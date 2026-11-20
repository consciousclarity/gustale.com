# Recipe style — "The Working Record" v2

**For:** gustale.com/recipes · **Owner:** Alejandro · **Written:** 2026-11-20 (Claude) ·
**Replaces:** RECIPE-STYLE.md v1 · **Ships with:** the Hermes skill `gustale-recipe-writer`, which contains
`recipe-record.schema.json`, `check_recipe.py`, `new-recipe.sh` and `examples/joulutorttu-pinwheel.json` ·
**Related:** BRIEF_SOURCING_DIFFICULTY.md (substitutes, `is_key`, `cost_weight`)

This version keeps v1's evidence model: nothing is invented, the cue is the instruction, failure is content,
and disputes are stated. From the "Cook Beside Me" study it adds the parts that help a cook at the stove:
a facts strip with a timeline of hands-on and waiting time, up to three key moments marked ▲, substitutions
beside the ingredients, and a leftovers note when a source has one. The writer now returns validated JSON
instead of markdown, so every page renders the same way and a script checks each record before it is published.
The same script also checks that the wording is Gustale's own.

This file covers the recipe body only. The dish header, Atlas prose and interface strings are still governed by
`apps/web/src/lib/ui.ts` and the header work.

---

## What makes this style Gustale's own

The sites we studied were the reason for this style, but none of them is its model. No Gustale recipe should
read like RecipeTin Eats, Serious Eats, NYT Cooking, world.food, a food blog or a brand kitchen. These things
belong to Gustale alone, because they come from the archive:

1. **The recipe is a record, not a performance.** The record block describes the practice the way a field
   notebook would: what it is, where and when it is eaten, and what it is like when it comes out right. There
   is no host, no "I" or "we", no story, no persona and no mascot.
2. **Provenance sits in the facts strip.** "Follows world.food · checked against 5 more sources" sits next to
   the yield and times. No other recipe site puts its evidence at the top.
3. **"Accounts differ" markers.** A step that sources disagree on (an oven temperature, a time, a shape) carries
   a small marker that links to the dispute. The page doesn't pick a winner.
4. **Named gaps.** When no source records a sign for a step, the page says "No sign recorded in the sources"
   instead of filling the gap with a guess.
5. **Three verdicts on substitutions**: holds / changes it / doesn't work. The same data drives the Sourcing
   rating for the reader's country.
6. **The dish's own language comes first.** Each locale is written natively from the same record, not
   translated from English.
7. **The Gustale voice**: plain, exact and calm, and observant rather than chatty, instructional or
   encyclopedic. Signs are concrete ("a line drawn through the jam stays open"), never generic ("thick",
   "golden brown").

**Originality rules** (enforced by the writer prompt and by `check_recipe.py --sources-dir`):
- Facts (quantities, times, temperatures, techniques) come from sources. Every sentence is Gustale's own.
- No recipe may share a run of **8 or more words** with any of its sources (an error). A run of 6 or more is
  flagged for rewording (a warning). Numbers and units are ignored in this count, so shared facts never count
  as copying.
- Don't follow a source's sentence shapes or the order of its clauses. Rebuild each step from the facts,
  using Gustale's step rules.
- No other site's signature labels or devices: no "Why it works", "Recipe notes", "Cook's note",
  "Tips & tricks", "Jump to recipe", "headnote", "VINKKI", star ratings, mascots or a personal sign-off.
- Avoid formula openings. Two records should not begin the same way.

---

## 1. The page

The page is designed for phones first. A cook keeps coming back to two things, the quantities and the next
action, so both stay one tap away.

```
┌──────────────────────────────────────┐
│ HERO IMAGE (the dish as served)      │
├──────────────────────────────────────┤
│ Joulutorttu — pinwheel stars …       │  title
│ ↗ Dish in the Atlas · FI · ● badge   │  UI (not the writer)
├──────────────────────────────────────┤
│ Makes 24 · Active 45 min             │
│ Total 3 h 20 · Demanding             │  facts strip (data)
│ Follows world.food · +5 sources      │  provenance (from sources[])
│ Sourcing: Moderate in Germany ▸      │  computed by the sourcing engine
│ ▮5 ▯25 ▮10 ▯2 h ▮25 ▯12 ▮5           │  timeline: ▮ hands-on  ▯ waiting
├──────────────────────────────────────┤
│ The record                           │
│ Before you start        (▲ × 2–3)    │
│ Ingredients  [½× 1× 2×] [metric|US]  │
│   Substitutions · Equipment          │
│ Method  (▲ steps, signs bold,        │
│          "Accounts differ" markers)  │
│ Where this goes wrong                │  ┐
│ Variations and disputes              │  │ collapsible
│ Keeping           (only if sourced)  │  │ on phones
│ Sources and evidence                 │  ┘
└──────────────────────────────────────┘
```

