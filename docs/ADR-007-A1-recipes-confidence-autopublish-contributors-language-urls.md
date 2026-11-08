# ADR-007 (Amendment 1) — Recipes: confidence, auto-publish, contributors, language, URLs

**Status:** **APPROVED — the owner's five decisions are recorded below.**
Docs only; no code, no migration, no live write.
**Date:** 2026-11-07 (drafted) · **2026-11-08 (the owner's five decisions
recorded; the amendment is now settled)**
**Amends:** ADR-007 (`docs/ADR-007-recipe-schema.md`, accepted 2026-11-06)
**Related:** ADR-002 (claims model), ADR-004 §14 (publish credential),
ADR-005 (live approval gate), ADR-006 (publish-credential session
binding), migration 0048 (bot credential guard)
**Deciders:** Alejandro (product owner), Hermes (author)

> **The owner's decisions, recorded 2026-11-08.** The five open decisions
> of §10 are now **closed**, and this document is written to match them.
> Where this document previously said "proposed" or "the owner must
> confirm", the owner's answer is now the text.
>
> | # | decision | the owner's answer |
> |---|---|---|
> | 1 | the auto-publish actor | **amend 0048** so the rule is an explicit list, not an email-suffix heuristic (§2.4) |
> | 2 | the trusted-contributor standard | a trusted contributor **also** needs **2 independent sources**; without them it goes to **Alejandro's review queue** (§6.2) |
> | 3 | the 301 path set | **the full set** — the three indexes **and** all 55 Atlas detail pages (§5.3) |
> | 4 | the kill switch's default | **OFF at launch** (§7.1) |
> | 5 | the daily cap / the digest | **cap 20**, and the **digest from day one** (§7.2, §7.3) |
>
> The decision on **source classes** is also now fixed, and it is
> **stricter** than the draft proposed: a **Wikipedia-only** recipe is
> **never HIGH**, and a recipe's **own wording only** — the agent's
> paraphrase, with no quoted source text — is **never HIGH** either.
> Both are now encoded in §1.3 and §1.4.

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

### 1.3 Which source classes count — **DECIDED 2026-11-08**

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

**The owner's decision, now explicit: a Wikipedia-only recipe is NEVER
HIGH.** Not "usually not HIGH" — **never**. A recipe whose every source
is `S6` is **MEDIUM at best**, whatever else it satisfies. This is now
a hard condition on the HIGH predicate, not a consequence of the source
classes:

```
HIGH requires: every contributing source_class IN ('S1','S2','S3','S4','S5')
```

**Why this is stated as its own rule rather than left implicit:** the
live database is 100% `S6` (§1.5), so without this rule the natural
reading of "2+ independent sources" would let two unrelated Wikipedia
articles produce a HIGH recipe. Two Wikipedia articles that copy each
other are `dependent` and already fail §1.2 — but two that do *not*
copy each other would otherwise pass. The independence condition alone
is not enough; the class condition is what makes it safe.

**And the tiers the owner named, as a table of what a recipe's sources
may be:**

| tier | source classes | can it support HIGH? |
|---|---|---|
| **cookbook** | `S4` (practitioner), `S5` (specialist) | **yes** — with a second *independent* source |
| **institution** | `S3` (institutional) | **yes** — with a second *independent* source |
| **established site** | `S1` (primary historical), `S2` (scholarly) | **yes** — with a second *independent* source |
| **reference only** | `S6` (Wikipedia) | **NO** — never HIGH on its own, never HIGH as the only support |

A recipe may cite across tiers; the rule is about the **floor**, not
about uniformity. A cookbook source plus an institutional source is a
fine pair. A cookbook source plus a Wikipedia source is **not** — the
Wikipedia source contributes to the citation but **not** to the HIGH
condition, so the recipe would still be MEDIUM unless a second
non-`S6` independent source is present.

### 1.4 "Own wording only" — **DECIDED 2026-11-08: never HIGH**

The owner's fourth point in the same decision: a recipe's **own wording
only** is never HIGH.

