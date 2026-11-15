# WP-A2 — one evidence label, one relationship key

**Baseline:** `origin/main` @ `be5915dd` (WP-A1 merged) · **Branch:** `feature/evidence-label-and-relationship-key`
**Date:** 2026-11-16 · **Package:** WP-A2 of the 2026-11-15 blueprint

---

## The problem

The site carried **five** different vocabularies for how well something is
supported, in five different components, and a reader could not tell that
"Proposed", "Likely" and "Likely related" meant roughly the same thing:

| where | vocabulary |
| --- | --- |
| the journey's badge | `Documented`, `Likely`, `Possible`, `Parallel tradition` |
| the dish page's badge | `unevidenced` (a raw database value) |
| the atlas island's badge | `Evidenced`, `Proposed`, `Being researched`, `Not yet evidenced` |
| the place page's badge | a second copy of the atlas island's four |
| the lineages' badge | `Documented`, `Likely related`, `Probable`, `Possible influence`, `Uncertain`, `Parallel evolution` |

The blueprint names one set of four public labels — **Documented, Likely,
Disputed, Unverified** — and asks for "one `EvidenceLabel` and one
`RelationshipKey` used everywhere".

## What this PR does

### 1. One mapping function, with the table as the specification

`apps/web/src/lib/evidenceLabel.ts` maps every vocabulary the database
holds onto the four public labels. The mapping is data, not branching:
adding a source value is a one-line change.

The **dispute check comes first** — a disputed claim is Disputed whatever
its evidence says. Then the evidence status, then the journey's
confidence, then the lineage's confidence level, then the review state,
then the source tie-breaker.

The source tie-breaker is the part that matters most: **Documented means
a source states it, so without a source the label falls back to Likely;
Likely means sources agree, so without a source it falls back to
Unverified.** A database row cannot reach the strongest label by
assertion alone.

The 35-row table-driven test in `evidenceLabel.test.ts` is the
specification, and it includes the two live-data cases checked against
production on 2026-11-16:

- all 2,713 live `dish_place_associations` rows are `unevidenced` → **Unverified**
- all 1,354 live `statements` rows are `provisional` → **Likely**

### 2. One badge component

`apps/web/src/components/EvidenceLabel.tsx` renders the label as a text
plus a dot whose **shape** differs per label — solid, ring, split,
hollow — so the four states are separable in greyscale and by a reader
who cannot distinguish the hues. The text is always present, so the
state is never carried by colour alone (WCAG 1.4.1).

The four colours are new tokens, checked against the warm cream ground:

| label | colour | on `--bg` | on `--card` |
| --- | --- | --- | --- |
| Documented | `#2f4a34` | 8.68:1 | 9.21:1 |
| Likely | `#211c16` | 15.02:1 | 15.94:1 |
| Disputed | `#6b4400` on `#fff3d6` | 7.61:1 | 7.77:1 |
| Unverified | `#6b6052` | 5.45:1 | 5.79:1 |

### 3. One relationship key

`apps/web/src/components/RelationshipKey.tsx` explains the blueprint's
three kinds — **Associated with**, **Resembles**, **Influenced** — with
the mark, the meaning, and what each kind requires.

The mark is the carrier, not the colour: a solid teal dot, a dashed grey
line, a solid terracotta line with an arrowhead.

### 4. One page of text

`/about/evidence` — "How we handle evidence" — explains the four labels,
the three relationships, the six things the site does not do, and who
checks the work. It is linked from the evidence page's relationship key
and is the answer to "what does this badge mean?".

### 5. The five vocabularies, replaced

| component | before | after |
| --- | --- | --- |
| `DishJourney.tsx` | `djc__badge--${confidence}` | `EvidenceLabel` |
| `DishDetail.tsx` | `rec-evidence__badge` printing `unevidenced` | `EvidenceLabel` |
| `AtlasPlaces.tsx` | its own `EVIDENCE_LABEL` map | `EvidenceLabel` |
| `PlaceDishes.tsx` | a second copy of the same map | `EvidenceLabel` |
| `LineageBrowse.tsx` | `lin-card__conf--${level}` | `EvidenceLabel` |
| `lineages/[slug].astro` | its own `CONFIDENCE_LABELS` | the shared mapping |

The **filter dropdown** on the lineages page keeps the precise level
names ("Probable", "Uncertain"), because a filter option has to name the
thing it filters by. The **badge** on each card is the public label.

## The contrast fix that came with it

`scripts/hermes/wp-a2-evidence-page-gate.mjs` found a
`color-contrast` violation on `/dishes/moussaka-greek` at `.stime > b`:
`#b04e29` on `#efe1d4` at 11px, **4.13:1** against a 4.5 requirement.

This was **pre-existing and unrelated** — it was reproduced on production
before the fix. It is a one-token change (`--accent` → `--accent-dark`,
which measures 6.5:1 on the same ground) and it is fixed here rather
than left as a known failure.

## Verification

```
node --test --experimental-strip-types src/lib/evidenceLabel.test.ts
# tests 35 · pass 35 · fail 0

npm test                                    # the whole web suite
# tests 166 · pass 166 · fail 0

pnpm lint                                   # RC 0
pnpm --filter @gustale/web run build:geo    # BUILD_RC 0, all validate-build checks pass

node scripts/hermes/wp-a2-evidence-page-gate.mjs --base http://127.0.0.1:4321
# 4 pages x 2 viewports — 0 violations

node scripts/hermes/axe-accessibility-gate.mjs
# 6 pages x 2 viewports — 0 violations
```

In the built output:

- `Not yet evidenced`, `Being researched`, `Parallel tradition` and
  `>unevidenced<` — **0 files each**. Gone.
- `>Unverified<` — **13,532 files**. The badge is on every dish page.
- The `/about/evidence` page is built (28.6 KB) and carries all three
  relationship marks.

## Screenshots

`docs/screenshots/wp-a2/` — the evidence page and the new badges, at
1440 px and 390 px.

## Still to do, stated plainly

- **The map's legend still uses the four-kind grammar**
  (`family`, `likeness`, `descent`, `migration`), not the blueprint's
  three. Rewiring the map is WP-C3's package; this PR adds the key
  without changing what the map draws, so the two do not yet agree.
- **`family` connections are still drawn.** The blueprint stops showing
  type `family` as a connection — 47 of the site's 82 connections are
  family rows, so the honest count is 35. That change belongs with the
  map work, not here.
- **The recipe-side site's own evidence vocabulary** was not audited in
  this pass; only the Atlas host's components were changed.
