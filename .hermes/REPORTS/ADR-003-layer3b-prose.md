# ADR-003 layer 3b — the prose, as built

**Status:** 🟡 **IN PROGRESS** — the schema and the sentences are live;
the translations are being produced.
**Rule:** `decided-by: hermes` for every decision below.

# What it delivers

| | |
|---|---|
| English sentences (live) | **313** over 121 dishes |
| sentence fields | `short` (the summary) and `long` (the full text) |
| translation table | `description_sentence_translations` |
| source hash | sha256 of the **English source sentence** |
| status machine | `draft` → `machine` → `reviewed` |
| stale | an **overlay flag**, not a status |
| locales | 9 non-English |

# The sentence layer (the foundation)

ADR-002 Q9 decides the anchor is a structured sentence table. It is
built and live: `db/migrations/0025_adr002_description_sentences.sql`.

**313 sentences over 121 dishes.** The `short` field is the summary,
the `long` field the full text. English is canonical; the translations
reference the English rows.

## The splitter

`scripts/split_sentences.py` is Q9's rule, stated as a rule rather
than a regex, and ONE implementation serves both the population and
the check — so the check cannot pass against a different splitter
than the one that wrote the rows.

Q9 requires **two instruments**, and they are not the same test:

| instrument | what it proves | what it cannot prove |
|---|---|---|
| the boundary fixture set | the splitter puts boundaries in the right places | nothing about table/column agreement |
| the concat check | the sentence table and the live column agree, byte-for-byte | that the sentences are the right *sentences* |

The concat check is a consistency gate, not a boundary test: a
zero-width split rejoins exactly **by construction**, so it
reconstructs the input whether the boundaries are right or wrong.

**13/13 boundary fixtures pass.** The five cases the live catalog
happens not to contain:

| case | example | why |
|---|---|---|
| quotes | `"Babi" means pig and "panggang" means grilled` | a terminator inside a quoted span must not end a sentence |
| decimals | `Simmered for 1.5 hours at 90 C` | `.` between digits is not a boundary |
| abbreviations | `St. Louis`, `Inc.`, `Dr.`, `vs.` | a terminator after an abbreviation is not a boundary |
| initials | `J. R. R. Tolkien`, `A. USDA grade` | a single capital + period is not a boundary |
| ellipses | `The dish is... contested.` | `...` is not a terminator |

Two of those fixtures caught real bugs in the rule as first written: a
**unit** (`90 C.`) read as an initial, and the initial rule not seeing
the second initial of `J. R. R.`.

## The guards

`0025` creates two guards, and both are verified against the database:

- **A direct `short_description` write on a managed dish is REFUSED**
  unless it equals the concatenation of that dish's sentences. The
  sentence table is the source of truth, not a suggestion.
- **A managed dish with no sentences is also REFUSED.** The first
  version allowed it, reasoning that "the table has not been populated
  yet" — but `sentence_managed` is set *by* the population, so a
  managed dish with no sentences means they were deleted, and
  accepting the write would let the two drift with no way back.

## The splitter bug that mattered

The translation run found a bug the fixtures had not.

The quoted-span regex treated a **straight apostrophe** as a quote
delimiter, so the apostrophe in `dish's` opened a span that ran to the
next apostrophe — over a thousand characters later. Every sentence
boundary inside it was swallowed, and one live description became a
single **1,257-character "sentence"**.

| what | how many |
|---|---|
| stored rows that were really several sentences | 5 |
| sentence boundaries that were missing | 22 |

The fix requires a straight single quote to **open a word**, and each
of the four quote styles to match *itself* rather than any of the
others.

The re-split (`scripts/resplit_description_sentences.py`) is live:
**313 sentences now**, and both the short and the long concatenation
checks hold for all 121 dishes.

The re-split had a bug of its own, caught by the same check: it
deleted every row for a `(dish, field)` and re-inserted only the
re-split ones, which threw away the **sibling** sentences. A field's
sentences are a list and the mis-split row is one element of it, so
the list is rebuilt from the original rows with that one element
replaced.

# The translation layer

`db/migrations/0026_adr003_sentence_translations.sql`.

## English is canonical; the translation inherits

The translation **references** the English sentence
(`source_sentence_id`), so it inherits the source's claim anchors
without copying them. The anchor text stays English — it is a
verbatim excerpt of the source. The surrounding sentence is
translated.

## The source hash

The hash is of the **English source sentence**, not of the English
description. That is what makes staleness per-sentence: editing
sentence 3 of a description invalidates the translation of sentence 3
and leaves sentences 1, 2 and 4 alone.

Editing an English sentence marks its translations stale. Editing
anything else — a touch of `updated_at`, a flag — does not.

## Stale is an overlay, not a status

`status` is `draft` → `machine` → `reviewed`. `is_stale` is a
separate boolean.