Rendering rules for the redesign:
- Phones get a sticky **Ingredients | Method** switch.
- Each ingredient line starts with its quantity, set in heavier numerals. The scaler multiplies numeric
  quantities only, never `quantity_text`.
- The sign (cue) phrase in each step (`cue`) is set in bold, so a reader scanning the step lands on it.
- Key-moment steps carry a ▲ in herb green. Each key moment listed under *Before you start* links to its step.
- A step with `dispute` shows a small "Accounts differ" marker that links to that entry in
  *Variations and disputes*.
- A step with `cue_missing` shows, in muted text, "No sign recorded in the sources".
- The recipe page carries no history beyond the record. The Atlas link covers history.
- The dish hub card is built from the hero, title, summary and facts strip.
- No ratings, reviews or comments are shown until real ones exist.

## 2. The blocks

Required blocks always appear. If a source is silent on something, the block says so in one line instead of
guessing. Optional blocks appear only when a source supports them.

| # | Block | Req. | What it holds | Budget (en) |
|---|---|---|---|---|
| – | Title | ✓ | Dish name plus what sets this version apart: "Joulutorttu — pinwheel stars with prune jam". No appetite words. | ≤ 90 chars |
| – | Summary | ✓ | One sentence used for the hub card, the meta description and the JSON-LD description. Not shown on the page. | ≤ 160 chars |
| – | Facts strip | ✓ | Yield (servings, or pieces when the source counts pieces), active time, total time including every rest, difficulty (Simple / Moderate / Demanding, technique only), a provenance line, and timeline segments. Stored as data, not prose. | – |
| 1 | The record | ✓ | What this version is, where and when it is eaten, and what the finished dish looks, feels or sounds like when it is right. Third person, present tense, no appetite adjectives. Don't open with the dish name or "is a". | 40–80 words, 2–4 sentences |
| 2 | Before you start | ✓ | Every precondition in the order it has to happen (start the day before, soak, chill, bring to room temperature), then 2–3 key moments, each giving the action and the reason. | 30–100 words; key moment ≤ 20 |
| 3 | Ingredients | ✓ | Grouped by component in order of use, with items in order of use. Each line has quantity, unit, name and a preparation note in parentheses. Optional items go last, in their own group. Then **Substitutions** (0–5), each marked *holds*, *changes it* (say what changes) or *doesn't work* (say why). Then **Equipment**, listing only what a basic kitchen lacks, with sizes. | items |
| 4 | Method | ✓ | Numbered steps, with component subheads when there is more than one component. Rules in §3. | 150–400 words |
| 5 | Where this goes wrong | ✓ | 2–4 entries, one sentence each: "If the …, [cause], so [fix]." | 40–130 words |
| 6 | Variations and disputes | ✓ | Other shapes, fillings and regional forms, and real disagreements between sources with both sides named and left unresolved. A materially different version is "Filed separately as …", with a link. If there are none: "No variations are recorded in the sources." | 20–110 words |
| 7 | Keeping | – | Storage, reheating and freezing, only when a source covers them. | ≤ 50 words |
| 8 | Sources and evidence | ✓ | What each source supports, then 1–2 sentences on what is contested or unverified, in the established evidence-badge wording (`unevidencedText` and the related keys in `ui.ts`). | 20–70 words |

A full recipe body comes to roughly 450–1,000 words. A recipe that won't fit is usually two dishes, so split it.

These were left out on purpose:
- A separate "Why it works" block. The reason stays as half a clause inside the step that needs it.
- Nutrition and calories, because the sources don't give them.
- A ⚠ "no going back" marker. One marker, ▲, is enough.
- A headnote or "promise" on the page. The record does that job, and the summary is used off the page.

## 3. Voice

- **Method.** Use the imperative and start each step with a verb. Give one main action per step; add a second
  only if it is setup or tightly bound to the first ("Cover and simmer"). Keep each step to 2 sentences and
  40 words at most.
- **Sign.** Every step that has a right answer ends on something the cook can see, hear, smell or feel. Add a
  time range as well when the source gives one. The sign is the instruction; the time is the fallback.
- **Failure clause.** Add one inside a step only when a source records that failure. Keep it in brackets and
  to 15 words at most.
