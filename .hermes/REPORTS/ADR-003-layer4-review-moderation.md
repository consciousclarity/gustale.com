# ADR-003 layer 4 — the review and moderation surface, as built

**Status:** 🟢 **DONE — deployed live 2026-10-29.**
**Rule:** `decided-by: hermes` for every decision below.

# What it delivers

| | |
|---|---|
| routes | 7 |
| integration tests | 14, all passing |
| the whole API suite | 10 files, 77 passed, 3 skipped |

# The routes

| route | who | what |
|---|---|---|
| `GET /api/admin/translations/review-queue` | any signed-in user | the machine translations, with the English source beside them |
| `GET /api/admin/translations/stale-queue` | any signed-in user | the translations whose source changed, with both hashes |
| `GET /api/admin/translations/proposals` | any signed-in user | the pending and resolved proposals |
| `GET /api/admin/translations/summary` | any signed-in user | the counts by locale and status |
| `POST /api/admin/translations/:id/propose` | contributor+ | proposes a correction |
| `POST /api/admin/translations/:id/resolve` | moderator+ | accepts or rejects a correction |
| `POST /api/admin/translations/:id/review` | moderator+ | confirms a translation as it stands |

# The database was already the enforcement point

Layer 3b's migration `0026` put the moderation flow in the DATABASE:
accepting a proposal makes it the translation's text, sets the status
to `reviewed`, stamps `reviewed_at`, and clears the proposal.

This layer is the surface over it. That ordering matters — the rule is
in the database, so it holds no matter what calls it. The route
cannot forget to do it, and a direct SQL write gets the same
behaviour.

# The roles

| role | can |
|---|---|
| `visitor` | read the queues |
| `contributor` | **propose** a correction |
| `moderator` | accept or reject a correction, and mark a translation as reviewed |
| `admin` | everything |

The role rank mirrors `dishes-write.ts`.

A **proposal does not change the translation** until it is accepted.
That is the whole point of the moderation path: a contributor proposes,
a moderator decides.

# The two queues

- The **review queue** is the machine translations that no human has
  confirmed. It lists the English source beside the translation, so a
  reviewer can compare without leaving the page.
- The **stale queue** is the translations whose English source has
  changed. It lists the stored hash AND the current hash, so a
  reviewer can see what moved.

# Where the surface is reachable

**Not on the public hosts — and that is deliberate.**

`infra/prod/Caddyfile` blocks `/api/admin/*` with a `404` on every
public host:

```
# ─── API host — block /api/admin/* with 404 ──────────────────────────────
# Defense in depth: even though /api/admin/* requires admin auth, never
# let admin endpoints be reachable from the public API host.
```

That is a **404, not a 401** — the endpoints are not merely
unauthorised, they are not advertised. The admin UI on
`gustale.recipes/admin` reaches them server-side, during the build,
where Caddy is not in the path.

So the verification is:

| from | result |
|---|---|
| `https://api.gustale.com/api/admin/translations/review-queue` | 404 — Caddy's block |
| `http://127.0.0.1:4000/api/admin/translations/review-queue` | **401** — the route is live and requires a session |

The 401 is the proof: the route is registered, reachable, and gated.

# Three bugs the tests found, all in the test

## 1. The two test users shared an email

`users.email` is `UNIQUE`. The batch insert of the contributor and the
moderator failed on the second row, and the whole insert rolled back —
leaving **neither** user. Every request that referenced `proposed_by`
or `reviewed_by` then failed on the foreign key.

The emails are distinct now.

## 2. The cleanup deleted nothing

```ts
.where(and(eq(users.id, CONTRIBUTOR.id), eq(users.id, MODERATOR.id)))
```

An `AND` of two different ids matches **no row**. `inArray` is what it
needed.

## 3. A test called "refuses a second pending proposal" never made a first proposal

It asserted a `409` against a route that correctly returned `200`,
because there was no pending proposal to conflict with. The test now
makes the first proposal, and then the second.

# What the tests cover

| behaviour | assertion |
|---|---|
| unauthenticated | 401 on every route |
| a contributor cannot accept | 403 |
| a contributor cannot review | 403 |
| an unknown decision | 400 |
| a resolve with no pending proposal | 409 |
| a second pending proposal | 409 |
| a proposal | recorded, and the translation **unchanged** |
| a moderator's acceptance | the proposal is the text, the status is `reviewed`, the proposal is cleared |
| a moderator's rejection | the text is **unchanged**, the status is still `machine` |
| a moderator's review | the status becomes `reviewed`, the text is unchanged |
| the review queue | lists the translation with its English source |
| the stale queue | picks up a source edit |

# The gate it went through

| step | result |
|---|---|
| CI lint | ✅ 0 errors |
| CI typecheck | ✅ |
| CI tests | ✅ 10 files, 77 passed |
| Docker build (api) | ✅ |
| Deploy | ✅ |
| Live verification | ✅ 401 on the internal port, 404 on the public host (by design) |

# The local test setup

The tests need a **CI-like** database, not the live one — against live
they fail, because live is populated and the tests expect the seed.

A `postgis/postgis:16-3.4` container with the migration chains and the
seed applied, and the env from the workflow:

```bash
docker run -d --name gustale-citest \
  -e POSTGRES_USER=gustale -e POSTGRES_PASSWORD=gustale -e POSTGRES_DB=gustale \
  -p 55432:5432 postgis/postgis:16-3.4
```

Then the chains in the order `scripts/ci-migration-chain.sh` uses, the
two seed files in ONE psql session (they share a temp table), and:

```bash
cd apps/api
DATABASE_URL="postgres://gustale:gustale@127.0.0.1:55432/gustale" \
SESSION_SECRET=ci-session-secret-do-not-use-anywhere-real \
AUTH_SECRET=ci-auth-secret-do-not-use-anywhere-real \
MINIO_ENDPOINT=http://ci-minio.placeholder.invalid:9000 MINIO_PORT=9000 \
MINIO_ACCESS_KEY=ci-minio-access-key-do-not-use-anywhere-real \
MINIO_SECRET_KEY=ci-minio-secret-key-do-not-use-anywhere-real \
BETTER_AUTH_SECRET=ci-better-auth-secret-do-not-use-anywhere-real \
NODE_ENV=test ./node_modules/.bin/vitest run
```

# What is NOT in layer 4

- **The admin UI.** The routes are the surface; the screens that use
  them — the review queue page, the proposal form — are not built. The
  existing admin pages at `gustale.recipes/admin` are the place for
  them.
- **The contributor proposal UI.** A contributor can propose through
  the API, but nothing in the reader-facing site offers the form.
- **The re-translation job.** The stale translations are queued and
  visible, but nothing re-translates them on a schedule yet — the
  translator is a script, not a job.
