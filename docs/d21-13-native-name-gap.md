# D21-13 — the native-script name: what the data is missing

The blueprint asks for the dish's own language to lead the names, and for the
native-script name to sit under the H1:

> The dish's own language comes first in names. The native-script name sits
> under the H1 (moussaka: μουσακάς) and is included in 'Also called'. Today
> the Greek name is missing, while Arabic, Hindi, Japanese and Chinese are
> shown.

## What the UI does now

The order of the "Also called" row and the name under the H1 are decided by
the dish's ORIGIN COUNTRY, mapped to a language. The implementation is in
`apps/web/src/lib/dishFacts.ts`:

- `ORIGIN_COUNTRY_LANGUAGE` — the country-to-language table (70 countries).
- `ownLanguage(names, originIsoCode)` — the dish's own language, but ONLY
  when the record really has a name in that language.
- `ownLanguageName(names, canonicalName, originIsoCode)` — the name to print
  under the H1, with its script and language.

The rule is deliberately conservative: **a name is never promoted, and
nothing is printed under the H1, unless the record already carries a name in
its own language.** Where the data has no such name, the row keeps the API's
order. A transliteration would be a guess, and a guess printed under the
title reads as the authoritative name.

## The gap

Measured against the live API on 2026-11-21, across all 1,474 published
dishes:

| | dishes |
|---|---|
| own-language name PRESENT | **194** |
| own-language name MISSING | **1,029** |
| origin country with no mapping in the table | 157 |
| no origin country at all | 94 |

So the blueprint's Greek example is one of 1,029. The gap is not specific to
Greek.

### Why it is so widespread

The corpus splits cleanly in two:

- **1,353 dishes carry only English.** No translation of any kind.
- **~120 dishes carry a fixed ten-language block** — Arabic, German, English,
  Spanish, French, Hindi, Indonesian, Japanese, Portuguese, Chinese.

That block was imported as a set. It is the same ten languages regardless of
where the dish comes from, and **the dish's own language is not in it unless
it happens to be one of the ten.** That is the whole cause: a translated dish
from Turkey got Arabic, German, English, Spanish, French, Hindi, Indonesian,
Japanese, Portuguese and Chinese — and not Turkish.

The own-language names that DO exist are almost all singletons: `el` 2,
`tr` 6, `ko` 5, `vi` 4, `it` 3, `th` 3, `he` 1, `tl` 1, `am` 1. They came
in one at a time, by hand.

### Where the missing ones are

By the language they are missing:

| language | dishes | | country | dishes |
|---|---|---|---|---|
| id | 177 | | ID | 177 |
| it | 116 | | IT | 116 |
| es | 79 | | TR | 59 |
| tr | 59 | | NG | 57 |
| yo | 57 | | IN | 53 |
| hi | 53 | | FR | 45 |
| fr | 45 | | JP | 44 |
| ja | 44 | | CN | 41 |
| zh | 43 | | PH | 38 |
| tl | 38 | | ES | 33 |
| ar | 34 | | PT | 28 |
| de | 29 | | MX | 26 |
| pt | 28 | | DE | 18 |

Indonesian, Italian and Spanish are the largest single groups. Turkish is
next: `pide`, `menemen`, `manti`, `doner-kebab`, `iskender-kebab`,
`musakka-turkish` and 53 more are all published with Arabic, German, English,
Spanish, French, Hindi, Indonesian, Japanese, Portuguese and Chinese names —
and no Turkish one.

## What this lane does NOT do

The names are DATA. Adding a native-script endonym is a content task: it
needs a source for the spelling (the dish's own language usage, not a
translator's guess), and it needs the `kind`, `script` and `isPrimary`
columns set correctly.

This lane does not invent names and does not machine-translate them. That
would be exactly the unsupported provenance D21-1 forbids: a name printed
under the title, in the dish's own script, that no source backs.

## The work list

`scripts/d21-13-native-name-worklist.json` lists every dish with its origin
country, the language its own language would be, and the names it currently
carries. It is a content work list, not a migration.

