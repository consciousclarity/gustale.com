# GUS-238 — dish journey: the review report

**Branch:** `feature/gus-dish-journey-osm-cards`
**PR:** #234 — **MERGED** 2026-11-13 12:54 UTC as `8750b17`, with `approved-live`
**Follow-up PR:** #236 — the publish rule and the association visibility rule

**Status at the time of writing:** PR #234 is merged and the API is deployed on
the live site. **The live migration has NOT been applied**, so
`GET /api/dishes/:slug/journey` returns **HTTP 500** on live. The web
containers are still on the previous SHA, so no page shows it yet. See §14.

---

## 1. What is done

| # | Item | State |
| --- | --- | --- |
| 3 | Verification labels — a chapter-by-chapter evidence record | **done** |
| 4 | Research-gap wording; non-success and malformed → unavailable | **done** |
| 5 | Map fallback — no repeated requests, no blank map, policy-compliant | **done** |
| 2 | Ingredient coverage for the five presentations; the real missing state | **done** |
| 1 | Countries & styles on the existing model | **done** — it already existed; the gap was the nav |
| 6 | Schema explanation | **done** — §7 |
| 7 | The CI patch, reconfirmed; the owner action | **done** — §9 |
| 8 | This report | **done** |

---

## 2. Item 3 — the verification labels are now per chapter

The blanket "eight chapters verified" is gone. Each chapter carries its own record, with a strict level:

| Level | Meaning |
| --- | --- |
| `primary_inspected` | The **original record** was read — the 1864 book's own recipe text. |
| `full_text_inspected` | The **complete modern source** was read. |
| `abstract_only` | Only the **abstract** was read. It supports what the abstract states and nothing beyond it. |
| `reported_only` | The claim comes through a secondary summary; the source was not reached. |
| `inaccessible` | The source could not be reached at all. |

### The evidence table

Every row says: the claim, the source, the locator, **what was actually inspected**, the corrections, and what remains unestablished.

#### Bibimbap — 6 chapters

| # | Claim | Source | Locator | Material actually inspected | Corrections made | Not established |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | The Hangeul name first appeared in **1810** as "Bubuyum" | Mun, Lee & Cha (2023), *Journal of Ethnic Foods* 10, 39 | "History of bibimbap" section; Mongyupyeon paragraph | **Full article text** | The pack said "a Hangul form of bibimbap's name"; the article says it first appeared as "Bubuyum", and lists the later variants. The pack treated 1810 as a "historical name record"; it is a **name** record, and the review records an earlier recipe-record and an earlier attestation, so 1810 is not a beginning. | **Jang Hon's *Mongyupyeon* was not read.** The article points to *Siuijonseo* — "a cookbook compiled … in the **late Joseon Dynasty**" — and gives **no year**, so it cannot date that manuscript. |
| 2 | The cook mixes the bowl before serving | AKS *Encyclopedia of Korean Culture*, "비빔밥" | Article body, content section | **Whole Korean article** (read in a browser — the body is JS-rendered) | The pack's ingredient list was checked against the article: rice, prepared meat, seasoned vegetables, sesame salt and plenty of oil, fried **튀각**, sliced fried egg, fried gochujang set aside, **참기름** to taste. The pack attributed the late-19th-century date to the 2023 review; it belongs to the **Encyclopedia**. The pack omitted that the Encyclopedia's own "first appearance" claim is not adopted. | **시유전서 was not read** — the encyclopedia quotes it. The date "1800년대 말" is the **Encyclopedia's**, not the review's. |
| 3 | Mixed over heat, rather than simply assembled | AKS, *The Birth of K-Food* (2025) | Section 2 | **Whole section**, including the 1921 passage | The pack said "vegetables are heated in a pot and then stirred with rice"; the text is more specific — radish sprouts and bean sprouts into a pot, **heated**, then mixed with rice and seasonings, and "the rice was **stir-fried** with other ingredients before being served". | The **1921 cookbook** *Joseon yori jebeop* was not read. One recorded preparation, not the household norm. |
| 4 | A topping arrangement is recorded | AKS, *The Birth of K-Food* (2025) | Section 2, the 1 December 1929 *Byeolgeon'gon* paragraph | **Whole section**, paragraph in full | The pack said "a topping arrangement with raw beef and gochujang"; the text lists bean sprouts, bracken, mung sprouts and **cheongpomuk** on the rice, then **finely chopped raw beef** and gochujang, and says the customer mixes it. | The **1 December 1929 issue** was not read. It is a **restaurant** serving — one setting, not the general way. |
| 5 | Regional styles circulate nationally | Joo Young-ha (2010), *Society and History* 87, 2010.09, **pp. 5–38** (34 pp.) | Korean **and** English abstracts | **ABSTRACTS ONLY** — the full article is paywalled | The pack's "national recognition in the early 1980s" is the abstract's **"1980년대 초반부터 전국적인 음식으로 자리를 잡았다"**. The pack omitted that the paper attributes the spread to urbanisation from the 1970s and treats the competing accounts as influential **discourses**, not settled origin. The pack did not say the article was an abstract. **It was.** | The **full article** was not accessed. The abstract supports the early-1980s recognition and nothing more. |
| 6 | The dish is adopted abroad | The same article | The same abstracts | **ABSTRACTS ONLY** | The pack's "overseas circulation, including adoption in Japan in the late 1990s" is the abstract's **"1990년대 말부터 전주비빔밥이 일본을 뿐만 아니라 해외로 진출"**, read as part of constructing a Jeonju-origin narrative. | The **full article** was not accessed. No first-arrival date, no route, no mechanism of the spread. |