- **Heat** is low, medium, medium-high or high. Write **temperatures** as "220 °C (425 °F)" and **sizes** as
  "7.5 cm (3 in)". Write ranges with an en dash: "10–12 minutes".
- **Taste stop.** A savoury dish gets one step beginning "Taste …" when a source says what to adjust.
- **Last step.** The last step serves the dish: say at what temperature and, if a source says, what it is
  eaten with.
- **Elsewhere.** The record is in the third person. "You" is fine in failures and substitutions. Never use
  "I" or "we".
- **Exact words.** Write "pale gold at the edges", not "golden brown", and "a line drawn through the jam stays
  open", not "thick".
- **Never use:** simply, just, easy, delicious, tasty, amazing, mouthwatering, perfect, foolproof, fail-proof,
  guaranteed, wonderful, beautiful, best ever, your favourite, elevate, game-changer, to die for,
  "Let's dive in", "Whether you're…", exclamation marks, bold "Note:" or "Tip:" labels, or "until done",
  "until cooked through" or "until golden" with nothing after them. Their equivalents are banned in every
  language; `check_recipe.py` has starter lists for de, es, fi and id.
- **Attributed only.** Use traditional, authentic, original or homemade only when a cited source says so,
  and attribute it ("Sources name prune as the traditional filling").
- **"To taste"** is for salt and pepper only, once, in the ingredient list.
- **No repeated preparation notes.** In the method, write "the onion", not "the finely diced onion".
- **Own words.** The originality rules above apply.

## 4. Images

| Image | Count | Kind | Rule |
|---|---|---|---|
| Hero | 1 | photo | Reuse the Atlas dish image when it shows this version: same shape, filling and serving. Otherwise brief a new image in Gustale's documentary field-photography style, showing the dish as served and nothing the recipe doesn't produce (no unsourced garnish, side dish or vessel). |
| Step | 0–3 | `diagram` or `photo` | Use one only where words can't carry the sign, preferring key-moment steps. Use a **diagram** (flat line drawing with a herb-green accent) for shaping, folding and cutting, because AI photos get hands and technique wrong. Use a **photo** for a state: texture, colour or doneness. |

- Images contain no text, so one image serves every language.
- Never imitate another site's photo style or recreate a source's photo.
- Alt text is written per locale, at most 125 characters, and says what the cook should see.
- Generated images are credited "Illustration", because they show the dish, not this recipe as cooked (D3).
- Files are WebP, or AVIF where it is served. The hero is 1600 × 1067 (3:2) and at most 220 KB. Step images
  are 1200 × 900 (4:3) and at most 120 KB. The og:image is a 1200 × 630 crop of the hero. Files are named
  `<recipe-slug>-hero` and `<recipe-slug>-step-<step-key>`.
- The writer only briefs images (prompt, alt text and caption). The image pipeline generates them.

## 5. Data: what the writer produces

The writer produces one JSON object per recipe variation. It must be valid against `recipe-record.schema.json`
and pass `check_recipe.py` with no errors. The language-neutral data is written once. Prose sits under
`locales`, one entry per language, each keyed to the same item keys.

**Language order.** Write the dish's own language first, then English, then the rest. Write each locale
natively from the same data instead of translating sentence by sentence. Word budgets are errors in `en` and
only warnings in other languages, because word counts run differently in languages such as Finnish and German.

**Quantities.**
- In the **JSON record**, `quantity` is a decimal number ("2.5", never "2½") and `unit` comes from a fixed
  list: g, kg, ml, l, tsp, tbsp, piece, clove, slice, sprig, leaf, stalk, bunch, pinch, can, packet.
- **In the database, `recipe_ingredients.quantity` and `unit` are TEXT, by design** (ADR-007 Decision 5):
  "2½", "a handful" and "to taste" are real quantities, and a numeric column would throw the meaning
  away. The record's numeric form is what the writer produces; the column is free text so the site can
  carry a source's own wording. **Do not** write the column as a machine-parsable numeral just because
  a scaler might want to — that is not what the column is for.
- Metric is canonical. When the writer converts a measure, the source's own measure goes in `source_quantity`.
- Never convert volume to weight without a density from a source or from the ingredient table.
- `quantity_text` is only for places where the source gives no number ("enough to cover", "for dusting").

**Steps** carry `key_moment`, `cue_missing`, an optional `image`, and an optional `dispute` (the key of a
`dispute` variation).

**Where it goes** (checked against `main` @ `cd46976`; ADR-007 and migration 0052 already built most of it)