"Own wording" means the agent's own prose — the recipe text as the
drafter wrote it, with **no quoted source text** behind it. The
distinction the owner is drawing is between a sentence that a source
**says** and a sentence the agent **composed**.

**The rule:**

> A recipe whose core claims rest on **the drafter's own wording**, with
> no quoted source text, is **never HIGH**.

This is a **different condition** from §1.2 (independence) and §1.3
(source classes), and it is checked **per claim**, not per recipe:

| claim | quoted source text present? | contributes to HIGH? |
|---|---|---|
| ingredient list | **yes** — the source states the ingredients | **yes** |
| method step | **yes** — the source states the method | **yes** |
| quantity | **yes** | **yes** |
| the agent's own framing, gloss, or generalisation | **no** | **no** |

**Why it is a separate condition.** §1.2 asks "do two sources agree
independently?". §1.3 asks "are those sources the right kind?". Neither
asks "**is the sentence actually in the source**?". A recipe could
satisfy both and still be the agent's own prose wearing citations: two
good sources exist, and the sentence about them was composed rather
than quoted. That is exactly the failure the owner is ruling out.

**How it is stored.** ADR-002's claims model already distinguishes a
**quoted** claim from a **derived** one. The recipe's core claims must
carry a **`quoted` provenance** — the text is present in the cited
source — and a `derived` claim does **not** contribute to HIGH.

**What this does not do:** it does not forbid the agent from writing
the recipe. The drafter still writes the sentence; it just cannot claim
HIGH for a sentence it did not find in a source. The drafting work
(item 8) therefore has to **retrieve and quote**, not merely
paraphrase — which is the right shape for it anyway, because the
digest (§7.3) has to show the reader the source text.

**Effect on §1.5:** the blocker gets *worse*, not better. With the live
data — 1,486 `S6` sources, 0 quoted claims, 0 `independence` values — a
recipe cannot satisfy §1.2, §1.3 or §1.4. That is the correct state.

### 1.5 The blocker, stated plainly

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

### 1.6 Where the level is stored, and who sets it

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

### 2.4 The actor — the owner's decision: **amend 0048**

**DECIDED 2026-11-08.** The auto-publish actor is a **dedicated service
account on an explicit list**, and **0048 is amended** so the rule is
*explicit* rather than *heuristic*.

The draft offered three options and proposed option 2 (a human-named
service account). The owner chose the **cleaner alternative the draft
described alongside it**: amend 0048 so that a publish credential is
refused to any account on a `service_accounts` list, and the recipes
service account is on that list.

**What changes in 0048:**

| before | after |
|---|---|
| the rule is inferred from the **email suffix** (`-bot`), so a service account wearing a human name slips through | the rule is an **explicit list**: a publish credential is refused to any account on `service_accounts`, **regardless of its name** |
| a bot-shaped account is refused by a name convention | a bot-shaped account is refused **and** a listed service account is refused — the two are separate, explicit checks |
| the intent is machine-checked only by accident of naming | the intent is machine-checked **by construction** |

**Why this is better than the alternative, and not merely different:**
the `-bot` heuristic has a hole exactly where the auto-publish path
needs a hole. Under the amendment, the service account is **named in the
schema as a service account**, so:

- it is refused a credential **like any other account on the list**, by
  name-in-a-table, not by guessing;
- the audit trail can say `service_account = recipes-publisher` because
  that is a **fact in the database**, not an inference from a string;
- adding a second service account later is a **row**, not a **new regex**.

**The amendment keeps 0048's rule completely intact.** 0048's *rule* is
"no bot publishes". The amendment changes only its *detection*: from
"the name looks like a bot" to "the account is on a list of service
accounts, and separately, the name looks like a bot". Both refusals
stand. The service account is refused **by the list**, not by being
allowed through a hole.

**Migration:** 0048 is amended in the item-2 migration, in the same
transaction as the recipe schema. The amendment is additive — a new
table, a new check function, and the credential trigger widened to
consult it. **No existing behaviour changes**: an account that is
neither on the list nor bot-shaped behaves exactly as it does today.

**The owner still has to create the account** — a human-named
`recipes-publisher@gustale.com` on `service_accounts`, with the
credential issued under ADR-006. The account's **name must not** end in
`-bot`; that is no longer what makes it safe, but it remains the
convention the owner's brief asks for.

