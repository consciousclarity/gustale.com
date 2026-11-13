# GUS-238 — dish journey: assessment, corrections and review package

**Branch:** `feature/gus-dish-journey-osm-cards`
**Base:** `origin/main` @ `af4a0f8`
**Status:** draft PR #234, **pilot disabled**, not merged, not deployed, no live data written.

---

## 1. Assessment: what the pack got right, and what it got wrong

The pack's **editorial contract** is sound and I kept it: a chapter needs a traceable record, dates keep their precision, an attestation is not an invention, a research gap stays a gap, and a movement needs its own source.

Its **technical assumptions** needed correcting. Everything below was re-verified against the current repository and the live sites on 12 November 2026.

| The pack said | Verified reality | What I did |
| --- | --- | --- |
| `recipes.gustale.com` is the Recipes domain | It resolves and serves Recipes content, but its **canonical is `gustale.recipes`**, and `infra/prod/Caddyfile` routes only `gustale.recipes`. `recipes.gustale.com` is a DNS alias on the same IP, not a Caddy host. | Implemented against the real canonical `gustale.recipes`. **No DNS or hosting change.** |
| `references/gustale-osm-lineage-reference.png` is the map style source | **It does not exist** in either archive. The two files in `reference/` are *hero* screenshots with no map, no marker, no attribution and no lineage block. | Derived the style from the 21 reference JPGs' palette plus the site's own basemap. **Recorded as an unresolved evidence gap.** |
| "lineage may need a new endpoint or relationship type" | `dish_lineages` already has a **typed 14-value role**, `explanation`, `changed_elements`, `confidence_level` and `sort_order`; `lineages` has descriptions, concept/origin summaries and uncertainty notes. | **No new lineage type, no new lineage table.** The section is a presentation over existing canonical data. |
| "the migration list is written down twice" | It is in **five** places, and `scripts/validate-ci-migration-chain.py` compares **three** of them and fails the build if they disagree. | Updated all five; the `ci.yml` copy ships as a patch file (see §6). |
| The Journey component renders nothing when empty, and draws a line through all points | Confirmed. `if (!beats.length) return null;` and an unconditional `LineString`. | The empty case now states a **research gap** and distinguishes it from a **fetch failure**. Lines are drawn only for source-supported movements. |
| The reference maps are simplified SVG outlines | They are — and they carry **no attribution and no scale bar**, while the brief demands both. | Used the real OSM-derived basemap with attribution and scale. A deliberate **improvement over the reference**, not a copy of it. |

---

## 2. Historical verification: what was actually read

The pack's inspection labels were carried forward; the records were then read. **Eight chapters are verified; three are not, and say so.**

### Primary record — read directly

**Turabi Efendi, *Turkish Cookery Book* (London, 1864)** — Internet Archive `b21527830`, University of Leeds Library copy.

- Edition metadata confirms **London, 1864**.
- The book's own index reads: *"Muzakka — Minced mutton, done with egg-plants … 106"*.
- The full recipe was read: minced mutton or lamb, two or three chopped onions, butter, parsley, three or four egg-plants in salt water, the meat and egg-plants **laid "in layers into a pan"**, **a pint of broth**, covered and simmered until the liquor is nearly absorbed. Printed page **36**.
- Checked and **absent** from the recipe: béchamel, white sauce, flour, milk.

### Secondary sources — read in full