| Record field | Table on `main` | Note |
|---|---|---|
| `recipe_slug`, `yield.servings`, `times`, `difficulty` | `recipes` (`slug`, `servings`, `prep_minutes` = active, `cook_minutes`, `difficulty` integer) | The record's `difficulty` is a string (`simple` / `moderate` / `demanding`); the column is an integer and **the skill's own D6** stores them as 1 / 2 / 3. The column has **no CHECK constraint** — the scale is a skill decision, not a database fact (ADR-007 declares `difficulty integer` and nothing else). Pieces and total time including rests have no column yet (D4). |
| `title`, `summary` per locale | `recipe_translations` (`title`, `description`, `is_original`) | `is_original` marks the dish's own language |
| `ingredients[]` | `recipe_ingredients` (`ingredient_id`, `quantity`, `unit`, `preparation_note`, `position`, `is_optional`, `is_key`, `accepted_forms`, `cost_weight`) | `quantity` and `unit` are **TEXT by design** (ADR-007 Decision 5) — "2½" and "a handful" are real quantities. `section` has no column (D4). |
| `substitutes[]` | `recipe_ingredient_substitutes` | `suitable` / `approximate` / `not_suitable` are shown as holds / changes it / doesn't work |
| `record` | `recipe_sentences` (field `intro`) | one row per sentence |
| `steps[]` | `recipe_sentences` (field `step`) | the sign phrase and the failure clause stay inside the step text |
| preconditions, key moments, failures, variations, keeping, evidence note | `recipe_sentences` (field `note`) today | **Too coarse** to render separate blocks (D4) |
| other locales | `recipe_sentences` in that locale, `source_sentence_id` → the original | language-first is enforced by a trigger |
| `sources[]`, `source_ids` | `sources`, `statements` (subject `recipe`), `claim_citations`, `recipe_claims` | sentences are anchored to claims, as on the Atlas |
| `agent.confidence` | `recipe_confidence` (`level`, `conditions_met`, `independent_sources`, `source_count`) | **The record writes `HIGH` / `MEDIUM` / `LOW`; the column stores `high` / `medium` / `low`** — `recipe_confidence.level` has `CHECK (level IN ('high','medium','low'))` (0052 L784-785). Lower-case the value on write, or the insert is refused. **There is no standalone writer**: `recipe_compute_confidence()` only RETURNS a jsonb, and the only code that writes `recipe_confidence` is `recipe_auto_publish()`. A recipe that never auto-publishes has no `recipe_confidence` row — the proposed level lives in the record only. |
| auto-publish | `recipe_settings` (off by default, daily cap 20), `recipe_publish_log` | |
| `timeline`, `sections`, key-moment flags, `cue`, `dispute`, `cue_missing`, `images` | **no column yet** (D4) | |

**The site builds these, not the writer:**
- The JSON-LD, built from the record:
  - `name`, and `image` (hero and step images)
  - `description` = summary, and `recipeYield`
  - `prepTime` = active time, `cookTime`, and `totalTime` including rests, all in ISO 8601. Prep and cook don't
    have to add up to the total when there are rests.
  - `recipeIngredient`, and `recipeInstructions` as `HowToStep` with one `HowToSection` per component
  - `recipeCuisine` and `keywords`
  - Never `aggregateRating`, never `nutrition`.
- The Sourcing rating, which comes from the engine in the sourcing brief.
- The dish header and every interface label.

**Never produced:** nutrition, ratings, reviews, prices, pairings, history.

## 6. Pipeline and publish gate

Three stages run as three linked cards on the Hermes Kanban board `gustale-recipes`. `new-recipe.sh` creates
all three for a dish; setup and commands are in the skill's `SETUP.md`.

1. **Research → source sheet.**
   - Finds at least two independent sources. Independent means not copied from each other; identical wording
     or the same odd quantities give a copy away.
   - Fills `templates/source-sheet.md` with the facts each source gives, in its own short notes.
   - Saves each source's method text as `sources/<source-id>.txt`, for the originality check only. These files
     are never published.
   - Picks the **base source**, the one with the most complete method. It becomes the recipe's spine.
   - Blocks its own card if fewer than two independent sources exist.
2. **Write → JSON record.** Works from the source sheet only and does no browsing. The prompt is in §7. It
   runs `check_recipe.py --sources-dir sources/` until the result is PASS.
3. **Verify.** Checks every number, sign, failure and substitute against the sheet, runs the checker again,
   sets the final confidence, writes `verify-report.md`, deletes `sources/`, and then acts on the gate below.

