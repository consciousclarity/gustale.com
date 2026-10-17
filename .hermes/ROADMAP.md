<!-- Adopted by the owner 2026-10-17 as the master roadmap for gustale.com + gustale.recipes.
     Supersedes .hermes/COMPETITIVE_ROADMAP.md (kept as reference; its items are mapped into BACKLOG.yaml notes).
     How Hermes executes it: .hermes/ROADMAP_EXECUTION.md. Task tracking: .hermes/BACKLOG.yaml.
     "Observed condition" rows below came from public pages, not a code audit — GUS-001 verifies them. -->

# GUSTALE — Master Development Roadmap
### Building the World's Most Credible and Interactive Encyclopedia of Culinary Heritage

**Project:** [gustale.com](https://gustale.com) + [gustale.recipes](https://gustale.recipes)  
**Status:** Active development  
**Objective:** Transform Gustale from a developing culinary atlas into a comprehensive, trustworthy, interconnected, interactive, and entertaining platform for exploring the world's food heritage.

## 1. Product vision

Gustale should eventually answer six fundamental questions about any dish:

1. **What is it?** — Ingredients, cooking methods, characteristics, and traditional preparation.
2. **Where is it from?** — Geographical associations, historical locations, communities, and disputed origins.
3. **When did it emerge?** — Earliest documented references, historical context, and subsequent developments.
4. **How did it spread?** — Migration, trade, colonization, religious exchange, and cultural adaptation.
5. **How is it connected?** — Related dishes, shared ingredients, cooking techniques, regional variations, and culinary families.
6. **How can I experience it?** — Authentic recipes, interactive discoveries, culinary stories, and opportunities to contribute knowledge.

The guiding principle should be:

**Every dish is a gateway into geography, history, culture, science, and cooking. Every important claim should be traceable to evidence.**

### What the current website tells us

The public Gustale pages reveal several development gaps:

| Area | Observed condition | Priority |
|---|---|---|
| Encyclopedia coverage | Homepage reports 121 dishes, 36 origins, 22 families, and 15 lineages | High |
| Source verification | Sample dishes rely on a single Wikipedia reference | Critical |
| Recipe completeness | Several dish pages display “No detailed steps recorded yet” | Critical |
| Photography | Several dishes display “Cover pending” | High |
| Historical lineages | Existing structure distinguishes documented and tentative relationships | Preserve and improve |
| Content consistency | Homepage reports 15 lineages; directory reports 14 | High |
| Connectivity | Related dishes exist, but historical and geographical relationships need greater depth | High |
| User engagement | Browsing and contributing exist; substantial opportunities remain for interactive exploration | High |

These observations come from publicly indexed Gustale pages, including individual dishes and the lineage directory. They are not a complete code or infrastructure audit. [Gustale](https://www.gustale.recipes/)

The following backlog is designed for implementation through **Hermes**, with clear priorities, technical deliverables, and validation criteria.

---

## 2. Priority system

| Priority | Meaning | Implementation guidance |
|---|---|---|
| **P0 — Critical** | Broken functionality, data integrity, credibility risks | Fix before expanding content |
| **P1 — Essential** | Core encyclopedia experience and completeness | Build next |
| **P2 — High value** | Discovery, interactivity, engagement, usability | Develop after the foundations |
| **P3 — Advanced** | Unique capabilities and competitive differentiation | Build on stable data and APIs |
| **P4 — Long-term** | Research partnerships, advanced AI, community ecosystem | Develop incrementally |

**Important:** Features must be driven by a coherent underlying data model. An attractive interactive map is not useful if the geographical claims are incorrect. Similarly, sophisticated AI search will not make the encyclopedia credible if its source material is unreliable.

---

## 3. EPIC 01 — Stabilize the technical foundation
**Priority: P0 — Critical**

The first objective is to make the existing system reliable. Do not introduce major new functionality while core API operations can silently fail.

### Tasks

- [ ] **GUS-001 — Audit the existing architecture.** Inventory the repositories, database schema, services, routes, APIs, deployment configuration, content pipeline, and unfinished features.
- [ ] **GUS-002 — Repair the API PATCH persistence bug.** Verify that updates actually persist to PostgreSQL and remain correct after application restarts.
- [ ] **GUS-003 — Add database transaction safety.** Ensure related changes are committed atomically, especially changes involving dishes, sources, regions, and lineages.
- [ ] **GUS-004 — Introduce database migration discipline.** Use versioned migrations, rollback procedures, and migration tests.
- [ ] **GUS-005 — Fix CI/CD reliability.** Eliminate hidden test failures, flaky linting, ignored exit codes, and deployment steps that report success incorrectly.
- [ ] **GUS-006 — Audit existing GitHub branches and Dependabot configuration.** Consolidate stale work without losing valuable changes.
- [ ] **GUS-007 — Resolve container registry authentication.** Fix GHCR token permissions if container publishing is required.
- [ ] **GUS-008 — Verify automated deployments.** Preserve the existing build-checkout, systemd timer, content-change detection, image SHA verification, and live-page checks.
- [ ] **GUS-009 — Implement API contract tests.** Cover GET, POST, PATCH, DELETE, pagination, filtering, authorization, and validation.
- [ ] **GUS-010 — Implement centralized error reporting.** Capture frontend exceptions, API failures, failed content imports, and database errors.
- [ ] **GUS-011 — Implement scheduled integrity checks.** Identify duplicate records, broken references, orphaned relations, invalid coordinates, and missing required fields.
- [ ] **GUS-012 — Verify backup and disaster recovery.** Test PostgreSQL restoration, object-storage recovery, and application redeployment.
- [ ] **GUS-013 — Introduce feature flags.** Allow unfinished functionality to remain deployed but unavailable until its acceptance tests pass.

### Technical direction

Preserve the existing architecture where practical:

| Component | Current documented stack | Direction |
|---|---|---|
| Backend | Fastify | Retain and harden |
| Database | PostgreSQL | Retain as primary source of truth |
| Geospatial | PostGIS | Expand geographical capabilities |
| Frontend | Astro + React | Improve interactivity, SSR, and performance |
| Maps | MapLibre GL | Develop advanced geographical visualization |
| Media | S3-compatible storage | Expand licensing and image management |
| Deployment | Containerized automated pipeline | Strengthen verification and rollback |

Gustale's About page documents this stack. Repository inspection should confirm the current implementation before architectural changes. [Gustale](https://gustale.recipes/about)

**Completion criteria:** All critical API operations pass automated tests, deployments are verifiable, and recorded changes survive restarts and rollbacks without data loss.

---

## 4. EPIC 02 — Redesign the culinary knowledge model
**Priority: P0 — Critical**

This may be the most important architectural work in the entire project.

Gustale should not function as a conventional recipe database. Its underlying system should represent **interconnected culinary knowledge**.

### Tasks

- [ ] **GUS-014 — Establish canonical culinary entity types.** Distinguish dishes, recipe variants, ingredients, cooking techniques, places, communities, culinary traditions, historical events, and sources.
- [ ] **GUS-015 — Separate dishes from recipes.** A dish represents a culinary concept; individual recipes represent documented preparations of that dish.
- [ ] **GUS-016 — Separate dishes from regional variants.** One dish can have multiple historically and culturally legitimate regional manifestations.
- [ ] **GUS-017 — Refactor food taxonomy.** Separate food families, cuisines, courses, techniques, and culinary traditions into independent classification dimensions.
- [ ] **GUS-018 — Implement permanent identifiers.** Give every entity a stable UUID and canonical URL.
- [ ] **GUS-019 — Implement multilingual naming.** Support native names, historical names, transliterations, spelling variants, and regional synonyms.
- [ ] **GUS-020 — Add typed relationships.** Model relationships explicitly rather than relying on shared tags.
- [ ] **GUS-021 — Introduce historical time intervals.** Support approximate dates, ranges, uncertain periods, and BCE dates.
- [ ] **GUS-022 — Introduce geographically scoped assertions.** Associate culinary facts with specific places and appropriate precision.
- [ ] **GUS-023 — Build bidirectional relationship queries.** Users should be able to move from a dish to its ingredients, places, related traditions, and back again.
- [ ] **GUS-024 — Create data-integrity constraints.** Prevent invalid entity types, duplicate associations, broken lineage links, and impossible chronological relationships.
- [ ] **GUS-025 — Implement migration tools for existing content.** Preserve existing IDs, references, editorial history, and URLs where possible.

### Proposed entity architecture

```text
CULINARY KNOWLEDGE GRAPH
│
├── Dish
│   ├── Names and aliases
│   ├── Descriptions
│   ├── Dish family
│   ├── Culinary traditions
│   ├── Regional variants
│   ├── Recipes
│   ├── Historical claims
│   └── Related dishes
│
├── Recipe
│   ├── Ingredients and quantities
│   ├── Cooking steps
│   ├── Equipment
│   ├── Preparation techniques
│   ├── Yield and timing
│   └── Attribution and documentation
│
├── Ingredient
│   ├── Botanical / zoological identity
│   ├── Regional names
│   ├── Culinary uses
│   ├── Historical distribution
│   └── Substitutions
│
├── Place
│   ├── Country
│   ├── Region
│   ├── City / locality
│   ├── Historical geography
│   └── Geographic precision
│
├── Community / Tradition
│   ├── Cultural association
│   ├── Food practices
│   ├── Ceremonies
│   └── Historical context
│
├── Historical Event
│   ├── Time interval
│   ├── Location
│   ├── Event type
│   ├── Related entities
│   └── Supporting claims
│
└── Evidence
    ├── Source
    ├── Claim
    ├── Citation
    ├── Confidence
    ├── Review history
    └── Disagreement
```

### Important taxonomy correction

The current food-family directory includes categories such as *Appetizer*, *Noodle soup*, *Filipino cuisine*, and *Turkish cuisine* within one classification. These describe different concepts and should not be treated as equivalent. [Gustale](https://www.gustale.recipes/families)

A corrected model would distinguish:

| Classification | Example |
|---|---|
| Dish family | Dumpling |
| Cuisine | Filipino |
| Cooking technique | Steaming |
| Course | Appetizer |
| Ingredient category | Legume |
| Cultural tradition | Minangkabau cuisine |
| Historical lineage | Filled dough across Eurasia |

One dish can belong to multiple categories across these dimensions.

**Completion criteria:** Every culinary entity has a stable identity, belongs to the appropriate taxonomy, and can participate in validated, queryable relationships.

---

## 5. EPIC 03 — Build the evidence and authenticity verification system
**Priority: P0 — Critical**

**Strategic objective: Gustale should become a reference that explains not only what it knows, but why it believes it.**

This is what will distinguish a credible encyclopedia from mass-produced AI recipe content.

### Tasks

- [ ] **GUS-026 — Develop an editorial evidence policy.** Define reliable sources, accepted evidence types, verification requirements, and uncertainty handling.
- [ ] **GUS-027 — Implement a structured source registry.** Record authors, titles, publishers, dates, URLs, identifiers, languages, and source types.
- [ ] **GUS-028 — Create claim-level citations.** Associate references with specific statements rather than attaching a bibliography to the entire dish.
- [ ] **GUS-029 — Support independent corroboration.** Require sufficiently independent sources for significant historical assertions whenever such evidence is available.
- [ ] **GUS-030 — Distinguish source quality from source quantity.** Multiple websites repeating the same unsupported assertion must not be treated as independent confirmation.
- [ ] **GUS-031 — Implement claim classifications.** Distinguish documented facts, scholarly interpretations, oral traditions, disputed claims, hypotheses, and unsupported assertions.
- [ ] **GUS-032 — Introduce editorial verification states.** Implement draft, research pending, under review, verified, disputed, published, and needs revision.
- [ ] **GUS-033 — Implement claim-level review history.** Record when a statement changed, who reviewed it, and why.
- [ ] **GUS-034 — Add an evidence-inspection interface.** Allow readers to inspect the sources supporting a historical or cultural claim.
- [ ] **GUS-035 — Add a corrections and disputes workflow.** Support evidence-backed challenges, moderator resolution, and public correction notices.
- [ ] **GUS-036 — Implement periodic evidence revalidation.** Check dead links, retractions, source updates, and previously unresolved research questions.
- [ ] **GUS-037 — Build a research-assistance pipeline for Hermes.** Automatically discover and organize potential references, while requiring evidence verification before publication.

### Source hierarchy

The system should consider the following classes of evidence:

| Source type | Research value |
|---|---|
| Historical manuscripts and original cookbooks | Primary historical documentation |
| Peer-reviewed culinary history and food anthropology | Strong scholarly analysis |
| University and museum publications | Valuable institutional research |
| Government culinary and heritage archives | Official regional documentation |
| Community practitioners and oral histories | Essential living-cultural knowledge |
| Specialist culinary historians | Valuable expert interpretation |
| Reputable regional cookbooks | Often strong practical documentation |
| Established culinary publications | Useful corroboration |
| Wikipedia and Wikidata | Discovery, terminology, and cross-referencing |
| Unverified blogs and AI-generated articles | Leads requiring independent verification |

**Wikipedia must never be the sole basis for a contested historical origin claim.**

Wikipedia and Wikidata should remain useful discovery tools, but Gustale must independently examine their underlying references.

### Implement a claim-evidence system

For example:

**Dish:** Chicken Tikka Masala

**Claim:** The dish originated in Glasgow.

The system should be capable of displaying:

- The geographical origin proposed.
- The earliest documented evidence for that claim.
- Alternative origin accounts.
- Academic or journalistic evidence.
- The claim's uncertainty.
- The reviewer and last verification date.

It should not present a disputed attribution as an established fact.

The current Chicken Tikka Masala page illustrates the need for this capability: its historical journey uses Wikipedia references, and its introduction presents Glasgow more definitively than its later qualified origin discussion. [Gustale](https://www.gustale.recipes/dishes/chicken-tikka-masala)

### Suggested evidence schema

```text
Claim
  id
  subject_entity_id
  predicate
  object_value
  claim_type
  temporal_scope
  geographical_scope
  confidence_label
  confidence_rationale
  editorial_status
  reviewed_by
  reviewed_at

Evidence
  id
  claim_id
  source_id
  source_locator
  evidence_role
  source_independence_group
  researcher_notes

Source
  id
  title
  author
  publisher
  publication_date
  source_type
  language
  identifier
  url
  access_date
  license
```

The `evidence_role` should distinguish evidence that supports, contradicts, or merely provides context for a claim.

Use the W3C provenance framework as a conceptual reference for recording who produced information and how that information was derived. [W3C](https://www.w3.org/TR/prov-overview/)

### Authenticity policy

Authenticity should not be reduced to a numerical AI score.

A recipe can be authentic to a particular family, locality, diaspora, historical period, or living tradition without being the only legitimate version.

Gustale should document **authenticity in context**, rather than declaring one universal recipe correct.

Community participation matters here. UNESCO's ethical principles emphasize the role of communities in safeguarding their own intangible heritage. [UNESCO ICH](https://ich.unesco.org/en/ethics-and-ich-00866)

**Completion criteria:** Published historical claims have inspectable evidence or clearly disclosed uncertainty. Significant disputed claims cannot silently become definitive statements.

---

## 6. EPIC 04 — Develop a historical and geographical knowledge graph
**Priority: P1 — Essential**

This is the foundation for understanding how food spread across civilizations.

### Tasks

- [ ] **GUS-038 — Implement historical relationship types.** Support adaptation, documented influence, shared ancestry, parallel development, and disputed connections.
- [ ] **GUS-039 — Implement typed historical events.** Model migration, trade, colonial exchange, agricultural introduction, technological change, and cultural transmission.
- [ ] **GUS-040 — Associate events with locations and time intervals.**
- [ ] **GUS-041 — Support many-to-many geographical associations.** A dish may belong to several communities and regions.
- [ ] **GUS-042 — Introduce geographical precision metadata.** Distinguish exact locality, region, country, historical territory, and unknown location.
- [ ] **GUS-043 — Support historically changing geographical boundaries.**
- [ ] **GUS-044 — Create historical relationship APIs.** Allow the frontend to request connected dishes, historical events, and their supporting evidence.
- [ ] **GUS-045 — Create graph traversal and filtering.** Explore connections by time, geography, relationship type, and evidence status.
- [ ] **GUS-046 — Implement lineage validation.** Prevent the system from interpreting superficial similarities as historical transmission.
- [ ] **GUS-047 — Create a graph visualization interface.** Display connected dishes, ingredients, traditions, places, and historical events.
- [ ] **GUS-048 — Implement pathway discovery.** Allow users to select two dishes or regions and discover documented relationships between them.

### Example: the culinary influence graph

A user opens:

**Tacos al Pastor**

They can explore its relationships to:

- Mexican taco traditions.
- Lebanese migration to Mexico.
- Shawarma and related vertical-spit cooking traditions.
- Pork preparation and regional adaptation.
- Mexican chili marinades.
- Pineapple and associated modern serving styles.

Every historical connection should have a typed relationship and evidence.

For example:

```text
Shawarma
    │
    │ Historical culinary influence
    │ Evidence: documented / disputed
    ▼
Tacos Árabes
    │
    │ Regional adaptation
    │
    ▼
Tacos al Pastor
    │
    ├── Ingredient changes
    ├── Cooking adaptations
    └── Mexican culinary context
```

This diagram illustrates the intended interface, not a substitute for researching each connection.

### Technology

Use PostgreSQL for canonical relational data and PostGIS for geospatial queries.

Graph relationships can initially be modeled with relational edge tables and indexed recursive queries. Avoid introducing Neo4j or another graph database until actual query complexity or performance justifies it.

**Completion criteria:** Users can navigate evidence-backed relationships between dishes and regions, with temporal and geographical context.

---

## 7. EPIC 05 — Transform the interactive world map
**Priority: P1 — Essential**

The map should become one of Gustale's defining features.

It should be more than a collection of markers.

### Tasks

- [ ] **GUS-049 — Audit all existing geographical coordinates.** Identify inaccurate, defaulted, duplicated, and country-centroid coordinates.
- [ ] **GUS-050 — Replace misleading location markers.** Use geographical areas or clearly qualified approximate markers when precise origins are unknown.
- [ ] **GUS-051 — Introduce multiple map layers.** Display dishes, ingredients, historical movements, culinary regions, and food traditions.
- [ ] **GUS-052 — Implement geographic clustering.** Prevent crowded marker displays.
- [ ] **GUS-053 — Implement continent, country, region, and city exploration.**
- [ ] **GUS-054 — Connect map selection with encyclopedia entries.**
- [ ] **GUS-055 — Implement historical timeline filtering.** Show known geographical associations within selected historical periods.
- [ ] **GUS-056 — Visualize documented culinary transmission.** Draw connections between locations where sufficient evidence exists.
- [ ] **GUS-057 — Implement geographical comparison.** Let visitors compare the culinary characteristics of different regions.
- [ ] **GUS-058 — Create map legends for uncertainty.** Distinguish documented relationships, approximate areas, disputed locations, and illustrative routes.
- [ ] **GUS-059 — Optimize map performance.** Use viewport queries, clustering, caching, and vector tiles when appropriate.
- [ ] **GUS-060 — Ensure map accessibility.** Provide equivalent textual and keyboard-accessible ways to explore the same information.

### Interactive layers

| Map layer | User experience |
|---|---|
| Traditional dishes | Discover food geographically |
| Culinary regions | Explore regional food cultures |
| Ingredient origins | Examine geographical associations of food ingredients |
| Historical trade | Explore documented exchanges |
| Migration and diaspora | Understand culinary traditions carried by communities |
| Food families | Compare related preparations across regions |
| Historical periods | Explore change over time |
| Cultural traditions | Discover cuisine associated with ceremonies and communities |

### A distinguishing feature: Culinary Time Machine

Imagine a historical slider allowing visitors to explore:

**1500 → 1600 → 1800 → 1900 → Today**

The map changes according to documented historical evidence.

Users can examine:

- Where particular foods were documented.
- When ingredients became available in different regions.
- How migration influenced local cuisines.
- Which culinary preparations emerged or changed.

Historical gaps must remain gaps; the interface must not fill them with invented trajectories.

**Completion criteria:** All displayed geographical claims accurately reflect their source precision, and visitors can explore culinary information interactively without needing to understand the underlying database.

---

## 8. EPIC 06 — Turn every dish into a complete encyclopedia article
**Priority: P1 — Essential**

Every dish page should be informative even if the visitor never opens another page.

### Tasks

- [ ] **GUS-061 — Redesign the dish-detail template.**
- [ ] **GUS-062 — Add native names, pronunciation, and name etymology where documented.**
- [ ] **GUS-063 — Add geographical and community associations.**
- [ ] **GUS-064 — Add a chronological historical overview.**
- [ ] **GUS-065 — Add cultural importance and traditional occasions.**
- [ ] **GUS-066 — Add characteristic ingredients and cooking techniques.**
- [ ] **GUS-067 — Add documented regional variations.**
- [ ] **GUS-068 — Add related dishes and historical connections.**
- [ ] **GUS-069 — Add evidence-backed source sections.**
- [ ] **GUS-070 — Add an interactive location and historical journey panel.**
- [ ] **GUS-071 — Connect dishes to available recipes.**
- [ ] **GUS-072 — Add contributor credits and revision history.**
- [ ] **GUS-073 — Add related reading and deeper exploration.**
- [ ] **GUS-074 — Add a visible content-completeness indicator.**

### Recommended article structure

| Section | Content |
|---|---|
| Introduction | Clear definition and representative image |
| At a glance | Places, traditions, family, ingredients, techniques |
| Historical background | Documented development |
| Cultural significance | Communities, ceremonies, everyday use |
| Where it is found | Interactive geographical representation |
| Regional variations | Different preparations and traditions |
| Ingredients | Traditional ingredients and explanations |
| Preparation | Overview of how the dish is made |
| Historical journey | Timeline of documented developments |
| Culinary relatives | Related dishes and supported connections |
| Sources | References for specific claims |
| Recipes | Practical ways to prepare the dish |
| Community knowledge | Moderated first-hand contributions |
| Editorial history | Changes, reviewers, and corrections |

### Important rule

An encyclopedia entry and a practical recipe are different content types.

A dish can have a complete encyclopedia article without a complete tested recipe.

However, Gustale.recipes must not mislead visitors into expecting executable cooking instructions when none exist.

If a detailed recipe is unavailable, display that honestly and offer links to relevant culinary documentation.

**Completion criteria:** Every published dish has a meaningful encyclopedia entry, not merely a description, country, category, and Wikipedia reference.

---

## 9. EPIC 07 — Build a genuinely useful recipe platform
**Priority: P1 — Essential**

Gustale.recipes should become a practical cooking companion to the encyclopedia.

### Tasks

- [ ] **GUS-075 — Implement a dedicated recipe entity and authoring workflow.**
- [ ] **GUS-076 — Add structured ingredient quantities and units.**
- [ ] **GUS-077 — Add complete preparation instructions.**
- [ ] **GUS-078 — Add preparation, cooking, resting, and total times.**
- [ ] **GUS-079 — Add serving-size adjustment.**
- [ ] **GUS-080 — Support metric and imperial unit conversions.**
- [ ] **GUS-081 — Add cooking equipment and preparation notes.**
- [ ] **GUS-082 — Support multiple documented variants for one dish.**
- [ ] **GUS-083 — Add ingredient substitutions with authenticity context.**
- [ ] **GUS-084 — Add dietary filters and reliably documented allergen information.**
- [ ] **GUS-085 — Implement step-by-step cooking mode.**
- [ ] **GUS-086 — Add integrated cooking timers.**
- [ ] **GUS-087 — Implement printable recipes.**
- [ ] **GUS-088 — Add shopping-list generation.**
- [ ] **GUS-089 — Add recipe collections and favorites.**
- [ ] **GUS-090 — Add source attribution and practical recipe review.**
- [ ] **GUS-091 — Validate actual cookability before marking recipes as kitchen-tested.**

### Recipe verification categories

Distinguish:

- **Historically documented:** A recipe or preparation appears in an identifiable source.
- **Traditional practitioner contribution:** Supplied by someone knowledgeable about the living tradition.
- **Kitchen-tested:** The instructions have been executed and reviewed.
- **Adapted:** Modified from a documented preparation, with changes disclosed.
- **Reconstructed:** Derived from historical evidence with acknowledged uncertainty.

A recipe can legitimately belong to multiple categories.

### Interactive cooking mode

When a visitor starts cooking:

1. Present one preparation step at a time.
2. Display quantities relevant to the current step.
3. Provide contextual ingredient explanations.
4. Activate timers when appropriate.
5. Allow visitors to move backward or forward.
6. Keep the interface readable on a phone.
7. Offer optional background stories without interrupting cooking.

This introduces practical daily utility that a pure encyclopedia lacks.

**Completion criteria:** Recipes marked as complete provide actionable ingredients and instructions, and interactive cooking tools work on mobile devices.

---

## 10. EPIC 08 — Create a comprehensive ingredient encyclopedia
**Priority: P1 — Essential**

Ingredients should become first-class encyclopedia entities.

The current ingredient directory is extremely limited and includes two separate entries named *Béchamel sauce*, with different dish counts. [Gustale](https://www.gustale.recipes/ingredients)

This suggests the need for canonicalization and relationship-integrity checks.

### Tasks

- [ ] **GUS-092 — Consolidate duplicate ingredient records.**
- [ ] **GUS-093 — Create a canonical ingredient registry.**
- [ ] **GUS-094 — Add scientific names where relevant.**
- [ ] **GUS-095 — Add regional and historical names.**
- [ ] **GUS-096 — Add ingredient categories and preparation forms.**
- [ ] **GUS-097 — Implement structured ingredient-to-recipe relationships.**
- [ ] **GUS-098 — Add cultural and geographical distribution information.**
- [ ] **GUS-099 — Add documented historical uses.**
- [ ] **GUS-100 — Connect ingredients to preparation techniques.**
- [ ] **GUS-101 — Add regional substitutions and functional equivalents.**
- [ ] **GUS-102 — Add seasonal information where geographically meaningful.**
- [ ] **GUS-103 — Build ingredient-based dish discovery.**
- [ ] **GUS-104 — Implement intelligent ingredient normalization.**

### Example

A visitor opens **Turmeric**.

They can explore:

| Section | Experience |
|---|---|
| What it is | Botanical identity |
| Where it grows | Geographical distribution |
| History | Documented culinary uses |
| Traditions | Communities and cuisines that use it |
| Cooking | Techniques and preparation forms |
| Related dishes | Curries, rice dishes, condiments |
| Regional names | Language and geographical variants |
| Research | Historical and scientific references |

**Completion criteria:** Ingredients have stable identities and useful relationships, and duplicate records no longer produce inconsistent results.

---

## 11. EPIC 09 — Build powerful search and discovery
**Priority: P1 — Essential**

Visitors should find relevant knowledge without needing to know a dish's exact name.

### Tasks

- [ ] **GUS-105 — Implement unified search across Gustale.**
- [ ] **GUS-106 — Search dishes, ingredients, places, cuisines, lineages, and historical events.**
- [ ] **GUS-107 — Add autocomplete and instant suggestions.**
- [ ] **GUS-108 — Support regional names and spelling variations.**
- [ ] **GUS-109 — Add multilingual search support.**
- [ ] **GUS-110 — Implement fuzzy matching and typo tolerance.**
- [ ] **GUS-111 — Add faceted filtering.**
- [ ] **GUS-112 — Implement relevance ranking.**
- [ ] **GUS-113 — Add interactive filters without unnecessary page reloads.**
- [ ] **GUS-114 — Implement similarity-based recommendations.**
- [ ] **GUS-115 — Add contextual recommendations to dish and ingredient pages.**
- [ ] **GUS-116 — Implement useful empty-result states.**

### Search dimensions

Users should be able to search by:

| Dimension | Example |
|---|---|
| Name | Rendang |
| Country | Indonesia |
| Region | Sumatra |
| Community | Minangkabau |
| Ingredient | Coconut |
| Cooking technique | Slow braising |
| Dish family | Stew |
| Historical influence | Portuguese |
| Historical period | 19th century |
| Tradition | Ceremonial food |
| Dietary restriction | Vegetarian |
| Preparation time | Under 30 minutes |
| Source status | Evidence-reviewed |

### Suggested implementation

Start with PostgreSQL full-text search, `pg_trgm`, and indexed structured filters.

Only introduce Meilisearch, Typesense, OpenSearch, or vector search when measured requirements justify the additional complexity.

**Completion criteria:** Visitors can reliably discover relevant content through names, attributes, geography, and relationships.

---

## 12. EPIC 10 — Make Gustale interactive, engaging, and entertaining
**Priority: P2 — High value**

This is where Gustale can become substantially more engaging than a conventional encyclopedia.

The goal is to transform passive reading into active discovery.

### Tasks

- [ ] **GUS-117 — Build an interactive culinary discovery homepage.**
- [ ] **GUS-118 — Implement a “Surprise Me” discovery feature.**
- [ ] **GUS-119 — Create interactive culinary journeys.**
- [ ] **GUS-120 — Implement visually animated historical timelines.**
- [ ] **GUS-121 — Build a side-by-side dish comparison tool.**
- [ ] **GUS-122 — Add interactive relationship diagrams.**
- [ ] **GUS-123 — Create guided food-history stories.**
- [ ] **GUS-124 — Build culinary knowledge quizzes.**
- [ ] **GUS-125 — Implement personal discovery collections.**
- [ ] **GUS-126 — Create a culinary exploration passport.**
- [ ] **GUS-127 — Introduce daily featured discoveries.**
- [ ] **GUS-128 — Add interactive ingredient and preparation explainers.**
- [ ] **GUS-129 — Support accessible storytelling animations.**
- [ ] **GUS-130 — Enable sharing of dishes, journeys, and discoveries.**

### Feature A — Culinary Journeys

Imagine opening Gustale and selecting:

**Follow the Journey of the Chili Pepper**

An interactive story begins.

The visitor explores the American origins of domesticated chili peppers, their subsequent movement through global exchange networks, and their adoption into different culinary traditions.

At different stages, the map reveals relevant places, dishes, and historical evidence.

The user can click:

- How did chilies reach Asia?
- Which culinary traditions adopted them?
- What ingredients did they displace or complement?
- How did local preparations change?

This connects history, geography, and the actual food people eat.

The experience should work as a guided story or as an independently explorable map.

### Feature B — Compare Two Dishes

Allow visitors to select two dishes.

For example:

**Rendang vs. Massaman Curry**

Gustale displays:

| Comparison | Rendang | Massaman Curry |
|---|---|---|
| Geographic association | Minangkabau, Indonesia | Thailand |
| Technique | Long coconut-milk reduction | Curry simmering |
| Characteristics | Concentrated, relatively dry finish | Rich sauce |
| Cultural history | Minangkabau tradition | Thai culinary tradition with external influences |
| Related ingredients | Coconut, aromatics, spices | Coconut, aromatics, spices |
| Historical connections | Evidence-backed relationships | Evidence-backed relationships |

Below the comparison, display an interactive visualization highlighting shared ingredients and differences.

Users can explore whether the similarities reflect documented influence, related culinary traditions, or convergent cooking techniques.

### Feature C — Culinary Passport

A personal exploration dashboard could show:

**Your Culinary Passport**

- Countries explored: 18
- Culinary traditions discovered: 32
- Dishes bookmarked: 46
- Historical journeys completed: 7
- Recipes cooked: 12

The experience should reward exploration and curiosity rather than geographical ownership claims or arbitrary judgments of authenticity.

### Feature D — Daily Culinary Discovery

Every day, Gustale features:

**Today's Culinary Discovery**

A different dish, ingredient, preparation technique, or historical connection.

Each feature includes a short story, an image, a geographical location, and links for deeper exploration.

Selection should prioritize verified content, geographical diversity, and interesting connections.

### Feature E — Culinary Mysteries

Use unresolved historical questions to encourage curiosity.

Examples:

- Where was a particular dish first documented?
- Why do distant cuisines use similar cooking techniques?
- How did a specific ingredient reach another continent?
- Which recipe traditions changed following major migrations?

Present the competing evidence, not just an entertaining theory.

**Completion criteria:** Visitors can explore culinary knowledge through several interactive experiences, and every educational experience remains grounded in documented evidence.

---

## 13. EPIC 11 — Create historical storytelling and editorial collections
**Priority: P2 — High value**

Some subjects deserve a deeper treatment than a collection of encyclopedia entries.

### Tasks

- [ ] **GUS-131 — Introduce long-form editorial articles.**
- [ ] **GUS-132 — Create historical culinary collections.**
- [ ] **GUS-133 — Implement interactive story templates combining maps, timelines, media, and sources.**
- [ ] **GUS-134 — Connect editorial articles directly to structured encyclopedia entities.**
- [ ] **GUS-135 — Introduce themed discovery trails.**
- [ ] **GUS-136 — Add reading-time indicators and progress tracking.**
- [ ] **GUS-137 — Provide accessible, source-linked historical illustrations.**
- [ ] **GUS-138 — Create an editorial calendar for recurring features.**

### Suggested editorial collections

| Collection | What visitors discover |
|---|---|
| The Silk Roads on a Plate | Trade, ingredients, and culinary exchanges |
| The Columbian Exchange | How foods from the Americas reshaped global cuisines |
| Food Across the Indian Ocean | Maritime exchange and regional cooking traditions |
| Culinary Diasporas | Recipes and traditions carried through migration |
| The History of Fermentation | Food preservation, microorganisms, and cultural knowledge |
| The Evolution of Noodles | Regional forms, documented histories, and disputed connections |
| Sacred and Ceremonial Foods | The relationship between food, ritual, and community |
| The History of Bread | Grain processing and the diversity of bread traditions |
| Cooking Before Modern Technology | Historical preservation and preparation methods |
| Endangered Food Traditions | Culinary knowledge at risk of disappearing |

These collections should be developed as curated research products, not automatically generated articles.

### Important capability

A new verified historical discovery should be reusable throughout Gustale.

For example, evidence about a historical trade route could appear in:

- A historical article.
- A dish's journey.
- An ingredient's history.
- A geographical map.
- A lineage visualization.

The information should originate from one structured, versioned knowledge system rather than five separately maintained descriptions.

**Completion criteria:** Long-form content provides compelling narratives while reusing the same verified historical knowledge as the encyclopedia.

---

## 14. EPIC 12 — Build a contributor and editorial community
**Priority: P2 — High value**

The knowledge of local cooks, culinary historians, and people maintaining living traditions is particularly valuable.

Gustale should support these contributors without compromising editorial quality.

### Tasks

- [ ] **GUS-139 — Audit account creation and authentication.**
- [ ] **GUS-140 — Improve the contributor dashboard.**
- [ ] **GUS-141 — Implement guided dish-submission forms.**
- [ ] **GUS-142 — Allow contributors to propose corrections.**
- [ ] **GUS-143 — Implement source-supported historical claims.**
- [ ] **GUS-144 — Create editorial review queues.**
- [ ] **GUS-145 — Support discussions around disputed claims.**
- [ ] **GUS-146 — Build contributor attribution and revision history.**
- [ ] **GUS-147 — Implement transparent editorial decisions.**
- [ ] **GUS-148 — Add role-based permissions.**
- [ ] **GUS-149 — Implement anti-spam and abuse protections.**
- [ ] **GUS-150 — Create community recognition and contributor profiles.**
- [ ] **GUS-151 — Support traditional-practitioner and expert contributions.**
- [ ] **GUS-152 — Implement consent and attribution requirements for oral-history submissions.**

### Suggested editorial roles

| Role | Responsibility |
|---|---|
| Visitor | Browse, search, and explore |
| Contributor | Submit and improve content |
| Researcher | Attach evidence and investigate claims |
| Reviewer | Assess evidence and accuracy |
| Cultural specialist | Review relevant regional or community knowledge |
| Editor | Approve editorial content |
| Administrator | Manage platform operations |

One person may hold several roles.

### Contributor recognition

Recognize meaningful contributions such as:

- Documenting a family or regional recipe.
- Providing a historical primary source.
- Correcting an inaccurate geographical attribution.
- Identifying a regional variation.
- Translating a culinary term accurately.

Do not reward contributors simply for the largest number of published entries. That would create an incentive for low-quality submissions.

**Completion criteria:** External contributors can submit knowledge, reviewers can evaluate it, and published changes remain attributable and auditable.

---

## 15. EPIC 13 — Establish a high-quality culinary media library
**Priority: P1 — Essential**

A visually compelling food encyclopedia needs excellent photography and supporting media.

### Tasks

- [ ] **GUS-153 — Audit all dish images and missing covers.**
- [ ] **GUS-154 — Implement a centralized media registry.**
- [ ] **GUS-155 — Record image copyright, license, attribution, and provenance.**
- [ ] **GUS-156 — Establish a licensed-image acquisition workflow.**
- [ ] **GUS-157 — Integrate permitted Wikimedia Commons image discovery.**
- [ ] **GUS-158 — Support contributor-owned image uploads.**
- [ ] **GUS-159 — Add automatic image resizing and optimization.**
- [ ] **GUS-160 — Generate responsive image variants.**
- [ ] **GUS-161 — Implement image-review workflows.**
- [ ] **GUS-162 — Add contextual image galleries to dish pages.**
- [ ] **GUS-163 — Support historical illustrations and document scans.**
- [ ] **GUS-164 — Add accurate alternative text and descriptive captions.**

### Image quality requirements

Every image should pass these checks:

1. Correct dish or subject identification.
2. Sufficient resolution.
3. Appropriate visual representation.
4. Verified license or explicit permission.
5. Required attribution.
6. Recorded original source.
7. No misleading representation of a traditional preparation.

AI-generated images may be useful for clearly labeled educational illustrations, but they should not be presented as documentary photography.

For historically sensitive subjects, distinguish reconstruction from evidence.

**Completion criteria:** Published media is accurately identified, legally usable, properly attributed, and visually suitable.

---

## 16. EPIC 14 — Build a scalable culinary research and publishing pipeline
**Priority: P1 — Essential**

Gustale needs a scalable way to research dishes without sacrificing quality.

This is particularly relevant to the existing Hermes-assisted content workflow.

### Tasks

- [ ] **GUS-165 — Create a standardized culinary research dossier.**
- [ ] **GUS-166 — Develop automated source discovery.**
- [ ] **GUS-167 — Implement cross-source claim comparison.**
- [ ] **GUS-168 — Detect unsupported assertions and contradictions.**
- [ ] **GUS-169 — Identify duplicate dishes and spelling variations.**
- [ ] **GUS-170 — Generate structured draft content from verified research notes.**
- [ ] **GUS-171 — Validate geographical information before publication.**
- [ ] **GUS-172 — Detect missing essential information.**
- [ ] **GUS-173 — Implement editorial quality gates.**
- [ ] **GUS-174 — Implement batch review and approval tools.**
- [ ] **GUS-175 — Automatically create related-entity suggestions.**
- [ ] **GUS-176 — Generate content-completeness and quality reports.**
- [ ] **GUS-177 — Add post-publication monitoring and correction workflows.**
- [ ] **GUS-178 — Ensure the research pipeline is idempotent.**
- [ ] **GUS-179 — Create a global content-coverage dashboard.**

### Recommended Hermes workflow

```text
1. SELECT SUBJECT
        ↓
2. DISCOVER SOURCES
        ↓
3. ASSESS SOURCE RELIABILITY
        ↓
4. EXTRACT INDIVIDUAL CLAIMS
        ↓
5. CROSS-CHECK CLAIMS
        ↓
6. RECORD DISAGREEMENTS
        ↓
7. BUILD RESEARCH DOSSIER
        ↓
8. NORMALIZE ENTITIES
        ↓
9. LINK GEOGRAPHY & HISTORY
        ↓
10. PREPARE ENCYCLOPEDIA DRAFT
        ↓
11. VALIDATE SCHEMA & EVIDENCE
        ↓
12. EDITORIAL REVIEW
        ↓
13. PUBLISH
        ↓
14. VERIFY LIVE PAGE
```

### Content quality gates

| Requirement | Publication rule |
|---|---|
| Canonical identity | Required |
| Dish definition | Required |
| Credible supporting evidence | Required for substantial factual claims |
| Geographical association | Required if asserted; uncertainty permitted |
| Historical origin | Must be qualified when disputed or unknown |
| Recipe instructions | Required only for publishing a complete recipe |
| Licensed image | Required for displaying a photographic cover |
| Ingredient relationships | Must reference valid entities |
| Historical relationships | Must include relationship type and evidence status |
| Editorial approval | Required for publication |
| Automated validation | Must pass |

A dish can still be published without a known date of origin, provided the uncertainty is clearly disclosed.

### Research quality over content quantity

The initial target should not be 10,000 automatically generated recipes.

Instead, establish a repeatable process for producing **high-quality, interconnected, reviewable culinary knowledge**.

Once the system consistently produces accurate entries, scale production across regions.

**Completion criteria:** Hermes can research and prepare batches of culinary content without bypassing source verification, editorial review, or technical validation.

---

## 17. EPIC 15 — Improve usability, accessibility, and visual design
**Priority: P1 — Essential**

A sophisticated encyclopedia should feel easy to use.

Visitors should not need to understand culinary taxonomies, knowledge graphs, or historical research methodologies to enjoy Gustale.

### Tasks

- [ ] **GUS-180 — Conduct a complete UX audit** of the homepage, navigation, atlas, search, directories, individual entries, and account functions.
- [ ] **GUS-181 — Create a consistent design system** across gustale.com and gustale.recipes.
- [ ] **GUS-182 — Improve homepage information architecture** with clear entry points for geography, history, recipes, and exploration.
- [ ] **GUS-183 — Make all core experiences mobile-first**, including maps and historical timelines.
- [ ] **GUS-184 — Add breadcrumb navigation and contextual links.**
- [ ] **GUS-185 — Eliminate incomplete or duplicated interface elements.**
- [ ] **GUS-186 — Design proper loading, empty, and error states.**
- [ ] **GUS-187 — Improve typography, content hierarchy, spacing, and readability.**
- [ ] **GUS-188 — Make advanced interactions accessible by keyboard.**
- [ ] **GUS-189 — Target WCAG 2.2 AA accessibility.**
- [ ] **GUS-190 — Provide reduced-motion alternatives to animations.**
- [ ] **GUS-191 — Improve performance on slower mobile networks.**

### Homepage concept

The Gustale homepage should immediately communicate its value.

**Hero:** Explore the World's Culinary Heritage.

A visually engaging globe or culinary map provides the main discovery experience.

Immediately below it, visitors can choose between four paths:

| Explore | Discover | Learn | Cook |
|---|---|---|---|
| World map | Dishes and ingredients | Historical journeys | Authentic recipes |
| Regions | Culinary families | Food traditions | Cooking techniques |
| Countries | Related dishes | Culinary evolution | Regional variations |

Further down, offer featured stories, recent discoveries, evidence-reviewed content, and opportunities to contribute.

**Completion criteria:** The essential discovery experience is intuitive, accessible, responsive, and consistent across both domains.

---

## 18. EPIC 16 — Internationalization, SEO, and public discoverability
**Priority: P1/P2**

Gustale should eventually serve an international audience and become a reference used by search engines, researchers, and AI systems.

### Tasks

- [ ] **GUS-192 — Establish canonical URLs** for dishes, recipes, ingredients, regions, and lineages.
- [ ] **GUS-193 — Implement appropriate Schema.org structured data.**
- [ ] **GUS-194 — Distinguish encyclopedia Article markup from Recipe markup.**
- [ ] **GUS-195 — Generate XML sitemaps.**
- [ ] **GUS-196 — Improve metadata, titles, and social previews.**
- [ ] **GUS-197 — Audit internal linking and orphaned pages.**
- [ ] **GUS-198 — Implement multilingual content architecture.**
- [ ] **GUS-199 — Support translated interfaces and localized culinary terminology.**
- [ ] **GUS-200 — Implement proper `hreflang` relationships.**
- [ ] **GUS-201 — Prevent untranslated or low-quality machine translations from appearing authoritative.**
- [ ] **GUS-202 — Develop a documented public read API.**
- [ ] **GUS-203 — Add machine-readable identifiers and citations.**
- [ ] **GUS-204 — Define data licensing and reuse conditions.**
- [ ] **GUS-205 — Establish performance budgets and monitor Core Web Vitals.**

Google specifically documents structured-data requirements for recipe search features, including actual preparation instructions, relevant images, and appropriate Recipe properties. [Google for Developers](https://developers.google.com/search/docs/appearance/structured-data/recipe)

### Public knowledge API

Eventually, Gustale should expose structured information through endpoints such as:

```text
GET /api/v1/dishes
GET /api/v1/dishes/{id}
GET /api/v1/dishes/{id}/relationships
GET /api/v1/dishes/{id}/history
GET /api/v1/dishes/{id}/evidence

GET /api/v1/recipes
GET /api/v1/ingredients
GET /api/v1/regions
GET /api/v1/lineages

GET /api/v1/search
GET /api/v1/graph/paths
GET /api/v1/geography/features
```

These are proposed API contracts, not claims that those endpoints already exist.

The API should provide stable identifiers, pagination, filtering, provenance, and licensing metadata.

A later version could support JSON-LD and linked-data interoperability.

**Completion criteria:** Search engines and external applications can discover and accurately interpret Gustale's published knowledge.

---

## 19. EPIC 17 — Develop an evidence-grounded culinary AI
**Priority: P3 — Advanced**

An AI assistant could become an important differentiator, but only after the underlying culinary knowledge is sufficiently complete and trustworthy.

### Tasks

- [ ] **GUS-206 — Implement semantic culinary search.**
- [ ] **GUS-207 — Create evidence-grounded question answering.**
- [ ] **GUS-208 — Connect AI responses to Gustale's knowledge graph.**
- [ ] **GUS-209 — Require citations for factual historical answers.**
- [ ] **GUS-210 — Expose uncertainty and conflicting evidence.**
- [ ] **GUS-211 — Support natural-language discovery requests.**
- [ ] **GUS-212 — Implement answer-quality evaluation and hallucination testing.**
- [ ] **GUS-213 — Prevent unsupported AI-generated claims from entering the canonical database.**

### Example user interaction

A visitor asks:

> Why does Japanese curry taste different from Indian curry?

Gustale could explain the documented historical influences, differences in cooking methods, characteristic ingredients, and relevant culinary traditions.

The response could also provide:

- A historical timeline.
- A map of relevant culinary developments.
- Related dishes.
- Recipes for comparison.
- Supporting sources.

Another visitor might ask:

> Which foods in Indonesia were influenced by Portuguese trade?

The assistant could retrieve documented relationships from Gustale's historical knowledge graph and clearly distinguish established evidence from possible influence.

### Technical architecture

Use retrieval-augmented generation against Gustale's verified content and indexed citations.

The AI must not substitute its internal knowledge for missing evidence.

Where the repository lacks reliable information, it should acknowledge the gap and optionally initiate a separate research workflow.

**Completion criteria:** The assistant provides useful, source-grounded answers and reliably distinguishes established knowledge from uncertain information.

---

## 20. EPIC 18 — Monitoring, evaluation, and continuous improvement
**Priority: P1 — Essential**

Gustale needs a way to measure whether the platform is becoming more complete, more reliable, and more useful.

### Tasks

- [ ] **GUS-214 — Create an operational dashboard.**
- [ ] **GUS-215 — Create a content-quality dashboard.**
- [ ] **GUS-216 — Track source completeness and independence.**
- [ ] **GUS-217 — Measure regional representation and coverage gaps.**
- [ ] **GUS-218 — Track broken links, missing media, and invalid relationships.**
- [ ] **GUS-219 — Measure search success and zero-result queries.**
- [ ] **GUS-220 — Measure engagement with maps, timelines, and articles.**
- [ ] **GUS-221 — Track editorial correction rates.**
- [ ] **GUS-222 — Add automated regression and accessibility testing.**
- [ ] **GUS-223 — Create recurring competitor and product reviews.**

### Key performance indicators

| Metric | Target |
|---|---|
| Critical API tests | 100% passing before deployment |
| Database integrity violations | 0 unresolved critical violations |
| Published claims | Evidence-linked or explicitly qualified |
| Images | 100% license-verified when published |
| Recipe completeness | 100% of entries labeled complete contain actionable instructions |
| Duplicate canonical entities | 0 known unresolved duplicates |
| Broken internal links | 0 known unresolved links |
| Search usefulness | Continuously improve successful searches |
| Accessibility | WCAG 2.2 AA target |
| Source diversity | Improve independent, regional, and primary-source coverage |
| Geographical accuracy | No knowingly misleading precision |
| Geographic representation | Monitor and address major regional blind spots |

Do not use raw page counts as the principal measurement of progress.

A smaller encyclopedia with documented provenance, meaningful relationships, and usable tools is more valuable than a much larger collection of unverified descriptions.

---

# 21. Implementation sequence

The 223 tasks should not all enter development simultaneously.

I recommend the following sequence.

| Phase | Objective | Principal epics | Release condition |
|---|---|---|---|
| **0 — Baseline** | Understand and stabilize existing functionality | 01, 18 | Audited system, reliable tests, no known critical data-loss bugs |
| **1 — Credibility** | Establish trustworthy data and citations | 02, 03 | Verified entity model and editorial workflow |
| **2 — Completeness** | Make existing content genuinely useful | 06, 07, 08, 13 | Representative complete dishes, recipes, ingredients, and media |
| **3 — Connectivity** | Build the geographically interconnected encyclopedia | 04, 05, 09 | Functional historical relationships, maps, and discovery |
| **4 — Experience** | Make the encyclopedia enjoyable and engaging | 10, 11, 15 | Tested interactive experiences across mobile and desktop |
| **5 — Growth** | Expand high-quality content and participation | 12, 14, 16 | Scalable research, contribution, and publication systems |
| **6 — Intelligence** | Add advanced discovery and AI | 17 | Evaluated, evidence-grounded AI features |

These phases are dependency-based rather than fixed-duration projects. Individual tasks can proceed in parallel when they do not compete for the same schema, APIs, or frontend components.

## The first 15 tasks I would actually execute

Although the roadmap contains 223 tasks, the immediate implementation order should be considerably narrower.

| Order | Task | Why it comes first |
|---|---|---|
| 1 | GUS-001 — Architecture audit | Establish what actually exists |
| 2 | GUS-002 — PATCH persistence repair | Protect data integrity |
| 3 | GUS-005 — CI/CD reliability | Avoid introducing silent failures |
| 4 | GUS-011 — Data integrity checks | Identify existing data problems |
| 5 | GUS-014 — Canonical entity model | Establish the correct foundation |
| 6 | GUS-017 — Taxonomy refactoring | Correct category inconsistencies |
| 7 | GUS-026 — Evidence policy | Define credible publication |
| 8 | GUS-028 — Claim-level citations | Make assertions verifiable |
| 9 | GUS-031 — Claim classifications | Represent historical uncertainty |
| 10 | GUS-049 — Coordinate audit | Prevent misleading maps |
| 11 | GUS-061 — Dish-page redesign | Improve the core reading experience |
| 12 | GUS-075 — Recipe model | Separate practical cooking from encyclopedic knowledge |
| 13 | GUS-092 — Ingredient deduplication | Repair foundational relationships |
| 14 | GUS-105 — Unified search | Make existing knowledge easier to find |
| 15 | GUS-165 — Research dossier format | Prepare safe content expansion |

**Do not begin bulk content generation until the foundational entity, evidence, and publication systems are sufficiently reliable.**

---

# 22. Establish three reference implementations

Before developing hundreds of dishes, I would fully develop three representative examples.

These examples should serve as implementation standards for future content.

### Reference A — Rendang

Use Rendang to demonstrate:

- A culturally specific culinary tradition.
- Detailed preparation techniques.
- Ingredients and regional variations.
- Living cultural practices.
- Documented historical context.
- Proper geographical representation.
- An accurate, kitchen-tested recipe.

### Reference B — Chicken Tikka Masala

Use Chicken Tikka Masala to demonstrate:

- Migration and culinary adaptation.
- Disputed origin claims.
- Historical timelines.
- Cross-cultural culinary connections.
- Multiple geographical associations.
- Evidence-supported historical explanations.

### Reference C — Tacos al Pastor

Use Tacos al Pastor to demonstrate:

- Culinary influence through migration.
- Related dishes and cooking techniques.
- Changes in ingredients and preparation.
- Historical and geographical visualization.
- Relationships between different culinary traditions.

Each reference entry should demonstrate the complete visitor journey:

**Discover → Explore → Understand → Compare → Cook → Verify → Continue exploring.**

These three entries should become automated regression fixtures, editorial examples, and design references.

If the system can represent them accurately and make them engaging to explore, it will have a much stronger foundation for expanding to thousands of dishes.

---

# 23. How Hermes should execute the roadmap

Since your infrastructure already has automated deployment and content pipelines, I would avoid rebuilding those systems unnecessarily.

Instead, Hermes should use this backlog as a controlled implementation program.

## Hermes execution rules

**1. Inspect before changing.** Review the actual repository, schemas, migrations, APIs, tests, and deployment configuration. Do not assume a component is missing simply because it is not visible on the public website.

**2. Reuse working infrastructure.** Extend Fastify, PostgreSQL/PostGIS, Astro, React, MapLibre, and the existing deployment system when appropriate.

**3. Convert roadmap tasks into trackable work.** Each task should have an ID, priority, dependencies, owner or agent, implementation notes, and acceptance criteria.

**4. Work in small, verifiable batches.** Avoid simultaneous changes to unrelated systems or broad database refactoring without a migration strategy.

**5. Preserve production data.** Use migrations, backups, transactions, and rollback procedures.

**6. Verify every implementation.** Require tests, build success, API verification, and live-page checks. Visual features also require browser-level testing.

**7. Treat AI research as research assistance.** Never publish model-generated citations, unsupported origin claims, or unverified historical relationships.

**8. Keep editorial and technical validation separate.** A technically valid record is not automatically a historically credible record.

**9. Update the backlog after every completed task.** Record evidence, affected components, test results, blockers, and remaining work.

**10. Make functionality a release requirement.** A feature is not complete merely because its interface exists. Its data, interactions, mobile behavior, accessibility, and failure cases must work.

### Recommended task definition

Every work item should use this structure:

```yaml
id: GUS-028
title: Implement claim-level citations
priority: P0
epic: Evidence and authenticity
status: todo

depends_on:
  - GUS-014
  - GUS-026

objective:
  Associate historical and cultural claims
  with independently reviewable evidence.

implementation:
  - Inspect existing source schema
  - Design claim-to-source relationships
  - Create versioned migration
  - Extend backend validation
  - Implement API operations
  - Add editorial interface
  - Display citations on public pages

acceptance_criteria:
  - Claims can reference multiple sources
  - Sources may support or contradict claims
  - Citation details are inspectable
  - Unsupported claims can be flagged
  - Editorial history is preserved
  - API tests pass
  - Live-page verification passes

deliverables:
  - Schema migration
  - Backend implementation
  - Frontend integration
  - Automated tests
  - Technical documentation
  - Verification report
```

This also makes the backlog suitable for a multi-agent Hermes workflow.

---

# 24. Additional strategic opportunities

Beyond the main development plan, four opportunities deserve consideration.

### A. Culinary heritage preservation

Gustale could eventually work with local cooks, historians, cultural organizations, and communities to document culinary knowledge that is poorly represented online.

This would give Gustale original research value rather than making it dependent entirely on published websites.

A carefully documented local recipe, oral history, or regional cooking tradition could become a valuable contribution to the historical record.

### B. Open culinary knowledge infrastructure

Gustale could become a reusable public information source.

Its structured data could eventually support:

- Educational websites.
- Culinary research tools.
- Cultural heritage applications.
- Museum exhibits.
- Recipe discovery applications.
- Geographical research.
- AI systems requiring source-linked culinary information.

A public API and carefully designed licensing model would make this possible.

### C. Culinary historical reconstruction

A particularly distinctive feature would be the ability to explore how a preparation changed over time.

For example, visitors could compare historical and modern versions of a dish, examining changes in available ingredients, cooking equipment, cultural context, and preparation techniques.

Historical reconstructions must clearly identify where documented evidence ends and interpretation begins.

### D. Regional culinary research hubs

Instead of expanding randomly across the globe, Gustale could develop detailed regional research collections.

Examples might include:

- Indonesian archipelago.
- Indian subcontinent.
- East Asia.
- Mediterranean basin.
- West Africa.
- Central Asia.
- Latin America.
- Pacific Islands.

These research hubs would combine geography, food traditions, ingredients, history, and recipes into interconnected collections.

This would also help prevent the encyclopedia from becoming disproportionately focused on a small number of already well-documented countries.

---

# 25. The eventual Gustale experience

The most important measure of success is what visitors can actually do.

Consider someone discovering Rendang through a search engine.

They open Gustale and find an excellent image, an informative introduction, and a map showing its Minangkabau associations.

They explore its traditional preparation and regional variations.

They open a historical timeline and learn about the available evidence concerning its development.

They discover related preparations elsewhere in Southeast Asia, with explanations distinguishing actual historical relationships from similarities in cooking techniques.

They compare Rendang with Massaman Curry.

They inspect the historical references.

Then they open a traditional recipe, adjust its serving size, generate a shopping list, and use the step-by-step cooking mode.

Afterward, they explore other Minangkabau dishes or follow a curated journey through the history of spice exchange.

**One dish has become an entry point into an entire network of culinary knowledge.**

That is the kind of experience Gustale should deliver.

---

## Final development priorities

I would allocate development effort approximately as follows:

| Area | Suggested effort |
|---|---:|
| Data architecture, evidence, and credibility | 25% |
| Encyclopedia and recipe completeness | 20% |
| Geographic and historical interconnection | 20% |
| Search, usability, and interactive experiences | 20% |
| Content-production systems and community | 10% |
| Advanced AI capabilities | 5% |

These are planning allocations, not estimates derived from the repository.

The biggest architectural decision is to make **the culinary knowledge graph and its evidence system the foundation of the entire product**.

Everything else—maps, historical journeys, recommendations, recipes, interactive comparisons, educational games, and AI assistance—should build upon that foundation.

The outcome should not be merely another alternative to TasteAtlas.

**Gustale should aim to become a living, evidence-based atlas of world culinary history: part encyclopedia, part geographical exploration platform, part interactive museum, and part practical cookbook.**

The immediate next milestone is a stable, source-verifiable, fully interconnected experience for three reference dishes. Once that works end to end, the same architecture can support systematic expansion across the world's culinary traditions.