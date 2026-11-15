# MIGRATION RECEIPT — `gus-238b-association-review-visibility.sql`

**Applied to live on 2026-11-15 at 04:56:24 UTC (12:56:24 WITA), by Hermes
Agent, over SSH to `root@62.72.7.218`, by direct `psql`.**

**`RC=0`. Zero error lines. `BEGIN` / `CREATE FUNCTION` / `COMMENT` /
`COMMIT` — the transaction committed.**

---

## Rule 11 — this migration is now frozen

`gus-238b` has run on live. It is **immutable**.

- A correction to it requires a **new** migration number.
- The **apply line** is authoritative, not the commit.
- `drizzle.__drizzle_migrations` on live does **not** record it, and that is
  expected: it records no hand-written migration. `0052`, `0053`, `0054` and
  `0055` are absent from it too, for the same reason. **The live objects are
  the record.**

What is now on live, verified by querying it directly:

| object | kind | state |
|---|---|---|
| `public.published_associations_for_dish(uuid)` | function | **REPLACED** — body now carries the evidence + review filter |

---

## The apply

```bash
docker exec shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f /tmp/gus-238b.sql
```

- **The `postgres` role**, not `gustale`.
- **`ON_ERROR_STOP=1`** — aborts on the first error.
- **The file was byte-identical to the reviewed one.** SHA-256 of
  `db/migrations/gus-238b-association-review-visibility.sql` at
  `origin/main` (`2205f67`):

  ```
  d0eee4a8321706cfcec1187b2e517af83d96811b9bd1d7f70d2bb06fab35591b
  ```

  The same digest was computed on the **reviewing host** before the apply and
  again on the **VPS** immediately before it. **The migration applied to live
  is the migration that was reviewed.**

---

## The backup

Taken immediately before the apply, on the VPS.

| | |
|---|---|
| path | `/home/gustale/backups/pre-238b-20261115T045210Z.dump` |
| bytes | `4,514,363` |
| sha256 | `0a770547a42374014ae319b982471b16acae53e181276ea196e0a28023bafbea` |
| container copy sha256 | **identical** — `0a770547a423…` |
| format | `pg_dump --format=custom` |

The dump was written **inside** the container (that is where `pg_dump` lives)
and copied out with `docker cp` — plain `cp` cannot cross the host/container
`/tmp` boundary.

### The backup is RESTORABLE, not merely present

A dump that exists proves only that `pg_dump` exited 0. The obligation is
that it restores and equals the live baseline. Both were proved:

- restored into `gus238b_restore_verify` on the **dedicated test Postgres**
  (port 5434), never on the production cluster;
- `pg_restore` exit code captured **without a pipe**: `RC=0`, **0 error
  lines**, 0 log lines;
- the restored copy compared against live on every measure:

| measure | restored copy | live | match |
|---|---|---|---|
| dishes (published / total) | 1474 / 1475 | 1474 / 1475 | yes |
| statements | 1354 | 1354 | yes |
| categories | 152 | 152 | yes |
| dish_families | 306 | 306 | yes |
| dish_place_associations (published / total) | 0 / 2713 | 0 / 2713 | yes |
| dish_journey_beats | 36 | 36 | yes |
| tables | 106 | 106 | yes |
| functions | 904 | 904 | yes |
| constraints | 377 | 377 | yes |
| the function body | OLD (no evidence filter) | OLD (no evidence filter) | yes |

The verification database was dropped in the same session that created it.
**The production cluster's database list was unchanged** — no copy was ever
created there:

```
bali_business  bali_day  dewata  gustale  n8n  postgres  scribe  template0  template1
```

---

## The dry run

`gus-238b` was applied to the **restored copy** on the test container before
it was applied to live.

- `psql RC=0`, **0 error lines** — `BEGIN` / `CREATE FUNCTION` / `COMMENT` /
  `COMMIT`.
- The copy's function then carried the new body (`has_evidence_filter = 1`).
- **Idempotent:** a second run also returned `RC=0` with no error.
- The data was untouched: `published|draft|total = 0|2713|2713`, and the
  content counts stayed `1475|1354|152|306|36`.

---

## What the migration changes — and what it does NOT

It is a **`CREATE OR REPLACE FUNCTION`**. It changes a query's **filter**; it
reclassifies no row and writes no data.

The new predicate adds two conditions to the existing one:

```sql
AND a.evidence_status = 'evidenced'
AND a.review_state  = 'accepted'
```

**The signature and return type are unchanged** — `CREATE OR REPLACE` cannot
alter them, so every existing caller still compiles:

```
p_dish_id uuid -> SETOF dish_place_associations
```

### The measured effect on the public surface

The live data was measured **before** the apply:

```
assoc_total=2713  publication_state=published=0  draft=2713
visible_old_predicate   = 0
visible_new_predicate   = 0
```

**Every one of the 2,713 associations is `draft`.** The old predicate and the
new predicate both return **zero** rows. The migration is **behaviourally
inert for the public surface** — it changes nothing a reader can see, today.