**What this needs, and it is the owner's to give:** the go-ahead to
amend 0048 — **given 2026-11-08** — and the creation of the service
account itself, which needs the owner's action on the live side.

### 2.4a What the audit trail records

Every auto-publish writes to `statement_status_log` (the function
already does) **and** to a new `recipe_publish_log`, which records:
the recipe, the computed confidence, the conditions evaluated, the
sources that satisfied the independence condition, the kill-switch
state at that moment, and the service account that acted.

Because the service account is on an explicit list, the log records the
account **as a service account** — `service_account_id`, not an email
that a reader has to interpret.

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

### 5.3 The revision to PR 6c — **DECIDED 2026-11-08: the full set**

**There is NO 301 for `/dishes/*` on gustale.recipes.** The recipes
property keeps its own `/dishes/<slug>` hubs.

**The owner's decision: the FULL set.** The three index paths **and**
all 55 Atlas detail pages are 301'd to `gustale.com`:

| from (gustale.recipes) | to (gustale.com) | count |
|---|---|---|
| `/regions` | `/regions` | 1 |
| `/families` | `/families` | 1 |
| `/lineages` | `/lineages` | 1 |
| `/family/<slug>` | `/family/<slug>` | **43** |
| `/lineages/<slug>` | `/lineages/<slug>` | **12** |

**Total: 58 paths.** Every target was verified to return **200** on
`gustale.com` before being listed.

**`/family` (the index) is NOT in the set** — it is a **404** on both
properties, so a 301 to a 404 is not shipped. The index is `/families`.

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
> **The owner's decision closes this.** The full set means:
>
> 1. **All 55 Atlas pages leave the recipes sitemap.** The sitemap
>    becomes 1 home + 1,475 `/dishes/<slug>` = **1,476 URLs**, and it
>    holds **no** Atlas content. That satisfies "No history/places/
>    families copied from the Atlas" completely.
> 2. **No redirect chains.** `/family` is excluded because it 404s; the
>    three index paths redirect to themselves on the other property, and
>    the 55 detail paths redirect to their own Atlas counterparts. Every
>    target is a **200**, verified.
> 3. **The 301s ship only with the owner's go** (ADR-005). This
>    section authorises the *set*; item 7 implements it, and the
>    implementation PR carries the label.

**What this costs, stated plainly:** 55 URLs that currently rank on the
recipes domain will move to the Atlas. That is the intended outcome —
they are Atlas content and belong on the Atlas. The recipes property
keeps its own `/dishes/<slug>` pages, which is the content it is for.

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

### 6.2 The trusted-contributor standard — **DECIDED 2026-11-08**

**The owner's answer: a trusted contributor ALSO needs 2 independent
sources. Without them, the recipe goes to Alejandro's review queue.**

The draft asked the owner to confirm one of two readings, and it
presented the "content conditions only" reading as the proposal. **The
owner chose the stricter one.** The draft's reading is therefore
**superseded**.

**The ladder, as decided:**

| recipes by this contributor | state | what happens |
|---|---|---|
| 0–2 | **probation** | every recipe goes to Alejandro's review; it does **not** publish on its own, **whatever its confidence** |
| 3 or more **approved** | **trusted** | their recipes publish immediately — **but only if they meet the source conditions** |

**What "the source conditions" means for a trusted contributor** — this
is the part that changed, and it is the whole substance of the decision:

> A trusted contributor's recipe publishes automatically **only if** it
> satisfies the same **source** conditions as any other auto-publish:
> **2+ independent sources**, from the **right classes** (`S1`–`S5`,
> never Wikipedia-only), with **quoted source text** rather than the
> drafter's own wording.
>
> **If a trusted contributor's recipe does not meet them, it goes to
> Alejandro's review queue** — the same queue a probationary
> contributor's recipe goes to.

**The trust ladder therefore skips the review queue only when the
evidence is there. It does not lower the evidence bar.** The
contributor's reputation buys them a **faster path to publication when
the evidence supports it**; it does not buy a publication without
evidence.