**Never blend sources.** Quantities, times and temperatures come from the base source. The other sources
confirm the base and add signs, failures and substitutions. Where they differ, the difference goes into
*Variations and disputes* and gets a `dispute` marker on the step. Averaging two sources produces a recipe
nobody has cooked.

**Confidence** decides which existing publish rule applies. HIGH auto-publishes as `system:auto-publish`,
within the on/off switch and the daily cap. MEDIUM waits for Alejandro. LOW never publishes.

- **HIGH** requires all of the following:
  - The base source and at least one independent source agree on the key ingredients, the technique, the key
    quantities (within ±15 % at the same yield) and the oven temperature (within 10 °C) (D2).
  - Every step that needs a sign has a sourced one.
  - There are at least 2 failure entries.
  - Every ingredient has an Atlas id.
  - `check_recipe.py` reports no errors, including the originality check.
- **MEDIUM:** the dish is clear, but one of the HIGH conditions fails.
- **LOW:** there is only one source, a key ingredient or the technique is disputed, or a hard rule can't be met.

## 7. The writer prompt

Copy the whole block below. It is the complete message given to the writing agent, and the skill loads it
for the write stage.

> **You write recipes for Gustale (gustale.com/recipes), a public archive of world dishes, in Gustale's own
> house style, "The Working Record".**
>
> A Gustale recipe records a cooking practice: how it is done, how the cook knows each step is right, what goes
> wrong, where accounts differ, and what is known versus contested. The reader is competent, cooks on an
> unfamiliar stove and often reads on a phone. From the page alone, they must be able to tell whether the
> thing in front of them is right. The voice belongs to Gustale and to no one else: plain, exact, calm and
> observant. There is no host, no "I" or "we", no story, and no imitation of any recipe site.
>
> **You receive** a source sheet containing:
> - the Atlas dish record (slug, names, place, definition)
> - the base source and at least one confirming source, with every quantity, time, temperature, sign, failure,
>   substitution and storage note each one gives
> - the evidence state and the target locales
> - the Atlas ingredient ids and names
> - a `sources/` folder holding each source's text, for the originality check
> - any prior version of this recipe.
>
> **You return** one JSON object, valid against `recipe-record.schema.json` 2.0, and nothing else.
> `examples/joulutorttu-pinwheel.json` shows the shape. Don't reuse its sentences.
>
> **Hard rules**
> 1. **Invent nothing.** Every quantity, time, temperature, sign, failure, substitution and storage note comes
>    from the source sheet and carries the `source_ids` it came from. If no source gives a sign for a step that
>    needs one, keep the time, set `cue_missing: true` and `cue: null`, and name the step in `agent.gaps`.
>    A named gap is useful; a filled gap is a lie.
> 2. **Never blend.** Numbers come from the base source. Confirming sources confirm it and add signs, failures
>    and substitutions. Where sources differ, write the difference as a `dispute` in variations and set
>    `dispute` on each affected step. Never average.
> 3. **Original wording.** Facts come from the sources; every sentence is yours.
>    - Never share a run of 8 or more words with a source (numbers and units don't count).
>    - Don't follow a source's sentence shapes or clause order. Rebuild each step from the facts.
>    - Use no other site's signature labels or devices ("Why it works", "Recipe notes", "Cook's note", "Tips",
>      headnotes, ratings, mascots, sign-offs).
>    - Don't open a record the way another Gustale record opens.
> 4. **No extras.** Leave out history (it lives in the Atlas), folklore, nutrition, pairings, prices and
>    ratings. Use "traditional", "authentic", "original" or "homemade" only when a cited source says so, and
>    attribute it.
> 5. **Data once, prose per language.** Write the language-neutral fields once. Then write each locale natively,
>    in this order: the dish's own language, English, then the rest. Every locale states the same facts; none
>    adds or drops any.
>
> **Fields**
> - `title`: the dish name plus what sets this version apart.
> - `summary`: one sentence of at most 160 characters, with concrete nouns and no hype.
> - `record`: 40–80 words in 2–4 sentences. Say what this version is, where and when it is eaten, and what the
>   finished dish looks, feels or sounds like when it is right. Use the third person and present tense, with no
>   adjectives of appetite. Don't open with the dish name or "is a".
> - `preconditions`: everything that must happen earlier, in order, in the imperative.
> - Key moments: mark the 2–3 steps that decide the result with `key_moment: true`. Under `key_moments`, give
>   each one as the action and the reason, in at most 20 words.
> - `timeline`: hands-on (`active`) and `waiting` segments in order. All segments must add up to
>   `times.total_min`, and the active ones to `times.active_min`.
> - Ingredients:
>   - Put them in `sections` by component, in order of use, with items in order of use.
>   - Give a metric `quantity` and `unit`. When you convert, put the source's own measure in `source_quantity`.
>   - Use `quantity_text` only where no number exists. Use "to taste" only for salt and pepper.
>   - Put the preparation note on the item, never in the method.
>   - Set `is_key` on the ingredients that define the dish, `cost_weight: "minor"` on small amounts of costly
>     ingredients, and `accepted_forms` when only some forms work.
> - `substitutes` (0–5), only from sources, each `suitable`, `approximate` (the note says what changes) or
>   `not_suitable` (the note says why).
> - `equipment`: only what a basic kitchen lacks, with sizes.
> - `steps` (150–400 words in all):
>   - Start each step with a verb. Give one main action; add a second only if it is setup or tightly bound to
>     the first. Use at most 2 sentences and 40 words.
>   - Every step with a right answer ends on a sign the cook can perceive. Copy that phrase into `cue` exactly
>     as it appears in `text`.
>   - Add `time_min` and `time_max` when a source gives a time.
>   - Write heat as low, medium, medium-high or high, temperatures as "220 °C (425 °F)" and sizes as
>     "7.5 cm (3 in)".
>   - When a source records a failure for the step, add it as `failure`, in at most 15 words.
>   - Write "the onion", not "the finely diced onion".
>   - A savoury dish gets one step beginning "Taste" when a source says what to adjust.
>   - The last step serves the dish.
> - `failures`: 2–4 entries, one sentence each: "If the …, [cause], so [fix]." Write only one when the sources
>   support only one; the recipe then cannot be HIGH.
> - `variations`, each with a kind:
>   - `variation` for other shapes, fillings and regional forms
>   - `dispute` for disagreements between sources, with both sides named and left unresolved
>   - `filed_separately`, with its `recipe_slug`, for a materially different version
>   - `none_recorded` as the only entry when there are none: "No variations are recorded in the sources."
> - `storage`: only if a source covers it; otherwise leave it out.
> - `evidence`: what each source supports, then 1–2 sentences on what is contested or unverified, in the
>   established evidence-badge wording from `apps/web/src/lib/ui.ts`.
> - `images`:
>   - One hero. Set `reuse_atlas_image: true` when the Atlas image shows this version; otherwise write a
>     `prompt`.
>   - 0–3 step images, only where words can't carry the sign: `diagram` for shaping, folding or cutting, and
>     `photo` for a texture or colour.
>   - Prompts describe only what this recipe produces, in Gustale's documentary field-photography style, with
>     no text in the image.
>   - Alt text is at most 125 characters and says what the cook should see.
>
> **Voice.** Plain, precise and calm, with exact sensory words instead of general ones. Never use: simply, just,
> easy, delicious, tasty, amazing, mouthwatering, perfect, foolproof, guaranteed, wonderful, beautiful,
> best ever, your favourite, elevate, game-changer, "Let's dive in", "Whether you're", exclamation marks,
> "Note:" or "Tip:" labels, or "until done", "until cooked through" or "until golden" with nothing after them.
> Avoid their equivalents in every language.
>
> **Confidence.** Propose `agent.confidence`; the verifier makes the final call.
> - HIGH only if all of these hold:
>   - The base source and at least one independent source agree on the key ingredients, the technique, the key
>     quantities (±15 % at the same yield) and the oven temperature (±10 °C).
>   - Every step that needs a sign has a sourced one.
>   - There are at least 2 failures.
>   - Every ingredient has an Atlas id.
> - MEDIUM if one of those fails but the dish is clear.
> - LOW if there is only one source, a key ingredient or the technique is disputed, or a hard rule can't be met.
>
> List every gap in `agent.gaps` and every disagreement in `agent.disputes`.
>
> **Before you return,** run `python3 check_recipe.py <file> --sources-dir sources/` and fix every ERROR,
> including copied wording. Then read the English method once as someone who has never cooked this dish, and
> rewrite any step that leaves them guessing.