---

## The proof that nothing visible changed — a BYTE-DIFF, not a status code

A 200 before and a 200 after is compatible with a silently different payload.
So the payloads of every endpoint that reads the function were captured
before and after and compared byte for byte.

| endpoint | before | after | verdict |
|---|---|---|---|
| `/api/dishes/falafel/atlas` | 200, sha `e3adae1d…` | 200, sha `e3adae1d…` | **IDENTICAL** |
| `/api/dishes/rendang/atlas` | 200, sha `b6d751a1…` | 200, sha `b6d751a1…` | **IDENTICAL** |
| `/api/dishes/bibimbap/atlas` | 200, sha `06463285…` | 200, sha `06463285…` | **IDENTICAL** |
| `/api/atlas/counts` | 200, sha `42693f2d…` | 200, sha `42693f2d…` | **IDENTICAL** |
| `/api/dishes/bibimbap/journey` | 200, sha `012e24dd…` | 200, sha `012e24dd…` | **IDENTICAL** |
| `/api/dishes/bibimbap` | 200 | 200 | differs — `viewCount` only |
| `/api/dishes/map?limit=5` | 200 | 200 | differs — `viewCount` only |
| `/health` | 200 | 200 | differs — `timestamp` only |

### The three differences are NOT caused by the migration — proved by control

Two **consecutive** captures with **no migration between them** produce the
**same three** differences:

```
dishes_bibimbap.json       DIFFERENT  (two captures, no migration between)
dishes_map_limit_5.json    DIFFERENT  (two captures, no migration between)
health.json                DIFFERENT  (two captures, no migration between)
```

and the five counter-free payloads are **IDENTICAL** in that control pair too.

The differences are therefore **inherent volatility**, not the migration:

- `viewCount` — a **live page-view counter**. Each capture script curls each
  endpoint once, so the capture increments it. The DB value read directly was
  `3068` after the two captures, and the deltas were exactly `+1` per
  capture.
- `/health` carries its own **`timestamp`**.

**Conclusion:** 238b is **provably invisible to the reader**.

---

## The end state, read from a NEW session

The persistence proof is read back through a **different connection** than
the one that applied it — a same-session read cannot distinguish "committed"
from "rolled back on disconnect".

```
has_evidence_filter | has_review_filter  =  1 | 1     (the NEW body is on disk)
signature = p_dish_id uuid -> SETOF dish_place_associations   (unchanged)
dishes|statements|categories|families|assoc|beats
       = 1475|1354|152|306|2713|36       (identical to the baseline)
```

Every user-data count is **identical** before and after, and no row changed
state.

---

## The API log, window pinned to the apply

```bash
docker logs --since 2026-11-15T04:56:24Z gustale-api
```

- **No errors.** No "does not exist", no exception, no 5xx.
- Status distribution since the apply: **30 × 200**, **3 × 404**.
- The 3 × 404 are on **`/api/health`** — the capture script's first attempt
  at the health endpoint, which correctly 404s under `/api` before the
  script retries it at the root. **They are an artifact of the verification
  harness, not a defect.** The three real dishes the capture curls
  (`falafel`, `rendang`, `bibimbap`) are all present and `published`.

---

## The five live URLs, after the apply

```
200  https://gustale.com/
200  https://gustale.recipes/
200  https://api.gustale.com/health
200  https://api.gustale.com/api/dishes/bibimbap/journey
200  https://api.gustale.com/api/dishes/bibimbap/atlas
```

Containers, all healthy: `gustale-api`, `gustale-web-recipes`, `gustale-web-geo`.

---

## What this migration does NOT do

- It does **not** delete anything. The 2,713 associations are still in
  `dish_place_associations` with their state intact — **all 2,713 are still
  `draft`**.
- It does **not** reclassify, publish, or re-point any row.
- It does **not** change the function's signature or return type.
- It does **not** make any association visible. **The rule is live and
  inactive**: the function now supports a visibility rule that nothing
  currently satisfies. When the review work package accepts and evidences
  rows, they become visible without a further migration.
- It does **not** create the GUS chain's own ledger — that is `gus-238c`,
  applied separately.

## The rollback

The rollback is a **DDL replay**, not a data operation. The previous function
body is preserved in the migration file's ROLLBACK section:

```sql
BEGIN;
CREATE OR REPLACE FUNCTION public.published_associations_for_dish(p_dish_id uuid)
RETURNS SETOF dish_place_associations
LANGUAGE sql STABLE PARALLEL SAFE
AS $$
  SELECT a.*
    FROM dish_place_associations a
    JOIN dishes d ON d.id = a.dish_id
   WHERE a.dish_id = p_dish_id
     AND a.publication_state = 'published'
     AND d.status = 'published';
$$;
COMMIT;
```

Verify the rollback landed by reading the body back and asserting on a
**structural marker**, not on string equality:

```sql
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='published_associations_for_dish'
   AND prosrc LIKE '%evidence_status%';
-- 0 = the OLD body is back
```
