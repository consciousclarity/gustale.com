# Migration receipt — 0050 and 0051 applied to live

**Date:** 2026-11-07
**Applied by:** Hermes Agent, on Alejandro's explicit `go` (2026-11-07)
**PR:** #189 (`feat/family-taxonomy-classification`), merged with the
`approved-live` label applied by `consciousclarity`
**Plan:** `docs/MIGRATION-PLAN-0050-0051.md`

> The plan is the approval request; this is the receipt. The plan's
> §4 "Live baseline, measured today" and §6 "Expected after" are the
> two things this receipt checks against.

---

## 1. The backup

Taken **before** anything was applied, and verified **before** the
migration ran.

| | |
|---|---|
| **path** | `/home/gustale/backups/pre-0050-0051-20261107-204100.dump` |
| **size** | **4,378,407 bytes** |
| **md5** | `a6582b906fb0bee96f3b9cb7cbddd3af` |
| **owner / mode** | `gustale:gustale` / `644` |
| **archive created** | 2026-11-07 12:41:00 UTC (from the archive header) |
| **TOC entries** | 1,502 (82 `TABLE DATA` sections) |

The dump was taken with `pg_dump --format=custom` inside
`shared-postgres` and copied to the host with `docker cp`.

> **One deviation from the plan's §1.** The plan's snippet does
> `cp /tmp/pre-0050-0051.dump "$DUMP"` — a *host* copy of a *container*
> path. `/tmp` is **not** shared between the host and the container
> (`shared-postgres` bind-mounts only `/home/deploy/shared/initdb` and
> its data volume), so that `cp` fails with "cannot stat". `docker cp`
> is the working equivalent. The plan's `pg_dump` and
> `pg_restore --list` commands are otherwise exactly as written.

### The dump was proven restorable, not just present

A dump that was never verified is not a backup. The archive was
restored **in full** into a throwaway database on the **test**
Postgres (`gustale-test-postgres`, 127.0.0.1:5434 — never the
production cluster), and the restored copy was checked against the live
baseline:

```
restored copy:  assoc_total=2713  in_review=0  published=0
                 families=306  dishes=1475  community_rows=1235
live baseline:  assoc_total=2713  in_review=0  published=0
                 families=306  dishes=1475  community_rows=1235
```

Identical. The proof database was then dropped.

---

## 2. The pre-apply gate

Every gate was checked before the first write:

| gate | result |
|---|---|
| dump exists, on the host, non-empty | 4,378,407 bytes |
| dump md5 matches the container copy | `a6582b90…` both sides |
| dump restores and reproduces the baseline | **yes**, exact |
| `pg_restore --list` on the archive | exit 0, 1,502 entries |
| dry-run 0050 on an exact copy | `DRYRUN_OK=1`, idempotent re-apply OK |
| dry-run 0051 on an exact copy | `DRYRUN_OK=1`, idempotent re-apply OK |
| **commit proof** (fresh session, not the migration's own report) | `2713 \| 50 \| 2663 \| 0 \| 306 \| 306 \| 306 \| 50` |
| production-drop scanner | exit 0 — no script can drop a production DB |
| live baseline matches the plan's §4 | `2713 / 0 / 0 / 306 / 1475 / 1235` |
| `approved-live` label, applied by the owner | present on #189 |

### 0050 ran in AUTOCOMMIT — and that is a finding

**Correction (2026-11-07, by the owner).** An earlier version of this
receipt said that `0050` "contains a `BEGIN` and no `COMMIT`", and
called the commit proof a guard against a transaction that would be
silently discarded. **That was wrong.** `0050` contains **no
transaction wrapper at all** — no `BEGIN`, no `COMMIT`.

It contains the *word* `BEGIN` twice, at lines 266 and 500, and both
are **PL/pgSQL block openers** (`BEGIN … END $$;`), not transaction
control. A `grep BEGIN` says the migration is wrapped. It is not.
`0051` is wrapped: `BEGIN;` at line 57, `COMMIT;` at line 606.

So `0050` ran in **AUTOCOMMIT**: every statement was its own
transaction, and each committed the moment it succeeded.

**What that actually means for live.** The migration *succeeded*, so
live is consistent — the end state below is exactly what the plan
predicted, and every number was verified by independent read-back. But
the exposure is real and worth stating plainly: had `0050` failed
part-way through on live, it would have left the three tables created,
the trigger installed, and only *some* of the 50 pilot rows updated —
with **no `ROLLBACK` able to undo any of it**, because in autocommit
there is no transaction to roll back. The only recovery would have
been a restore from the §1 dump.

**The commit proof was still worth doing, for a different reason.** The
dry-run script reads its results back in the *same* session it applied
them in. For `0051` — which is transactional — that is a sound check,
because a `BEGIN` without a `COMMIT` would show up as an empty
read-back. For `0050` it proved something different: that the rows are
on disk and not merely visible in an open session. So the proof was
restored into a throwaway database on the test container, `0050` then
`0051` were applied exactly as the live apply would apply them
(`psql -v ON_ERROR_STOP=1`), and the result was read back **from a new
session**. It read `2713 | 50 | 2663 | 0 | 306 | 306 | 306 | 50`.

The proof stands. Its stated *reason* was wrong, and is corrected
here.

**What now prevents a repeat.** `scripts/check-migrations-are-transactional.py`
fails the build if any migration that is not explicitly grandfathered
is not wrapped in `BEGIN`/`COMMIT`. It does not grep for the word
`BEGIN`; it distinguishes a transaction wrapper from a PL/pgSQL block,
which is the check that would have caught `0050`. `0050` and `0048`
are on a frozen, explicit grandfathered list, with the reason for each
— and neither is rewritten, because rewriting an applied migration
changes its checksum and breaks the chain's idempotence check.

---

## 3. The apply

```bash
docker exec -i -u postgres shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 < db/migrations/0050_association_review_ledger.sql
docker exec -i -u postgres shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 < db/migrations/0051_family_classification.sql
```

| migration | psql exit | the migration's own assertion |
|---|---|---|
| 0050 | **0** | `0050: ok -- 50 pilot rows in_review, 0 associations dangling, 0 published` |
| 0051 | **0** | `0051: ok -- 306 families classified (all: FORM 172 COURSE 59 CUISINE 5 CONTENT TYPE 70; the 123 with a published dish: FORM 83 COURSE 21 CUISINE 4 CONTENT TYPE 15)` |

Both committed. `0051` is wrapped in `BEGIN;`/`COMMIT;`; `0050` ran in
autocommit (§2) and was verified from a separate session.

---

## 4. The verification

### The plan's §6 query — matches the prediction exactly

```
assoc_total=2713 in_review=50 published=0 unreviewed=2663
families=306 families_classified=306
```

The plan's §6 "Expected after" line reads
`assoc_total=2713  in_review=50  published=0  unreviewed=2663  families=306  families_classified=306`.
**Every number matches.**

### Independent read-back (not the migration's own report)

| check | expected | found |
|---|---|---|
| `association_review_log` rows | 50 | **50** |
| `association_sources` rows | 0 | **0** |
| `family_classification_ledger` rows | 306 | **306** |
| `dish_families` with `family_class` set | 306 | **306** |
| `dish_families` with `family_class` NULL | 0 | **0** |
| **dangling associations** | 0 | **0** |
| published associations | 0 | **0** |
| `entity_repointed` by `migration:0050` | 0 | **0** |
| pilot rows claiming HIGH confidence | 0 | **0** |
| pilot rows claiming LOW confidence | 0 | **0** |
| `dishes` | 1475 | **1475** |
| `statements` | 1354 | **1354** |
| `geo_entities` | 3892 | **3892** |
| `dish_traditions` | 433 | **433** |
| `sources` | 1486 | **1486** |
| `vocabulary_labels` | 35871 | **35871** |

### The classification is internally consistent

* class split: **FORM 172 / CONTENT TYPE 70 / COURSE 59 / CUISINE 5** —
  the same split the ledger document specifies, and the same the
  dry-run produced;
* families mis-classified against the ledger: **0**;
* ledger rows not on live: **0**; live families not in the ledger: **0**.

### The new objects are in place and enforced

```sql
dish_families_class_check
  CHECK (((family_class IS NULL) OR (family_class = ANY
         (ARRAY['FORM','COURSE','CUISINE','CONTENT TYPE']))))

CREATE TRIGGER dish_place_associations_entity_guard
  BEFORE INSERT OR UPDATE OF entity_kind, entity_id
  ON dish_place_associations FOR EACH ROW EXECUTE FUNCTION check_association_entity()
```

The trigger was **behaviourally tested on live** (in a block that
raises an exception to roll itself back):

| test | result |
|---|---|
| a `place` pointing at a non-existent `geo_entities` row | **refused** — "does not resolve to a geo_entities row" |
| a `community` pointing at a non-existent `dish_traditions` row | **refused** — "does not resolve to a dish_traditions row" |
| a `place` pointing at a **real** `geo_entities` row | **accepted** — the guard is not over-blocking |

After the test, live was re-read: `assoc_total=2713, in_review=50` —
unchanged.

### The 1,235 community rows are untouched

```
entity_kind |   n   | resolves_to_tradition
community   | 1235  |                    1235
place       | 1478  |                      0
```

Every community row still points at a `dish_traditions` row. Nothing
was re-pointed at a cuisine's country — the failure mode the plan
§2 warned about, and it did not happen.

### The pilot is exactly the deterministic sample

* `place_pilot = 25`, `community_pilot = 25` → 50, as `MIN(25,
  available)` per kind predicts;
* ledger rows: `action='submitted'`, `review_state_before='unreviewed'`,
  `review_state_after='in_review'`, `confidence=3`,
  `confidence_label='medium'`, `reviewer='pilot:0050'` — 50 of them;
* the pilot rows' own `publication_state` is still `draft` and their
  `evidence_status` is still `unevidenced`.

Nothing was published. Nothing was accepted. The places KPI stays **0
by design**.

---

## 5. The service is healthy

| check | result |
|---|---|
| `https://api.gustale.com/health` | **200** `{"status":"ok"}` |
| `https://api.gustale.com/api/atlas/counts` | **200** — `families: 123`, unchanged |
| `https://api.gustale.com/api/taxonomy/family/dumpling` | **200** |
| `https://gustale.com/` | **200** |
| `https://gustale.recipes/` | **200** |
| `https://gustale.com/families/` | **200** |

The API reaches `dish_families` through explicit SQL
(`apps/api/src/routes/taxonomy-family.ts`, `apps/api/src/routes/atlas.ts`),
not through a Drizzle model, so the new nullable column cannot break a
read. `family_class` is not yet selected by any endpoint — surfacing
it is a separate, additive change.

The 203 `Authentication required` entries in the API log are the
**entire container lifetime**, not new — they predate the migration
and are unrelated to it.

---

## 6. The rollback, if it is ever needed

Both migrations are additive, so rollback is a **DROP**, not a restore.
The full SQL is in the plan's §5. The order matters: restore the 50
pilot rows' `review_state` **before** dropping
`association_review_log`, because the UPDATE reads the pilot ids from
there.

The last-resort full restore from the §1 dump is in the plan's §5,
under a warning from the 2026-11-06 incident. It should only ever be
run by the owner, with the dump verified, and it is **not** scripted.

---

## 7. Cleanliness

* The production cluster now carries **only** `gustale` (plus the other
  projects' databases and `postgres`). The `gustale_atlas_dryrun` copy
  that `dryrun-migration.sh` left behind — it dropped its copy at the
  *start* of a run, not the end — was dropped after the verification.
* Both throwaway proof databases on the **test** container
  (`gustale_dump_restore_proof`, `gustale_t50_commitproof`) were
  dropped.
* Live was re-read after every cleanup: `2713 | 50 | 0 | 306 | 306`.
* No repository file was changed by the apply itself. The migrations
  were applied from `main` as merged.

> **Two process problems this run exposed, both fixed in item 0.**
>
> **1. The dry-run created its copy on the PRODUCTION cluster.**
> `scripts/dryrun-migration.sh` ran `DROP DATABASE` and `CREATE
> DATABASE` against `shared-postgres` — which violates
> `docs/DATABASE-SAFETY.md` §1, because those statements are
> cluster-scoped and `shared-postgres` hosts live plus five other
> projects' databases. It went well, which is exactly why it is
> dangerous: "it worked once" is not a defence for a rule. The script
> now runs its copy on the dedicated test Postgres
> (`gustale-test-postgres`, port 5434), its allowlist exemption in
> `scripts/check-no-production-db-drops.py` has been **removed**, and
> the scanner now has a test case that proves it would catch the
> regression. The script also drops its copy and its snapshots at the
> end, so it leaves nothing behind.
>
> **2. `0050` ran in autocommit.** See §2. The fix is
> `scripts/check-migrations-are-transactional.py`, which fails the
> build for any new migration that is not wrapped in `BEGIN`/`COMMIT`,
> and which — unlike a `grep BEGIN` — tells a transaction wrapper from
> a PL/pgSQL block.