**What trust *does* change.** The trust ladder is about the
**contributor**, not the confidence (§6.2 in the original draft, now
corrected). The differences between a trusted contributor and an
agent-drafted recipe are:

| | agent-drafted | trusted contributor |
|---|---|---|
| review | the review queue **unless HIGH** | the review queue **unless HIGH** |
| source conditions | required for HIGH | **required for HIGH — the same ones** |
| review | if it fails the source conditions, it waits | if it fails the source conditions, **it waits** |
| the ladder | n/a | 3 approved recipes to reach trusted |

**So what does the ladder buy?** This is the honest question, and the
answer is: **the review queue is not skipped on evidence — it is
skipped on the *human* axis.** A trusted contributor's recipe that
meets the source conditions publishes without a human reading it,
because the contributor has already been vetted by three prior
approvals. An agent-drafted recipe that meets the same conditions also
publishes without a human reading it — because the *evidence* is
sufficient. **Neither path gets a recipe published without 2
independent, correctly-classed, quoted sources.**

The difference is in what happens when the evidence is *missing*. In
both cases the recipe waits for Alejandro. The ladder does not change
that.

**Why this is the right shape, and why it is not a contradiction.** A
trusted contributor is a real risk-reducer, but the risk being reduced
is **"is this person making things up?"**, not "is this text in the
sources?". Trust answers the first question and does not answer the
second. The owner's decision keeps the two separate: trust affects
**review**, evidence affects **publication**.

**The one thing this makes cheaper:** a trusted contributor's MEDIUM
recipe still waits. But a trusted contributor who can produce two
independent, correctly-classed, quoted sources gets a recipe published
**immediately**, whereas the same recipe from an unknown contributor
also gets published immediately (it is HIGH) — or, if it is not HIGH,
waits. **The ladder's real effect is that a trusted contributor's
recipe does not need to clear the *confidence* bar to be trusted with
an auto-publish, but it does need the *source* bar.** In practice the
trusted contributor with real sources and the agent with real sources
are in the same place.

> **A note on the original draft's reading, for the record.** The draft
> said a trusted contributor's recipe needed "one source is enough".
> **That is now wrong and is replaced by the above.** It is recorded
> here because an ADR is a record of decisions, including the ones that
> changed.

**The owner still creates the first trusted contributors.** The ladder
needs no decision from the owner; it needs accounts. A trusted
contributor must hold a **verified `publisher` credential** to publish
through any path other than the auto-publish function — and **a bot
cannot hold a credential, so a bot cannot be a trusted contributor**
(0048 still refuses it, and the ladder inherits that refusal for
free).

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

### 7.1 The kill switch — **DECIDED 2026-11-08: OFF at launch**

**One switch, off by default, that stops all auto-publishing
immediately.**

**The owner's decision: the switch ships OFF at launch.** The
auto-publish path is therefore **dormant** on day one. It stays off
until the owner flips it — a deliberate, server-side action, with no
deploy and no CI wait.

The switch is a **server-side** setting, not an environment variable and
not a code change — the owner must be able to flip it without a deploy,
and without waiting for CI. The design:

- a single-row settings table (`recipe_settings`), read by the
  auto-publish function **on every invocation**;
- the switch has three positions, not two: `enabled` / `disabled` /
  `enabled_with_cap`;
- **the initial value is `disabled`** — the migration seeds it that way,
  and the function refuses to publish while it reads `disabled`;
- flipping it to `enabled` takes effect on the **next invocation** —
  no restart, no cache to expire;
- the kill switch stops **auto-publish only**. It does not stop a
  human from publishing through the ordinary review queue, and it does
  not unpublish anything already published.

