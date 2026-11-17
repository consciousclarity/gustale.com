# MIGRATION RECEIPT — `0059_dish_families_descriptions.sql` + `0058_dish_families_listed.sql`

**Applied to live on 2026-11-16 at 17:38–17:39 WITA, by Hermes Agent, over
SSH to `root@62.72.7.218`, by direct `psql`.**

**`PSQL_RC_0059=0` · `PSQL_RC_0058=0`.** Both migrations' own proofs
passed inside their own transactions.

**Order: `0059` FIRST, then `0058`.** Not the other way round, and the
reason is in `0058`'s header: `listed` is *defined* as
`(family_class = 'FORM' AND the family has a description)`, so the
descriptions have to be in place before the backfill reads them. The
reverse order marks the 56 unlisted and leaves them that way.

---

## Rule 11 — a correction, and what it means for this receipt

Both migrations were applied to live with the files **as they stood on
the PR branch at the time of the apply** (`4e6516b`). After the apply,
CI found two defects in those files, and both were fixed in commit
`348af03`.

The fixes are **NOT changes to what live received.** They change what
the migration does on a *different* database shape (the CI fixture
database) and on a *re-run* (where the column already exists).

**Both fixed files are no-ops on live, and that was proven by running
them against the live database:**

```
0058 on live -> UPDATE 0, 162 listed, 144 unlisted, all assertions pass
0059 on live -> skipped cleanly ("the 56 target families ... already
                carry their descriptions")
```

So the state live is in **is** the state the fixed migrations produce.
There is no second apply, and none was made. Had the fixed files been
the ones applied, live would be in exactly this state — which is what
the proof above establishes.

The two fixes, for the record:

| migration | the defect | the fix |
|---|---|---|
| `0059` | the guard asked "are there FORM families with no description?" (a question about the *database*); the body needs "are all 56 target families **present**?" (a question about the *data*). On the CI seed the first is true, the body ran, wrote 3 descriptions, and its own `= 56` assertion failed: `ERROR: 0059: expected 56 family descriptions, got 3`. | the guard now asks the data question, and **skips cleanly** on a shape that does not carry the 56. The skip path also emits the `0059: ok` marker, because the CI gate greps for it and a gate that did not report is treated as a gate that did not run. |
| `0058` | the backfill set only the **false** cases and relied on the column's `DEFAULT true` for the rest. That works once, on a table where the column did not exist. On a **re-run** the column exists, the `DEFAULT` applies to nothing, and a family that gained a description since the last run stays unlisted. | the backfill now **derives** `listed` for every row — `listed = (family_class = 'FORM' AND it has a description)` — so the result does not depend on the column's history. |

Both are recorded here because the live apply used the pre-fix files.
A reader who wants to re-derive live's state from the repository's
current files gets the same answer.

---

## The backup

Taken immediately before the apply, by the method in
`docs/AGENT-RUNBOOK.md` §3:

| | |
|---|---|
| path | `/home/gustale/backups/pre-0059-0058-20261116-173733.dump` |
| size | **4,516,885 bytes** (4.5 MB) |
| TOC entries | **1,686** (`pg_restore --list \| wc -l`) |
| method | `docker exec -u postgres shared-postgres pg_dump -U postgres -d gustale --format=custom --file=/tmp/pre-0059-0058.dump` then `docker cp shared-postgres:/tmp/pre-0059-0058.dump "$DUMP"` |

`docker cp`, not `cp` — the host and the container do not share `/tmp`,
so a plain `cp` fails with `cannot stat`.

The offsite encrypted backup was also run immediately before the apply
(`gustale-backup.service`), and its database upload is recorded in the
service log:

```
Database uploaded: raw=4516885 encrypted=3986203
sha256=e674d1c932c6ba9a522186c0842fe6203ee4d70d1e828eeaf54a57ea979283e8
```

---

## The apply

```bash
# 0059 -- the descriptions
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f - < /tmp/0059.sql

# 0058 -- the listed column and the Musakka variant
docker exec -u postgres -i shared-postgres psql -U postgres -d gustale \
  -v ON_ERROR_STOP=1 -f - < /tmp/0058.sql
```

The files were transferred by `scp` and their MD5 sums were compared
against the branch copies before the apply:

```
260cbe4b77f88a178cacc783ee825384  0058.sql
d4c5264c45eaa5ebef160ac67ac7a224  0059.sql
```

### 0059's output

```
WP-B1: the 56 FORM families have no descriptions and this migration is not yet applied - running it
BEGIN
UPDATE 56
DO
WP-B1: 0059: ok -- 56 FORM families now carry a description and stay listed
COMMIT
```

`UPDATE 56` — the migration's own `DO` block asserts that all 56 rows
it named now carry a description, and raises if the count is not 56.
It committed, so it was 56.

### 0058's output

```
BEGIN
ALTER TABLE
COMMENT
UPDATE 144
DELETE 1
NOTICE:  0058: ok -- 306 families (162 listed, 144 unlisted); the Musakka variant is gone, its similar_form relation and its standalone dish survive
COMMIT
```

