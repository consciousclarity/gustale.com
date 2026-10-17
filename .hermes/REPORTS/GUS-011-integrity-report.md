# GUS-011 — Integrity report (Phase 0)

**Date:** 2026-10-17 · **Auditor:** Hermes (gustale profile) · **Scope:** published catalog at `api.gustale.com` (121 published dishes as of 2026-10-17)
**Method:** read-only live API sweeps (dishes, dishes/:slug, relations, journey, lineages, categories, ingredients) + comparison against the dish endpoints' published shape and seed data in `packages/db/src/seed-data/`. No DB writes, no destructive ops.

This is the baseline report — the FIRST run of the integrity check. Future runs should be cron-driven and diff against this snapshot (file: `.hermes/REPORTS/GUS-011-integrity-snapshot-2026-10-17.json` is implied; see "Next steps" §7).

---

## 1. Summary

| Check | Total | Affected | Severity |
|---|---|---|---|
| Dish count vs seed | 121 | matches seed-data/dishes.ts (121 entries) | OK |
| Slug uniqueness | 121 | 0 duplicates | OK |
| Canonical name uniqueness | 121 | 0 duplicates | OK |
| Missing origin (country) | 121 | 0 | OK |
| Invalid / (0,0) coordinates | 121 | 0 | OK |
| Orphan relations (dish→dish refs to non-existent slugs) | 121 | 0 | OK |
| All sources = Wikipedia | 121 | **121/121** | **P0** (feeds EPIC 03) |
| `longDescription` populated | 121 | 21 (17.4%) | P1 |
| Preparation steps populated | 121 | 1 (moussaka-greek) | P1 |
| Cover image present | 121 | 11 (9.1%) | P1 (GUS-153) |
| Journey beats present | 121 | 12 (9.9%) | P2 |
| **Category table near-duplicates** | 152 | **86 (56.6%)** | **P0** (GUS-011) |
| Lineages table vs homepage "15 lineages" stat | 14 | 15 — semantic mismatch | P1 (fix in AtlasHeroKpi) |
| `kitchen-tested` set without human review | 121 | 0 | OK (RULES.md guard working) |

## 2. Catalog identity (sanity)

- `/api/dishes` paginated: 121 published, 0 drafts, 0 deleted surfaced. Matches `seed-data/dishes.ts` (121 entries).
- Slugs unique across the catalog. Canonical names unique (no `Moussaka` collision between `moussaka-greek` and `moussaka-levant`, etc.).
- Every dish has an origin country (none null). All lat/lng within bounds; no `(0,0)` "Null Island" rows.
- 36 distinct origin countries (smallest, Indonesia and India dominate the catalog).

## 3. The P0 findings

### 3.1 All sources are Wikipedia (P0)
- **Swept 121 dish details.** Every dish has ≥1 source, and **every source's publisher+URL contains `wikipedia` or `wikidata`**. Zero dishes with a non-Wikipedia source.
- **Implication:** RULES.md §Credibility and ROADMAP §5 ("Wikipedia is discovery, never sole source for a contested claim") are **already violated for 100% of the published catalog**. The audited content is one-sourced. This blocks Phase 1→2 credibility and is the single largest content gap in the project.
- **Action:** feed into EPIC 03 — GUS-026 evidence policy, GUS-028 claim citations, GUS-014 entity model. Out of scope for the integrity check itself, but must be tracked in BACKLOG.yaml as a Phase-0 blocker of the Phase 1→2 gate.

### 3.2 Category table has 86 near-duplicate rows (P0)
- `/api/categories` returns **152 categories**. 66 are sensible, well-named single concepts (e.g. `indonesian-cuisine`, `pasta`, `dumpling`, `kebab`).
- The remaining **86 entries (56.6%) are near-duplicates / variant spellings** of the same idea:
  - Pluralisation: `noodle-soup` vs `noodle-soups`, `dumpling` vs `dumplings`, `kebab` vs `grilled-skewered`
  - Renamed/expanded: `stew` vs `stews-braises`, `soups-broths` vs `soups-broths-family` (a third `soup` also exists)
  - Direction-of-description: `bread` vs `breads-doughs` vs `leavened-loaves` vs `flatbreads` vs `fried-breads` vs `enriched-breads` vs `sandwiches-stuffed-breads` vs `hand-pies-turnovers`…
- **Visible impact on site:** none in the live dish pages (categories render as 3-4 chips per dish), but search, filter, and the upcoming "browse by category" UI (GUS-073+) will surface this mess. It is also hostile to the roadmap's data-model redesign (EPIC 02).
- **Action:** follow-up task to **de-duplicate / consolidate the `categories` table** as the first sub-step of GUS-014 (entity model). Treat as a Phase 0 deliverable; a separate small migration is needed (not destructive: aliases / soft-deprecate, RULES.md approval required for the merge step).

## 4. The P1 findings