**What "OFF at launch" means in practice, so there is no
misunderstanding:** the auto-publish job runs from day one (it is part
of item 8's pipeline), and it **publishes nothing** because the switch
reads `disabled`. Turning it on is one row-update. Until then, the only
way a recipe publishes is **a human publishing it through the review
queue**.

**This is also the right safety property given §1.5.** With today's
data nothing could be HIGH anyway, so a live switch would be a no-op
regardless. Shipping it OFF means the *switch-on* moment is a
deliberate act by the owner on a system whose data is known-good, not
an accident of a deploy.

**The kill switch is checked BEFORE the recipe is touched**, not after.
A recipe that is mid-publish when the switch flips finishes; the switch
prevents the *next* one. That is deliberate — a half-finished publish
is worse than a slightly-late refusal.

**Every kill-switch flip is logged** (`recipe_publish_log` records the
switch state at each publish), so "was it on when this went live?" is
answerable afterwards.

### 7.2 The daily cap — **DECIDED 2026-11-08: 20**

**Maximum 20 auto-published recipes per day.** The owner's number,
confirmed.

- the counter is **per calendar day, per property** (there is one
  property);
- the cap counts **auto-published recipes only** — a recipe published by
  Alejandro through the review queue does not consume the cap, because
  the cap exists to bound the *machine's* output, not the editor's;
- hitting the cap **defers** the recipe, it does not fail it: the
  recipe stays in the queue and is published the next day, still subject
  to the kill switch;
- the cap is a **setting**, so the owner can change it without a deploy.

**The cap and the kill switch are separate.** The switch is a binary
gate; the cap bounds the volume when the gate is open. `enabled_with_cap`
is the third position (§7.1) for the case where the owner wants the
machine publishing but at a lower ceiling.

### 7.3 The daily digest — **DECIDED 2026-11-08: from day one**

**A daily digest listing everything that went live, with its sources.**
The owner's decision: the digest ships **from day one**, not after the
auto-publish path is switched on.

**"From day one" is a stronger requirement than it looks**, and it is
the right one: the digest is the audit of the machine's work, and an
audit that starts when the machine starts producing is worthless. So
from launch, the digest runs **every day** and reports:

- everything that went live — **including recipes published by
  Alejandro through the review queue**, because the digest's job is to
  be the complete record of what the recipes property published on a
  given day;
- and, when the kill switch is off, that fact is itself reported: the
  digest says **"the switch was off; 0 auto-published"** rather than
  being silent.

**A silent digest is a broken digest.** A day with no auto-publishes
still produces a digest, and that digest states the switch state and
the count. Otherwise "the digest is missing today" and "the digest is
empty today" are indistinguishable, and only one of them is a fault.

The digest must contain, per published recipe:

- the recipe's title, slug, and URL;
- the dish it belongs to;
- **the confidence level** and, for HIGH, the conditions that were met;
- **its sources** — the citation for each sentence, with the source's
  class (`S1`–`S7`) and title;
- **the independence finding** — which sources were judged independent
  of each other, and on what basis;
- **the quoted source text** for the claims that count toward HIGH
  (§1.4) — the reader must be able to see the text the recipe claims to
  be quoting;
- the service account that performed the publish;
- the kill-switch state and the day's auto-publish count at the time.

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
-- The explicit list that amends 0048's email-suffix heuristic.
--
-- 0048 refuses a publish credential to any account whose email looks
-- like a bot. That heuristic has a hole exactly where the auto-publish
-- path needs one: a service account that is NOT named like a bot
-- slips through. The owner's decision (ADR-007-A1 §2.4) is to amend
-- 0048 so the rule is explicit instead of inferred.
--
-- So: an account ON THIS LIST is refused a publish credential, by
-- name-in-a-table, regardless of what its email looks like. 0048's
-- own refusal stays completely intact and is checked separately.
-- The two checks are independent:
--
--   refuse if email looks like a bot        (0048, unchanged)
--   refuse if account is on service_accounts (the amendment)
CREATE TABLE service_accounts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  -- What this service account is for. The audit trail reads this, not
  -- an email a reader has to interpret.
  purpose       text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text NOT NULL,
  revoked_at    timestamptz
);

-- The recipes service account. Inserted by the owner, not by the
-- migration, because it is an ACCOUNT -- a row in `user` with a
-- credential issued under ADR-006. The migration creates the table
-- and the function that consults it; it does not create the account.
--
-- The name must not end in '-bot'. That is no longer what makes it
-- safe -- being on this list is -- but it is the convention the
-- owner's brief asks for, and 0048's own check is checked too.