A stale **reviewed** translation is still `reviewed`; it is just
flagged as needing re-translation. Making staleness a status would
lose the information about *who* last confirmed it.

## The moderation path

A contributor proposes a correction (`proposed_text`,
`proposed_by`, `proposal_status`). A moderator accepts it, and a
trigger makes it the translation's text, sets the status to
`reviewed`, stamps `reviewed_at`, and clears the proposal.

All four behaviours are verified against the database, not asserted:

| behaviour | verified |
|---|---|
| the translation inherits the source's anchors | `source_sentence_id` FK |
| the hash is stored | `hash_matches: t` on insert |
| a source edit marks it stale | `is_stale` `f` → `t`, `hash_matches` `t` → `f` |
| stale is an overlay | the status stayed `machine` while stale |
| propose → accept → reviewed | `status: reviewed`, the proposal cleared |

# The translator

`scripts/translate_sentences.py` runs on MiniMax through the **OAuth**
token, which the existing subscription covers. It does not touch the
exhausted PAYG credential, and it does not spend the user's prepaid
OpenAI or DeepSeek credit on ~2,800 translations.

The output is machine-produced, so the schema says so: `status` is
`machine`, not `reviewed`, and the UI badges it.

## The output check

A valid source hash makes a broken translation look perfectly correct
to the database. So the check runs before the write, and it rejects
only what is unambiguously broken — it never rewrites, because a
rewrite would be a silent editorial decision.

| check | why |
|---|---|
| empty | nothing to show |
| starts with the source | the model echoed the input |
| a glued word (`simplementeDesigna`) | the model dropped a space |
| a leaked instruction word | the model copied the prompt |
| too short by length ratio | the call was truncated |

The measured length ratios for the real sentences are **0.97 to 1.31**
— a translation is about the same length as its source — so a
truncation lands well below the 0.6 threshold.

## The citation lines are not translated

Eleven sentences are `[Source: Wikipedia — Aloo gobhi, accessed ...]`.
They are **metadata**, not prose: they name a source and a date, and
they are the same in every language, because the source is the English
Wikipedia article whatever locale the reader is in.

Translating them produced a shorter, mangled version that then tripped
the output check — and was wrong anyway. They are **skipped**, and the
English citation is shown in every locale.

## Two bugs the run found

- **The model's reasoning ate the whole token allowance.** The
  reasoning comes back as a `thinking` block; when it took the whole
  budget the call returned no text at all, with `stop_reason:
  max_tokens`. The budget is now 4,000, and an empty call is **retried**
  with a larger one. Retrying is safe: a failed call wrote nothing.
- **The `CASE` expression returned `text`, not the enum.** A `CASE`
  over an enum column comes out as text, and assigning text to an enum
  column is an error. The literal needs an explicit cast.

# The read path

The dish response now carries:

- `description` — the prose to render, assembled from the translated
  sentences
- `descriptionSentences` — the sentence list, so a client can show
  which part is machine-translated and which is reviewed
- `machineTranslated` — true when any sentence being shown is not
  reviewed

A **stale** translation is not shown: the English sentence is used
instead, and the sentence is flagged `isStale` so the client can say
so.

# Why a new table and not `dish_translations`

ADR-003 offered the choice: reuse `dish_translations` (after the
GUS-239 archive) or add a sentence-level table.

**The sentence-level table wins**, for the reason the ADR itself names:
the translation has to be a *sentence*, because a sentence is what
carries the claim anchors and what carries the stale flag.
`dish_translations` holds one `description` per dish per language — a
whole blob. A blob cannot be marked stale for one changed sentence,
cannot carry a per-sentence status, and cannot be reviewed one sentence
at a time.

So `description_sentence_translations` is a NEW table, and
`dish_translations` is **left alone**. It is NOT archived as part of
this work. The ADR said "reuse dish_translations (after GUS-239
archive)"; GUS-239 is not in the backlog and its archive has not
happened, so archiving it here would destroy data something else may
still depend on. The sentence table is **additive**.

# The gate it went through

| step | result |
|---|---|
| backup | ✅ 2.39 MB, 68 table data entries |
| snapshot | ✅ 122 dishes, 1,373 names, 35,871 labels |
| exact copy | ✅ |
| dry run | ✅ |
| assertions | ✅ the concat check runs in the DATABASE, before and after |
| abort path | ✅ a wrong expected count rolls back with 0 rows |
| apply | ✅ |
| verify | ✅ 313 sentences, 0 concat mismatches |

A **dollar-quoting bug** was caught by the database-side concat check.
The SQL emitter escaped apostrophes for a single-quoted string and
then emitted the result inside `$$`, where the parser unescapes
nothing — so `herdsman` became `''herdsman''` and three dishes came
out two characters too long. The check fired, the transaction rolled
back, and the emitter now uses a dollar tag chosen so it cannot occur
in the text.

The Python-side check had passed. It was the **database** that knew,
which is the point of having the check in the database.
