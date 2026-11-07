# ADR-007 (Amendment 1) — Recipes: confidence, auto-publish, contributors, language, URLs

**Status:** **PROPOSED** — for Alejandro's approval. Docs only; no code,
no migration, no live write.
**Date:** 2026-11-07
**Amends:** ADR-007 (`docs/ADR-007-recipe-schema.md`, accepted 2026-11-06)
**Related:** ADR-002 (claims model), ADR-004 §14 (publish credential),
ADR-005 (live approval gate), ADR-006 (publish-credential session
binding), migration 0048 (bot credential guard)
**Deciders:** Alejandro (product owner), Hermes (author)

---

## 0. What this amendment does, and what it does not

ADR-007 settled **the schema of a recipe**: what it is, how it relates
to a dish, what a sentence is, what a quantity looks like, and when a
recipe may be published. That ADR is accepted and binding.

This amendment **extends** it with five things the owner decided on
2026-11-07, and **resolves three conflicts** that the accepted ADR-007
left open:

| # | conflict | resolution |
|---|---|---|
| 1 | 0048 forbids a bot from holding a publish credential, and it stays — but "HIGH publishes automatically" | a **server-side rule**, not the agent publishing (§2) |
| 2 | ADR-007 requires every ingredient to be a **published Atlas ingredient**, and there are only **5** | a **staged backfill** with its own review gate (§3) |
| 3 | ADR-007 has no notion of language order, and `description_sentences` enforces `en` as the source locale | **original-language-first**, with a stated conflict (§4) |

And it adds the **URL scheme** (§5), the **confidence levels** (§1),
the **contributor trust ladder** (§6), and the **auto-publish
safeguards** (§7).

**What this amendment does NOT do:** it does not authorise a migration.
The schema this amendment implies (§8) still has to be written as a
migration, and applying it to live still needs `approved-live` **and**
the owner's separate "go", per ADR-005. Item 2 of the task is that
migration; this document is what it is designed from.

---

## 1. Confidence levels

A recipe carries a **confidence level**. It is not an editorial mood; it
is a **computed verdict over evidence**, and it is stored so that the
publish decision and the review decision read the same number.

### 1.1 The three levels

| level | what it means | what happens to it |
|---|---|---|
| **HIGH** | 2+ **independent** cited sources agree on the core ingredients and the method; **every** ingredient named resolves to a published Atlas ingredient; **every** sentence is sourced | **publishes automatically** (§7) |
| **MEDIUM** | sourced, coherent, but fails one or more HIGH conditions | **waits for Alejandro**; goes to the review queue |
| **LOW** | not fully sourced, or an ingredient does not resolve | **never publishes.** It may exist as a draft, visible only to its author |

**HIGH is a conjunction, not a score.** A recipe with five perfect
sources but one unresolved ingredient is **MEDIUM**, not HIGH. There is
no averaging and no partial credit: a recipe is only as trustworthy as
its weakest *required* part.

### 1.2 "2+ independent sources" — the word that matters most

The owner wrote "2+ independent cited sources agree". **Independent is the
operative word, and the database already knows how to say it.**

`statements.independence` exists, with exactly three values:

```
single | corroborated | dependent
```

and it is paired with `independence_checked_at`. The column exists and
is **completely unused**: `0` of 1,354 statements have it set.

So "2+ independent sources" is implemented as: the recipe's core claims
carry at least two `supports` citations whose sources are **not
dependent on each other** — i.e. at least one statement at
`independence = 'corroborated'`, or two statements whose sources are
distinct and not marked dependent.

**A recipe cannot be HIGH on the strength of two citations from the same
page.** Two Wikipedia articles that copy each other are `dependent`, and
the recipe is MEDIUM. This is the single most important rule in this
section: it is what stops the auto-publish path from publishing
plagiarism.

### 1.3 Which source classes count

`source_class` is `S1`–`S7` (`S1` primary historical, `S2` scholarly,
`S3` institutional, `S4` practitioner, `S5` specialist, `S6` reference
e.g. Wikipedia, `S7` unverified).

The existing `statement_set_status()` verified-gate already keys on
`S1`–`S5` for a `documented` claim, and `S1`–`S3` for a
`scholarly_interpretation`. **This amendment does not change those
gates.** A recipe's HIGH condition reuses them:

> A recipe's sources must be `S1`–`S5` (the classes the existing
> `verified` gate already accepts for a `documented` claim).

**`S6` and `S7` never contribute to HIGH.** `S6` is Wikipedia; `S7` is
unverified. This is the existing policy, not a new one.

### 1.4 The blocker, stated plainly

**Every one of the 1,486 sources in the live database is `S6`.**
There is not one `S1`–`S5` source. All 1,354 statements sit at
`research_pending`, and the `verified` gate is **unreachable** for every
one of them.

