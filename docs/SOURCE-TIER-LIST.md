# The source tier list — S1 to S7, concretely

**Written:** 2026-11-08 (research lane, kanban card `t_ea058a91`, recipes
task item 3).
**Companion document:** `docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md` (the
staged backfill this list feeds).
**Status:** PROPOSED — for the owner's approval. Nothing here has been
applied to any database.

---

## Why this document exists

ADR-007-A1 §1.3 defines the tiers:

> `source_class` is `S1`–`S7` (`S1` primary historical, `S2` scholarly,
> `S3` institutional, `S4` practitioner, `S5` specialist, `S6` reference
> e.g. Wikipedia, `S7` unverified).

and it decides the rule that depends on them:

> **HIGH requires: every contributing source_class IN
> ('S1','S2','S3','S4','S5')**

The tiers were defined as **abstract categories**. What was missing — and
what this card asks for — is the **concrete list**: which sources exist in
the world, which tier each one is, and where they can actually be
reached. A tier that names no catalogue is not actionable, and the whole
evidence chain is blocked without it.

The chain, from ADR-004 §"the chain that has to be built":

```
non-Wikipedia source (S1–S5)
  → claim_citations row with stance='supports'
    → statement can reach 'verified'   (gate: the source class)
      → statement can reach 'published' (gate: a human credential)
        → claim is visible in the public API
```

**Step 1 is missing for every statement in the database.** This document
is step 1's address book.

---

## The facts this list rests on

Every number below is labelled with **how it was established**. Three
methods appear, and they are not interchangeable:

| label | meaning |
|---|---|
| **live API** | observed on `https://api.gustale.com` on 2026-11-08, read-only `GET` |
| **test DB** | observed on the isolated migration-built database `gustale_t_ea058a91` (test Postgres, `127.0.0.1:5434`) |
| **repo** | read from the repository's own files at the commit this branch is based on |
| **probe** | an HTTP status observed on 2026-11-08 from this host, with the identifying user agent `gustale-source-tier-probe/1.0 (https://gustale.com)` |

### The database today

