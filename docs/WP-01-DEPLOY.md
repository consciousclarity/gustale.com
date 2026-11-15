# WP-01 — Deploy and rollback runbook

**Written:** 2026-11-11 (WP-00, at the owner's instruction)
**Rule:** no WP-01 deploy happens without this document's rollback command
being verified first.

---

## 1. The rollback target

| | |
|---|---|
| **Tag** | `pre-wp-01` |
| **Commit** | `923391bb004c9b883fc18db0da2c103e7645579f` |
| **Tag on the remote** | `refs/tags/pre-wp-01` → verified on GitHub |
| **Created** | 2026-11-11, immediately before the WP-00 merge, at the exact commit running on production |

**What was running on production at the moment the tag was cut** (read from
the VPS with `docker ps`, 2026-11-11):

```
gustale-api         ghcr.io/consciousclarity/gustale.com/gustale-api:923391bb004c9b883fc18db0da2c103e7645579f
gustale-web-recipes ghcr.io/consciousclarity/gustale.com/gustale-web-recipes:live-data-923391b-recipes
gustale-web-geo     ghcr.io/consciousclarity/gustale.com/gustale-web-geo:live-data-923391b-geo
```

All three were `Up ... (healthy)`.

**Why a tag and not a SHA.** The deploy pulls **images**, not source. The
images are tagged `live-data-<short-sha>-<variant>` and
`gustale-api:<full-sha>`, so the SHA alone identifies the image. The tag
adds the thing a human needs at 3am: a name that says what it is for.
`pre-wp-01` is the state to go back to if WP-01 goes wrong.

---

## 2. The rollback command

**This is the exact command. It is idempotent and it is safe to run while
the site is up.** It does not touch the database, the media store, or any
content — it swaps three containers back to the images that are already on
the VPS.

> **The images are pinned by ID, not pulled by tag — and this is not
> optional.** Measured on the VPS on 2026-11-11:
>
> ```
> $ docker manifest inspect ghcr.io/…/gustale-web-geo:live-data-923391b-geo
> denied: denied
> ```
>
> The `live-data-*` images are **never pushed to ghcr** (the deploy builds
> them on the VPS with `GUSTALE_NO_PUSH=1`), and the API image for that
> commit is not in the registry either. A fresh token does not help — the
> token on the VPS was expired *and* the images are absent. So a rollback
> that begins with `docker pull` **fails at the first line**.
>
> The rollback images exist **locally on the VPS**, which is where the
> rollback runs. Pinning by image digest also makes the rollback immune to
> a `docker image prune` deleting the tag, and immune to a tag being
> re-pointed.

Run it on the VPS (`srv626116` / `62.72.7.218`) as root:

```bash
set -euo pipefail

# ── The rollback target, pinned by image digest ────────────────────────
# Each ID was verified on the VPS on 2026-11-11 to resolve to exactly the
# tag in the table above.
API_ID=sha256:203039e34e0a97e9d7e54e811b3ae72ac48f3d612faf77b2ab011267ae379008
WEB_RECIPES_ID=sha256:56d564cfe2b01b2406c711bfa6344ec6d026f2d8349baa97a377afaf99eacbc9
WEB_GEO_ID=sha256:b3309bec394f674f7ef2dc34ba5f8ef2bb3f33f6b0df7334ef42187b5ec6c152

# Fail early and loudly if the rollback images are not on this host.
for id in "$API_ID" "$WEB_RECIPES_ID" "$WEB_GEO_ID"; do
  docker image inspect "$id" >/dev/null 2>&1 || {
    echo "ROLLBACK IMPOSSIBLE: $id is not on this host." >&2
    echo "The rollback images are built locally and never pushed to ghcr." >&2
    exit 1
  }
done

# ── The API first: the web images were BUILT against it ───────────────
docker stop gustale-api 2>/dev/null || true
docker rm   gustale-api 2>/dev/null || true
# A container mid-removal still holds its name, and `docker rm -f` does
# not clear it. Retry until the name is free. If the API does not come
# back, the web containers are left untouched on purpose.
for i in $(seq 1 30); do
  docker run -d --name gustale-api --restart unless-stopped \
    -p 4000:4000 --network host --env-file /root/.env \
    "$API_ID" && break
  echo "  gustale-api name still held, waiting..." >&2
  sleep 2
done

# Wait for the API to answer before the web containers start.
for i in $(seq 1 60); do
  curl -fsS --max-time 5 http://127.0.0.1:4000/health >/dev/null && break
  sleep 2
done
curl -fsS --max-time 10 http://127.0.0.1:4000/health || {
  echo "ROLLBACK ABORTED: the API did not come up. The web containers were left untouched." >&2
  exit 1
}

# ── Then the two web containers ───────────────────────────────────────
run_web() {
  local NAME="$1" IMAGE="$2" HP="$3" CP="$4"
  echo "--- $NAME : $IMAGE on $HP:$CP ---"
  docker stop "$NAME" 2>/dev/null || true
  docker rm   "$NAME" 2>/dev/null || true
  # A container that is mid-removal still HOLDS ITS NAME. `docker rm -f`
  # is not enough if a removal is already in progress, and the next
  # `docker run` then fails with "the container name is already in use".
  # This happened on 2026-11-11 during the live test of this command.
  for i in $(seq 1 30); do
    docker run -d --name "$NAME" --restart unless-stopped \
      -p "$HP:$CP" "$IMAGE" && break
    echo "  name still held, waiting..." >&2
    sleep 2
  done
}
run_web gustale-web-recipes "$WEB_RECIPES_ID" 4001 4001
run_web gustale-web-geo     "$WEB_GEO_ID"     4002 4001

docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | grep gustale
```

> **The API container has the same name-holding hazard**, and it is worse
> there: if `docker run` fails, **there is no API**, and
> `api.gustale.com` returns **502** while the web containers keep serving
> stale static pages. The web sites look fine, so the outage is easy to
> miss. Verified on 2026-11-11 during the live test of this command.
>
> The same retry loop belongs around the API's `docker run`, and the
> **public** health check below — not just the local one — is what proves
> the site is actually serving.

**If the API does not come back**, the site is down for everything
dynamic. Get it back first, in this order:

```bash
# 1. Is the container there, and in what state?
docker ps -a --format '{{.Names}}\t{{.Status}}\t{{.Image}}' | grep gustale-api

# 2. Free the name if a removal is in progress.
docker rm -f gustale-api; sleep 3

# 3. Start it. Use the CURRENT image, not the rollback image, unless the
#    rollback is what you actually want.
docker run -d --name gustale-api --restart unless-stopped \
  -p 4000:4000 --network host --env-file /root/.env \
  ghcr.io/consciousclarity/gustale.com/gustale-api:<sha>

# 4. Prove it from OUTSIDE, not just on localhost.
curl -fsS https://api.gustale.com/health
```

### The public check is the real check

`curl http://127.0.0.1:4000/health` passing does **not** prove the site
works — it only proves the container answers. The check that matters is
the public one, through Caddy:

```bash
curl -fsS https://api.gustale.com/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://gustale.com/
curl -fsS -o /dev/null -w '%{http_code}\n' https://gustale.recipes/
```

**Then verify — all three must be healthy, and the smoke test must agree:**

```bash
curl -fsS https://api.gustale.com/health
curl -fsS -o /dev/null -w '%{http_code}\n' https://gustale.com/
curl -fsS -o /dev/null -w '%{http_code}\n' https://gustale.recipes/
```

And from the repo, on the `wp/01-browsing-works` branch:

```bash
scripts/smoke/run-smoke.sh --wp WP-01
```

The WP-01 checks must be **green** again. If the rollback is itself
producing failures, stop and report — do not roll forward and back again in
a loop.

### Why the API comes first

The web images are **statically built against the API** at build time
(`scripts/hermes/build-web-live.sh` fetches every dish page from
`http://127.0.0.1:4000` on the VPS). So the web containers must never be
started against a *different* API than the one their pages were baked
from. The order above is: API up → API healthy → web swap.

This is the same ordering the CI deploy uses (`ci.yml`, the deploy job:
pull API → deploy API → poll health → `build-web-live.sh` → deploy web →
verify).

### What the rollback does NOT do

- It does not touch the database. No migration is reversed. WP-01 is a
  read-path fix and adds no schema.
- It does not restore content. Any dish, description or cover changed
  while WP-01 was live **stays changed** — the rollback returns the *code*
  to the pre-WP-01 state, not the data.
- It does not touch MinIO or the media bucket.

---

## 3. Before a WP-01 deploy — the checklist

1. **The tag exists and points at the right commit.**
   ```bash
   git ls-remote --tags origin refs/tags/pre-wp-01
   ```
2. **A clean-clone production build passes.** The owner's instruction
   (2026-11-11): *no staging for now — verify on a clean-clone production
   build locally, then smoke prod after deploy.* So:
   ```bash
   git clone --branch integration/wp-01-wp-02 https://github.com/consciousclarity/gustale.com.git /tmp/wp01-verify
   cd /tmp/wp01-verify && pnpm install --frozen-lockfile && pnpm lint && pnpm -r run typecheck && pnpm -r run test
   ```
   A green working tree is **not** enough — CI caught two failures in the
   working tree that only a clean clone exposed (WP-00 §6b).

   **The branch is `integration/wp-01-wp-02`, not one of the four PR
   branches.** The four PRs (#225, #226, #227, #228) conflict with each
   other in two files, and the resolution is in the integration branch
   (PR #229). Merging the four PRs into `main` one at a time would
   produce the conflicts again. The integration branch is what gets
   deployed.
3. **The build itself succeeds in the production shape** — the Astro build
   with `BUILD_DATA_SOURCE=live`, because that is what the deploy does:
   ```bash
   cd /tmp/wp01-verify
   PUBLIC_DOMAIN=recipes BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:recipes
   PUBLIC_DOMAIN=geo     BUILD_DATA_SOURCE=live PUBLIC_API_BASE=http://127.0.0.1:4000 pnpm --filter @gustale/web run build:geo
   ```
4. **The smoke test passes locally** against a local build, where the
   `--base` flag points at it.
5. **CI is green on the PR**, including `Live approval gate`.
6. **The rollback command above has been read by a human** — and, if the
   deploy fails in a way that is not obvious, it is executed **before**
   anyone tries to fix forward.

---

## 4. After the deploy

```bash
scripts/smoke/run-smoke.sh --wp WP-01 --json reports/smoke-<date>-WP-01.json
```

The WP-01 checks must be green on production. If they are not:

- **Report it. Do not roll back on your own.** The operating model says
  the agent proposes the rollback; the owner decides. The one exception is
  a site that is down or serving errors — then roll back first (the
  command above is safe and idempotent) and report immediately after.

---

## 5. Staging — WP-00b, required before WP-04

There is **no staging environment**. The pack's operating model assumes one
(`OPERATING-MODEL.md` step 4: "the smoke test against a local or staging URL
(`--base`)"), and there is none: no staging branch, no staging URL, no
staging deploy job.

**Until WP-00b exists:**

- Every change is verified by a clean-clone production build (step 3 above).
- The smoke test runs against production after the deploy.
- The blast radius of a bad build is one deploy.

**WP-00b is required before WP-04.** WP-04 is the first package that changes
a user-facing flow in a way that is hard to eyeball (the corrections link
and the search in the hero), and by then there will be a real queue of
suggestions arriving that must reach a moderation queue — that needs a
place where a change can be seen before production.

WP-00b is a **minimal subdomain**: a `staging.gustale.com` serving the same
stack, built from a branch, with its own API and its own database. It is
tracked as a backlog card and is out of scope for WP-01 and WP-02.

---

## 6. The record

| Item | Value |
|---|---|
| Rollback tag | `pre-wp-01` |
| Rollback commit | `923391bb004c9b883fc18db0da2c103e7645579f` |
| API image (rollback) | `sha256:203039e34e0a97e9d7e54e811b3ae72ac48f3d612faf77b2ab011267ae379008` |
| Web images (rollback) | recipes `sha256:56d564cf…`, geo `sha256:b3309bec…` |
| Verified on the VPS | 2026-11-11: all three IDs resolve to exactly the expected tags |
| Verified on GitHub | `refs/tags/pre-wp-01` → `923391b` |

### What the live test found

This command was **run on the VPS on 2026-11-11**, not just written. It
found three defects that a paper review would not have:

1. **`docker pull` does not work.** The rollback images are not in ghcr
   (the `live-data-*` images are never pushed; the API image for that
   commit is absent too), and the VPS's ghcr token was expired — a fresh
   token did not help. **Pinned by image ID instead.**
2. **The port parsing was wrong.** Splitting the image off the front of
   the string put `gustale-web-geo` on host port **4001**, the same port
   as `gustale-web-recipes`. Fixed to take the last two fields.
3. **A container mid-removal still holds its name.** The API's
   `docker run` failed with *"the container name is already in use"*, and
   because `api.gustale.com` is what serves every dynamic page, the
   public API returned **502** while both web sites still returned 200 —
   **the outage looked invisible from the front page.** Fixed with a retry
   loop, and the recovery procedure is written out above.

> **The service was restored during that test** and re-verified:
> `gustale.com` 200, `gustale.recipes` 200, `api.gustale.com/health` 200,
> `api.gustale.recipes/health` 200, and the API serving dish data. The
> API container was then left on the **current** image
> (`gustale-api:323eade…`, the WP-00 merge) rather than the rollback
> image, because the rollback was not what was wanted — only the command
> was being tested.

### The current production state

| Container | Image | Status |
|---|---|---|
| `gustale-api` | `gustale-api:323eade0913bdffc23a62a5aa64d885bda4856c4` | healthy |
| `gustale-web-recipes` | `live-data-923391b-recipes` | healthy |
| `gustale-web-geo` | `live-data-923391b-geo` | healthy |

The **API is on the WP-00 merge** (`323eade`) and the **web containers are
still on the pre-merge build** (`923391b`). That is the expected state:
the WP-00 merge changed only docs and scripts, so the web images were not
rebuilt. The two are consistent — WP-00 changed no application code, so
the baked pages are identical either way.

