# ADR-003 — the whole thing, as built

**Status:** 🟢 **All four layers live and deployed.** The prose layer is COMPLETE: **2,718 translations — 302 for each of the nine locales.**
**Date:** 2026-10-29.

# The decision, as recorded

Three layers, per the ADR-003 decision:

**1. Vocabulary labels.** Every vocabulary value — families, cuisines, techniques, ingredients, traditions, contexts, predicates, places — gets one label per locale, from Wikidata (CC0) where available. This makes every dish page multilingual in structure.

**2. `dish_names`.** `(dish, language, script, name, kind, is_primary)`, seeded from Wikidata. A dish can have several names in one language: an endonym, an exonym, a romanization.

**3. Prose.** English is canonical and the evidence anchors stay on it. Translation is per `description_sentence`. Translations inherit the source sentence's claim anchors. The source hash is stored, so a change marks the translation stale and triggers a re-translation. The status is `machine` or `reviewed`, machine translations carry a badge, and contributor corrections go through moderation.

Locales: `en, es, de, fr, pt, id, zh, ja, ar, hi`, plus each dish's own language.

URLs: `/{locale}/dishes/{slug}`, stable slugs, hreflang, per-locale sitemaps, browser-language *suggestion* (not forced), English fallback with a notice, RTL, Noto fonts.

Applies to `gustale.com` and `gustale.recipes`.

# What is live

| layer | the numbers | where |
|---|---|---|
| 1 — vocabulary labels | **35,871** labels, 4,383 values, 9 non-English locales | `vocabulary_labels` |
| 2 — dish names | **1,373** names, 121 dishes, 37 languages | `dish_names` |
| 3a — routing and UI | **1,089** locale pages, 10 locale sitemaps + index, 11 hreflang per page, RTL, 747 Noto faces | the web build |
| 3b — prose | **313** English sentences (302 translatable), **2,718** translations (9 × 302), zero stale | `description_sentences`, `description_sentence_translations` |
| 4 — review and moderation | 7 API routes, 14 integration tests, the `/admin/translations` screen, a nightly stale re-translation job | the API |

# The six things that were wrong and had to be fixed

These are the findings that shaped the implementation. Each was found by measuring the live data or the live API, not by reading the code.

## 1. The sentence splitter was wrong — and the error was enormous

The quote-span regex treated the apostrophe in *"dish's"* as an opening quote and swallowed **1,064 characters**. Five stored "sentences" were really 27.

The live table went from **291 sentences to 313**, and the longest single stored sentence fell from 1,257 characters to 247. Both the short and long description concatenations now reproduce their source byte for byte.

## 2. The guard against direct prose writes was a no-op for the case that mattered

The managed-description trigger refused a tampered write to a dish that *had* sentences — but it allowed a tampered write to a managed dish that had *none*. That is the exact hole an attacker would use. The trigger now refuses both.

## 3. The API's tests ran against a stale build

The API imports `@gustale/db`, which resolves to `./dist/index.js`. CI's test job never built the db package, so the tests ran against a build from whenever the last one happened to be. Eleven tests failed on a schema that was correct.

**CI now builds the db package before the tests.** This was the single cause of three consecutive red CI runs.

## 4. The claims model had a gate that could be walked around

The `statement_set_status()` function checked every transition — but a direct `UPDATE statements SET status = 'published'` skipped it entirely and published a statement with no sentence anchor.

There is now a trigger that refuses any status change not made by `statement_set_status()`. The flag it uses is **text, not boolean** — and that was itself a bug: `current_setting(..., true)` returns an empty string when unset, and assigning `''` to a boolean raises *"invalid input syntax for type boolean"* **before** the comparison runs. So the guard raised a confusing error, and with the comparison never reached, the direct UPDATE *succeeded*. The first test run masked this: it only checked that the write was refused, and it was refused — by the wrong error.