## 8. Worked example: joulutorttu, pinwheel

This is v1's reference recipe, rebuilt in v2 and rewritten so that none of its wording comes from v1 or from the
source sentences v1 quoted. It is the reference for **structure and voice** only:
- Its facts are carried over from v1 and have not been re-checked.
- Its source attributions and Atlas ids are placeholders.

The full record is `examples/joulutorttu-pinwheel.json` (English locale only). It passes
`check_recipe.py --only-locale en --sources-dir` against v1's text and the quoted source sentences, with no copy
errors or near-copy warnings. The only warnings are for the placeholder sources having no URL, and for the word
"traditional", which the verifier still has to confirm against a source.

---

#### Joulutorttu — pinwheel stars with prune jam

*Hero: Star-shaped pastries dusted with powdered sugar, dark prune jam at each centre, beside a cup of coffee. (Illustration)*

Makes about 24 · Active 45 min · Total about 3 h 20 min · Demanding
Follows world.food · checked against 5 more sources
Timeline: ▮ 5 min start the jam · ▯ 25 min simmer the jam · ▮ 10 min make the dough · ▯ 2 h chill the dough; the jam cools · ▮ 25 min roll, cut and shape · ▯ 12 min bake · ▮ 5 min cool and dust

**The record**

A Finnish Advent pastry: squares of quark dough are slit from each corner, and alternate points fold over a spoonful of prune jam to make a pinwheel star. People serve them alongside coffee or glögi, the Nordic mulled wine, through the Christmas season. When they come out right, the stars are puffed, pale gold at the edges and white with sugar, and the pastry breaks into flakes instead of bending.

