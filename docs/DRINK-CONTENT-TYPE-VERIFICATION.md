# Drink content-type verification

**Verified live:** 2026-11-06, read-only against the restored database.

## The rule

`dishes.content_type` is **editorial** metadata. It is set by hand, one dish at a time.
It is **never** synchronised from family tags, and no trigger propagates a family change
into `content_type`. The two columns are independent by design.

Migration `0049_content_type.sql` added the column with a CHECK constraint and applied
the Pelamushi correction.

## The verified editorial drink set — 8 dishes

| slug | content_type | family |
|---|---|---|
| `bir-pletok` | drink | drink |
| `buttermilk-koldskal` | drink | drink |
| `cendol` | drink | drink |
| `champurrado` | drink | drink |
| `es-doger` | drink | drink |
| `es-goyobod` | drink | drink |
| `lassi` | drink | dish |
| `neera` | drink | drink |

Seven sit in family `drink`. `lassi` is `content_type='drink'` while its canonical family
is `dish` — that is the deliberate case that proves the two fields are independent. A
sync would have overwritten one of them.

## The Pelamushi correction

`pelamushi` is a **dessert**, not a drink:

| slug | content_type |
|---|---|
| `pelamushi` | dish |

Migration 0049 re-pointed its family to `dessert`. It was previously mis-classified as a
drink and would have been counted in the drinks set.

## Live counts at verification time

| content_type | dishes |
|---|---|
| dish | 1,467 |
| drink | 8 |

## Why there is no Startpage drinks row

The drinks set is 8. The Startpage drinks row is deliberately withheld until there are
roughly **40 verified drinks** — a row of 8 would misrepresent the coverage of the
drink section, and the section is not the Startpage's subject. The Startpage selects
exactly 12 dishes by an auditable rule, with no drinks row and no dash counters.

## What would invalidate this

- Any change that derives `content_type` from family tags. That would break `lassi`
  immediately.
- Any migration that re-runs the Pelamushi correction against an already-correct row.
- A count that reports a `drink` set other than 8 without a corresponding editorial
  review.