#### Moussaka — 3 chapters

| # | Claim | Source | Locator | Material actually inspected | Corrections made | Not established |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | A **muzzakka** is printed in 1864 | *Turkish Cookery Book* (Turabi Efendi) | Internet Archive `b21527830`, University of Leeds Library copy | **THE ORIGINAL BOOK** — the edition metadata, the book's own **index**, and the **full OCR of receipt No. 106** with its ingredient and method lines | The pack's ingredient summary was checked against the recipe: a leg of mutton or lamb minced very fine, two or three chopped onions, two or three ounces of fresh butter, salt, **parsley**, three or four egg-plants in salt water, the meat and egg-plants laid **"in layers into a pan"**, **a pint of broth**, covered and simmered until the liquor is nearly absorbed. The pack's "simmers them in broth" is right but incomplete — the **layering** and the **parsley** are part of the record. The pack's "no béchamel appears" was verified by searching the recipe for béchamel, white sauce, flour and milk: **all absent**. | One recipe in one 1864 London edition. It is a **muzzakka**, not necessarily the ancestor of the modern Greek moussaka; the link is an editorial interpretation, and the absence of béchamel here does not mean béchamel was unknown. |
| 2 | A béchamel-topped form is interpreted | Neos Kosmos, "The Greek Kitchen" | — | **NOTHING.** The article returned **HTTP 403** on every attempt on 12 November 2026. | The pack recorded this as "reported through a secondary summary" without saying the source was unreachable. **It is unreachable.** | **The claim is unresolved.** It is known only through the pack's own summary. The 2011 piece is also a republication of an *Atlantic* article, so the original may be the better source. **Not publishable.** |
| 3 | A British cookbook prints the dish | Brighton & Hove Museums, "Trailblazer" | The account | **The whole museum account** | The pack said "described by Brighton & Hove Museums"; the account names **Elizabeth David**, *A Book of Mediterranean Food*, and **moussaka** among its recipes, with the year **1950** — stronger than the pack's summary. | The **book itself** was not read. That is readership and reception in British cooking, not origin and not first arrival. |

#### Chongqing hot pot — 2 chapters, **neither publishable**

| # | Claim | Source | Locator | Material actually inspected | Corrections made | Not established |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | The 1934 table-service change | Lin Wenyu's 2023 essay | — | **NOTHING.** The Chongqing Morning Post page returned no readable content on 12 November 2026; neither the 1947 *Sichuan Times* nor the 1948 *Feng Tu Shi Zhi* could be consulted. | The pack recorded this as "the modern essay was inspected; the 1947–48 periodicals were not". **The modern essay could not be read either.** | **Unresolved.** The event date (1934), the record dates (1947–48) and the source's publication date (2023) are three different things and must not be merged. |
| 2 | The 1936 Chongqing → Chengdu transmission | The same | — | **NOTHING**, for the same reason. | The pack recorded this as "original periodical issues not inspected", which reads as if the essay had been read. **It had not.** | **Unresolved** — and the more consequential of the two: a claimed movement between two cities is exactly what must not be drawn on a map while it rests on an unread source. |

### The tally is broken down, not aggregated

```
moussaka-greek   3 chapters: 1 primary · 1 full text · 1 inaccessible · 1 unresolved · 2 publishable
bibimbap         6 chapters: 4 full text · 2 abstract only · 0 unresolved · 6 publishable
chongqing-hot-pot 2 chapters: 0 primary · 0 full text · 2 inaccessible · 2 unresolved · 0 publishable
```

The component shows the level, what was inspected, what is not established, and the corrections, inside the existing "Evidence & research limits" disclosure. An unresolved chapter says so and is not publishable.

---

## 3. Item 4 — the research-gap wording, and what counts as unavailable

### The wording

Zero journey records proves only that **no records were returned**. It does not prove the dish is unresearched — it may be well documented and not yet written up here, or the project may not have looked at it.

| | Before | Now |
| --- | --- | --- |
| Lede | "We have not yet verified a dated chronology for X." | "A dated history of X is not available yet." |
| Body | "The history of X is still being researched." | "No historical journey is available for X yet. There are no dated chapters for it at present…" |
| Note | "**This is a research gap**, not a claim that the dish is new." | "A chapter appears here only when a traceable historical record supports it." |

The removed sentence asserted a **research status** that nothing in the data establishes.

### Fetch failure versus missing research

Three mechanisms, so the two cannot be confused:

1. **The API returns `status`** — `history` or `gap`. A 404 stays a 404; an unknown slug is not a gap.
2. **The route sets `unavailable` only when the request throws.**
3. **A malformed response is now rejected by the client.** `getDishJourney` validates the shape — the body must be an object, `beats`/`lineages`/`movements` must be arrays, `status` must be `history` or `gap`, and every beat needs an `id`, a `sequence` and a `label`. A body that fails validation throws, and the route's catch sets `unavailable`.

Before this change a 200 with a malformed body was indistinguishable from an empty history, so **a broken response could be presented as an editorial statement about the dish.**