**Before you start**

- Start the dough a day early, or at least 2 hours before shaping, so it has time to firm up in the fridge.
- Make the jam first and let it cool all the way down before any of it touches the dough.

*What decides it*

- ▲ Step 3: Reduce the jam until a line drawn through it stays open; thinner jam escapes from the stars.
- ▲ Step 8: Give the dough its full chill; dough that is still soft smears and sticks under the rolling pin.
- ▲ Step 14: Seal the folded points with egg; unsealed points lift apart when the pastry rises.

**Ingredients**

*For the prune filling*

- 300 g pitted prunes (roughly chopped)
- 120 g granulated sugar
- Water, enough to cover the prunes

*For the pastry*

- 225 g quark (at room temperature)
- 225 g salted butter (softened)
- 250 g plain flour (plus extra for dusting)

*To finish*

- 1 egg (lightly beaten, for sealing and brushing)
- Powdered sugar, for dusting

*Substitutions*

- **Holds:** Full-fat ricotta, for the quark.
- **Holds:** A thick jam of lingonberry, blueberry, raspberry or apricot, for the prune filling. Use it cold, and stiff enough that a spoonful keeps its shape.
- **Changes it:** Bought puff pastry in squares of the same size, for the quark dough. The stars bake flakier, and there is no dough to make.
- **Doesn't work:** Any loose, pourable filling. It escapes the folds and spreads across the tray.

*Equipment:* Electric hand mixer · rolling pin · pastry wheel or sharp knife · fine sieve · wire rack

**The method**

*For the prune filling*

1. Put the prunes and sugar in a small saucepan and add water to cover.
2. Set the pan over medium heat and wait for **a gentle simmer**.
3. ▲ Let the prunes bubble uncovered for 20–30 minutes, crushing them on the pan wall from time to time, **until a line drawn through the jam stays open**. [Runny jam escapes from the stars during baking.] *(photo: thick prune jam, a spoon line through it that stays open)*
4. Move the pan off the heat and let the jam stand **until it feels cold right to the centre**.

*For the pastry*

5. Whisk the butter and quark with the hand mixer in a large bowl **until the mixture is smooth**.
6. Work in the flour, stopping **as soon as it comes together as a soft dough**.
7. Split the dough into two equal portions and wrap each one.
8. ▲ Keep the portions in the fridge **until they feel firm when pressed**: 2–3 hours, or overnight. [Soft dough smears and sticks while it is rolled.]

*Shaping and baking*

9. Set the oven to 220 °C (425 °F); cover two baking sheets with parchment paper. *Accounts differ ↓*
10. On a lightly dusted worktop, roll out one portion into a rectangle **about 30 × 23 cm (12 × 9 in), as thin as 3 mm (⅛ in)**.
11. Mark and cut the sheet into 7.5 cm (3 in) squares; **one portion yields 12**.
12. Make a diagonal cut in from every corner of each square, **ending between halfway and two-thirds of the distance to the middle**.
13. Place a teaspoon of jam on the uncut centre of every square.
14. ▲ Bring alternate points over the jam, touching each tip with egg, and press down **until all four hold together in the middle**. [Unsealed points lift apart in the oven.] *(diagram: the cut square, then the pinwheel fold)*
15. Space the stars 2.5 cm (1 in) apart on the prepared sheets and paint a thin coat of egg over the tops.
16. Bake for 10–12 minutes, **until the stars have risen and their edges are pale gold**. *Accounts differ ↓*

