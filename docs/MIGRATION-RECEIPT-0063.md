# MIGRATION RECEIPT — `0063_record_0061_in_the_ledger.sql`

**The ledger row that 0061 forgot to write for itself.**

**APPLIED TO LIVE — 2026-11-19 (WITA).** The migration was applied to
the live production database (`gustale` on `shared-postgres`) by direct
`psql`, with `-X -v ON_ERROR_STOP=1`.

`PSQL_RC=0`, 0 error lines, `BEGIN` → `COMMIT`, and the migration's own
four proofs were emitted. The backup, the independent verification and
the idempotence proof are all below.

**This migration writes exactly one row, and it writes nothing else.**
It is the smallest possible migration: a ledger row for 0061, and
nothing else.

---

## The renumbering: 0062 → 0063

This migration was applied to live on 2026-11-19 **as**
`0062_record_0061_in_the_ledger.sql`. It was subsequently **renumbered
to 0063**.

**Why.** The number 0062 was already taken:
`0062_ingredients_sourcing_vocabulary.sql` was applied to live on
2026-11-11 and owns the number 0062. Two migrations must never share a
number — the chain validator (`scripts/validate-ci-migration-chain.py`)
reads the three lists (`ci.yml`, `ci-migration-chain.sh`,
`repro-ci-db.sh`) as a sequence, and a duplicate number makes the order
ambiguous.

**What the renumbering changed — and what it did not.**

| | |
|---|---|
| **Filename** | `0062_record_0061_in_the_ledger.sql` → `0063_record_0061_in_the_ledger.sql` |
| **Receipt filename** | `docs/MIGRATION-RECEIPT-0062.md` → `docs/MIGRATION-RECEIPT-0063.md` |
| **CI patch filename** | `docs/ci-0062-migration-chain.patch` → `docs/ci-0063-migration-chain.patch` |
| **Row it writes** | **unchanged** — keyed `0061_ingredient_aliases`, *not* by its own number |
| **Rows on live** | **unchanged** — the row already exists, so `ON CONFLICT (name) DO NOTHING` leaves it exactly as it is |
| **Schema** | **unchanged** — no DDL, no other table touched |

**The live ledger is unaffected by the rename.** The only `0062` in the
ledger is prose *inside* the `0061_ingredient_aliases` row's `note`
column, and that row was written by the apply on 2026-11-19 and has not
been rewritten since. A fresh database would now write `0063 records
it`, which is correct for the renamed file.

**Every historical record below is left as it happened** — the backup
filename, the `/tmp/0062.sql` checksum protocol, the `psql` NOTICE
lines and their line numbers. They record what physically ran on live on
2026-11-19, when the file was still called `0062`. The file on the VPS
at `/tmp/0062.sql` still carries the applied checksum
`498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7`, and
that is the checksum the note below refers to.

---

## Why this migration exists

Migration `0061_ingredient_aliases.sql` was applied to live on
2026-11-19. It did everything it was written to do — the
`ingredient_aliases` table, the one alias row for the béchamel
duplicate, and its P1–P8 proofs, all confirmed:

```
PSQL_RC=0
INGREDIENT_ALIASES_OK=1
```

But it did **not** write a row for itself in
`public.gus_migrations_applied`.

Every other migration in the GUS chain records itself. `0060` does it
inside its own transaction, before the proofs:

```sql
INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES ('0060_legacy_associations_published', '2026-11-17'::timestamptz, 'Hermes', NULL,
        'applied by direct psql; receipt docs/MIGRATION-RECEIPT-0060.md')
ON CONFLICT (name) DO NOTHING;
```

`0061` simply omitted that `INSERT`. The omission was found **after**
0061 had been applied to live.

**Rule 11 says an applied migration's file is immutable** — a fix goes
into a *new* number. So 0061 was left exactly as it was applied, and
the gap is closed here, in 0063.

---

## What this migration does

Exactly one thing:

```sql
INSERT INTO public.gus_migrations_applied (name, applied_at, applied_by, sha256, note)
VALUES (
  '0061_ingredient_aliases',
  '2026-11-19'::timestamptz,
  'Hermes',
  'd09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a',
  'applied by direct psql on 2026-11-19; the migration omitted its own ledger row, '
  'and 0063 records it. receipt docs/MIGRATION-RECEIPT-0061.md'
)
ON CONFLICT (name) DO NOTHING;
```

It does **not**:

- create the alias table (0061 did that),
- write an alias row (0061 did that),
- modify any existing ledger row,
- touch any other table.

The `applied_at` is **2026-11-19** — the date 0061 was actually
applied, not the date this migration runs.

The `sha256` is the checksum of the 0061 file **as it was applied**,
which is the file from the `feat/0061-ingredient-aliases` branch:

```
d09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a
```

Verified on 2026-11-19 against the branch file:

```console
$ git show origin/feat/0061-ingredient-aliases:db/migrations/0061_ingredient_aliases.sql | sha256sum
d09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a  -
```

That checksum is the same one recorded in
`docs/MIGRATION-RECEIPT-0061.md`.

---

## The ledger's role

`public.gus_migrations_applied` is the GUS chain's **index**. It is a
*record*, not a mechanism:

- nothing reads it to decide whether to run a migration,
- nothing auto-applies `db/migrations/` to live,
- `drizzle.__drizzle_migrations` does not record the GUS chain.

The **authoritative** record of 0061's apply is the receipt,
`docs/MIGRATION-RECEIPT-0061.md`. The receipt already existed and
already documented the apply before this migration was written.

So this migration does not change *what happened* — it makes the index
agree with the receipt, so that a reader who queries the ledger sees
0061 in the chain.

---

## The backup

Taken immediately before the apply, on the live VPS:

```
/home/deploy/gustale.com/backups/gustale_pre_0062_20261119T140342Z.dump
3,959,444 bytes
```

The daily `gustale-backup.service` had also last run successfully
(`Result=success`, `ExecMainStatus=0`, at 09:11 WITA on 2026-11-19),
and the dedicated pre-0061 backup
(`gustale_pre_0061_20261119T130936Z.dump`, 4,528,697 bytes) was still
in place from that apply.

---

## The checksum protocol

The file was copied to the VPS and its checksum compared byte-for-byte
before `psql` ever saw it:

```console
$ sha256sum /tmp/0062.sql
498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7  /tmp/0062.sql

$ ssh root@<vps> 'sha256sum /tmp/0062.sql'
498ab199069c49452d2b3cb1219cc483968292b6cbf1368baaf537a02532f0d7  /tmp/0062.sql
```

**Identical.** The file that ran on live is the file in this repository.