### 4.1 Lineages 14 vs homepage 15 (semantic mislabel)
- `/api/lineages` returns **14** rows (filled-dough, flatbread, rice-pilaf, noodle-soup, stuffed-leaves, skewered-grilled-meat, curry-spiced-stew, fermented-bean, fried-dough-pastry, preserved-fish, chili-condiment, wrapped-leaf, fermented-batter, stuffed-pasta).
- `AtlasHeroKpi.astro` (homepage hero) reports **15 lineages**. Cause: it counts distinct `dishes[i].methodSlug` values (15 of them: 14 lineages + `steamed-and-custard`), conflating *cooking methods* with *lineages*. The 15th value appears in seed `LINEAGE_METHODS` but is not a member of the `LINEAGES` array.
- **Fix:** the KPI band should either:
  1. Read `lineages.length` from the same `/api/lineages` endpoint (simple, correct), or
  2. Rename the label to "cooking methods" (15) and add a second "lineages" stat (14).
- Pick the smaller-blast-radius option when the task is picked up; trivial change, ~5 lines.

### 4.2 No long description on 100/121 dishes
- 21/121 (17.4%) have `longDescription`. The other 100 fall back to `shortDescription` on the dish page.
- The Indonesian batch in flight (private/state) is currently writing `longDescription` (per `scripts/inject-mock-journeys.mjs` and earlier `long-descriptions-indonesia-batch1.md`). This will close the gap, not raise it.

### 4.3 No detailed preparation steps on 120/121 dishes
- Only `moussaka-greek` has populated `preparations[].steps`. All other 120 dishes have `preparations[].steps: null`. Blocks the cooking-mode feature (ROADMAP §7 EPIC 07).
- The `preparationMethods` taxonomy has 15 entries (matches the `LINEAGE_METHODS` set above).

### 4.4 110/121 dishes have no cover image
- 11 dishes have covers: `moussaka-greek` + the 10 Indonesian batch dishes (nasi-goreng, pempek, rendang, gado-gado, babi-guling, rawon, sate-lilit, soto-ayam, sambal, satay).
- In-flight under GUS-153. Batch-1 + batch-2 (private/state) extending.

## 5. The P2 finding

### 5.1 Journey beats populated on 12/121 dishes
- The `/api/dishes/:slug/journey` endpoint returns `beats: []` for 109 dishes, 3 beats for 12 dishes (banh-mi, ceviche-peruvian, chicken-tikka-masala, falafel, hamburger-american, jollof-rice, pho-vietnamese, pizza-margherita, poutine, sushi, tagine-moroccan, vindaloo). Note the `total` field reports 0 in all cases — that looks like a field-mapping bug, worth a separate small PR.
- Out of Phase 0 scope but noted.

## 6. The "OK" findings (negative results)

- **No duplicate canonical names** in the published catalog.
- **No orphan dish→dish relations** in `/api/dishes/:slug/relations` (swept 121 dishes; 0 references to non-existent slugs).
- **No `kitchen-tested` set** on any dish (RULES.md guard working — `kitchen-tested` is admin-only and would require human approval).
- **No (0,0) / out-of-range coordinates.**
- **No empty-origin dishes.**

## 7. Next steps (suggested for execution program)

1. **Fix the lineages KPI label** (~5-line PR, AtlasHeroKpi.astro) — included as a follow-up; can ship in this same PR or stand alone. **No schema change.**
2. **Add an integrity cron** that runs this same check on a schedule, writes the JSON snapshot to `.hermes/REPORTS/integrity/<date>.json`, and fails the nightly workflow on regressions. Belongs to GUS-011 acceptance.
3. **De-duplicate `categories` table** — separate task in BACKLOG (proposed GUS-011.b / folded into GUS-014 prep). **RULES.md approval required** for the merge (drop/rename/merge data).
4. **EPIC 03** unblocks the P0 "all sources are Wikipedia" finding.

## 8. Reproducing

```bash
# One-shot (reproduces this report; same outputs until the catalog changes)
for s in $(curl -s 'https://api.gustale.com/api/dishes?limit=200' | jq -r '.dishes[].slug'); do
  curl -s "https://api.gustale.com/api/dishes/$s" > "/tmp/dish-$s.json"
  curl -s "https://api.gustale.com/api/dishes/$s/relations" > "/tmp/rel-$s.json"
done
curl -s 'https://api.gustale.com/api/lineages' > /tmp/lineages.json
curl -s 'https://api.gustale.com/api/categories' > /tmp/categories.json
```

Or use `apps/api/test/dishes-journey.test.ts` and similar integration tests as the canonical runner (extend with a `gustale-integrity` test file under `apps/api/test/`).

---
*Acceptance: report at `.hermes/REPORTS/GUS-011-integrity-report.md`; covers dupes / broken refs / orphans / invalid coords / missing required fields; includes the 15-vs-14 lineage cause from GUS-001.*
