# LIVE-APPLY-0057 — GUS-1108, the ingredient sourcing vocabulary

**Owner:** Alejandro · **Migration:** `db/migrations/0057_ingredients_sourcing_vocabulary.sql`
**What it does:** adds 21 rows to `ingredients` — the reviewed 20-ingredient
list, plus one, because the spec's "Parmigiano Reggiano and Pecorino" is
two ingredients here.

**This runbook is the owner's to run.** The agent does not apply a live
migration. Everything below is the sequence, with the exact commands and
the exact expected output, so the owner can run it without reading the
migration.

---

## 1. What has already been proved

| the gate | the result |
|---|---|
| the full 57-migration chain, on a fresh database | `FULL_CI_CHAIN_OK=1` |
| 0057's own 6 proofs, inside the chain | `0057: all 6 proofs passed` |
| the dry run against an **exact copy of live** | `DRYRUN_OK=1` |
| idempotence — applied twice | `IDEMPOTENT: the second application succeeded` |
| the proof mutants | `ALL_MUTANTS_CAUGHT=1` (5/5) |
| the live baseline, unchanged by this | `24 ingredients, 5 published` |

**The dry run's own count read-back**, on the copy of live:

```
the ingredients: 45 total, 21 new, 5 published, 1 without a resolvable category
```

45 = 24 pre-existing + 21 new. The 5 published are the same 5 that were
published before. **The one row without a resolvable category is the
pre-existing `bechamel-sauce` row**, whose `category` is empty — it is
not one of the 21, and this migration does not touch it.

---

## 2. Before you start — the two things to confirm

**The backup.** The live-apply gate requires a verified backup, and
"the dump exists" is not enough. It must restore with exit code 0, zero
errors, and matching counts.

```bash
systemctl status gustale-backup.service --no-pager
```

**The owner has NOT applied `approved-live` to PR #219.** That label is
for migration `0056` (the ingredient aliases). **0057 is a separate
migration and does not need it** — 0057 writes to `ingredients`, and
0056 writes to `ingredient_aliases`; they do not overlap. If the owner
prefers to land 0056 first (the béchamel merge), say so, because the
order matters for the receipt.

---

## 3. The apply — copy-pasteable

```bash
cd /root/gustale.com   # or wherever the checkout is on the VPS

# The backup, through the service, and WAIT for it.
systemctl start gustale-backup.service
systemctl status gustale-backup.service --no-pager
```

**Wait for `SUCCESS`.** If it says `failed`, **stop** — do not apply.

Then the dry run, which restores the copy on the dedicated test postgres
(never on production):

```bash
bash scripts/dryrun-migration.sh \
  db/migrations/0057_ingredients_sourcing_vocabulary.sql \
  gustale_0057_dryrun
```

**Expected:** `DRYRUN_OK=1`, `0057: all 6 proofs passed`, and
`IDEMPOTENT: the second application succeeded`.

**If the dry run fails, stop.** Do not apply.

Then the apply itself:

```bash
docker exec -i shared-postgres psql -U postgres -d gustale -v ON_ERROR_STOP=1 \
  < db/migrations/0057_ingredients_sourcing_vocabulary.sql
```

**Expected:** `NOTICE: 0057: all 6 proofs passed`, and **no ERROR**.

---

## 4. The independent verification

**These queries do not ask the migration whether it worked.** They read
the database fresh.