**Consequence: with today's data, no recipe can be HIGH, and therefore
nothing auto-publishes.** That is the correct behaviour, not a bug — but
the owner should know it before the pipeline is built, because it means
the auto-publish path is **dormant until real sources are added**.

This is item 3 of the task (the ingredient backfill) and item 8 (the
content pipeline) meeting in the middle: the pipeline's source-gathering
is what eventually turns the switch on. **No recipe will be auto-published
by accident in the meantime.**

### 1.5 Where the level is stored, and who sets it

The confidence level is a **computed column**, not a hand-set flag. A
human may *override* it downward, never upward. The reason is the same
reason `content_type` is an explicit editorial field with no sync
trigger (0049): a derived field that a human can raise is not derived,
it is just a flag with extra steps.

The computation lives in a **database view** (the same shape as the
existing `recipe_publishable` view in ADR-007), so the API, the publish
job, and the digest all read the same number. A recipe's stored
`confidence` column is what the view compares against; the view computes
the *actual* level and the publish path uses the **computed** one, so a
stale stored value can never cause a publish.

---

## 2. Conflict 1 — auto-publish without a bot credential

### 2.1 The constraint, quoted

Migration 0048 (`db/migrations/0048_bot_credential_guard.sql`) installs
`is_bot_publish_actor()` and refuses a publish credential to any account
whose email local part ends in `-bot` — including `hermes-bot@gustale.com`.

> **THE BOT MUST NEVER HOLD A PUBLISH CREDENTIAL.**
> A publish credential may NOT be held by a bot account.

ADR-006 then made the credential check meaningful: the actor is
**derived from a Better Auth session**, not supplied by the caller, and
`publish_credential.actor` is a foreign key to `"user"(id)`.

### 2.2 Why "HIGH publishes automatically" cannot mean "the agent publishes"

If the agent were to publish the HIGH recipes, it would need a publish
credential — which 0048 forbids. The owner was explicit: *"Design
auto-publish as a server-side rule that checks the HIGH conditions
itself, not as you publishing."*

There is a second, deeper reason, and it is not a technicality.

`statement_set_status()` — the only sanctioned way to move a statement
to `verified`/`published` — does four things:

1. derives the actor from a **session token**;
2. requires that actor to hold a **verified** credential of role
   `publisher` (an `editor` may verify but not publish);
3. runs the **evidence gate** for the target status;
4. sets `gustale.statement_gate` for the write, and writes
   `statements_status_gate_trg`

The gate GUC is the mechanism that makes the write unforgeable. **A
direct `UPDATE` on `statements` is refused by the
`statements_status_gate_trg` trigger** unless the transaction came
through the gate. That trigger is the reason the whole claim pipeline is
trustworthy: it is what stops *any* role — including `postgres` — from
setting a statement's status by hand.

So there are exactly three possible designs, and only one of them is
safe:

| design | how it works | verdict |
|---|---|---|
| **A. The agent publishes** | the bot needs a publish credential | **forbidden by 0048**, and it would make the bot the publisher of record |
| **B. A direct `UPDATE`** | the job writes `status='published'` itself | **refused by `statements_status_gate_trg`**. It would also need the trigger disabled, which is exactly the unforgeability guarantee |
| **C. A server-side rule** | a **database function** evaluates the HIGH conditions and performs the transition through the sanctioned path | **adopted** |

### 2.3 The decision — a server-side rule, in the database

**Auto-publish is a database function, owned by the server, that
evaluates the HIGH conditions itself.**

```
recipe_auto_publish(p_recipe_id uuid)
```

It:

1. **Re-evaluates every HIGH condition from the rows**, not from a
   stored flag: dish published, every ingredient published, every
   sentence present, every sentence's statement `verified`/`published`,
   every claim backed by an `S1`–`S5` `supports` citation, and the
   independence condition (§1.2).
2. **Refuses** — returning the reason, not raising — if any condition
   fails, or if the **kill switch** is off (§7.1), or if today's
   auto-publish count has reached the cap (§7.2).
3. On success, performs the transition **through
   `statement_set_status()`**, with a **session token** for a **service
   account that holds a verified `publisher` credential**.

### 2.4 The one thing this needs, and it is the owner's to give

`statement_set_status()` requires a session token belonging to an actor
who holds a **verified `publisher` credential**. That is a
**human account** — 0048 refuses bot accounts — and it is an account
that does not exist yet: `publish_credential` currently holds **0 rows**.

So the design needs **one service account**, owned by a human, that
holds the credential. Options, for the owner to choose:

| option | what it means | what it costs |
|---|---|---|
| **1. Alejandro's own account holds the credential** | the service function acts under Alejandro's session | the audit trail names **Alejandro** as the publisher of every auto-published recipe. Honest, but it says "Alejandro published this" for content he did not read |
| **2. A dedicated human-named service account** | e.g. `recipes-publisher@gustale.com` — a **human-shaped account**, not a `-bot` account | it must be a real account with a real owner, and 0048's `-bot` pattern means the name must **not** end in `-bot`. It is a service account wearing a human name, which is a deliberate, disclosed exception |
| **3. The owner approves each auto-publish, in bulk** | the HIGH recipes are queued and Alejandro releases them | this is **not** auto-publish. It is "publish with one click instead of N". It is the safest option and it contradicts the owner's stated rule |