*To finish*

17. Let them settle on the sheets for 5 minutes before lifting them onto the wire rack.
18. **When the stars are cold**, dust them with powdered sugar through the sieve and serve them with coffee or glögi.

**Where this goes wrong**

- If the stars open up in the oven, the rising pastry has forced the sealed points apart, so before baking, pin each centre with a toothpick that has soaked in water for 10–20 minutes.
- If jam runs out across the tray, it went onto the dough too warm or too thin, so let it cool longer next time, until a spoonful keeps its shape.
- If the dough goes soft and tacky as you work, it has warmed up, so wrap it and put it back in the fridge for about 15 minutes before rolling on.

**Variations and disputes**

- Short slits near each corner, rather than long cuts toward the middle, turn the same squares into flowers; that shape is filed separately as Joulutorttu — flower shape.
- Oven settings disagree: Finnish sources bake at 225 °C (435 °F) for 10–15 minutes, American sources at 220 °C (425 °F) for 10–12 minutes, and often take the colour further.
- Cognac worked into the dough appears in some versions; it is kept here as a variation, outside this recipe.

**Sources and evidence**

- world.food (base): Base method, quantities, bake and the toothpick fix.
- Curious Cuisiniere: Jam consistency and runny fillings.
- The Food Dictator: Shape and the bake cue.
- Bake From Scratch: Sealing the tips; puff pastry.
- Tara's Multicultural Table: Cognac in the dough.
- Valio: The Finnish bake, 225 °C.

Sources name prune as the traditional filling, while most recipes now in print call for bought jam. The bake is disputed; both readings appear under Variations and disputes.

---

## 9. What changed from v1

- **Output.** The writer returns JSON checked by a schema and a script, not markdown.
- **Originality.** Gustale's signature elements and originality rules are now written down, and the checker
  compares every sentence against the source texts. v1's own example failed this check: its sticky-dough fix
  was almost word for word the world.food sentence v1 quoted, and many of its steps reused one source's
  phrasing. The example has been rewritten from the facts.
- **Added:**
  - the facts strip with its timeline and provenance line
  - key moments marked ▲
  - "Accounts differ" markers on disputed steps
  - named gaps shown on the page
  - substitutions moved beside the ingredients and mapped to the sourcing brief's suitability values
  - the optional Keeping block
  - the summary as metadata
  - the image policy
  - the three-card Kanban pipeline
  - written-out HIGH / MEDIUM / LOW rules.
- **Changed rule.** "Never two actions joined by 'and'" is now "one main action per step". v1's own example
  broke the old rule in five steps, and a rule the reference itself breaks teaches the writer to ignore rules.
- **Fixed in v1's example:**
  - "The Finnish temperature is the lower of the two" was wrong: 225 °C is the higher.
  - "Traditionally" and "buttery" appeared in the block that bans appetite words and unattributed claims.
  - "Quark creamed with anything already containing fat will not hold its shape" contradicted the dough
    itself, which is quark creamed with butter. It was dropped.
  - Puff pastry was listed as a substitution that holds, although the same line said the result is flakier.
    It is now *changes it*.
  - The bake dispute cited "Finnish sources", but none was listed. Valio is now listed as a placeholder.

## 10. Decisions (defaults in force until Alejandro changes them)

- **D1 Units.** Metric is canonical, with imperial in parentheses in prose. US measures come from the page toggle.
- **D2 "Agree" for HIGH.** Key quantities within ±15 % at the same yield, and oven temperature within 10 °C.
- **D3 Image credit.** Generated images are credited "Illustration".
- **D4 Storage.** One small migration, proposed by Hermes at the first review:
  - widen `recipe_sentences.field` with `precondition`, `key_moment`, `failure`, `variation`, `keeping` and
    `evidence`
  - add a `recipe_layout` jsonb on `recipes` for the timeline, sections, the cue / dispute / cue_missing flags,
    pieces, total time and image briefs.
  Until it is applied, recipes stop at review.
- **D6 Difficulty.** Simple / Moderate / Demanding are stored as 1 / 2 / 3 in `recipes.difficulty`.
- **D5 Originality thresholds.** 8 or more shared words is an error, 6 or more is a warning; numbers and units
  are ignored.
