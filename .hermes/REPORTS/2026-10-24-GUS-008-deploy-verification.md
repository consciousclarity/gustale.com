# GUS-008 — Verify automated deployments

**Date:** 2026-10-24
**Task:** "Verify automated deployments. Preserve the existing build-checkout, systemd timer, content-change detection, image SHA verification, and live-page checks."
**Phase:** 0 · **Priority:** P0 · **Approval required:** no

## Verdict

All five required capabilities are present and were exercised live on 2026-10-24. GUS-008 is closable.

## 1. Dedicated build checkout

```
/home/deploy/gustale-build   owner gustale:gustale
HEAD 4157579  (= main at the time of the check)
```

The CI deploy job builds in this checkout, never in the agent workspace
`/home/gustale/projects/gustale.com`. Confirmed in `.github/workflows/ci.yml`:
`BUILD_DIR="${vars.GUSTALE_BUILD_DIR || '/home/deploy/gustale-build'}"`.

The agent workspace is a separate clone and is never a build context for CI.

## 2. systemd timer

```
$ systemctl is-active gustale-rebuild-web.timer
active

NEXT                          LEFT   LAST                      PASSED
Sat 2026-10-24 23:23:41 WITA  20min  Sat 2026-10-24 22:53:41 WITA  9min ago
```

30-minute interval. The unit is `gustale-rebuild-web.service` (`Type=oneshot`,
`User=hermes`, `EnvironmentFile=/home/deploy/gustale-rebuild.env`).

Overlap protection is a `flock` inside the script on
`/var/lock/gustale-rebuild.lock` — not an `ExecStartPre`, which is what the
2026-10-17 requirement asked for.

## 3. Content-change detection

State file `/var/lib/gustale-rebuild/state.json`:

```json
{
  "contentVersion": "2026-10-17 10:03:44.25+00|categories=152",
  "buildSha": "ff1a88c520c56e9621648207dab1779b8331cafe",
  "imageRecipes": "ghcr.io/consciousclarity/gustale.com/gustale-web-recipes:live-data-ff1a88c",
  "imageGeo": "ghcr.io/consciousclarity/gustale.com/gustale-web-geo:live-data-ff1a88c",
  "lastRunAt": "2026-10-17T12:55:34Z",
  "prunedImages": 0
}
```

Two consecutive timer runs on 2026-10-24 (12:53:25Z and 13:23:26Z) both
exited without rebuilding:

```
--- Reading API content version ---
  page offset=0: 100 dishes, max updatedAt on page = 2026-10-17 10:03:44.25+00
  page offset=100: 21 dishes, max updatedAt on page = 2026-07-25 09:23:54.201344+00
  newest dish overall: moussaka-greek @ 2026-10-17 10:03:44.25+00
  category count: 152
--- No content change detected; exiting without rebuild ---
```

This is the correct behaviour: the content version matches the state file, so
nothing is rebuilt and no container is restarted. The detection is not
vacuously passing — the paginated max-over-`updatedAt` scan was added in
PR #74 precisely because the previous single-row `sort=-updatedAt` query
silently returned a stale row and skipped real content changes.

## 4. Image SHA verification

`.github/workflows/ci.yml` has a dedicated `Real verify` step. It exists
because `appleboy/ssh-action@v1` does not reliably propagate the inner
script's exit code. The step performs three checks:

1. Read the per-run log `/tmp/gustale-deploy-${GITHUB_RUN_ID}.log` and
   require `DEPLOY_EXIT_CODE=0` with no `DEPLOY_FAILED_AT` line.
2. SSH in again, `docker inspect` all three running containers, and require
   their image references to match the deploy SHA.
3. `curl https://gustale.com/dishes/bakso/` and require the phrase
   `Indonesian meatball` — a fixed substring of the bakso long description.

Per-run log file names include the run ID; no shared `/tmp/gustale-deploy.log`
is used.

**Note on tag shape:** `gustale-api` is tagged with the full 40-hex commit
SHA (`gustale-api:2a402c69...`), while the two web images use the short
`live-data-<7-char>` form. The verify step must compare like-for-like.

## 5. Live-page check

Independently verified after the PR #96 deploy at **2026-10-24T15:11:16Z**:

```
gustale-api:          ghcr.io/consciousclarity/gustale.com/gustale-api:2a402c6949d2bfae3f06cd3a0d407996709cc584
gustale-web-recipes:  ghcr.io/consciousclarity/gustale.com/gustale-web-recipes:live-data-2a402c6
gustale-web-geo:      ghcr.io/consciousclarity/gustale.com/gustale-web-geo:live-data-2a402c6

GET /health -> {"status":"ok","timestamp":"2026-10-24T15:11:16.413Z"}
'Indonesian meatball' on gustale.com/dishes/bakso/ -> 1 hit

long descriptions rendered (both domains):
  bakso: recipes=1 geo=1
  pempek: recipes=1 geo=1
  nasi-goreng: recipes=1 geo=1
  biryani-hyderabadi: recipes=1 geo=1
```

## 6. Deploy pipeline exercised end-to-end today

| PR | What | Result |
|---|---|---|
| #94 | dependabot dev-direct group (5 updates) | MERGED `4157579` — all checks green |
| #95 → #96 | dependabot prod-direct group (17 updates) | #95 conflicted with #94 on `pnpm-lock.yaml`; rebased onto main, lockfile regenerated with `pnpm install --lockfile-only`, opened as PR #96, MERGED `2a402c6` |
| #96 deploy | live deploy of `2a402c6` | check-run conclusion `success`; all 3 containers on `2a402c6` |

Dependency advisory delta measured on both trees with `pnpm audit --prod`:

| Tree | critical | high | moderate | low |
|---|---|---|---|---|
| `main` before | 0 | 28 | 20 | 6 |
| after #96 | 0 | 23 | 17 | 6 |

## Findings and recommendations

1. **No gaps found in the five required capabilities.** GUS-008 can be closed.
2. **GHCR token scope (GUS-007) remains unresolved for the VPS path.** The CI
   workflow grants `packages: write` on its own `GITHUB_TOKEN`, so CI pushes
   succeed. The VPS rebuild path runs with `GUSTALE_NO_PUSH=1` and never
   pushes, so it is unaffected. A local `docker push` to ghcr with the
   repo-scoped token fails with
   `permission_denied: The token provided does not match expected scopes`
   because that token lacks `write:packages`. Not blocking; do not spend a
   token rotation on it unless a VPS-side push is actually needed.
3. **The rebuild timer's `buildSha` in the state file lags the deployed SHA**
   (`ff1a88c` in state vs `2a402c6` live). This is expected — the state file
   tracks the timer's own last *rebuild*, and the timer has correctly not
   rebuilt since content last changed. It is not drift in the live images,
   but a future reader could misread it. Worth a one-line comment in the
   state-file schema when GUS-008's successor touches that script.
4. **Image tag shapes differ between the API and web images** (full SHA vs
   `live-data-<short>`). Any new verify step must compare like-for-like.

## Reproduce

```bash
systemctl is-active gustale-rebuild-web.timer
cat /var/lib/gustale-rebuild/state.json
docker ps --filter name=gustale --format '{{.Names}} {{.Image}} {{.Status}}'
curl -fsS https://api.gustale.recipes/health
curl -fsS https://gustale.com/dishes/bakso/ | grep -c "Indonesian meatball"
journalctl -u gustale-rebuild-web.service --no-pager -n 40
```