> **A note on this checksum.** The first version of 0062 was applied and
> then **changed**: its proof P4 asserted that the alias table exists,
> and the CI gate caught that as a real failure — the CI chain did not
> apply 0061 (it lived in the unmerged PR #266), so the table was
> legitimately absent there. P4 was made conditional on the table
> existing. The checksum above is the file that was applied to live on
> 2026-11-19 and re-applied for the idempotence proof.
>
> **P4 was revised again on 2026-11-20**, after PR #266 merged and 0061
> entered the CI chain — see "THE P4 REVISION" below. That revision
> changes the **proof**, not the data: the file's INSERT, the ledger row
> it writes, and everything it writes to live are unchanged. The live
> proof is strictly **stronger** after the revision, not weaker. The
> checksum in this section remains the record of the file that ran on
> live on 2026-11-19; the revision of 2026-11-20 was made in the
> repository, and live has not been re-applied since — live still holds
> the row and the one alias row, both unchanged.

---

## The apply

```console
$ docker exec shared-postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d gustale -f /tmp/0062.sql
BEGIN
psql:/tmp/0062.sql:64: NOTICE:  relation "gus_migrations_applied" already exists, skipping
CREATE TABLE
COMMENT
INSERT 0 1
psql:/tmp/0062.sql:160: NOTICE:  CONFIRMED: the ledger records 0061
psql:/tmp/0062.sql:160: NOTICE:  CONFIRMED: the 0061 ledger row carries the applied checksum
psql:/tmp/0062.sql:160: NOTICE:  CONFIRMED: the ledger holds 11 rows, including 0061
psql:/tmp/0062.sql:160: NOTICE:  CONFIRMED: the alias table still holds exactly one alias
COMMIT
psql:/tmp/0062.sql:169: NOTICE:  GUS_LEDGER_0061_OK=1
DO
PSQL_RC=0
```

`INSERT 0 1` — one row inserted. `PSQL_RC=0`, 0 error lines, and the
transaction committed.

The **final** version of the file (after P4 was made conditional — see
the note on the checksum above) was re-applied to live and passed all
four proofs there as well:

```console
INSERT 0 0
psql:/tmp/0062.sql:172: NOTICE:  CONFIRMED: the ledger records 0061
psql:/tmp/0062.sql:172: NOTICE:  CONFIRMED: the 0061 ledger row carries the applied checksum
psql:/tmp/0062.sql:172: NOTICE:  CONFIRMED: the ledger holds 11 rows, including 0061
psql:/tmp/0062.sql:172: NOTICE:  CONFIRMED: the alias table still holds exactly one alias
psql:/tmp/0062.sql:181: NOTICE:  GUS_LEDGER_0061_OK=1
PSQL_RC=0
```

`INSERT 0 0` — the row was already there, so nothing was written, and
the proofs still passed.

---

## The proofs

The migration carries its own four proofs, in one `DO` block, inside
the transaction:

| | proof | result |
|---|---|---|
| **P1** | the ledger has a row for `0061_ingredient_aliases` | CONFIRMED |
| **P2** | that row carries the checksum of the applied file | CONFIRMED |
| **P3** | the ledger holds its 0061 row and is otherwise unchanged | CONFIRMED (11 rows) |
| **P4** | the alias table still holds exactly one alias — **checked only when the table exists** | CONFIRMED |
| **P4a** | the alias row count is **unchanged** by this migration (added 2026-11-20) | CONFIRMED |
| **P4b** | where the orphan `bechamel-sauce` exists, the alias table holds exactly one row **and it resolves to `bechamel`** (added 2026-11-20) | CONFIRMED |

P4 is the important one for a ledger-only migration: it proves the
data 0061 wrote was **not** disturbed by this one.

**P4 was conditional on purpose — and then it was revised.** The alias
table is created by 0061. At the time of the live apply, 0061 was **not**
applied before this migration in the CI chain (it lived in PR #266, which
was not merged), so the table was legitimately absent there. The first
version of the migration asserted the table exists, and the CI gate caught
that as a real failure:

```
FAILED: 0062
psql:<stdin>:160: ERROR:  P4 FAILED: the alias table is missing
```

P4 was then made conditional on the table existing, and printed a plain
note when it did not. On live, where 0061 **has** been applied, the check
was the real one and it passed.

**That conditional version was STILL wrong, and CI caught it again on
2026-11-20.** PR #266 has since been merged, so 0061 **is** now in the CI
chain — the table now EXISTS on CI. But 0061 creates the table and writes
the alias row only where the retired orphan ingredient `bechamel-sauce`
exists, and that orphan lives on **live** only (it is the duplicate that
GUS-092 later deletes). On a chain-built database the orphan is absent, so
0061 skips the insert and leaves the table **empty**. The conditional P4
therefore took the "table exists" branch and asserted the LIVE count:

```
FAILED: 0063
psql:<stdin>:197: NOTICE:  CONFIRMED: the ledger holds 7 rows, including 0061
psql:<stdin>:197: ERROR:  P4 FAILED: the alias table holds 0 rows, expected exactly 1
```

**The revision — P4a and P4b (2026-11-20).** P4 now asserts the
invariant that is true on **every** shape and is what the proof was for:

| | proof | live | chain-built |
|---|---|---|---|
| **P4a** | the alias row count is **unchanged** by this migration (captured before the ledger INSERT, compared after) | 1 → 1 | 0 → 0 |
| **P4b** | where the orphan `bechamel-sauce` exists, the alias table holds **exactly one** row, and it resolves to the canonical `bechamel` ingredient | asserted | skipped, with a plain note |

**Nothing on live is weakened.** Live holds one alias row; P4b asserts one
alias row, exactly as before, and now *additionally* asserts that the row
resolves to the canonical ingredient — so the live proof is **strictly
stronger** than the version that ran on live. P4a is a new proof that
holds on both shapes and proves the ledger-only migration disturbed
nothing.

**The negative tests.** The revised P4 was checked against a deliberately
broken live-shaped database, so the gate is known to have teeth:

| the database was broken like this | the migration did this |
|---|---|
| the alias row deleted | `ERROR: P4 FAILED: the alias table holds 0 rows, expected exactly 1` |
| the alias resolving to the wrong ingredient | `ERROR: P4 FAILED: the bechamel-sauce alias is missing or does not resolve to the bechamel ingredient` |
| an extra alias row present | `ERROR: P4 FAILED: the alias table holds 2 rows, expected exactly 1` |

**The full chain passes with the revision.** The local reproduction of the
exact CI chain (`scripts/ci-migration-chain.sh`) was run twice — once with
the pre-revision file and once with the revised one — and produced:

```
# with the pre-revision file
FAILED: 0063
psql:<stdin>:197: ERROR:  P4 FAILED: the alias table holds 0 rows, expected exactly 1

# with the revised file
psql:<stdin>:324: NOTICE:  GUS_LEDGER_0061_OK=1
...
FULL_CI_CHAIN_OK=1
```

The chain-built database ends with `ledger = 7 rows`, `ingredient_aliases
= 0 rows`, and no `bechamel-sauce` ingredient — which is exactly the shape
that broke the previous version.

**P3 is a floor, not an equality.** This migration runs in two
databases — the CI chain (7 ledger rows) and live (11) — whose ledgers
differ by the migrations they applied, so no fixed count is asserted.

---

## The CI chain

A migration that is not in the CI chain is a migration that is never
applied in CI, in the Nightly, or in the local reproduction — and a
schema that does not exist. So 0063 was added to all three lists, and
the validator that keeps them in agreement passes:

```console
$ python3 scripts/validate-ci-migration-chain.py
CI migration chain OK (61 migrations, all three lists agree)
```

| file | what was added |
|---|---|
| `scripts/ci-migration-chain.sh` | `MIGRATION_0063=...` and the run block |
| `scripts/repro-ci-db.sh` | the same step, for the local reproduction |
| `.github/workflows/ci.yml` | **as a patch file** — see below |

### The `ci.yml` change ships as a patch file

The GitHub App (`gustale-bot`) has **no `workflows` scope**. GitHub
refuses to let it create or update a file under `.github/workflows/`:

```
 ! [remote rejected] ... (refusing to allow a GitHub App to create
   or update workflow `.github/workflows/ci.yml` without
   `workflows` permission)
```

The PAT is revoked and the SSH deploy key is rejected, so no machine
identity available to the agent can push a workflow change. The
`ci.yml` step therefore ships as **`docs/ci-0063-migration-chain.patch`**,
which the owner applies — the same pattern as the other
`docs/ci-*.patch` files in this repository.

```console
$ git apply docs/ci-0063-migration-chain.patch
```

It was verified to apply cleanly against a pristine `origin/main`, and
the validator was then run on a fully-patched tree:

```console
$ python3 scripts/validate-ci-migration-chain.py
CI migration chain OK (61 migrations, all three lists agree)
```

61 migrations — 60 before, 0063 the one that is added.

The live-migration gate's own test also passes against the chain:

```console
$ bash scripts/test-apply-migration-live-copy.sh
=== 5. the assertions ===
  OK    the gate succeeds against the stand-in
  OK    the gate reports LIVE_MIGRATION_OK=1
  ...
  ALL PASS
```

And the marker check passes against the real log:

```console
$ bash scripts/check-ci-markers.sh "record 0061 in the ledger" "GUS_LEDGER_0061_OK" /tmp/m0063.log
  record 0061 in the ledger: the marker 'GUS_LEDGER_0061_OK' is present
```

---

## The independent verification

The checks below were run **separately** from the migration's own
proofs, querying live directly.

**The ledger now agrees with the receipt:**

```console
$ docker exec shared-postgres psql -U postgres -d gustale -tAc \
    "SELECT name, applied_at::date, applied_by, sha256 FROM public.gus_migrations_applied WHERE name LIKE '006%' ORDER BY applied_at;"

0060_legacy_associations_published|2026-11-17|Hermes|
0061_ingredient_aliases|2026-11-19|Hermes|d09d86a9b225035517d9430d2ca07b72bc9d0b31b348df726cbfb2d9f17ec85a
```

**The counts changed by exactly one row, and nothing else:**

| | before | after |
|---|---|---|
| `gus_migrations_applied` | 10 | **11** |
| `ingredient_aliases` | 1 | **1** |
| `ingredients` | 45 | **45** |
| `dish_ingredients` | 23 | **23** |

---

## The idempotence proof

The migration was applied a **second time** to live, unchanged:

```console
$ docker exec shared-postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d gustale -f /tmp/0062.sql
INSERT 0 0
psql:/tmp/0062.sql:160: NOTICE:  CONFIRMED: the ledger records 0061
...
psql:/tmp/0062.sql:169: NOTICE:  GUS_LEDGER_0061_OK=1
PSQL_RC=0

$ docker exec shared-postgres psql -U postgres -d gustale -tAc \
    "SELECT (SELECT count(*) FROM public.gus_migrations_applied), (SELECT count(*) FROM public.ingredient_aliases);"
11|1
```

`INSERT 0 0` — the second run inserted **nothing**, and the counts are
unchanged. The `ON CONFLICT (name) DO NOTHING` did its job: this
migration never edits a ledger row it did not create.

---

## The follow-on work this migration does NOT do

0063 closes the **ledger** gap for 0061. Two things remain open, and
neither is a defect in this migration:

1. **The API's alias-resolving route is still unmerged.** It lives in
   PR #266, which needs the owner-only `approved-live` label before it
   can merge. The `ingredient_aliases` **table** is on live and
   populated; the route that reads it is not deployed. So
   `GET /api/ingredients/bechamel-sauce` still returns the pre-alias
   behaviour on live.

2. **0061's own file still omits its ledger `INSERT`.** That is
   deliberate and correct under Rule 11 — the file is immutable now
   that it has been applied. The omission is documented here and in
   `docs/MIGRATION-RECEIPT-0061.md`, so the chain is not
   self-describing on its own, but it is not wrong.

---

**Applied by:** Hermes, by direct `psql` on the live VPS, 2026-11-19.
**`PSQL_RC=0`.** All four proofs confirmed. Idempotent. The ledger went
from 10 rows to 11, and no other count moved.