-- The recipe's own settings: the kill switch and the daily cap.
--
-- auto_publish_enabled DEFAULT false is the owner's decision (§7.1):
-- the switch ships OFF at launch, and the auto-publish function
-- refuses to publish while it reads false.
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
  -- The service account, as a fact in the database rather than an
  -- email a reader has to interpret (§2.4a).
  service_account_id uuid REFERENCES service_accounts(id),
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

| # | condition | fails to | source |
|---|---|---|---|
| 1 | the dish is `published` | medium (or low if the dish is missing) | — |
| 2 | every `recipe_ingredients.ingredient_id` is a **published** ingredient | medium | — |
| 3 | the recipe has at least one `recipe_sentences` row | low | — |
| 4 | every sentence has a claim with a statement at `status IN ('verified','published')` | medium | — |
| 5 | every claim's statement has at least one `supports` citation from an `S1`–`S5` source | medium | §1.3 |
| 5a | **no contributing source is `S6`/`S7`** — a Wikipedia-only recipe is never HIGH | medium | §1.3 (owner, 2026-11-08) |
| 6 | **independence**: ≥2 independent sources on the core claims | medium | §1.2 |
| 7 | **quoted provenance**: every claim that counts toward HIGH carries **quoted** source text, not the drafter's own wording | medium | §1.4 (owner, 2026-11-08) |
| 8 | the recipe is not a draft-only stub (has servings/time or an explicit omission) | low | — |

**Conditions 5a and 7 are the owner's 2026-11-08 additions**, and they
are not merely restatements of 5 and 6:

- **5a** is not implied by 5. Condition 5 asks "does the recipe have at
  least one `S1`–`S5` source?"; 5a asks "are **all** of its
  contributing sources `S1`–`S5`?" A recipe with one cookbook source
  and three Wikipedia citations satisfies 5 and fails 5a — it is
  MEDIUM, because the Wikipedia text would otherwise be carrying weight
  it is not allowed to carry.
- **7** is not implied by 4 or 6. Both of those ask about the *sources*;
  7 asks about the **text** — whether the sentence in the recipe is
  actually in the source, or whether the drafter composed it. A recipe
  can have two independent, correctly-classed sources and still be
  entirely the drafter's own wording.

**Every failing condition is recorded in `conditions_met`**, so a MEDIUM
recipe can say exactly which condition it failed. That is what the
owner reviews, and it is why the level is stored as JSON rather than as
a single enum.

**For a trusted contributor, the same conditions apply** (§6.2). The
confidence computation does not have a "trusted" branch: a trusted
contributor's recipe that fails 5a, 6 or 7 is MEDIUM, and MEDIUM goes
to the review queue. What trust changes is that a trusted contributor's
MEDIUM recipe is **not** re-drafted and re-queued by the pipeline — it
waits for a human, which is a different thing from being blocked by
the pipeline.

### 8.4 The auto-publish function

```sql
-- Publishes a recipe if, and only if, every HIGH condition is met,
-- the kill switch is on, and the daily cap is not reached.
-- Returns the reason on refusal; never raises for a policy refusal.
CREATE OR REPLACE FUNCTION recipe_auto_publish(p_recipe_id uuid) RETURNS text;
```

Its contract:

1. evaluates the conditions from §8.3 against the **rows**;
2. checks the kill switch and the cap — **the switch is checked FIRST,
   before the recipe is touched** (§7.1);
3. on success, transitions the recipe's statements to `verified` then
   `published` **through `statement_set_status()`**, with the service
   account's session token — the service account being one on
   `service_accounts` (§2.4);
4. writes `recipe_publish_log`, including `service_account_id`;
5. returns a string: the publish reason on success, or the failing
   condition on refusal.

**It does not update `recipes.status` directly.** The recipe becomes
published because its statements are published — the same direction of
dependency ADR-007 already has, and the same reason the
`statements_status_gate_trg` trigger exists.