**This amendment proposes option 2**, because option 1 misattributes
publication, and option 3 is not what "auto-publish" means.

**The conflict to report:** option 2 requires creating an account whose
email does **not** end in `-bot` but which is not a person. That is a
deliberate weakening of 0048's *shape* — 0048's **rule** ("no bot
publishes") stays completely intact, but its *detection heuristic*
(email suffix) does not catch a service account that is not named like a
bot. **The owner must approve this explicitly**, because it is exactly
the kind of thing the `-bot` rule exists to prevent, and it should be
decided by the person who wrote the rule rather than by the agent.

A cleaner alternative the owner may prefer: **amend 0048** so that the
rule is *explicit* rather than *heuristic* — a publish credential is
refused to any account that is on a `service_accounts` list, and the
recipes service account is on that list. That keeps the intent machine-
checked instead of relying on a name convention. **The amendment is
written to work either way**; which of the two is used is the owner's
call, and it is recorded as an open decision in §10.

### 2.5 The audit trail is not optional

Every auto-publish writes to `statement_status_log` (the function
already does) **and** to a new `recipe_publish_log`, which records:
the recipe, the computed confidence, the conditions evaluated, the
sources that satisfied the independence condition, the kill-switch
state at that moment, and the service account that acted.

**There is no path by which a recipe becomes `published` without a row
in `recipe_publish_log`.** That is what makes the daily digest (§7.3)
possible and what makes the kill switch auditable after the fact.

---

## 3. Conflict 2 — the ingredient backfill

### 3.1 The problem, in numbers

ADR-007's publish gate requires:

```sql
AND EXISTS (SELECT 1 FROM recipe_ingredients ri
             JOIN ingredients i ON i.id = ri.ingredient_id
            WHERE ri.recipe_id = r.id AND i.status = 'published')
```

i.e. **every** ingredient a recipe names must be a **published** Atlas
ingredient.

The live database has **5** ingredient rows, **all 5 published**:

| slug | uses in `dish_ingredients` |
|---|---|
| `bechamel` | 1 |
| `eggplant` | 1 |
| `lamb-mince` | 1 |
| `tomato` | 1 |
| `bechamel-sauce` | 0 (unused; a near-duplicate of `bechamel`) |

> **Correction to the task brief.** The owner's brief said "there are
> 4" published ingredients. The live count is **5** (4 in use, 1
> unused). The brief's number is the number of *used* ingredients; the
> publish gate counts *published* ingredients, which is **5**. The
> difference does not change the conclusion — the ingredient table is
> effectively empty for the purpose of recipes — but the number in the
> amendment is the one the database reports.

A recipe for, say, nasi goreng names shallots, garlic, palm sugar,
chilli, rice, banana leaf. **Not one of those exists.** Under ADR-007
as accepted, such a recipe could never publish.

### 3.2 The decision — a staged backfill with its own gate

The ingredient table is backfilled **before** recipes are authored, in
three stages. Each stage ends with a review gate, and **the owner
approves the stage's output before the next stage starts**.