The two states render different words: *"This is a loading problem, not a statement about the dish's history"* versus *"No historical journey is available for X yet."*

**Covered by 21 tests** in `journeyStates.test.ts`: 15 malformed bodies (null, a string, a number, an array, a missing `beats`, non-array `beats`/`lineages`/`movements`, an unusable or missing `status`, beats without an id/sequence/label, a null beat) are all rejected; a valid gap with zero beats is **accepted**; and the wording tests assert the gap copy contains none of the over-claiming phrases.

---

## 4. Item 5 — the map fallback

### What was observed

On 12 November 2026 the CARTO **style** loaded (200) while the **vector tiles** did not, and the live `gustale.com` dish map showed the same symptom at the same moment. **That is a shared symptom, not proof of a provider outage** — it could equally be a network or CDN-path problem affecting both. The report no longer asserts a cause.

What was reproducible, and is now fixed:

- The probe ran **once per map card**, so a six-chapter page made six probe requests and six four-second waits on a failing service, and could get six different answers — so a page could show a **mix** of vector and raster maps.
- With both tile services blocked, the page made **39 tile requests** to a service it had just found unreachable.
- A map that had **loaded but painted nothing** sat blank, with attribution and a scale bar, and no explanation.

### The fix

The probe is **one shared, cached decision** for the page, and it distinguishes two failures that need opposite handling:

| Probe result | Meaning | Behaviour |
| --- | --- | --- |
| `ok` | The vector service answers. | Vector tiles. |
| `vector_down` | The **style** loaded but the vector **tiles** did not: the provider's tile service is broken, the network is fine. | OSM's raster tiles. |
| `network_down` | Neither loaded: the network is blocked. | **No tile service is asked for anything.** The fallback panel shows the place name and the reason. |

The style is fetched **first**, because it answers "is the network working at all". That is what separates "the provider is broken" from "the network is down".

A map that has loaded but painted nothing now shows its fallback, detected with MapLibre's **documented** `queryRenderedFeatures()`. The earlier version reached into the private `style.sourceCaches` and reported "no tiles" on a map that had fetched 28 of them — so every map wrongly showed its fallback.

### Measured, in a real browser

**Network blocked** (`Network.setBlockedURLs` on both services):

```
tile requests total        : 2      (was 39)
probe requests (style)     : 1      (once for the page)
probe requests (tile)      : 0      (no tile service was asked)
FALLBACK PANELS SHOWN      : 3/3
citations still present    : 3
research-limit notes       : 3
chapter headings           : 3
```

**Normal path** (services reachable), 6-chapter page:

```
distinct style URLs requested : 1
distinct tile URLs             : 28
FALLBACK panels (should be 0)  : 0
canvases                       : 6
attribution shown              : © OpenStreetMap contributors © CARTO
scale controls                 : 6
```

Both paths: **all checks passed.**

### The OSM tile policy

The policy was read at `operations.osmfoundation.org/policies/tiles/`. Each requirement, and what this code does:

| Policy | This implementation |
| --- | --- |
| Use `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Exactly that URL |
| Provide visible licence attribution | The map's attribution control shows "© OpenStreetMap contributors" |
| Send a valid HTTP User-Agent identifying the application | `Gustale Atlas/1.0 (https://gustale.com)` via `transformRequest` |
| Send a valid HTTP Referer from web pages | `https://gustale.com/`, also via `transformRequest` |
| Use a restrictive Referrer-Policy that prevents the Referer being stripped | `<meta name="referrer" content="strict-origin-when-cross-origin" />` on the document |
| Cache tiles per the HTTP caching headers | MapLibre's default |
| **Must not** bulk-download, scrape, or offer prefetch | One tile at zoom 0, as a reachability probe, and it is to CARTO's own service |
| **Must not** send `no-cache` headers by default | The probe sends none |
| **Must not** use a permissive Referrer-Policy | Set as above |

The raster fallback is used **only** when the probe has already established that the vector service is down. In the normal case the OSM service is never contacted at all.

---

## 5. Item 2 — the ingredient fixtures, and the real missing state

### The five presentations

| Dish | Heading | Cards | Optional | Preparation notes |
| --- | --- | --- | --- | --- |
| `bibimbap` | **In the bowl** | 10 | 1 | 6 |
| `moussaka-greek` | **In the bake** | 9 | 1 | 4 |
| `chongqing-hot-pot` | **At the table** | 11 | 1 | 4 |
| `century-egg-tofu` | **On the plate** | 6 | 1 | 1 |
| `beyaynetu` | **On the platter** | 9 | 2 | 5 |

The heading names the dish's **form**, because the form is part of what the reader is being told. Every card links to a real ingredient page (`gustale.recipes/ingredients/<slug>`), and every slug is a usable path segment.

**LOCAL REVIEW DATA** — read from a module, never seeded, never written to a database. For a dish with a review fixture and the pilot **on**, the fixture's set is used; every other dish uses the published rows unchanged.

### The real missing-ingredient state, measured

Of the eleven published dishes in the review database, **only `moussaka-greek` has ingredient rows** (4). The other ten have none.

The section therefore **shows no section at all** for those dishes — the component returns `null` for an empty list. An empty "In the bowl" heading over nothing would be worse than no section, and that is the behaviour.

### Verified in the browser

All five presentations: heading correct, card count correct, every card a link to `/ingredients/…`, no broken hrefs.

---

## 6. Item 1 — Countries & styles

**It was already implemented.** There was no new content model to invent, and none was added.

| Layer | What exists |
| --- | --- |
| Table | `dish_place_associations` — six typed relationships (`historical_emergence`, `established_tradition`, `regional_adaptation`, `later_introduction`, `earliest_documentation`, `legacy_unreviewed`), `entity_kind` (`place` \| `community`), `explanation`, `qualifiers`, `provenance`, `evidence_status`, `dispute_state`, `research_outcome`, `review_state`, `publication_state` |
| Entities | `geo_entities` (a place: a country, a region, a cross-border area) and `dish_traditions` (a **community**: a people or a practice) |
| API | `GET /api/dishes/:slug/atlas` → `placesAndTraditions` |
| Component | `<AtlasPlaces>`, mounted on **every** dish page |

### Measured

| Dish | Associations | What the section shows |
| --- | --- | --- |
| `falafel` | 2 published | "Established tradition" + "Other associations", 2 rows with their evidence badges |
| `rendang` | 3 published | the same |
| `moussaka-greek` | 2, all draft | "No association has been published for this dish yet." + the legacy discovery value "Associated with Greece · GR" with its warning |
| `beyaynetu`, `bibimbap` | 0 | "No association has been published for this dish yet." |

The empty-state copy is already exactly what the data supports — the same principle as item 4.

### The gap was the nav

The section nav offered **Journey, Ingredients, Variations, Preparation, Sources** — and no link to the places and traditions that were on the page. The nav now always reaches it.

The link's label is the section's own heading, **"Places & traditions"**, rather than "Countries": a place association can be a country, a region, a cross-border area **or a community**. "Israeli cuisine" is not a country and "Minangkabau" is a people, so "Countries" would misname most of the section's own rows.

### Populating real associations — proposed, not started

**This is a separate research work package and I have not started it.** It needs a decision from you, because it is editorial:

- **Which dishes.** All five pilot dishes, or a smaller first batch?
- **Which relationships.** `established_tradition` and `regional_adaptation` are the "countries and styles" claims; `historical_emergence` and `earliest_documentation` are *historical* claims and overlap the Journey's territory, which would risk two sections making the same claim differently.
- **What counts as `established_tradition` for a community.** "Israeli cuisine" as a tradition is a different kind of claim from "Greek cuisine", and the model stores both under one relationship type.
- **Who reviews.** Every existing published association is `evidence_status = unevidenced` and `review_state = unreviewed`. A section that says "Countries & styles" while every row is unreviewed would be presenting discovery values as findings. Either the associations are reviewed first, or the section says what they are.

---

## 7. Item 6 — the schema extension

### The migration

`db/migrations/gus-238-journey-editorial-fields.sql` — **additive only**.

**Ten nullable columns on `dish_journey_beats`:**

| Column | Why the existing fields cannot carry it |
| --- | --- |
| `title` | `label` is one text column, used for the explanation. A chapter needs a headline **and** a body. |
| `date_label` | The date **as displayed**: "1810", "c. 1810", "1810–1820", "late 19th century", "1930s". |
| `date_precision` | Whether that label is exact, a range, a decade, a century or approximate — so the renderer knows how to present it. |
| `evidence_kind` | The **kind** of record: primary, reference work, scholarly interpretation, reported account. `confidence` answers "how sure are we"; reusing it would conflate two different facts and change a constraint other code reads. |
| `locator` | The bibliographic locator — page, receipt number, section. The source's fields carry title, URL, year and reliability only. |
| `authors` | The authors of the cited work. Not present. |
| `place_role` | The place's role — attestation, preparation context, adaptation, reception, circulation. `place_name` is a name; the role is a separate editorial claim. |
| `scope_note` | What the record establishes, and whether the original was read or reported through a summary. Not present. |
| `bounds` | Broad regional framing. Only a **point** could be stored, and a region is not a point. |
| `regions` | Named regions. Not present. |

Each has a **CHECK constraint** on its vocabulary.

**One new table: `dish_journey_movements`** — the source-supported transmission edges between chapters, with their own claim and source. There was no table for a relation between beats, and chapter order and map proximity must never imply one.

### Compatibility

- The **confidence enum is untouched** — the CHECK constraint still reads `('documented','likely','possible','parallel')`. The new `evidence_kind` is a separate field with its own constraint.
- Every new column is **nullable**, so existing rows and existing consumers are unaffected.
- **No new lineage table, no new relationship type, no competing journey store, no new endpoint family.**
- **No historical record is created or promoted.** The migration is empty structure.

### How it was tested

Against the **disposable** `gustale-test-postgres` container on port 5434 — never the live database:

```
bash scripts/ci-migration-chain.sh gustale_cichain_test
  → FULL_CI_CHAIN_OK=1

the chained database, inspected:
  the 10 new columns on dish_journey_beats   present
  dish_journey_movements                      present
```

And on the patched PR head, for the full chain: **`FULL_CI_CHAIN_OK=1`**, with the 10 columns and the table confirmed in the resulting database.

### Rollback

The pilot is **off** by default, so turning it off restores the previous presentation for every dish immediately — no schema change is needed to stop the feature.

If the schema itself is rolled back:

```sql
DROP TABLE IF EXISTS dish_journey_movements;
ALTER TABLE dish_journey_beats
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS date_label,
  DROP COLUMN IF EXISTS date_precision,
  DROP COLUMN IF EXISTS evidence_kind,
  DROP COLUMN IF EXISTS locator,
  DROP COLUMN IF EXISTS authors,
  DROP COLUMN IF EXISTS place_role,
  DROP COLUMN IF EXISTS scope_note,
  DROP COLUMN IF EXISTS bounds,
  DROP COLUMN IF EXISTS regions;
```

**This is destructive to any editorial records written into those columns.** With the pilot off there are none, so the rollback is safe today. If records are approved and written later, **export them first**.

---

## 8. Validation — what actually passed

Every row below is a real run. **Local runs are labelled local.**

| Check | Result |
| --- | --- |
| Web unit tests | **111 / 111 pass** |
| API tests — journey v2 + journey | **12 / 12 pass** (against the patched, chained DB) |
| API suite — full | **22 files, 217 passed, 3 skipped, 0 failed** (against the patched, chained DB) |
| `astro check` | **77 errors, 0 in the changed files** (baseline `origin/main`: 83) |
| Biome (the CI lint command) | **exit 0** — 266 files, no format or error-level findings |
| API typecheck | **exit 0** |
| DB typecheck | **exit 0** |
| Atlas build, pilot OFF | **exit 0** — 180 pages |
| Atlas build, pilot ON | **exit 0** — 180 pages |
| `validate-ci-migration-chain.py`, patched | **"CI migration chain OK (55 migrations, all three lists agree)"** — exit 0 |
| `ci-migration-chain.sh`, patched | **`FULL_CI_CHAIN_OK=1`** |
| Pilot isolation, pilot OFF | **PILOT FULLY ABSENT** — no pilot chunk loaded by any of the 180 pages, no pilot CSS linked, no fixture string in any page, 0 pages with `dj--v2` |
| Pilot scope, pilot ON | 5 pages carry `dj--v2` (the 5 pilot dishes); the fixture content appears in exactly 1 |
| The public change, pilot OFF | **90 pages** carry the "not available yet" state; **0** carry "unavailable" |
| Map — network blocked | tile requests **2** (was 39); 3/3 fallbacks; citations, notes and headings intact |
| Map — normal path | 28 tile URLs, 6/6 maps with attribution and a scale bar, 0 fallbacks |
| Ingredients — five presentations | all five: heading, card count, links, optional flag and preparation notes correct |
| Places & traditions | 2 rows for falafel, 3 for rendang, the discovery-value warning for moussaka, the empty state for beyaynetu and bibimbap |
| Domain check | all four surfaces: **200, no redirect**, canonicals as in §10 |

### The coverage matrix

| Case | Chapters | Maps | Ingredient cards | State |
| --- | --- | --- | --- | --- |
| `moussaka-greek` (pilot) | 3 | 3 | 9 | populated |
| `bibimbap` (pilot) | 6 | 6 | 10 | populated |
| `chongqing-hot-pot` (fixture) | 2 | 2 | 11 | populated |
| `century-egg-tofu` (fixture) | 0 | 0 | 6 | not available yet |
| `beyaynetu` (fixture) | 0 | 0 | 9 | not available yet |
| `chicken-tikka-masala` (regression) | 0 | 0 | — | legacy presentation preserved |
| `vindaloo` (non-pilot control) | — | — | — | **unchanged** |

Widths **320 / 390 / 768 / 1280**: no horizontal overflow on any case at any width. Six chapters lay out as **two rows of three**. Keyboard: the section nav has 6 links, every target confirmed present, all focusable. Reduced motion: transitions `0s`.

---

## 9. Item 7 — the CI patch, and the exact owner action

### What is failing on GitHub, and why

CI's `Lint + typecheck` job has **eight** steps. **Seven pass**: Set up job, checkout, pnpm, Node, install dependencies, **Typecheck**, **Validate seed data**, **Lint**. One fails:

```
Validate the CI migration chain → CI migration chain MISMATCH
```

The `Tests` job fails with `expected 500 to be 200` on the journey tests, because CI's database is built without the new columns.

Both have the **same single root cause**: the `ci.yml` copy of the migration list does not include `gus-238-journey-editorial-fields.sql`.

### The permission boundary

`gustale-bot` is a GitHub App with `contents: write` and `pull_requests: write`, but **no `workflows` scope**. GitHub refuses a push that touches `.github/workflows/`:

```
refusing to allow a GitHub App to create or update workflow
`.github/workflows/ci.yml` without `workflows` permission
```

So the `ci.yml` copy ships as a **patch file**. The other four copies — `scripts/ci-migration-chain.sh`, `scripts/repro-ci-db.sh`, `scripts/probe_migration_order.sh`, `scripts/repro-ci-test-job.sh` — are updated and pushed.

### The patch

`docs/ci-238-migration-chain.patch` — **regenerated from the current `ci.yml`**, not from the state it was first generated from, so it cannot reference stale context.

```
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -540,6 +540,7 @@ jobs:
             db/migrations/gus-014-technique-fallback.sql
             db/migrations/gus-224-relations-option-b.sql
             db/migrations/gus-227-preparation-method-names.sql
+            db/migrations/gus-238-journey-editorial-fields.sql
             db/migrations/gus-242-seed-countries.sql
             db/migrations/gus-242-seed-country-names.sql
             db/migrations/gus-242-seed-cuisines.sql
```

### The one command you run

```bash
git checkout feature/gus-dish-journey-osm-cards && git apply docs/ci-238-migration-chain.patch && git commit -m "ci: add the GUS-238 migration to the CI chain" && git push
```

### What has been verified — and where

**Against the PR head `3e95598`, locally** (not on GitHub, because the patch is not pushed):

| Check | Result |
| --- | --- |
| `git apply --check` against the current `ci.yml` | applies cleanly |
| `validate-ci-migration-chain.py` **with the patch applied** | **"CI migration chain OK (55 migrations, all three lists agree)"** — exit 0 |
| `ci-migration-chain.sh` **with the patch applied** | **`FULL_CI_CHAIN_OK=1`** |
| The 10 new columns + `dish_journey_movements` in the chained database | present |
| Journey API tests against that database | **12 / 12 pass** |
| Full API suite against that database | **22 files, 217 passed, 3 skipped, 0 failed** |
| API + DB typecheck | exit 0 |
| Biome | exit 0 |

**These are local runs against a disposable chained database.** They are not a GitHub CI run. **After you push the patch, GitHub's CI will re-run** — and its result, not mine, is what counts.

### `approved-live` — what it authorises

The **Live approval gate** fails by design, because the PR touches `db/migrations/`. It reads the `approved-live` label and refuses to proceed without it.

**What the label authorises:** it authorises **this PR's migration to be applied to the LIVE production database** — the `gustale` database on the VPS at `62.72.7.218`. It is not a code-review sign-off and not a deploy approval; it is the switch that lets a migration touch production data.

**What it does not do:** it does not merge the PR, and it does not deploy the site.

**What I have not done, and will not do without you:** apply the migration to the live database. The migration is additive — ten nullable columns and one new table — so it does not destroy anything, but "additive" is not the same as "no need for a backup and a receipt". The runbook's sequence is preflight → backup → dry-run → apply → verify → receipt, and the live database is reachable only from the VPS.

---

## 10. Domain behaviour — verified, unchanged

No DNS, hosting or Caddy change. Measured with redirects **not** followed:

| Surface | HTTP | Canonical | Belongs to |
| --- | --- | --- | --- |
| `gustale.com/` | 200, no redirect | `https://gustale.com/` | **ATLAS** |
| `gustale.com/dishes/` | 200, no redirect | `https://gustale.com/dishes` | **ATLAS** |
| `recipes.gustale.com/` | 200, no redirect | **`https://gustale.recipes/`** | **RECIPES** |
| `recipes.gustale.com/dishes/` | 200, no redirect | **`https://gustale.recipes/dishes`** | **RECIPES** |
| `gustale.recipes/` | 200, no redirect | `https://gustale.recipes/` | RECIPES |
| `gustale.recipes/dishes/` | 200, no redirect | `https://gustale.recipes/dishes` | RECIPES |

`recipes.gustale.com` is a **DNS alias** on the same IP that serves the Recipes site and correctly canonicalises to `gustale.recipes`. It has **no Caddy entry of its own** — `infra/prod/Caddyfile` routes `gustale.recipes` + `www.gustale.recipes` — which is why it works: it falls through to the default block. Pre-existing, and deliberately **not** changed here.

A dish page (`gustale.com/dishes/bibimbap`) declares **11 hreflang alternates** with an `x-default`; the index pages declare none, which is the existing behaviour.

---

## 11. Unresolved evidence gaps

| # | Gap | Why it is still open |
| --- | --- | --- |
| 1 | **The Neos Kosmos article** (moussaka chapter 2) | HTTP 403 on every attempt. The claim is unresolved and the chapter is not publishable. The 2011 piece is also a republication of an *Atlantic* article, so the original may be the better source. |
| 2 | **The Chongqing Morning Post essay** (both hot-pot chapters) | No readable content. Both chapters are not publishable. |
| 3 | **Joo Young-ha (2010), full text** | Paywalled. The abstracts support the early-1980s recognition and the late-1990s spread, and nothing more. |
| 4 | ***Mongyupyeon* (1810), *Siuijeonseo*, *Joseon yori jebeop* (1921), *Byeolgeon'gon* (1929)** | All four are quoted by sources that **were** read, but the originals were not. Each chapter says which. |
| 5 | **Elizabeth David's *A Book of Mediterranean Food* (1950)** | The museum's account was read; the book was not. |
| 6 | **`gustale-osm-lineage-reference.png`** | **Does not exist** in either archive — the two reference images are hero shots with no map. The map style was derived from the 21 reference JPGs' palette plus the site's own basemap. **A documented reference gap, not a blocker.** |
| 7 | **The CARTO tile failure** | The symptom is recorded and the behaviour is fixed; the **cause is not established**. It could be a provider outage, a CDN path problem or a local network issue. |
| 8 | **Real place associations for the pilot dishes** | Not started — it is an editorial work package, proposed in §6. |

---

## 12. What needs your access

1. **Run the patch command** (§9) — one command; it is the only thing standing between the branch and a green CI.
2. **Decide whether to apply `approved-live`** — this authorises the migration to touch the **live** database. It is additive, but it still needs the runbook's preflight → backup → dry-run → apply → verify → receipt sequence, on the VPS.
3. **Decide the scope of the real place associations** (§6) — four questions: which dishes, which relationships, what counts as an established tradition for a community, and who reviews.
4. **Supply the two unreachable sources** (or confirm those chapters stay unpublished) — the Neos Kosmos article and the Chongqing Morning Post essay.

---

## 13. What changed and what did not

**Changed:** the dish-page Journey presentation (pilot-gated); the "not available yet" state (every dish); the lineage section (pilot-gated); the visible ingredient overview (pilot-gated); the section nav (now reaches the places & traditions section); one additive migration; the journey payload; the map's tile-source resilience; the per-chapter evidence record; the journey response validation.

**Not changed:** the confidence enum; the lineage data model; the `dish_place_associations` model; any existing component's behaviour outside the Journey section; `gustale.recipes`; DNS, hosting or Caddy; any live database; the Recipes site's design; the editorial content model.

**Not done:** no merge, no deploy, no `approved-live`, no live migration, no published editorial data. The pilot is off.

---

## 14. After the merge — the live state, measured

**PR #234 was merged** 2026-11-13 12:54 UTC by `consciousclarity`, as
`8750b17`, with the `approved-live` label applied at 12:28 and the PR
marked ready at 12:53. The merge is a fact, and the whole of §12 above
describes the state *before* it. This section describes the state after,
measured on the VPS and against the live endpoints.

### 14.1 What CI did

The merge run is `43429059289`. Every job except the deploy passed:

| Job | Result |
| --- | --- |
| `Lint + typecheck` | **success** |
| `Tests (vitest + postgis)` | **success** |
| `Accessibility gate (axe)` | **success** |
| `Docker build (gustale-api)` | **success** |
| `Docker build (gustale-web-recipes)` | **success** |
| `Docker build (gustale-web-geo)` | **success** |
| `Deploy to Hostinger` | **failure** — `Deploy via SSH`, then `Real verify` |

The migration-chain check that used to fail is now green: the `ci.yml`
copy of the migration list carries `gus-238-journey-editorial-fields.sql`
at line 543.

### 14.2 The live database was NOT migrated

This is the finding that matters, and it is not a judgement call — the
table says so:

```
$ docker exec shared-postgres psql -U postgres -d gustale -c "\d dish_journey_beats"
 id | dish_id | sequence | place_name | lat | lng | year_approx |
 label | confidence | source_id | created_at          <- 11 columns, no `title`
```

`dish_journey_movements` does not exist. The **10 new columns and the new
table are absent from live.** The `approved-live` label authorised the
migration; it did not apply it. Applying a live migration is the owner's
step, by direct `psql`, on the VPS (runbook §1 and §3).

### 14.3 The consequence: the live journey endpoint returns 500

The deployed API selects the new columns. The live database does not have
them. The query fails:

```
PostgresError: column dish_journey_beats.title does not exist
  at /app/dist/routes/dishes.js:1121:26
```

Measured against the live API, 2026-11-14:

| Endpoint | HTTP |
| --- | --- |
| `GET /api/dishes/bibimbap/journey` | **500** |
| `GET /api/dishes/moussaka-greek/journey` | **500** |
| `GET /api/dishes/falafel/journey` | **500** |
| `GET /api/dishes/rendang/journey` | **500** |
| `GET /api/dishes/vindaloo/journey` | **500** |
| `GET /api/dishes/chicken-tikka-masala/journey` | **500** |
| `GET /api/dishes/bibimbap/atlas` | 200 |
| `GET /api/dishes/bibimbap` | 200 |
| `GET /api/dishes/map?limit=5` | 200 |

**The blast radius is one endpoint.** Every other live route is healthy,
and the site itself is up: `gustale.com/`, `/dishes/bibimbap` and
`api.gustale.com/health` all return 200.

### 14.4 Why no page shows it yet

The web containers were never swapped. They are still on the previous SHA:

```
gustale-api           …gustale-api:8750b17…              Up 14 hours (healthy)   <- NEW
gustale-web-geo       …gustale-web-geo:live-data-af4a0f8-geo    Up 2 days (healthy)  <- OLD
gustale-web-recipes   …gustale-web-recipes:live-data-af4a0f8-recipes  Up 2 days (healthy)  <- OLD
```

The recipes image for the new SHA **was** built
(`gustale-web-recipes:live-data-8750b17-recipes`, 922 MB, present on the
box) but never started; there is **no** `gustale-web-geo:live-data-8750b17-geo`
image at all. The deploy log for the run is a single line:

```
DEPLOY_EXIT_CODE=0
```

…with no `DEPLOY_FAILED_AT=` line, even though the SSH step failed. And
the per-run tag file the deploy sourced, `/tmp/gustale-web-live-tag.viLVsv.env`
(2026-11-13 20:58), is **0 bytes** — the deploy looked for a tag that was
never written, which is the GUS-229 hazard the `ci.yml` comment describes
("the script wrote the correct tag to its own mktemp file, and the deploy
then 'source'd the stale fixed path"), recurring in the per-run form.

**So the live site is currently in a half-deployed state:** new API, old
web. That combination is *lucky*, not designed. The moment the web
containers are rebuilt to `8750b17`, every dish page that reads the
journey client-side would render the "This is a loading problem, not a
statement about the dish's history" state.

**The correct order is therefore: migrate the database first, then
rebuild the web.** Doing it in the other order ships the broken state
to readers.

### 14.5 The migration is proven safe to apply — a real dry run

The migration was applied to a **copy** of the live journey data, on the
disposable `gustale-test-postgres` container, never to live:

* The live `dish_journey_beats` structure and its **36 real rows** were
  dumped with `pg_dump` (read-only) and restored into a fresh database,
  with the referenced `dishes` and `sources` ids stubbed so the foreign
  keys could be enforced.
* The copy reproduced live exactly: **36 beats, 11 columns, no
  movements table**.
* The real `db/migrations/gus-238-journey-editorial-fields.sql` was
  applied to it: **`COMMIT`, exit 0**, no errors.
* After: **36 beats (unchanged), 21 columns, movements table present and
  empty, 9 CHECK constraints.** The exact query the deployed API runs
  returns rows.
* Re-running it: the `ADD COLUMN IF NOT EXISTS` statements are no-ops
  (NOTICEs), but the three `ADD CONSTRAINT` statements **abort**, because
  PostgreSQL has no `ADD CONSTRAINT IF NOT EXISTS`.

**A defect, honestly stated:** the migration's own header claims
"Idempotent: re-running produces no changes." That is **false** for the
three CHECK constraints. CI never re-runs a migration against the same
database, so nothing breaks today — but the header is wrong, and a
re-run aborts. The fix is a `DO $$ … IF NOT EXISTS (SELECT 1 FROM
pg_constraint …) $$` guard around each constraint, which is a **new
migration number** (Rule 11: an applied migration's file is immutable —
and this one is now applied on live, so it is frozen).

### 14.6 The two commits that are not in main

`c342411` (the publish rule) and `7457ab0` (its tests) were committed
**after** the merge and exist only on the branch. They are the ones that
make the publish rule actually *bind*:

```
primary_inspected, full_text_inspected   → publishable
abstract_only                            → publishable only for what the
                                           abstract states, and labelled
reported_only, inaccessible              → NEVER published
```

Before `c342411`, `isPublishable()` existed and **nothing called it** at
render time, so a `reported_only` chapter would have been rendered with
the pilot on. After it, the component builds its chapter list through
`publishableChapters()`, and the exclusion happens **before** the display
numbering, so the reader sees "1 / 3" rather than "1 / 4" with a gap.

`c342411` also carries `db/migrations/gus-238b-association-review-visibility.sql`,
which implements the owner's rule of 2026-11-13: an association is hidden
until it is **evidenced and reviewed**. It is a `CREATE OR REPLACE
FUNCTION` — genuinely idempotent — and it deletes nothing.

### 14.7 The follow-up PR

The two commits ship as **PR #236**, off `origin/main`. It needs the
`ci.yml` line, which the App cannot push, so it ships as the patch file
`docs/ci-238-migration-chain.patch`:

```
+            db/migrations/gus-238b-association-review-visibility.sql
```

Verified against `origin/main`'s `ci.yml`:

| Check | Result |
| --- | --- |
| `git apply --check` | applies cleanly |
| `validate-ci-migration-chain.py` **with the patch applied** | **"CI migration chain OK (56 migrations, all three lists agree)"** — exit 0 |
| the same validator **without** the patch | MISMATCH — and the mismatch is **exactly one line**, the missing `gus-238b` entry, and nothing else |
| `ci-migration-chain.sh` (both migrations) | **`FULL_CI_CHAIN_OK=1`** |
| `repro-ci-test-job.sh --with-0053` | exit 0, `RECIPES_PUBLISHED_VIEW_OK=1` |
| API suite against that database | **22 files, 223 tests, 210 passed, 3 skipped, 0 failed** |
| Web suite (`node --test`, 7 files) | **125 / 125 pass** |
| `pnpm -r run typecheck` | exit 0 |
| `node scripts/run-lint.mjs` | **"the lint: OK"** — 267 files |

### 14.8 What still needs the owner

1. **Apply `gus-238-journey-editorial-fields.sql` to the live database**,
   by direct `psql` on the VPS, with a backup first
   (`docker cp shared-postgres:/tmp/pre-XXXX.dump "$DUMP"`). It is
   additive — 10 nullable columns and one empty table — and §14.5 proves
   it applies cleanly against the live data. It is now FROZEN: fixes go
   into a new migration number.
2. **Apply `gus-238b-association-review-visibility.sql`** after it, if
   PR #236 is merged.
3. **Apply the `ci.yml` patch** from PR #236, or CI's database will not
   have `gus-238b` and its tests will fail.
4. **Rebuild the web containers** — after the migration, not before.

### 14.9 The one thing to fix in the migration

The three CHECK constraints are not re-runnable. Fix in a **new**
migration number, with a `DO $$` guard, so the file stays frozen:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dish_journey_beats_date_precision_check'
      AND conrelid = 'dish_journey_beats'::regclass
  ) THEN
    ALTER TABLE "dish_journey_beats"
      ADD CONSTRAINT "dish_journey_beats_date_precision_check"
      CHECK ("date_precision" IS NULL OR "date_precision" IN (
        'exact', 'circa', 'range', 'century', 'decade', 'bce', 'ce', 'unknown'
      ));
  END IF;
END $$;
```