**It has no contributor branch.** The function evaluates the rows and
publishes on the HIGH conditions, full stop. A trusted contributor's
recipe goes through the same function (§6.2): if it is HIGH it
publishes; if it is MEDIUM it waits for a human, exactly like any other
MEDIUM recipe. **Trust is not a parameter of this function**, because
making it one would be the mechanism by which the evidence bar got
lowered.

---

## 9. What this amendment conflicts with, in one place

So the owner can see the whole conflict surface at once:

| # | conflict | where | resolution | decided? |
|---|---|---|---|---|
| 1 | bot publish credential | 0048 | server-side function (§2); **0048 amended** to use an explicit `service_accounts` list (§2.4) | **YES — 2026-11-08** |
| 2 | only 5 published ingredients | ADR-007's publish gate | staged backfill (§3) | no — the plan is here; the *vocabulary* is approved per stage |
| 3 | `description_sentences` is English-source | live CHECK | recipes get a language-first model; the Atlas is untouched (§4) | no |
| 4 | trusted contributors may publish below HIGH | §2 vs §6.2 | **they may not**: a trusted contributor also needs 2 independent sources, else the review queue (§6.2) | **YES — 2026-11-08** |
| 5 | `/family/*` and `/lineages/*` are in the sitemap and are Atlas content | live sitemap vs §5.3 | **the full set** — 58 paths, all 55 Atlas pages leave the recipes sitemap (§5.3) | **YES — 2026-11-08** |
| 6 | the recipes pages would be served on both properties | `post-build.mjs` `RECIPES_ONLY = []` | the strip list gains `/recipes` (§5.5) | no |

**No conflict now blocks item 2.** Conflicts 1 and 4 were the two the
owner had to answer before the migration could be written, and both are
answered (§2.4, §6.2). Conflict 2's *plan* is settled and its per-stage
vocabulary is approved as the stages run; it does not block the schema
migration.

---

## 10. The owner's decisions — **ALL FIVE CLOSED 2026-11-08**

**There are no open decisions.** The five the draft left open, and the
answers:

| # | the question | the answer | where |
|---|---|---|---|
| 1 | **the auto-publish actor** — whose credential does the function use, and do we amend 0048? | **Amend 0048.** The rule becomes an explicit `service_accounts` list rather than an email-suffix heuristic. The actor is a dedicated human-named service account on that list. | §2.4 |
| 2 | **the trusted-contributor standard** — does a trusted contributor also need the source-independence condition? | **Yes.** A trusted contributor needs **2 independent sources**, same as anyone. Without them, the recipe goes to Alejandro's review queue. The ladder does not lower the evidence bar. | §6.2 |
| 3 | **the 301 path set** — the three indexes, or the 55 detail pages too? | **The full set.** `/regions`, `/families`, `/lineages`, all 43 `/family/<slug>` and all 12 `/lineages/<slug>` — **58 paths**. `/family` itself is excluded (404). | §5.3 |
| 4 | **the kill switch's default** | **OFF at launch.** The migration seeds `disabled`; the owner flips it when ready. | §7.1 |
| 5 | **the daily cap and the digest** | **Cap 20** auto-publishes per day, and the **digest from day one** — every day, including days with zero auto-publishes, and including recipes published by hand. | §7.2, §7.3 |

**And the three source rules that came with decision 2**, stated
separately because they are conditions on HIGH rather than decisions
about process:

| rule | effect | where |
|---|---|---|
| **a Wikipedia-only recipe is never HIGH** | every contributing source must be `S1`–`S5`; `S6` never supports HIGH | §1.3 |
| **the source tiers** | cookbook (`S4`/`S5`), institution (`S3`), established site (`S1`/`S2`) may support HIGH; reference (`S6`) may not | §1.3 |
| **own wording only is never HIGH** | a claim must carry **quoted** source text, not the drafter's prose | §1.4 |

**What the owner still has to do** (these are actions, not decisions):

1. **Create the service account** — `recipes-publisher@gustale.com`, on
   `service_accounts`, with a credential issued under ADR-006 (§2.4).
2. **Create the trusted contributors** — accounts with a verified
   `publisher` credential (§6.2).
3. **Give the go for the item-2 migration** — `approved-live` plus a
   separate go, per ADR-005.

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