**Stage A — the pantry list.** Produce the list of ingredients the
first wave of recipes will need. Source: the recipes themselves, drafted
in draft-only form first. Output: a list, with each ingredient's
canonical name, slug, and the dish(es) that need it. **No database
write.** The owner reviews the *list* — this is where the vocabulary
decisions happen (is "palm sugar" one ingredient or two? is "shrimp
paste" its own ingredient?).

**Stage B — the rows.** For each ingredient on the approved list, create
the `ingredients` row with `status='draft'`, plus its
`ingredient_translations` row in the dish's own language. Each row gets:
- `canonical_name` + `slug` (the slug is the public identity and is
  **immutable** once published — see §3.4);
- `short_description`, and the `category`;
- `origin_geo_id` **only** when the ingredient's origin is itself
  documented — otherwise NULL. **An ingredient is not a claim about a
  dish, so it does not need a statement; but its origin must not be
  invented either.**

**Stage C — publication.** The rows go to `published` only after the
owner reviews them. Publishing an ingredient is what unblocks the
recipes that use it.

### 3.3 Review — what "review" means for an ingredient

An ingredient is reviewed against the same standard the Atlas already
uses, minus the parts that belong to a dish:

| requirement | why |
|---|---|
| the name is the **canonical** name in its language | the ingredient is a shared entity; two names for one thing is a data defect |
| the slug is stable and in English | the slug is the URL identity |
| the category is from the existing category vocabulary | a new category is a vocabulary decision, and the owner makes it |
| the origin is either documented or absent | never guessed |
| **at least one `S1`–`S5` source** for the ingredient's own descriptive claims | an ingredient description is a **claim**, and a claim with no source is worse than no claim — this is ADR-002's rule applied to a new table |

**The last row is the expensive one, and it is the honest consequence of
§1.4.** An ingredient's description cannot be `S6`-only and still be
published, because every source in the database today is `S6`. So the
backfill either brings real sources with it, or the ingredient rows
carry **no descriptive claims at all** — a name, a category, a slug —
and are published on that basis.

**That second path is the one this amendment recommends.** An ingredient
row that says only "palm sugar, category: sweetener" is honest, useful,
and does not need a source. An ingredient row that says "palm sugar is
a traditional Indonesian sweetener derived from the sap of the aren
palm, used since…" needs a source, and today it cannot have one.

### 3.4 The slug is immutable, and why

**A published ingredient's slug never changes.** The slug is the public
URL identity, and a changed slug is a broken link.

The `ingredients` table has `slug text NOT NULL UNIQUE` and **no update
trigger** protecting it. So the immutability is a **rule the code must
enforce**, not something the database currently guarantees. The schema
change (§8) adds the guard — a trigger that refuses a slug change on a
published row — because "we will remember not to rename it" is not a
mechanism.

An **unused** published ingredient (`bechamel-sauce`) is the one case
where a rename is allowed, because nothing links to it. The guard
distinguishes those two cases by *link count*, not by a flag.

### 3.5 The order, and what it blocks

```
item 3  ingredient backfill plan  →  Stage A (a LIST, no write)
        owner reviews the list
        item 3 pilot             →  Stage B + C on ~30 ingredients
        owner reviews the rows
        item 8 drafting           →  recipes can now name real ingredients
```

**Recipes are drafted only after Stage C for the ingredients they
name.** Drafting against a vocabulary that does not exist yet is how
"palm sugar" and "gula aren" end up as two rows.

---

## 4. Conflict 3 — original-language-first, and the `en`-source constraint

### 4.1 The rule

**A recipe is written first in the dish's own language, then English,
then the other languages.**

Nasi goreng → Indonesian first. Moussaka → Greek first. Kimchi jigae →
Korean first.

The dish's own language is **derived from the dish's origin**, not from
the contributor's language and not from the site's default. A dish's
origin is already modelled (`dishes.origin_geo_id`), and `geo_entities`
carries a locale — so the dish's language is a **lookup**, not an
editorial judgement.

### 4.2 The rule for a page in a language the recipe has no text in yet

The owner's default, which this amendment adopts:

> **the original text + a "Not yet translated" note, `noindex`.**

So `gustale.recipes/recipes/nasi-goreng` in English, when the recipe
exists only in Indonesian:

- shows the **Indonesian original** — the full recipe, in the language
  it was written in;
- carries a visible **"Not yet translated"** note;
- is served with `<meta name="robots" content="noindex, follow">` and a
  self-referential canonical.

**`noindex`, not `noindex, follow` alone — and `follow` is deliberate.**
The page is in the index only when it has a translation; until then it
must not be indexed, because a recipe page with no text in the reader's
language is a bad search result. But it *should* let a crawler follow
the links out of it (to the hub, to the Atlas), so the site's link
graph stays connected.

**And the original-language page is `indexable`** — it is the primary
text of the recipe. A page whose language matches the recipe's
original language is a complete page, not a stub. The `noindex` rule
applies to the **missing-translation** case only.

### 4.3 The conflict, and what it changes

`description_sentences` — the table ADR-007's model mirrors — carries
this CHECK constraint:

```sql
CHECK (locale = 'en' AND source_sentence_id IS NULL
    OR locale <> 'en' AND source_sentence_id IS NOT NULL)
```

**In English, a sentence is the original. In any other language, a
sentence must be a translation of an existing English sentence.**
That is the opposite of original-language-first: the model treats
English as the source language and every other language as derived.

**The same constraint does not exist on `ingredients`
(`ingredient_translations`) or on `recipes`.** `ingredient_translations`
is keyed by `(ingredient_id, language)` with **no** `source_sentence_id`
column at all — it is already language-first in structure.

So the conflict is real but **narrower than it first appears**:

| table | language model | needs changing? |
|---|---|---|
| `description_sentences` | English is the source; others are translations | **not changed** — it stays the Atlas's model, and the Atlas dish pages are not part of this task |
| `ingredient_translations` | language-first, no source column | **no change needed** |
| `recipe_sentences` (new) | free to choose | **must be language-first** |
| `recipe_translations` (new) | free to choose | **must be language-first** |

**The decision:** `recipe_sentences` gets a **language-first** shape
with its own check — the **original-language** sentence is the one with
`source_sentence_id IS NULL`, and every other locale's sentence points
at it. The mirror-image of `description_sentences`, and deliberately so.

Concretely, `recipe_sentences` gains:

- `is_original boolean NOT NULL` — true for exactly one locale per
  recipe (the dish's own language);
- `source_sentence_id uuid` — set for translations, NULL for the
  original;
- a check constraint: **exactly one** `is_original` row per recipe,
  and a translation's `source_sentence_id` must point at that row.

`recipe_translations` (title + description per locale) is kept as
ADR-007 specified, **plus** a `is_original` marker on the recipe's own
language, so the "primary title" question has one answer.

### 4.4 Why this does not touch the Atlas

The Atlas dish pages keep `description_sentences` and its English-source
model **unchanged**. Changing that constraint would touch 1,474
published dishes and their translations, and the Atlas dish page is
explicitly **not** part of this task ("`gustale.com/dishes/<slug>` = the
Atlas dish … **Unchanged**"). The two properties end up with different
language models on different tables, which is a real asymmetry — and it
is the right one, because the Atlas is a history site with one editorial
language and Recipes is a cooking site with many.

**The `recipe_sentences` check is new and additive.** It touches no
existing table, so it carries no migration risk to the Atlas.

---

## 5. The URL scheme

### 5.1 The three URLs

| URL | what it is |
|---|---|
| `gustale.com/dishes/<slug>` | the **Atlas dish** — history, origins, places, families, connections. **Unchanged.** |
| `gustale.recipes/dishes/<slug>` | the **recipe hub** for that dish — name, photo, one-line definition, "History, origins & connections on the Atlas ↗️", then the list of its recipes with filters (time, region, diet). **No history, places, or families copied from the Atlas.** |
| `gustale.recipes/recipes/<slug>` | **one recipe.** Each variation is its own full recipe (`nasi-goreng-kampung`, `nasi-goreng-jawa`), as ADR-007 requires. |

### 5.2 The hub's empty state

A dish with **0 published recipes** gets:

- the heading **"No recipe yet"**;
- a link to the Atlas dish;
- an **"Add the first recipe"** call to action;
- **`<meta name="robots" content="noindex, follow">`**.

**It becomes indexable automatically at ≥1 published recipe.** The
`noindex` is therefore a **derived** property, not a stored flag: the
hub's indexability is a function of its published recipe count. The
hub template emits `noindex` when the count is zero and omits the meta
tag (indexable) when it is ≥1. There is no manual "now index this" step
and no state that can drift.

### 5.3 The revision to PR 6c

**There is NO 301 for `/dishes/*` on gustale.recipes.** The recipes
property keeps its own `/dishes/<slug>` hubs.

Still 301 to `gustale.com`: **`/regions`, `/families`, `/lineages`.**

> **A fact on the ground, reported because it affects the work.**
> The live routes are **not** the three the brief names. Verified on
> 2026-11-07 against both sites:
>
> | path | gustale.recipes | gustale.com | in the recipes sitemap? |
> |---|---|---|---|
> | `/regions` | 200 — "Places" | 200 — "Places" | no |
> | `/families` | 200 — "Food families" | 200 — "Food families" | no |
> | `/family` | **404** | **404** | — (the index is `/families`) |
> | `/family/<slug>` | 200 (43 URLs) | 200 (43 URLs) | **yes, 43** |
> | `/lineages` | 200 — "History & connections" | 200 — "History & connections" | no |
> | `/lineages/<slug>` | 200 (12 URLs) | 200 (12 URLs) | **yes, 12** |
>
> The recipes sitemap (`sitemap-en.xml`, 1,531 URLs = 1 home + 1,475
> `/dishes/<slug>` + 43 `/family/<slug>` + 12 `/lineages/<slug>`) therefore
> contains **55 URLs that are Atlas content served on the recipes
> domain**, and they are exactly the pages the brief wants redirected.
>
> Two things follow, and both are the owner's call:
>
> 1. **The brief's three paths are the three *index* pages.** But the
>    detail pages under `/family/` and `/lineages/` are the ones actually
>    in the sitemap, and they are Atlas content ("History & connections",
>    "Food families"). If only the three index paths are 301'd, **55
>    Atlas pages stay on gustale.recipes and stay in its sitemap** —
>    which contradicts "No history/places/families copied from the Atlas".
> 2. **A redirect whose target is itself redirected is a chain.** `/family`
>    is 404, so it must not be added to the 301 set; and a 301 of
>    `/families` → `gustale.com/families` is fine only because that
>    target exists (verified 200).
>
> Every candidate target was checked to **exist on the Atlas** — a 301
> whose target 404s is reported, not shipped.

### 5.4 The sitemap and canonicals

- The **recipes sitemap** lists **indexable hubs and published recipes
  only** — never a zero-recipe hub, never an untranslated stub, never a
  draft.
- **Every page self-canonicals on its own site.** `gustale.recipes` pages
  canonical to `gustale.recipes`; `gustale.com` pages canonical to
  `gustale.com`. **No cross-site canonical** between the two properties:
  they are different sites with different content, and a canonical that
  points from Recipes to Atlas would tell Google to index the Atlas
  instead and drop the recipes pages entirely.
- The two properties **do not** declare each other as `hreflang`
  alternates for the same URL: `gustale.com/dishes/<slug>` and
  `gustale.recipes/dishes/<slug>` are **different pages with different
  content**, not translations of each other.

### 5.5 Where the recipes pages live in the code

The two properties are **one Astro app**, built twice. `PUBLIC_DOMAIN`
is baked at build time (`geo` | `recipes`), and `apps/web/src/lib/domain.ts`
already carries the helpers (`isRecipesDomain()`, `atlasUrl()`,
`recipesUrl()`, `authoringHref()`).

**Consequence for the recipe pages: they are recipes-domain pages, and
the post-build step strips them from the `geo` build.** `post-build.mjs`
currently has `const RECIPES_ONLY = []` — "All shared pages are now on
both domains" — so the strip list must gain
`/recipes` and the hub's recipe-listing sections. The Atlas build must
**not** serve `/recipes/<slug>`: the recipe page is the recipes
property's content, and shipping it on both would duplicate it (the
exact failure R2's 301s were meant to end).

---

## 6. Contributor trust

### 6.1 The ladder

| recipes by this contributor | state | what happens |
|---|---|---|
| 0–2 | **probation** | every recipe goes to Alejandro's review; it does **not** publish on its own, **whatever its confidence** |
| 3 or more **approved** | **trusted** | their recipes publish immediately on the same rules as the agent's own |

**The first 3 recipes go through Alejandro's review. After 3 approved,
theirs publish immediately.** The count is of **approved** recipes, not
submitted ones — a rejected recipe does not move the ladder.

### 6.2 Why the ladder is about the contributor, not the confidence

A trusted contributor's MEDIUM recipe publishes immediately. That is
what the owner decided, and it is a deliberate trade: **the contributor's
reputation substitutes for the source evidence** that the confidence
level measures.

It is worth being explicit about what that means, because it is the one
place in this amendment where a recipe can publish on something other
than HIGH confidence:

- **trusted contributor** → publishes on the same content conditions,
  but **not** on the confidence level, and **not** on the source-independence
  condition;
- **agent-drafted** → publishes only at HIGH.

**This means a trusted contributor's recipe does not need two independent
sources.** It needs the *content* conditions: the dish is published,
every ingredient is published, every sentence is sourced (one source is
enough), and the recipe has passed the review that made it trusted.

**The owner should confirm this reading.** It is the natural reading of
"after 3 approved, theirs publish immediately", but it is the
difference between "trusted contributors get the review queue skipped"
and "trusted contributors get the source standard lowered", and those are
different standards.

### 6.3 How "Contributor" is shown

A trusted contributor's recipes carry the badge **"Contributor"** — and
**only** a trusted contributor's recipes do. A probationary contributor
is shown as a contributor in the interface but their recipes are still in
review, so the badge on a *published* recipe means "this person is
trusted", and it is meaningful.

The badge is the public face of the trust ladder. It is stored as
`user.role = 'contributor'` plus a separate counter (the `user` table
already has `contributor_since`), and **the ladder count lives on the
recipe side**, because "3 approved recipes" is a property of the
recipes, not of the account.

### 6.4 The badge is not a credential

**The "Contributor" badge grants no publishing power.** It is a label on
a published page. Publishing power lives in `publish_credential`
(ADR-006) and nowhere else, and a contributor's account needs a
credential to publish through any path other than the auto-publish
function.

**A bot cannot hold a credential, so a bot cannot be a trusted
contributor** — 0048 already refuses it, and the ladder is built on
credentials, so it inherits that refusal for free.

---

## 7. Auto-publish safeguards

### 7.1 The kill switch

**One switch, off by default, that stops all auto-publishing
immediately.**

It is a **server-side** setting, not an environment variable and not a
code change — the owner must be able to flip it without a deploy, and
without waiting for CI. The design:

- a single-row settings table (`recipe_settings`), read by the
  auto-publish function **on every invocation**;
- the switch has three positions, not two: `enabled` / `disabled` /
  `enabled_with_cap`;
- flipping it to `disabled` takes effect on the **next invocation** —
  no restart, no cache to expire;
- the kill switch stops **auto-publish only**. It does not stop a
  human from publishing through the ordinary review queue, and it does
  not unpublish anything already published.

**The kill switch is checked BEFORE the recipe is touched**, not after.
A recipe that is mid-publish when the switch flips finishes; the switch
prevents the *next* one. That is deliberate — a half-finished publish
is worse than a slightly-late refusal.

**Every kill-switch flip is logged** (`recipe_publish_log` records the
switch state at each publish), so "was it on when this went live?" is
answerable afterwards.

### 7.2 The daily cap

**Maximum 20 auto-published recipes per day, to start.**

- the counter is **per calendar day, per property** (there is one
  property);
- the cap counts **auto-published recipes only** — a recipe published by
  Alejandro through the review queue does not consume the cap, because
  the cap exists to bound the *machine's* output, not the editor's;
- hitting the cap **defers** the recipe, it does not fail it: the
  recipe stays in the queue and is published the next day, still subject
  to the kill switch;
- the cap is a **setting**, so the owner can change it without a deploy.

### 7.3 The daily digest

**A daily digest listing everything that went live, with its sources.**

The digest is the owner's audit of the machine's work. It must contain,
per published recipe:

- the recipe's title, slug, and URL;
- the dish it belongs to;
- **the confidence level** and, for HIGH, the conditions that were met;
- **its sources** — the citation for each sentence, with the source's
  class (`S1`–`S7`) and title;
- **the independence finding** — which sources were judged independent
  of each other, and on what basis;
- the service account that performed the publish;
- the kill-switch state and the day's auto-publish count at the time.

**The digest covers auto-published recipes, and only those.** It is a
report on the machine's output. A human-published recipe is visible in
the ordinary review queue and does not need to be in a daily digest.

**Delivery:** the digest is generated by the same job that runs
auto-publish, and delivered to the owner (Telegram, the channel the
owner already uses). It is **retained in the repository** as a dated
file under `docs/digests/`, so the history is auditable and not only
telegram-deep.

---

## 8. The schema this amendment implies

Docs only here — the migration is item 2, and it needs `approved-live`
**and** the owner's separate "go". But the amendment has to fix the
shape, because the auto-publish rule and the confidence levels are
**computed in the database** and therefore need somewhere to live.

### 8.1 New tables

```sql
-- The recipe's own settings: the kill switch and the daily cap.
CREATE TABLE recipe_settings (
  id                     boolean PRIMARY KEY DEFAULT true CHECK (id),
  auto_publish_enabled   boolean NOT NULL DEFAULT false,
  auto_publish_daily_cap integer NOT NULL DEFAULT 20 CHECK (auto_publish_daily_cap >= 0),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             text
);

-- Why a recipe is what it is: the computed confidence, the evidence,
-- and every publish decision.
CREATE TABLE recipe_confidence (
  recipe_id        uuid PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  level            text NOT NULL DEFAULT 'low'
                     CHECK (level IN ('high','medium','low')),
  -- The condition results, so a MEDIUM says WHICH condition failed.
  conditions_met   jsonb NOT NULL DEFAULT '{}'::jsonb,
  independent_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_count     integer NOT NULL DEFAULT 0,
  ingredient_count integer NOT NULL DEFAULT 0,
  sentence_count   integer NOT NULL DEFAULT 0,
  computed_at      timestamptz NOT NULL DEFAULT now(),
  -- A human may lower the level; nobody may raise it above the computed one.
  override_level   text CHECK (override_level IN ('high','medium','low'))
);

-- The audit trail for every auto-publish. No recipe becomes published
-- without a row here.
CREATE TABLE recipe_publish_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id         uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  confidence        text NOT NULL,
  publish_mode      text NOT NULL CHECK (publish_mode IN ('auto','manual')),
  conditions_met    jsonb NOT NULL,
  sources           jsonb NOT NULL,
  actor             text NOT NULL,
  kill_switch_on    boolean NOT NULL,
  daily_count_at_publish integer NOT NULL,
  published_at      timestamptz NOT NULL DEFAULT now()
);
```

Plus, on the existing `recipes` table:

- `confidence` is **not** added to `recipes`. It lives in
  `recipe_confidence` (one row per recipe), because the confidence is a
  **computed** value with its own evidence, and a column on `recipes`
  would invite it to be set by hand.
- `created_by` / `last_edited_by` already exist on `recipes` and carry
  the contributor id.

### 8.2 Changes to existing tables

| change | why | risk |
|---|---|---|
| `statements.subject_type` CHECK widened from `('dish','place')` to include `'recipe'` | a recipe's sentences carry statements | **additive**, on 1,354 rows. ADR-007 already flags this as required |
| `recipe_sentences` gains `is_original` + a language-first CHECK | §4.3 | **new table**, no effect on existing data |
| `ingredients` gains a trigger refusing a slug change on a published row | §3.4 | **additive**; the trigger must not fire on the 5 existing rows (their slugs are not changing) |
| `recipe_translations` gains `is_original` | §4.3 | **new table** |

### 8.3 The confidence computation

The confidence is computed by a **view or function**, not by the API,
so the publish path and the UI read the same number:

```sql
-- The confidence of a recipe, computed from the rows.
-- 'high' requires EVERY condition; there is no scoring.
```

The conditions, in the order they are evaluated (first failure decides
the level, and the reason is recorded):

| # | condition | fails to |
|---|---|---|
| 1 | the dish is `published` | medium (or low if the dish is missing) |
| 2 | every `recipe_ingredients.ingredient_id` is a **published** ingredient | medium |
| 3 | the recipe has at least one `recipe_sentences` row | low |
| 4 | every sentence has a claim with a statement at `status IN ('verified','published')` | medium |
| 5 | every claim's statement has at least one `supports` citation from an `S1`–`S5` source | medium |
| 6 | **independence**: ≥2 independent sources on the core claims (§1.2) | medium |
| 7 | the recipe is not a draft-only stub (has servings/time or an explicit omission) | low |

**Every failing condition is recorded in `conditions_met`**, so a MEDIUM
recipe can say exactly which condition it failed. That is what the
owner reviews, and it is why the level is stored as JSON rather than as
a single enum.

### 8.4 The auto-publish function

```sql
-- Publishes a recipe if, and only if, every HIGH condition is met,
-- the kill switch is on, and the daily cap is not reached.
-- Returns the reason on refusal; never raises for a policy refusal.
CREATE OR REPLACE FUNCTION recipe_auto_publish(p_recipe_id uuid) RETURNS text;
```

Its contract:

1. evaluates the conditions from §8.3 against the **rows**;
2. checks the kill switch and the cap;
3. on success, transitions the recipe's statements to `verified` then
   `published` **through `statement_set_status()`**, with the service
   account's session token;
4. writes `recipe_publish_log`;
5. returns a string: the publish reason on success, or the failing
   condition on refusal.

**It does not update `recipes.status` directly.** The recipe becomes
published because its statements are published — the same direction of
dependency ADR-007 already has, and the same reason the
`statements_status_gate_trg` trigger exists.

---

## 9. What this amendment conflicts with, in one place

So the owner can see the whole conflict surface at once:

| # | conflict | where | resolution | still needs a decision? |
|---|---|---|---|---|
| 1 | bot publish credential | 0048 | server-side function (§2) | **yes** — which service account (§2.4), or amend 0048 to be explicit |
| 2 | only 5 published ingredients | ADR-007's publish gate | staged backfill (§3) | no — the plan is here; the *vocabulary* is approved per stage |
| 3 | `description_sentences` is English-source | live CHECK | recipes get a language-first model; the Atlas is untouched (§4) | no |
| 4 | trusted contributors may publish below HIGH | §2 vs §6.2 | **proposed**: content conditions, not confidence | **yes** — confirm the reading (§6.2) |
| 5 | `/family/*` and `/lineages/*` are in the sitemap and are Atlas content | live sitemap vs §5.3 | item 7 must resolve | **yes** — the exact 301 path set (§5.3) |
| 6 | the recipes pages would be served on both properties | `post-build.mjs` `RECIPES_ONLY = []` | the strip list gains `/recipes` (§5.5) | no |

**Conflicts 1 and 4 need the owner's answer before the migration
(item 2) can be written.** Conflict 1 because it decides whether
`recipe_auto_publish()` gets a session token at all. Conflict 4 because
it decides the shape of the publish predicate.

---

## 10. Open decisions for the owner

1. **The service account for auto-publish** (§2.4) — option 1
   (Alejandro's account, misattributes the audit trail), option 2 (a
   dedicated human-named account — **recommended**), or option 3
   (owner approves in bulk, which is not auto-publish). And if option 2:
   **do we amend 0048** so the rule is an explicit service-account list
   rather than an email-suffix heuristic?
2. **The trusted-contributor standard** (§6.2) — does a trusted
   contributor's recipe publish on the **content** conditions only
   (proposed), or does it also need the source-independence condition?
3. **The 301 path set** (§5.3) — the brief names `/regions`,
   `/families`, `/lineages`, but the live sitemap's Atlas content lives
   at `/family/<slug>` (43) and `/lineages/<slug>` (12), and `/family`
   itself is a 404. Confirm the exact path set — in particular whether
   the **detail** pages are redirected too, or the recipes property keeps
   55 Atlas pages in its own sitemap.
4. **The kill switch's default** (§7.1) — `disabled` is proposed, so
   the very first auto-publish only happens after the owner turns it on.
   Confirm.
5. **The daily cap of 20** — confirm, or set a different number.

---

## 11. What this amendment does not decide

- **The recipe page's visual design.** v1 is core-only per the owner's
  brief; scaler, unit conversion, timers, cooking mode, and print are a
  later PR.
- **The API shape** — `GET /api/recipes`, the hub endpoint, the
  pagination contract. ADR-007 already deferred this; item 4 decides
  it.
- **The digest's exact channel and format.** The owner reads Telegram;
  the content is fixed by §7.3.
- **The review queue's UI.**
- **What "region" and "diet" mean as hub filters** (§5.1) — they are
  named in the owner's brief but not defined anywhere in the schema. The
  filter values need a vocabulary before the hub can offer them; this is
  reported as an open item for item 4.
- **Whether a recipe may exist for a dish with no published dish entry.**
  ADR-007 left this open and this amendment does not change it.