```bash
# 4.1 the count: 24 + 21 = 45
docker exec -i shared-postgres psql -U postgres -d gustale -tAc \
  "SELECT count(*) FROM ingredients"

# 4.2 the 21 new rows, and their status
docker exec -i shared-postgres psql -U postgres -d gustale -tAc \
  "SELECT slug, status FROM ingredients WHERE slug IN (
     'coconut-milk','cassava','plantain','tamarind','saffron',
     'preserved-lemon','curry-leaves','makrut-lime-leaves','gochujang',
     'doubanjiang','fish-sauce','fresh-mozzarella-di-bufala',
     'parmigiano-reggiano','pecorino','ube','ackee','huitlacoche',
     'asian-pear','pandan','epazote','fresh-corn-masa')
   ORDER BY slug"

# 4.3 every one of them resolves a category in the FoodOn taxonomy
docker exec -i shared-postgres psql -U postgres -d gustale -tAc \
  "SELECT count(*) FROM ingredients i
     LEFT JOIN ingredient_categories c ON c.slug=i.category
   WHERE c.slug IS NULL AND i.slug IN (
     'coconut-milk','cassava','plantain','tamarind','saffron',
     'preserved-lemon','curry-leaves','makrut-lime-leaves','gochujang',
     'doubanjiang','fish-sauce','fresh-mozzarella-di-bufala',
     'parmigiano-reggiano','pecorino','ube','ackee','huitlacoche',
     'asian-pear','pandan','epazote','fresh-corn-masa')"

# 4.4 nothing was published by this migration
docker exec -i shared-postgres psql -U postgres -d gustale -tAc \
  "SELECT count(*) FROM ingredients WHERE status='published'"

# 4.5 is_key has NOT leaked onto ingredients
docker exec -i shared-postgres psql -U postgres -d gustale -tAc \
  "SELECT count(*) FROM information_schema.columns
    WHERE table_name='ingredients' AND column_name='is_key'"
```

### What each query proves

| the query | the expected value | what it proves |
|---|---|---|
| 4.1 | **45** | the 21 rows were added and none were lost |
| 4.2 | 21 rows, all `draft` | every one of the 21 exists, and this migration published nothing |
| 4.3 | **0** | every one of the 21 resolves a real FoodOn category |
| 4.4 | **5** | the pre-existing published set is unchanged |
| 4.5 | **0** | `is_key` is still a recipe-line property, not an ingredient one |

**4.1 = 45, 4.3 = 0, 4.4 = 5, 4.5 = 0.** If any of these differs, stop and
roll back:

```bash
docker exec -i shared-postgres psql -U postgres -d gustale -c \
  "DELETE FROM ingredients WHERE slug IN (
     'coconut-milk','cassava','plantain','tamarind','saffron',
     'preserved-lemon','curry-leaves','makrut-lime-leaves','gochujang',
     'doubanjiang','fish-sauce','fresh-mozzarella-di-bufala',
     'parmigiano-reggiano','pecorino','ube','ackee','huitlacoche',
     'asian-pear','pandan','epazote','fresh-corn-masa')"
```

---

## 5. The receipt

After the verification passes, write `docs/MIGRATION-RECEIPT-0057.md`
with: the migration's SHA-256, the timestamp of the apply, the backup
path and its restore proof, the six proofs' output, the four independent
counts, and the before/after baseline.

**Baseline before:** `24 ingredients | 5 published`
**Baseline after:** `45 ingredients | 5 published`

---

## 6. What this migration does NOT do, and what it unblocks

**It does not publish anything.** All 21 rows are `draft`, because an
ingredient whose availability has not been measured must not show a
reader a rating.

**It does not write an availability row.** That is GUS-1107's job, and
it attaches to these 21 slugs.

**It does not set `is_key`.** That is `recipe_ingredients.is_key`, a
recipe-line property. The owner's correction was exactly this, and
proof 5 checks the leak.

**It does not set `ubiquitous`.** None of the 21 is a staple.

**What it unblocks:** GUS-1107's loader. Before this, the research
wrote rows for ingredients that did not exist, so nothing could be
loaded. Now the 21 slugs exist and every research row has an
ingredient to attach to.

---

## 7. The rollback, in one command

The migration is purely additive, so the rollback is a DELETE of the 21
slugs — shown in §4. There is nothing else to undo: no column was
added, no table was created, and no existing row was modified.

**Rule 11:** `0052`–`0056` are frozen. If a correction to 0057 is ever
needed, it is a NEW migration number, never an edit to this file.