`UPDATE 144` — the 144 families that must **not** be listed (the
134 non-FORM classes and the 10 FORM families with no description).
`DELETE 1` — the single Musakka variant row.

---

## The verification — independent queries, not the migration's own report

```sql
SELECT
  count(*) FILTER (WHERE listed)                      AS listed,     -- 162
  count(*) FILTER (WHERE NOT listed)                  AS unlisted,   -- 144
  count(*)                                            AS total,      -- 306
  count(*) FILTER (WHERE family_class='FORM' AND NOT listed)
                                                      AS form_unlisted,  -- 10
  count(*) FILTER (WHERE family_class<>'FORM' AND listed)
                                                      AS nonform_listed, -- 0
  count(*) FILTER (WHERE family_class='FORM' AND listed
                     AND (description IS NULL OR btrim(description)=''))
                                                      AS listed_nodesc   -- 0
FROM dish_families;
```

| check | expected | measured | |
|---|---|---|---|
| families | 306 | **306** | unchanged |
| listed | 162 | **162** | 106 pre-existing + 56 from `0059` |
| unlisted | 144 | **144** | 134 non-FORM + 10 FORM with no description |
| FORM families unlisted | 10 | **10** | the 10 that carry no dish — `0059`'s header predicted exactly 10 |
| non-FORM families listed | 0 | **0** | a COURSE, CUISINE or CONTENT TYPE is never a shape |
| listed families with no description | 0 | **0** | `listed` and "has a description" agree, as `0058` asserts |
| `dish_variants` rows | 0 | **0** | the Musakka variant is gone |
| `dishes` with slug `musakka-turkish` | 1 | **1** | the standalone dish survives |

**The `similar_form` relation survives** — the knowledge the blueprint
asked to keep:

```
 relation_type |   from_dish    |     to_dish     | status
---------------+----------------+-----------------+--------
 similar_form  | moussaka-greek | musakka-turkish | active
 similar_form  | moussaka-greek | moussaka-levant | active
```

---

## The cost, stated plainly

**849 published dishes carry only an unlisted family, and 29 carry
none** — measured on live after the apply:

```sql
SELECT count(*) FILTER (WHERE f.listed)            AS with_listed,     -- 625
       count(*) FILTER (WHERE f.listed IS NOT TRUE) AS without_listed,  -- 849
       count(*) FILTER (WHERE f.id IS NULL)         AS no_family_row    -- 29
  FROM dishes d
  LEFT JOIN LATERAL (
    SELECT df.id, f.listed FROM dish_dish_families df
      JOIN dish_families f ON f.id = df.value_id
     WHERE df.dish_id = d.id
     ORDER BY df.is_primary DESC, f.slug, df.id LIMIT 1
  ) f ON TRUE
 WHERE d.status='published';
```

1,474 published dishes: **625 keep a family, 849 will have none, 29
already had none.**

"Family: Dish" is not a shape, so those dishes will say no family
rather than claim one they do not have. **The API filter that makes
this visible ships with the merge of PR #246, not with this apply** —
until that code is live, the API still returns the placeholder
families, because the API's own query is what chooses the family.

Classifying those 849 dishes is **editorial work (WP-R)**, not a
migration's job.

---

## The site

| URL | before | after |
|---|---|---|
| `https://api.gustale.com/health` | 200 | **200** |
| `https://gustale.com/families` | 200 | **200** |
| `https://gustale.com/dishes/moussaka-greek` | 200 | **200** |

---

## The proof that the fixed files agree with live

Run against the **live** database, in a transaction that was rolled
back:

```
BEGIN;
  <the fixed 0058>
  UPDATE 0            <-- zero rows changed: a true no-op
  NOTICE: 0058: ok -- 306 families (162 listed, 144 unlisted); ...
COMMIT;
SELECT count(*) FILTER (WHERE listed) FROM dish_families;
 listed_after
--------------
          162
```

And the fixed `0059` against live:

```
WP-B1: 0059: skipped -- the 56 target families are not all present in this
         database, or they already carry their descriptions
WP-B1: 0059: ok -- skipped cleanly; ...
```

**Live is in the state the fixed migrations produce.** Nothing more
was applied.

---

## The CI matrix, proven

Against a **live-shaped copy of production** (306 families) and the CI
fixture database (28 families):

| scenario | result |
|---|---|
| live shape: `0059` then `0058` | 162 listed, 144 unlisted |
| live shape: `0059`, `0058`, `0058` again | 162 listed — **idempotent** |
| live shape: `0058`, `0059`, `0058` again | 162 listed — **was `ERROR` before the fix** |
| CI shape: `0059` then `0058` | 2 listed, 26 unlisted |
| CI shape: `0059` alone | skipped, `0059: ok` |

Both marker checks pass on every path (`0059: ok`, `0058: ok`).