| fact | value | how |
|---|---:|---|
| `sources` rows | **1,486** | repo (`docs/briefs/atlas-baseline.md`, and `docs/INCIDENT-2026-11-06-live-db-drop.md`'s dump comparison, which found them identical) |
| `sources` with `source_class` in S1–S5 | **0** | repo (same baseline) |
| `sources` with `source_class = 'S6'` | **1,486** | repo (same baseline) |
| `statements` | **1,354** | repo (baseline + `docs/MIGRATION-RECEIPT-0050-0051.md`) |
| `statements` at `research_pending` | **1,354** | repo (baseline) |
| `claim_citations` | **1,354** — every one pointing at an S6 source | repo (baseline) |
| `source_candidates` | **0** | repo (`docs/ASSOCIATION-REVIEW-PROPOSAL.md`; the 2026-11-06 dump also found 0) |
| `sources.source_class` is nullable | yes | test DB — `ALTER TABLE sources ADD COLUMN source_class source_class` (0027), no NOT NULL |
| `source_class` enum labels | `S1 S2 S3 S4 S5 S6 S7` | test DB (`pg_enum`) |

> **Direct live SQL was not available on this host.** `GUSTALE_LIVE_DB_ALLOW=1
> bash scripts/dbq.sh "<SELECT>"` returned, verbatim:
>
> ```
> ERROR: no database password. Set GUSTALE_DB_PASSWORD, or make
>        /home/deploy/gustale.com/.db-password readable.
> ```
>
> The lane rules forbid SSH, and the password file does not exist on this
> host. So the **live row counts above are quoted from the repository's own
> baseline and dump-comparison documents, not from a live query**. They
> were corroborated where possible by the public API (below), which reads
> the same live database through a different door.

### The public API today (live API, 2026-11-08)

A read-only census of every published dish:

```
GET /api/dishes?limit=100&offset=N     → 1,474 dishes total, 1,474 fetched, 0 errors
GET /api/dishes/<slug>                 → per-dish detail
```

| fact | value |
|---|---:|
| dishes listed | **1,474** |
| dishes with **at least one** source row | **121** |
| dishes with **no** source row | **1,353** |
| source rows per dish | `0` → 1,353 · `1` → 121 |
| `source_type` of every source row exposed | `web` (121 of 121) |
| `publisher` of every source row exposed | `Wikipedia, The Free Encyclopedia` (121 of 121) |
| dishes whose `evidence` block is `{statementCount: 0, verifiedCount: 0}` | **121** — the legacy published dishes |
| dishes whose `evidence` block is `{statementCount: 1, verifiedCount: 0}` | **1,353** — the Pool A dishes: one statement each, **none** verified |
| dishes with **any** ingredient row | **1** (`moussaka-greek`) |
| `dish_ingredients` rows in the whole database | **4** |
| distinct ingredient slugs in use | **4** — `eggplant`, `lamb-mince`, `tomato`, `bechamel` |

`GET /api/ingredients` returns **5** rows: those four plus `bechamel-sauce`
(a published near-duplicate of `bechamel` with `dishCount: 0`). This
matches ADR-007-A1 §3.1 exactly — 5 published, 4 in use.

**Two things follow, and both matter for the plan.**

**1. The `sources` table is nearly empty in practice.** The 1,486 source
rows are one per Pool A dish's Wikipedia article; the `citations` rows
that the public dish API reads are a different, much smaller set (121).
The 121 are the legacy published dishes; the 1,353 Pool A dishes carry
their citation in `claim_citations` against a `statement`, and the public
dish endpoint does not join `claim_citations` — it reads `citations`
(`apps/api/src/routes/dishes.ts:684`). So a dish can carry a Wikipedia
source and still show **no** `sources` array in the API, and vice versa.
Any counting done through the API alone will under-report by more than
ten times. **The API census and the SQL baseline are two different
views, and this document keeps them apart.**

**2. `verifiedCount` is 0 for every dish in the database.** Not one
statement has reached `verified` or `published` — which is exactly what
§1.3 predicts when every source is `S6`.

### Where the ingredient vocabulary already comes from

| fact | value | how |
|---|---:|---|
| `ingredient_categories` rows | **435** | test DB (migration `0020`, FoodOn-derived + project rows) |
| of those, carrying a `foodon_id` | **380** | test DB |
| of those, with a `parent_id` (41 are children) | **41** | test DB |
| `ingredients.category` values set | **0 of 4** — the column is unused | test DB |
| `ingredients.category` is a foreign key to `ingredient_categories` | **no** — it is a free `text` column | test DB (`\d ingredients`) |
| the TypeScript union `ingredientCategory` (12 values) vs the vocabulary table | 11 of 12 exist as rows; **`other` does not exist** | test DB + `packages/db/src/schema/index.ts:252` |

This is a **finding**, not a change: `ingredients.category` is an
unenforced free-text column whose intended vocabulary (the TypeScript
union) and its actual vocabulary (the 435-row `ingredient_categories`
table) are different sets. Stage B of the backfill plan has to pick one
and say so.

---

## The tiers, concretely

The tier names are ADR-002's (§0027, the `source_class` enum comment).
What follows is the concrete instantiation: **which catalogues and
publishers belong to each tier**, and whether each is reachable from this
host today.

### The rule the tiers encode

The class of a source is a property of **the publisher**, not of the
individual work. ADR-002 §0027 says so: *"Q6: sources are classified by
URL domain, individually."* The class decides what a source may be used
**for**; the existing `statement_set_status()` verified-gate already keys
on it (`db/migrations/0027_adr002_claims_model.sql:607-638`, the `verified`
branch of `statement_set_status()`):

| claim class | the sources that satisfy it |
|---|---|
| `documented` | ≥1 `supports` citation from `S1`–`S5` |
| `scholarly_interpretation` | ≥1 `supports` citation from `S1`–`S3` |
| `oral_tradition` | ≥1 `supports` citation from `S4` |
| `disputed` | ≥2 **distinct** classes among `S1`–`S3` |
| `hypothesis` | ≥1 `supports` citation from `S2` or `S5` |

and ADR-007-A1 adds one more rule on top, which is the reason this
document is a document and not a table:

> `S6` and `S7` never contribute to HIGH. A recipe whose every source is
> `S6` is MEDIUM at best.

---

### S1 — primary historical

**What it is:** the primary record of the thing itself — a period
cookbook, an archive catalogue record of a manuscript, a first-edition
treatise, an institutional collection holding the original artefact.
The work someone made at the time, or the catalogue that holds it.

**Concrete sources, with the class each gets:**

| source | what it is | stable identifier | probe (2026-11-08) |
|---|---|---|---|
| **Project Gutenberg** | digitised public-domain cookbooks and treatises | PG ebook id | `200` — `gutendex.com/books/?search=cookery` → **68** hits for "cookery" |
| **Internet Archive** | scanned books, cookery collections, ephemera | `identifier` | `200` — `archive.org/advancedsearch.php` |
| **BnF catalogue général** (national library catalogue) | bibliographic records of books and manuscripts | ARK, e.g. `ark:/12148/cb39124381t` | `200` — `catalogue.bnf.fr/api/SRU` → **42** records for "moussaka" |
| **BnF Gallica** | digitised French books and periodicals | ARK | `403` from this host |
| **Open Library** | union catalogue of library holdings | OL work key (`/works/OL…W`) | `200` — `openlibrary.org/search.json` |
| **Library of Congress** | national library catalogue | LCCN | `403` from this host (both UAs tried) |
| **HathiTrust** | digitised library holdings | HathiTrust id | `403` from this host |
| **Europeana** | European cultural-heritage aggregator (books, manuscripts, images) | provider id + item id | `200` — 1,840 results for "cookery" |
| **Wikisource** (non-en) | transcription of public-domain primary texts | page title | `200` — `en.wikisource.org/w/api.php` |

**Why S1 and not S5:** the same book in a *catalogue record* (S1 — the
artefact is catalogued, the record is primary evidence of its existence
and edition) and the same book *cited in a modern work* (S5) are
different evidentiary acts. The classification is by **where the source
sits**, not by how interesting it is.

**Reachability, honestly:** 5 of 8 reachable from this host on
2026-11-08; BnF Gallica, LOC and HathiTrust answer `403` here. They are
not dead — they are reachable from a browser, and `scripts/fetch_pool_a_leads.py`
already has a fallback ladder for exactly this. But **a plan that depends
on them needs a fetch strategy that tolerates `403`**, and that is a
finding for the backfill plan, not something to assume away.

**`S1` in the repo's own tooling:** `scripts/find_source_candidates.py`
maps `openlibrary` → `S1`/`S5` and `loc` → `S3`. The `openlibrary` →
`S5` mapping is the one this document **questions** — see
[Finding F-2](#finding-f-2--the-openlibrary--s5-mapping-is-wrong).

---

### S2 — scholarly

**What it is:** peer-reviewed research and the scholarly record —
journal articles, monographs in academic presses, theses in
repositories, conference proceedings.

**Concrete sources:**

| source | what it is | stable identifier | probe |
|---|---|---|---|
| **Crossref** | DOI registry — journals, books, proceedings | DOI | `200` — `api.crossref.org/works` |
| **OpenAlex** | open scholarly index (works + sources) | OpenAlex id | `200` normally; **`503` during this session** ("Search temporarily unavailable") |
| **DataCite** | DOI registry for datasets, preprints, dissertations | DOI | `200` |
| **DOAJ** | open-access journal articles | article id | `200` |
| **Europe PMC** | biomedical literature | PMID / DOI | `200` |
| **HAL** (French open archive) | theses, articles, preprints | `hal-…` id | `200` — **2,516** hits for "cuisine" |
| **OpenAIRE** | European research aggregator | DOI / result id | `200` |
| **Zenodo** | research software, data, preprints | DOI / record id | `200` |
| **OED / Oxford English Dictionary** (via Crossref) | the standard historical dictionary of English | DOI (`10.1093/oed/…`) | `200` — surfaced "nasi goreng, n." under Crossref |

**Note on the OED.** It surfaced *through* Crossref as a Crossref-registered
book chapter. It is a **`S5` specialist** source by the tier definitions
(an authoritative reference work for words), and it reached us through an
`S2` index. **The tier is a property of the publisher, so the class must
follow the publisher, not the index it was found through.** This document
classifies the OED as `S5`; see Finding F-1.

---

### S3 — institutional

**What it is:** a government, intergovernmental or standards body's own
published record — a food authority's nomenclature and composition
tables, a national institute's dataset, a taxonomic authority for
species, a museum's open-access collection.

**Concrete sources:**

| source | what it is | stable identifier | probe |
|---|---|---|---|
| **FoodOn** | the food-material ontology this repo already uses for identifiers | `FOODON:…` | `200` — `purl.obolibrary.org/obo/foodon.owl`, **40.8 MB** |
| **EFSA Foodex 2** | the EU food classification (via data.europa.eu) | dataset id | `200` — the dataset page; the EFSA application URL itself is `404` |
| **CIQUAL** (ANSES, France) | French food composition table | food id | `503` from this host |
| **INAO** (France) | the French national institute for fruit-and-vegetable products | — | `200` |
| **FAO / FAOSTAT** | the UN food and agriculture statistics (Food Composition Tables) | — | `200` |
| **USDA FoodData Central** | the US food-composition database | FDC id | `200` — `api.nal.usda.gov/fdc/v1` |
| **GBIF** | the global biodiversity occurrence + backbone taxonomy | usage key | `200` — exact match for *Solanum lycopersicum* → `usageKey 2930137`, `status ACCEPTED` |
| **Catalogue of Life** | the taxonomic checklist | checklist id | `200` |
| **Wikimedia Commons** | media repository (files, not articles) | file title | `200` |
| **Smithsonian Open Access** | museum collection objects | `edanmdm:…` | `200` — 228 results for "cookery" |
| **Wellcome Collection** | a specialist library's catalogue | `kx…` / `asd…` id | `200` — 1,912 results for "cookery" |

**`S3` is the tier this project needs most and has least.** The
ingredient vocabulary is *already* FoodOn-derived: 380 of the 435
`ingredient_categories` rows carry a `foodon_id`. The identifiers exist;
what is missing is the **evidence** that connects an ingredient to the
material it names — and FoodOn, EFSA Foodex 2, CIQUAL, USDA FDC and GBIF
are precisely the sources that provide it, each with a stable identifier
and an API.

---

### S4 — practitioner

**What it is:** the working chef. A tested recipe from a professional
kitchen or a serious food publication's test kitchen — the practice as
it is actually performed, including the parts a textbook omits.

**DECIDED 2026-11-09: the discovery source for S4 is the LIBRARY
CATALOGUES — WorldCat and Library of Congress records.** The owner's
words: *"S4: option 1, library catalogues (WorldCat / LoC records) as the
S4 discovery source."*

That changes what S4 *is for this project*. The practitioner sources
below (James Beard, Cook's Illustrated, Le Cordon Bleu) are **HTML with
no API** — finding F-3 — and they are what the library catalogues
replace as the *discovery* layer. The catalogues are:

- **WorldCat** (OCLC) — catalogue records, holdings, editions, OCLC
  numbers;
- **Library of Congress** — catalogue records, and separately the **LC
  authority file** (`id.loc.gov`), which is an *authority* record rather
  than a catalogue record and may be the better fit for a food material's
  authoritative name and classification.

**The access plan — terms, API keys, rate limits, and what needs the
owner's signup — is a separate research deliverable.** Until it lands,
the honest statement is: S4's discovery path is **decided but not yet
reachable**, and every S4 source below is HTML-only.

**Concrete sources:**

| source | what it is | probe |
|---|---|---|
| **James Beard Foundation** | recipes and reference from the Foundation's test kitchens | `200` — 106 KB |
| **Cook's Illustrated** | the magazine's test-kitchen recipes and equipment methodology | `200` — 341 KB |
| **Le Cordon Bleu** | a culinary school's public teaching material | `200` — 233 KB |
| **Chefs Collaborative** | a professional-chefs' network | `403` from this host |
| **Serious Eats** | a test kitchen with published methodology | `402` from this host |

**`S4` is the tier with the sharpest constraint, and it is a policy
constraint rather than a technical one.** ADR-007-A1 §1.4 decides:

> **Published recipe text MUST be in our own words, never copied.**

So an `S4` source is used as **evidence that a method exists and works**,
with a **locator** (ADR-007-A1 §8.3 condition 7′) — never as text to
reproduce. The `S4` tier is what makes a recipe's *method* credible; the
copyright rule is what stops the tier from becoming a copy-paste
machine. The two together are coherent: cite the page, write the
sentence.

---

### S5 — specialist

**What it is:** the reference work, the dictionary, the monograph by the
person who knows the subject. Not a general publication (that is `S6`);
a specialist authority.

**Concrete sources:**

| source | what it is | stable identifier | probe |
|---|---|---|---|
| **Larousse / Larousse Gastronomique** | the French encyclopaedia of food | article slug | `200` — 54 KB on the encyclopédie index |
| **CNRTL / TLFi** | the *Trésor de la Langue française informatisé* — the French language treasury | headword | `200` — 90 KB; a headword page carries Morphologie / Lexicographie / Étymologie / Synonymie sections, i.e. **clean locator targets** |
| **Brill** | scholarly publishing, incl. food studies | DOI / book id | `200` |
| **Oxford Reference** | the general reference library | DOI | `302` (redirect) |
| **Oxford English Dictionary** | the historical dictionary of English | DOI | via Crossref, `200` |
| **Open Library** (as a *bibliographic* source about a work) | catalogue metadata | OL key | `200` |

**`S5` is a specialist tier, and the sources above are specialists.**
A general-interest magazine or a newspaper is **not** `S5` — it is `S6`
(see Finding F-2).

---

### S6 — reference (discovery and terminology only)

**What it is:** general reference works and encyclopaedias, used for
**discovery and terminology** — to find the dish, to get its name in the
right language, to identify the Wikipedia article that the Pool A import
used. Never the sole basis for a claim.

**Concrete sources:**

| source | what it is | probe |
|---|---|---|
| **English Wikipedia** | the encyclopaedia | `200` — REST and action API |
| **Wikidata** | the structured knowledge base | `200` |
| **Britannica** | the general encyclopaedia | `403` from this host |

**`S6` is not a tier of evidence. It is a tier of *provenance*.** The
repo's own use makes this exact: `scripts/cite_pool_a.py` attaches one
`S6` citation per Pool A dish and says so in its own docstring:

> The statement STAYS at `research_pending`. The citation is not evidence
> for the origin claim — S6 is "discovery and terminology only" and can
> never stand alone. The citation is ATTRIBUTION.

And the ADR-007-A1 rule:

> **a Wikipedia-only recipe is NEVER HIGH** — not "usually not HIGH",
> never.

---

### S7 — unverified

**What it is:** anything whose authorship or editorial process cannot be
established — an anonymous blog post, an unattributed forum answer, an
AI-generated text, a social-media post.

| source | what it is | probe |
|---|---|---|
| **Open Food Facts** | a crowd-sourced product database | `503` from this host |
| **unattributed web pages** | anything with no identifiable publisher | — |

**`S7` is a quarantine class.** It exists so that a source can be
**recorded** without being **usable** — a `S7` row in `sources` is a
record that something was found and rejected, not an endorsement. There
is no `S7` source in the database, and there should not be one in
`sources`: `S7` belongs on `source_candidates`, whose `status` enum
(`candidate` / `fetched` / `rejected`) already carries the same
vocabulary.

---

## The catalogue-to-tier map, as code

The repo already has this map, in `scripts/find_source_candidates.py`:

```python
CATALOGUES = {
    "crossref":   {"class": "S2"},
    "openalex":   {"class": "S2"},
    "loc":        {"class": "S3"},
    "openlibrary": {"class": "S5"},
}
```

**This document proposes extending it.** The four catalogues above are
correct as far as they go; the problem is that they are the *only* four,
and they cover 2 of the 5 usable tiers (`S2` and `S3`), leaving `S1`
under-served, `S4` and `S5` barely served at all.

### The proposed catalogue set, in tier order

| tier | catalogue | endpoint | class | notes |
|---|---|---|---|---|
| S1 | `gutenberg` | `gutendex.com/books` | S1 | JSON, PG ids |
| S1 | `internet_archive` | `archive.org/advancedsearch.php` | S1 | JSON, identifiers |
| S1 | `bnf` | `catalogue.bnf.fr/api/SRU` | S1 | XML, ARK ids |
| S1 | `europeana` | `api.europeana.eu/record/v2/search.json` | S1 | JSON, needs an api key |
| S1 | `loc` | `www.loc.gov/search/?fo=json` | S1 | JSON, LCCN — **currently 403 here** |
| S1 | `hathitrust` | `catalog.hathitrust.org` | S1 | **currently 403 here** |
| S1 | `openlibrary` | `openlibrary.org/search.json` | S1 | JSON, OL keys — see F-2 |
| S2 | `crossref` | `api.crossref.org/works` | S2 | already wired |
| S2 | `openalex` | `api.openalex.org/works` | S2 | already wired; **intermittent 503** |
| S2 | `datacite` | `api.datacite.org/dois` | S2 | JSON, DOIs |
| S2 | `doaj` | `doaj.org/api/search/articles` | S2 | JSON |
| S2 | `europe_pmc` | `ebi.ac.uk/europepmc/webservices/rest` | S2 | JSON/XML |
| S2 | `hal` | `api.archives-ouvertes.fr/search` | S2 | JSON, `hal-` ids |
| S2 | `openaire` | `api.openaire.eu/search/publications` | S2 | JSON |
| S2 | `zenodo` | `zenodo.org/api/records` | S2 | JSON, DOIs |
| S3 | `foodon` | `purl.obolibrary.org/obo/foodon.owl` | S3 | OWL, 40.8 MB, `FOODON:` ids |
| S3 | `gbif` | `api.gbif.org/v1/species/match` | S3 | JSON, usage keys |
| S3 | `catalogue_of_life` | `api.checklistbank.org` | S3 | JSON |
| S3 | `usda_fdc` | `api.nal.usda.gov/fdc/v1` | S3 | JSON, FDC ids — **needs a key** |
| S3 | `wellcome` | `api.wellcomecollection.org/catalogue/v2` | S3 | JSON |
| S3 | `smithsonian` | `api.si.edu/openaccess/api/v1.0` | S3 | JSON — **needs a key** |
| S3 | `europeana` | (see above) | S3 | JSON — **needs a key** |
| S4 | `james_beard` | `jamesbeard.org/recipes` | S4 | HTML — **no API** |
| S4 | `cooks_illustrated` | `cooksillustrated.com` | S4 | HTML — **no API** |
| S4 | `cordon_bleu` | `cordonbleu.edu` | S4 | HTML — **no API** |
| S5 | `cnrtl` | `cnrtl.fr/definition/<headword>` | S5 | HTML, per-headword pages |
| S5 | `larousse` | `larousse.fr/encyclopedie/…` | S5 | HTML — **404 on many article URLs** |
| S5 | `brill` | `brill.com` | S5 | HTML, DOI-backed |
| S6 | `wikipedia` | `en.wikipedia.org/api/rest_v1` | S6 | **discovery only, never proposed** |
| S6 | `wikidata` | `www.wikidata.org/w/api.php` | S6 | **discovery only, never proposed** |
| S7 | — | — | S7 | **not a discovery catalogue** |

**The `S4` row is the problem.** All three `S4` sources are HTML with no
public API, and `scripts/find_source_candidates.py`'s own docstring
already draws the line:

> All are public APIs, fetched over plain HTTPS with an identifying
> User-Agent.

`S4` — practitioner sources — is **the tier most needed for recipes**
(ADR-007-A1 §1.3: the cookbook tier can support HIGH) and it is the
tier with the **least machine-readable surface**. This is Finding F-3, and
it is the single most consequential thing in this document.

---

## The four findings

### Finding F-1 — the class must follow the publisher, not the index

**Observed:** the OED entry for "nasi goreng" is reachable only through
Crossref (`10.1093/oed/4329179586`), which the repo maps to `S2`. The
OED itself is an authoritative specialist reference work.

**Why it matters:** if the class is taken from the index, a dictionary
becomes "scholarly" and a scholarly article indexed in Open Library
becomes "specialist". The evidence gates key on the class, so a wrong
class either inflates a claim (an `S5` reference work passing a
`scholarly_interpretation` gate it should fail) or deflates it.

**Proposal:** the class is assigned from the **publisher's identity**,
recorded explicitly on the candidate, with the catalogue recorded
separately as *how it was found*. `source_candidates` already has both
slots: `catalogue` and `proposed_source_class`. The rule is that the
classifier looks at the **resolved publisher**, not the search API.

### Finding F-2 — the `openlibrary` → `S5` mapping is wrong

**Observed:** `scripts/find_source_candidates.py` maps `openlibrary` →
`S5`. Open Library is a **union catalogue**: it indexes scholarly
monographs, popular paperbacks, and everything in between. The `S5`
tier is "specialist" — an authority on a subject.

**Why it matters:** a union catalogue's result carries the class of
**whatever it happens to index**, so the same catalogue would propose
`S5` for a university press monograph (wrong — that is `S2`) and `S5`
for a general-interest cookbook (wrong — that is `S4`).

**Proposal:** Open Library is a **`S1` discovery catalogue**, and the
class of any individual result is decided from its publisher after the
catalogue has resolved it. The same correction applies to `loc`: a
Library of Congress record is a **catalogue record** (`S1`), while the
Library of Congress as an **issuing institution** (its own reports,
photographs, datasets) is `S3`. The repo currently maps `loc` → `S3`
uniformly, which conflates the two.

**Also flagged:** a general-interest publication — a newspaper, a
magazine, a popular food show's website — is **`S6`**, not `S5`. `S6`
covers "general publications" in ADR-002's own words.

### Finding F-3 — `S4` has no machine-readable surface, and it is the tier recipes need

**Observed:** all three `S4` sources answer HTML. There is no API, no
structured feed, no catalogue that indexes them. `S1`–`S3` and `S5` all
have JSON or XML endpoints with stable identifiers; `S4` has none.

**Why it matters:** the source-candidate pipeline is built entirely around
API queries that return structured records (`title`, `authors`, `year`,
`publisher`, `doi`, `isbn`, `url`). An `S4` candidate cannot be produced
by that pipeline. And `S4` is what ADR-007-A1 §1.3 names as the tier
that can support a recipe's HIGH confidence.

**Proposal — three options, for the owner to choose between:**

1. **Give `S4` a catalogue.** The honest route, and the one that fits
   the existing pipeline: a *catalogue of cookbooks and culinary
   collections* with structured records. The candidates are
   **WorldCat** (the union catalogue of the world's libraries), the
   **Library of Congress**'s `cft=book` filter, and — for the periodical
   and website tier — the **ISSN Portal** and the publishers' own
   sitemaps. A cookbook found in WorldCat is an `S4` candidate with an
   OCLC number, a publisher, and a year: exactly the record shape the
   pipeline expects.
2. **Treat `S4` as fetched-from-HTML.** Extend the pipeline with an
   HTML fetch step that extracts the recipe's metadata (title, author,
   date, test-kitchen attribution) from a specific URL. `S4` candidates
   would be seeded by hand — the publisher's own recipe index — rather
   than discovered by query.
3. **Demote `S4`'s role.** Accept that recipes reach HIGH on `S1`/`S2`/
   `S3` sources alone, and treat `S4` as a *quality* signal rather than
   a *confidence* signal.

**Recommendation: option 1.** It is the only one that keeps the
pipeline uniform, and it is the only one that makes `S4` a **discovery**
tier rather than a hand-curated list. But this is a decision with a cost,
and under Rule 10 it is the owner's.

### Finding F-4 — `S1` and `S3` are partly behind `403`

**Observed:** from this host, on 2026-11-08: BnF Gallica `403`, Library
of Congress `403` (with the identifying UA **and** with a browser UA),
HathiTrust `403`, CIQUAL `503`, Open Food Facts `503`, Serious Eats
`402`, Chefs Collaborative `403`. OpenAlex returned `200` on the first
probe and `503` ("Search temporarily unavailable") on the second.

**Why it matters:** a catalogue that is intermittently unreachable
produces a pipeline that is intermittently empty, and an empty pipeline
is indistinguishable from a catalogue that has nothing. The
`find_source_candidates.py` code already anticipates this — its
`fetch_json` docstring says *"A catalogue that returns a truncated body
— which the Library of Congress does under load — is a failure, not a
partial answer"* — but the **set** of catalogues is the real constraint.

**Proposal:** the pipeline needs a per-catalogue **availability record**,
and the candidate run should treat "catalogue unreachable" as a
**reported outcome**, not a silent zero. The `source_candidates` table
has a `fetch_note` column and a `fetched` boolean — but a candidate is
only ever created *after* a successful catalogue response, so a catalogue
that never responded leaves **no trace at all**. That is the gap.

---

## What is NOT in this document

- **No migration.** This is a research lane; the card forbids writing
  one. The catalogue-to-tier map above is a proposal for
  `scripts/find_source_candidates.py`'s `CATALOGUES` dict, to be applied
  in a later, separately-approved card.
- **No application code.** Nothing here has been implemented.
- **No live database write.** No write was attempted. The one live access
  path available (`dbq.sh`) was refused for a missing credential, and
  the lane forbids SSH.
- **No promotion of candidates.** `source_candidates.status` has three
  values (`candidate`, `fetched`, `rejected`) and the repo's own report
  prints *"the promoted (MUST BE ZERO)"* — the promotion path does not
  exist and this document does not invent one.

---

## Reproducing the facts

### The live API census

```
GET https://api.gustale.com/api/dishes?limit=100&offset={0,100,...,1400}
GET https://api.gustale.com/api/dishes/<slug>          for each of the 1,474 slugs
GET https://api.gustale.com/api/ingredients?limit=50
```

Result (2026-11-08): 1,474 dishes, 0 errors, 121 with a source row, 1,353
with a statement and no verified statement, 1 with ingredients, 4
`dish_ingredients` rows, 5 `ingredients` rows.

### The catalogue probe

One script, run once, with the identifying user agent
`gustale-source-tier-probe/1.0 (https://gustale.com)`:

```bash
probe () {
  code=$(curl -s -m 25 -A "$UA" -o /tmp/probe_body -w '%{http_code}' -L "$2")
  size=$(wc -c < /tmp/probe_body | tr -d ' ')
  printf '%-34s %-4s %8s  %s\n' "$1" "$code" "$size" "$2"
}
```

46 endpoints were probed. Every `200` above is that command's output. The
`403`/`402`/`503`/`404`/`302`/`000` entries are equally real: they are
the endpoints that need a different access strategy, and they are the
reason Finding F-4 exists.

### The schema facts

```
test Postgres, 127.0.0.1:5434, database gustale_t_ea058a91
built by scripts/ci-migration-chain.sh gustale_t_ea058a91
```

- `\d sources`, `\d ingredients`, `\d claim_citations`, `\d citations`,
  `\d ingredient_categories`, `\d ingredient_translations`,
  `\d ingredient_variants`, `\d dish_ingredients`,
  `\d recipe_ingredients`, `\d source_candidates`
- `select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
  where t.typname in ('source_class','source_candidate_status','citation_stance')`
- `select pg_get_viewdef('recipe_publishable'::regclass, true)`
- `select pg_get_functiondef(oid) from pg_proc where proname='assert_provenance_status'`

---

## Related documents

| topic | file |
|---|---|
| the ADR this list implements | `docs/ADR-007-A1-recipes-confidence-autopublish-contributors-language-urls.md` |
| the claims model and the `source_class` enum | `db/migrations/0027_adr002_claims_model.sql` |
| the candidate table | `db/migrations/0046_source_candidates.sql` |
| the candidate pipeline | `scripts/find_source_candidates.py` |
| the S6 citation rule | `scripts/cite_pool_a.py` |
| the live baseline (1,486 S6 / 1,354 statements) | `docs/briefs/atlas-baseline.md` |
| the evidence chain | `docs/ADR-004-atlas-amendments.md` |
| the ingredient backfill plan | `docs/RECIPES-INGREDIENT-BACKFILL-PLAN.md` |
| the task state | `docs/RECIPES-TASK-RESUME.md` |