| Source | What the text actually says |
| --- | --- |
| **AKS Encyclopedia of Korean Culture**, "비빔밥" (Korean, JS-rendered — read in a browser) | Author **황혜성 (Hwang Hye-seong)**, 1995, revised 7 Feb 2023. Bibimbap first appears in the **1800년대 말 (late 19th century)** 『시의전서(是議全書)』, *Siuijeonseo*. Quotes the mixing method, the fried **튀각 (t'wigak)**, the fried egg, sesame salt and oil, the fried gochujang set aside, and **참기름** added to taste. Cites 『한국요리문화사』 (Lee Seong-u, Kyomunsa, 1985). |
| **Mun, Lee & Cha (2023)**, *Journal of Ethnic Foods* 10, 39 | *"The name of bibimbap in Hangeul first appeared in 1810 as **'Bubuyum'** in Mongyupyeon (夢喡篇; an encyclopedia created by **Jang Hon**…),"* with the later variant spellings. Also points to 『**Siuijonseo**』, called *"a cookbook compiled … in the **late Joseon Dynasty**"* — **and gives it NO year**. And to "Hondonban" in 『Kijaijabki』 (~1590). |
| **AKS "The Birth of K-Food" (2025)** | 1921 『**Joseon yori jebeop**』: radish sprouts and bean sprouts into a pot, **heated, then mixed with rice**; *"the rice was stir-fried with other ingredients before being served"*. **1 December 1929** 『**Byeolgeon'gon**』: a **restaurant** bibimbap in **Jinju**, South Gyeongsang — sprouts, bracken, mung sprouts, cheongpomuk on the rice, **finely chopped raw beef (yukhoe)** and gochujang; the customer mixes. |
| **Joo Young-ha (2010)**, *사회와 역사* 87, 2010.09, 5–38 (34pp) — Korean and English abstracts read; **full article paywalled** | Jeonju bibimbap, in the press since the 1960s, *"**1980년대 초반부터 전국적인 음식으로 자리를 잡았다**"* — a nationwide food **from the early 1980s**. *"**1990년대 말부터** 전주비빔밥이 **일본을 비롯하여** 해외로 진출"* — **from the late 1990s**, abroad including **Japan**. Home-style cook-mixed → restaurant eater-mixed. The competing accounts (harvest-season food; Donghak troops) are recorded as influential **discourses**, not a settled origin. |
| **Brighton & Hove Museums**, "Trailblazer" | Names **Elizabeth David**, *A Book of Mediterranean Food*, and **moussaka** among its recipes, **1950**. The book itself was not read. |

### Not verified — access blocked, and labelled as such in the data

| Chapter | Limitation |
| --- | --- |
| Moussaka 02 — Kremezi on the béchamel form | **HTTP 403** to the Neos Kosmos article. Reported, not inspected. The 2011 piece is itself a republication of an *Atlantic* article. **Should not be published until read.** |
| Hot pot 01 — the 1934 table-service change | The Chongqing Morning Post page returned no readable content; neither the 1947 *Sichuan Times* nor the 1948 *Feng Tu Shi Zhi* could be consulted. Reported, not inspected. |
| Hot pot 02 — the 1936 Chongqing→Chengdu transmission | As above. **Should not be published until a primary record is read.** |

### Wording corrections made

- The **"late 19th century"** date for the Siuijeonseo is the **Encyclopedia's**; the 2023 review says only "late Joseon Dynasty". The fixture now attributes the date to the right source.
- The 1810 record is a **name** record, and the Hangul form is **'Bubuyum'**. The fixture now says so.
- The 1921 and 1929 records describe **different preparations**, not one linear development. The fixture now says so.
- The Jeonju claim is **"became a national food from the early 1980s"**, never "originated in Jeonju".

---

## 3. The 51-page public change, and why it is outside the pilot

**What changes publicly with the pilot OFF:** exactly one thing — on a dish with **no** journey beats, the Journey section now renders a **research-gap state** instead of nothing at all.

| Before | After |
| --- | --- |
| The section renders **nothing**. A reader sees no journey, no explanation, no indication whether it is missing or broken. | The section renders: *"We have not yet verified a dated chronology for X… This is a research gap, not a claim that the dish is new."* |

**Why this belongs outside the pilot:** it is not a design enhancement, it is a **correction of a defect that misleads**. A dish whose history has not been researched is currently presented exactly like a dish whose history is broken or absent. The research-gap state is also what makes the two **research-gap fixtures** meaningful, and it is the same state the brief requires the pilot to distinguish. Gating a defect fix behind a feature switch would leave every non-pilot dish in the misleading state for no editorial reason.

**Can a fetch failure be distinguished reliably from missing research?** Yes, and it is now distinguished three ways:

1. **The API returns `status`.** `"history"` when chapters exist, `"gap"` when the dish is published but has none. A 404 remains a 404 — an unknown slug is not a research gap.
2. **The client distinguishes the two failures.** The route sets `journeyStatus = "unavailable"` when the journey request **throws**, and `"gap"` when it succeeds with no chapters. These render **different text**: an operational failure says *"This is a loading problem, not a statement about the dish's history"*; a gap says *"This is a research gap, not a claim that the dish is new."*
3. **The two are not conflated by the component.** `status === "unavailable"` returns the operational message; `status === "gap"` returns the research-gap message; `status === "history"` renders the chapters.

**Measured:** in the pilot-off build, 6 of 8 dish pages show the gap state, 2 show a populated journey (their beats exist in the database), and 0 show the unavailable state. No pilot class, no pilot CSS, no pilot chunk and no fixture text is present in the built output.

**If you would rather it were gated:** set `journeyStatus` to `"gap"` only when the API confirms it, and move the gap copy behind `journeyPresentation`. That is a small change, but it leaves every non-pilot dish in the current misleading state — so my recommendation is to keep it outside the pilot, and to review it as its own change.

---

## 4. Lineage wording now follows the recorded role

The earlier sentence was **"Part of the X lineage — {role}."**, which asserted *membership* whatever the role was — and for an `ancestor` role read *"part of the X lineage — an ancestor of the X lineage"*.

Now:

- The **role** drives the sentence. A grouping role reads *"Part of the X lineage — a cousin dish."* A directional role reads *"An ancestor of the X lineage — X."* — never "part of".
- The **caveat** is shown for a grouping and **withheld** for an explicit ancestry claim, because *"a culinary grouping is not a chain of descent"* would contradict an ancestor statement. A lineage's own `uncertaintyNote` always wins.
- The **lineage name is stated once** (a short form names the relationship without repeating it).

Covered by 8 new tests, including *"does NOT repeat the lineage name"*.

---

## 5. Design coverage — measured

All cases, both pilot dishes, the three other reference cases, the regression fixture and a non-pilot control, at **320 / 390 / 768 / 1280**.

| Case | Chapters | Maps | State | Overflow |
| --- | --- | --- | --- | --- |
| `moussaka-greek` (pilot) | 3 | 3 | populated | none at any width |
| `bibimbap` (pilot) | 6 | 6 | populated | none at any width |
| `chongqing-hot-pot` (fixture) | 2 | 2 | populated | none at any width |
| `century-egg-tofu` (fixture) | 0 | 0 | **research gap** | none at any width |
| `beyaynetu` (fixture) | 0 | 0 | **research gap** | none at any width |
| `chicken-tikka-masala` (regression) | 0 | 0 | gap state, legacy presentation preserved | none at any width |
| `vindaloo` (non-pilot control) | — | — | **unchanged** | none at any width |

**Map failure (WebGL disabled):** 3 of 3 maps show the fallback panel, and **the chapters, citations and research-limit notes all remain readable** — the prose never depends on the map.

**Keyboard:** the section nav has 5 links (Journey, Ingredients, Variations, Preparation, Sources), all `href="#…"` with a **confirmed target element**, all focusable.

**Reduced motion:** transitions are `0s`.

**Screenshots:** `docs/gus-238-screenshots/` — each case at 390 and 1280, plus the map-failure state.

### Defects found and fixed by rendering

1. The grid pinned every map to row 1 and every text to row 2; with six chapters the cells overflowed and the texts **overlapped**. Now each chapter's map and text share a column, and the chapter row picks the grid row — six chapters lay out as **two rows of three**.
2. `setPaintProperty(layer, props)` threw `e.endsWith is not a function` — the runtime resolved the group form against the single-property signature. The palette is now applied one property at a time.
3. `React.lazy()` + `Suspense` caused **hydration error #419**: Astro renders the island on the server where `lazy()` resolves, but the client suspends on first render. The dynamic import is now resolved *before* rendering, so both sides agree.
4. The pilot's stylesheet was in the bundle **every dish page loads**. It is now a runtime link from `public/pilot/`, added only when the pilot renders.
5. `grid-column: attr(data-djc-col)` is not supported by Chrome, so the grid collapsed to one column. Reverted to custom properties, written as an object with a stable key order so hydration stays clean.

### Map resilience

The CARTO vector tile service can fail **silently**: the style, fonts and sprite load, and the map is an empty canvas that still shows attribution and a scale bar. **The LIVE site showed the same symptom at the same moment**, so it is a provider outage, not a per-page defect. The journey maps now probe the vector service once and fall back to **OSM's raster tiles**, verified reachable for every region the pilot frames.

---

## 6. The one thing that needs you

The migration list is in five files; CI compares three of them and fails if they disagree. The `gustale-bot` App is **refused by GitHub for touching a workflow file** (no `workflows` scope), so the `ci.yml` copy ships as a patch:

```bash
cd <repo>
git checkout feature/gus-dish-journey-osm-cards
git apply docs/ci-238-migration-chain.patch
git commit -m "ci: add the GUS-238 migration to the CI chain"
git push
```

The patch is verified to apply cleanly. **After it is applied**, `scripts/validate-ci-migration-chain.py` reports *"CI migration chain OK (55 migrations, all three lists agree)"* — I confirmed this by applying the patch to a clean worktree at the PR head and running the validator.

The **Live approval gate** also fails, by design: the PR touches `db/migrations/`, so it needs the `approved-live` label, which only you may apply.

---

## 7. The schema extension, and why it is needed

`dish_journey_beats` could hold a place, a point, an approximate year, a label, a confidence value and one source. It **could not** hold what a historical chapter needs:

| Requirement | Why the existing fields cannot carry it |
| --- | --- |
| The chapter's own title, distinct from its explanation | `label` is one text column used for the explanation |
| The date **as displayed** — "1810", "c. 1810", "1810–1820", "late 19th century", "1930s" | `year_approx` is an integer; a range, a century and "unknown" cannot be represented, and a missing date would have to be encoded as 0 |
| The **kind** of record — primary record, scholarly interpretation, reported account | `confidence` answers "how sure are we"; reusing it would conflate two different facts and change a constraint other code reads |
| The **bibliographic locator** — page, recipe number, section | the source's fields carry title, URL, year and reliability only |
| The **authors** of the cited work | not present |
| The place's **role** — attestation, preparation context, adaptation, reception, circulation | `place_name` is a name; the role is a separate editorial claim |
| The **scope note** — what the record establishes, and whether the original was read or reported | not present |
| Broad regional **framing** and named regions | only a point could be stored; a region is not a point |
| **Source-supported movements** — a claimed transmission between two chapters, with its own claim and source | there is no table for a relation between beats; chapter order and map proximity must never imply one |

**The extension:** ten **nullable** columns on `dish_journey_beats` (`title`, `date_label`, `date_precision`, `evidence_kind`, `locator`, `authors`, `place_role`, `scope_note`, `bounds`, `regions`), each with a CHECK constraint on its vocabulary, plus one new table `dish_journey_movements` for the transmission edges.

**Compatibility:**
- The **confidence enum is untouched** — the CHECK constraint still reads `('documented','likely','possible','parallel')`, and the new `evidence_kind` is a separate field with its own constraint.
- Every new column is **nullable**, so existing rows and existing consumers are unaffected.
- **No new lineage table, no new relationship type, no competing journey store, no new endpoint family.**
- **No historical record is created or promoted.** The migration is empty structure.

**How it was tested:** `bash scripts/ci-migration-chain.sh gustale_cichain_test` → **`FULL_CI_CHAIN_OK=1`**, against the **disposable** `gustale-test-postgres` container on port 5434 (never the live database). The chained database was then inspected: all ten columns present, `dish_journey_movements` present.

**Rollback:** the columns are nullable and the table is separate, so a rollback is `DROP TABLE dish_journey_movements` plus `DROP COLUMN` on the ten. **If editorial records have been approved and written, drop the table only after exporting them.** The pilot is off by default, so turning it off restores the previous presentation for every dish.

---

## 8. Domain behaviour — verified, unchanged

No domain, DNS, hosting or Caddy change is made by this work. What the four requested surfaces actually do, measured with redirects **not** followed:

| Surface | HTTP | Canonical | Belongs to |
| --- | --- | --- | --- |
| `gustale.com/` | 200, served directly | `https://gustale.com/` | **ATLAS** |
| `gustale.com/dishes/` | 200, served directly | `https://gustale.com/dishes` | **ATLAS** |
| `recipes.gustale.com/` | 200, served directly | **`https://gustale.recipes/`** | **RECIPES** |
| `recipes.gustale.com/dishes/` | 200, served directly | **`https://gustale.recipes/dishes`** | **RECIPES** |

And for comparison, the canonical Recipes origin itself:

| Surface | HTTP | Canonical |
| --- | --- | --- |
| `gustale.recipes/` | 200 | `https://gustale.recipes/` |
| `gustale.recipes/dishes/` | 200 | `https://gustale.recipes/dishes` |

**Findings:**
- **No surface redirects.** All seven return 200 directly.
- **`recipes.gustale.com` is an alias**: it serves the Recipes site and correctly canonicalises to `gustale.recipes`. It is **not** in `infra/prod/Caddyfile`, which routes `gustale.recipes` + `www.gustale.recipes`. This is why it works — it falls through to the default block — and it is a **pre-existing** configuration, not something this PR changes.
- **`recipes.gustale.com/dishes/` correctly canonicalises to `gustale.recipes/dishes`**, so the alias does not create a duplicate-content problem.
- A dish page (`gustale.com/dishes/bibimbap`) declares **11 hreflang alternates** with `x-default`; the list pages declare none, which is the existing behaviour for index pages.

**The recommendation, unchanged:** the canonical Recipes origin is `gustale.recipes`. `recipes.gustale.com` works, but it is an alias with no Caddy entry and no canonical of its own — worth tidying as a **separate** infrastructure change, with its own approval, and explicitly **not** as part of this design work.

---

## 9. Ingredients and countries/styles — kept in the assessment

**Ingredients.** The visible ingredient overview is a **presentation of the dish's existing `DishIngredient` rows** — the same rows the detailed list below already uses, rendered as cards that open the detailed explorer. No second content model, no invented ingredient, and the copy says *"A representative preparation. Ingredients vary by style and by cook."* Optional components are marked optional.

It renders only where the dish **has** ingredient rows. In the review database only `moussaka-greek` has them, so the other reference cases show no ingredient cards — which is correct behaviour, not a gap: **the reference pack's countries/styles and ingredient content is editorial material that belongs in the content model, not in the layout.** Those cases have no published ingredient rows to show.

**Countries & styles.** This is **present-day** material, deliberately separate from the historical Journey, and it is **not** implemented in this PR. The pack's own references (the Sapporo education board's school-lunch recipe, CJ's December 2025 consumer survey, KFPI's 2025 survey) are current-context material with their own scope rules — *"do not infer country popularity or national variations from restaurant locations"*, *"this pooled number is not attributed to each country or a national ranking"*. Publishing it needs:

1. a content model for a present-day country/style section that does not exist yet, and
2. an editorial decision on which countries qualify.

The brief's own scope allows this: *"Add further countries only when their evidence is available."* Doing it from the pack's summary alone would publish numbers the pack itself warns are scoped. **This is an editorial task, not a layout task**, and it is listed in §11 as outstanding.

---

## 10. Validation results

| Check | Result |
| --- | --- |
| Web unit tests | **48 / 48 pass** (27 journey semantics, 13 fixture contracts, 8 lineage wording) |
| API tests (new) | **9 / 9 pass** (`dishes-journey-v2.test.ts`) |
| API suite (full) | **22 files, 217 passed, 3 skipped, 0 failed** |
| `astro check` | **77 errors, 0 in the changed files** (baseline `origin/main`: 83) |
| Biome (`pnpm lint` gate) | **exit 0** — no format or error-level findings in the changed files |
| Atlas build, pilot OFF | **127 pages, exit 0** |
| Atlas build, pilot ON | **127 pages, exit 0** |
| Recipes build | **127 pages, exit 0** — no pilot CSS, no fixture data |
| `validate-ci-migration-chain.py` | **"CI migration chain OK (55 migrations, all three lists agree)"** — after applying the patch |
| `scripts/ci-migration-chain.sh` | **`FULL_CI_CHAIN_OK=1`** on the disposable database |
| Pilot isolation | with the pilot off: **no pilot chunk, no pilot CSS, no fixture text** in any of the 132 built pages |
| Domain check | all four surfaces: **200, no redirect**, canonicals as in §8 |
| Map failure (WebGL off) | 3/3 fallbacks, **prose and citations intact** |
| Keyboard | 5 nav links, all targets confirmed, all focusable |
| Reduced motion | transitions `0s` |