**A gate is only as strong as the write path.** The refusal now reads: *"the status of a statement may only change through statement_set_status(), which checks the gates."*

## 5. The translation output check was calibrated on a guess

It had a length floor of 0.6 and no ceiling.

The floor was *exactly the observed minimum ratio*, which rejects every good value at the edge and still lets real problems through. The missing ceiling let a **16,022-character** Indonesian translation of a 194-character source through — the model looping, at a ratio of 82.

And the floor had to become **per-locale**: Chinese compresses to 0.33–0.43 because it carries more meaning per character, and a global floor rejected complete, correct translations like *"菲律宾阿多博（adobo）是一种将肉、海鲜或蔬菜用醋、酱油、大蒜、月桂叶和黑胡椒炖煮…"*.

The measured distribution, over the accepted translations:

| | min | p2 | median | p95 | max |
|---|---:|---:|---:|---:|---:|
| the ratio | 0.600 | 0.922 | 1.149 | 1.387 | 1.387 |

The floor is now 0.45 (0.25 for `zh`/`ja`) and the ceiling 3.0.

## 6. Fourteen of the Japanese and Chinese translations were model degeneration

A model can lose the script mid-generation and produce text that *looks* like the target language while carrying English — or a half-formed token — straight through it:

    ナシゴレンは.ENGLISH_ID.
    today's samosas are a staple across India, Pakistan, Bangladesh
    「Mie bakso」は黄色い麺とライスバーミンブリ Shilat served with yellow noodles
    gado-gadoはslides、METI diplomacy、narration、in the broader Indonesian sense.

Every existing check passed them: the length ratio was fine (the corruption is *verbose*, not short), the glued-word check did not fire, and one of them had 27 kana and 4 kanji — it read as Japanese. **One was written to the catalogue during this work**, after passing every check.

The detector distinguishes debris from a *legitimate* dish name kept in Latin, which Chinese and Japanese do constantly — `Babi guling是巴厘岛式烤全猪。`, `carne de vinha d'alhos`, `nasi campur Bali`, `ras el hanout`. All of those survive.

Building the detector took five attempts, and each attempt found a different thing:

| attempt | the rule | what it caught | what it broke |
|---|---|---|---|
| 1 | a Latin-character ratio | 55 | 43 legitimate Chinese |
| 2 | ALLCAPS runs only | 8 | missed `served with yellow noodles` |
| 3 | a three-word-run test | 19 | caught `carne de vinha d'alhos` |
| 4 | `btrim(x, '.')` to strip punctuation | 18 | **`btrim` strips SPACES, not the given characters** — so `balik,` never matched `balik`, and the SQL and Python disagreed about 9 rows |
| 5 | a second signal on the two-word rule | 17 | caught `campur Bali` |

The final detector lives in `scripts/find_cjk_debris.py`, and **the migration's ids are generated from it** — so the migration and the validator cannot disagree about what debris is.

**The length floor was wrong too.** The Chinese floor was 0.25 — exactly the measured Chinese minimum (0.248) — so it rejected the next good value the moment it arrived:

    日式薄皮煎饺，以猪肉、白菜、韭菜和姜为馅，一面煎至金黄，再蒸至熟透。

34 characters for a 149-character English source, a ratio of 0.23, and a complete and accurate translation of the whole sentence. The floors are now measured: **0.20 for Chinese, 0.22 for Japanese**, against the observed distributions.

# The translation job, as it now runs

Four defects, all fixed and all verified:

- **A single-instance lock.** An exclusive `flock` on `/tmp/gustale-translate.lock`, non-blocking by default: a second run exits immediately with a clear message rather than piling up behind a long one. The lock is held by the file descriptor, so the kernel releases it when the process dies — both earlier runs died with SIGTERM (-15) and the lock does not survive them.
- **A status cast.** `'machine'::sentence_translation_status`, explicitly, on the insert as well as in the `CASE` branch.
- **Thinking-only responses.** Sometimes the model returns only a thinking block and no text. The fix is *not* to take the thinking text — that is the model's reasoning, not the translation. The response returns empty and the retry ladder asks again with a bigger budget. The `stop_reason` and the block kinds are logged.
- **Resumability.** The job reads the existing `(sentence, locale)` pairs and their hashes and **skips** a pair whose hash still matches the current source. The write is an upsert, so running twice is safe anyway.