---

## 11. Outstanding — what genuinely needs access or an editorial decision

1. **Apply `docs/ci-238-migration-chain.patch`** — the App cannot push workflow files. Until then the Tests job fails with 500s.
2. **Apply the `approved-live` label** — the PR touches `db/migrations/`.
3. **The Neos Kosmos article (HTTP 403)** — needed before the moussaka 02 chapter can be published. It is also a republication of an *Atlantic* article, so the original may be the better source.
4. **The Chongqing Morning Post essay** — needed before either hot-pot chapter can be published. Both are marked "reported" in the data.
5. **The missing `gustale-osm-lineage-reference.png`** — if it exists, the map style should be reconciled against it.
6. **Countries & styles** — needs a content model and an editorial decision on which countries qualify.
7. **The four reference fixtures have no published ingredient rows**, so the ingredient cards do not appear for them. Reviewing that state needs seeded ingredients for the fixtures.
8. **`gustale.recipes` vs `recipes.gustale.com`** — a separate infrastructure tidy-up, with its own approval.
9. **The live `recipe.gustale.com` canonical points at `gustale.recipes`**, which is correct, but the alias has no Caddy entry of its own. Not changed here.

---

## 12. What changed and what did not

**Changed:** the dish-page Journey presentation (pilot-gated), the research-gap and fetch-failure states (all dishes), the lineage section (pilot-gated), the visible ingredient overview (pilot-gated), the sticky section nav (pilot-gated), one additive migration, the journey payload, and the map's tile-source resilience.

**Not changed:** the confidence enum; the lineage data model; any existing component's behaviour outside the Journey section; `gustale.recipes`; DNS, hosting or Caddy; any live database; the Recipes site's design; the editorial content model.

**Not done:** no merge, no deploy, no auto-merge, no approval label, no live migration, no published editorial data.