A rejected sentence gets **three attempts** with the retry ladder between them. Over the whole run, **2 rejections out of ~2,700**.

# The counts, measured

The real target is **302 per locale**: 313 sentences, less the 11 `[Source: Wikipedia — …]` metadata lines, which are citations rather than prose and are not translated.

| locale | translations | of 302 | stale | proposals |
|---|---:|---:|---:|---:|
| `ar` | 302 | ✅ | 0 | 0 |
| `de` | 302 | ✅ | 0 | 0 |
| `es` | 302 | ✅ | 0 | 0 |
| `fr` | 302 | ✅ | 0 | 0 |
| `hi` | 302 | ✅ | 0 | 0 |
| `id` | 302 | ✅ | 0 | 0 |
| `ja` | 302 | ✅ | 0 | 0 |
| `pt` | 302 | ✅ | 0 | 0 |
| `zh` | 302 | ✅ | 0 | 0 |
| **the total** | **2,718** | **2,718 / 2,718** | **0** | **0** |

**On the "906 not 939" figure.** 906 was `es + de + fr`, which is 302 × 3 exactly. The gap was **not 33**. Measured across the locales already started, it was **fr 3 + id 16 + pt 1 = 20 missing** — and every one of those was a sentence the output check had rejected. The count was never a partial run; it was 20 rejected sentences that had no retry.

# The review and moderation surface

Seven routes under `/api/admin/translations`:

| route | what it does |
|---|---|
| `GET /review-queue` | the queue, with the source sentence beside the translation |
| `GET /summary` | the counts by status, locale and staleness |
| `GET /:id` | one translation, with its citations and proposals |
| `POST /:id/propose` | a contributor proposes a correction |
| `POST /:id/accept` | a moderator accepts it — status becomes `reviewed` |
| `POST /:id/reject` | a moderator rejects it |
| `POST /:id/review` | a moderator marks it reviewed directly |

**Fourteen integration tests**, covering the role gates (401/403), the proposal and acceptance flow, the refusal of a second pending proposal, and the moderator-only paths.

**The admin screen** is at `gustale.recipes/admin/translations` — a React island with the machine/reviewed/stale filters, the source beside the translation, and the propose/accept/reject actions.

**The nightly job** re-translates the stale queue. It runs on the VPS over SSH, because that is where the live database is. A **machine** translation is re-translated in place; a **reviewed** one is **not** — the new wording is queued as a proposal and the human's text stands until a moderator decides. That is "stale is an overlay, not a status" in practice.

# The label provenance

**All 35,871 labels are from Wikidata. None is machine-translated.** Verified three ways — the table's own metadata (100% `source='wikidata'`, 100% with a QID), an independent re-fetch of 12 random labels from the live Wikidata API (**12/12 exact**), and a scan for 13 real credential shapes (one hit, already redacted in the file).

Two things the measurement found: the `is_primary` flag was `false` on all 35,871 rows (the loader hardcoded it), and the per-locale coverage gap — 3,408 to 4,234 of 4,383 values — is Wikidata's shape, not a bug. Where Wikidata has no label, the page falls back to English.

# What is left

- The last two locales' translations (`ar`, `hi`) and the two single-sentence gaps in `zh`/`ja`.
- **GUS-239**: archive the superseded `dish_translations` table. The API still reads it at `apps/api/src/routes/dishes.ts:429` for the legacy name/description fallback, so it is **not yet actionable** — and it needs approval, because archiving published content is one of the standing approval cases.
- The Pool A import: **14 batches of 100**, proven on a copy.
