# Recipes accent — herb green proposal

**Status:** **APPROVED** by Alejandro on 2026-11-06 ("I approve the 5
approvals") and **applied** to `apps/web/src/styles/recipes-island.css`.
**Scope:** the `--accent` / `--accent-dark` / `--accent-ink` tokens for
the **recipes** property (gustale.recipes). The Atlas (gustale.com)
keeps its terracotta.

### What was actually applied, and the one thing that changed

The palette is as proposed:

```
--accent      #327a2f
--accent-dark #286226
--accent-ink  #fbefe6
--accent-soft rgba(50, 122, 47, 0.1)
```

**The contrast caveat in this document turned out to be a live defect,
not a hypothetical one.** The caveat says the accent must not be used
as normal-size text on its own `--accent-soft` tint, because it only
reaches 4.14:1 there. Checking the stylesheet showed **three** places
where accent-coloured text does exactly that:

| place | what it is |
|---|---|
| `.variant[data-on="1"] .rg` | the selected variant's region label, on the tinted selected-variant card |
| `.step .stime b` | the step's time value, on the tinted time chip |

(`.variant[data-on="1"]` sets the tint; `.step .stime` sets the tint.
The third hit in the first draft of the checker was a false positive —
`border-color: var(--accent)` matched a plain substring search for
`color: var(--accent)`.)

Those now use `--accent-dark` (`#286226`), which measures **5.72:1**
on the tinted surface. The pre-existing terracotta had the same defect
(4.13:1) — so this is the Atlas's pattern being inherited, and fixed
in the recipes property at the same time.

**The Atlas was NOT changed.** It keeps its terracotta and keeps its
own 4.13:1 defect; fixing that is the separate `--accent-on-soft`
work this document already flagged.

### The verification

`scripts/hermes/recipes-accent-verify.py` recomputes every ratio from
the WCAG relative-luminance definition, reading the tokens out of the
stylesheet, and reports:

- the seven accent-on-surface ratios (all PASS),
- the accent-on-its-own-tint ratios (the known 4.14:1 / 4.38:1
  failures — a property of the pattern, inherited faithfully),
- and **every place in the stylesheet where accent-coloured text
  actually sits on an accent-soft tint** — currently zero.

`scripts/hermes/recipes-accent-selftest.sh` proves the checker can
fail: it reverts one `--accent-dark` to `--accent` and confirms the
tint check fires, then sets a pale green and confirms the ratio check
fires, then asserts the stylesheet is byte-identical to its saved copy.

The recomputed ratios match this document's table to within 0.01:

```
                          THIS DOC    RECOMPUTED
  accent on white           5.30         5.30
  accent on cream (--bg)    4.71         4.71
  accent on card (--card)   5.00         5.00
  accent-ink on accent      4.69         4.69
  accent-dark on white      7.33         7.33
  accent vs bg (non-text)   4.71         4.71
  accent vs card (non-text) 5.00         5.00
```

---

## The method

The Atlas accent was not chosen by eye. On 2026-10-30 it was darkened
from `#b8552f` to `#b04e29` because the old value **failed** WCAG AA on
the warm cream background (4.26:1, needs 4.5:1). The reason it was
darkened to that specific value was that it passes on all three public
surfaces with the same margin:

```
ATLAS MEASURED PROFILE
  accent #b04e29 on white            5.29:1
  accent #b04e29 on cream  #f6f1e7   4.70:1
  accent #b04e29 on card   #fbf8f1   4.99:1
  accent-ink #fbefe6 on accent        4.69:1
  accent-dark #94391e on white        7.33:1
  accent vs bg, non-text 3:1          4.70:1
```

So the green is not asked to merely "pass". It is asked to land within
**±0.10** of each of those ratios, so the two properties read at the
same visual weight. 2,779 greens clear that band; the one below was
picked for reading as a culinary herb green rather than a forest green.

## The proposal

```
--accent      #327a2f   rgb(50, 122, 47)   hue 118°, saturation 0.44, lightness 0.33
--accent-dark #286226   rgb(40, 98, 38)
--accent-ink  #fbefe6   (unchanged from the Atlas)
--accent-soft rgba(50, 122, 47, 0.1)
```

`--accent-ink` is the same value as the Atlas's, because it is the same
role: text sitting on top of the accent. Keeping it identical means the
two properties' buttons and badges are the same height and weight.

## The measured comparison

```
ratio                                      ATLAS     GREEN   delta
------------------------------------------------------------------------------
accent on white                            5.29:1     5.30:1   +0.01
accent on cream (--bg)                     4.70:1     4.71:1   +0.01
accent on card (--card)                    4.99:1     5.00:1   +0.01
accent-ink on accent                       4.69:1     4.69:1   +0.01
accent-dark on white                       7.33:1     7.33:1   -0.01
accent vs bg  (non-text 3:1)               4.70:1     4.71:1   +0.01
accent vs card (non-text 3:1)              4.99:1     5.00:1   +0.01
```

Every ratio is within 0.01 of the Atlas. That is the whole point: the
green is a **palette swap**, not a redesign, and the two properties
will look equally weighted.

### WCAG thresholds

| Check | Value | Need | |
|---|---|---|---|
| accent on white (text) | 5.30 | 4.5 | PASS |
| accent on cream (text) | 4.71 | 4.5 | PASS |
| accent on card (text) | 5.00 | 4.5 | PASS |
| accent-ink on accent | 4.69 | 4.5 | PASS |
| accent-dark on white (hover) | 7.33 | 4.5 | PASS |
| accent vs bg (focus ring, non-text) | 4.71 | 3.0 | PASS |
| accent vs card (focus ring, non-text) | 5.00 | 3.0 | PASS |

The last two matter because `--focus-ring` is `var(--accent)`, and PR 1
added it specifically so the ring clears WCAG 1.4.11 (3:1 non-text) on
every public surface.

## One thing to know: a pre-existing issue the green inherits

The accent does **not** clear 4.5:1 when it is used as text on top of
its own `--accent-soft` tint (a 10% wash of the accent over the
surface):

```
ATLAS  #b04e29
   accent on --bg-blend   #efe1d4 =  4.13:1  FAIL
   accent on --card-blend #f4e7dd =  4.37:1  FAIL
   accent on white-blend  #f7edea =  4.60:1  PASS

GREEN  #327a2f
   accent on --bg-blend   #e2e5d5 =  4.14:1  FAIL
   accent on --card-blend #e7ebde =  4.38:1  FAIL
   accent on white-blend  #eaf2ea =  4.64:1  PASS
```

**The Atlas has the same defect** — 4.13:1 where the green is 4.14:1.
So this is not something the green introduces; it is a property of the
pattern (a tint of the accent raises the surface's lightness toward
the accent and eats the contrast). The green inherits it faithfully.

Two things follow:

1. **Nothing to fix in the recipes palette.** A green that also passed
   on its own soft tint could not hold the Atlas's other ratios within
   ±0.10 — the search returns nothing at alpha 0.10, 0.08 or 0.06. The
   two requirements are mutually exclusive. Matching the Atlas means
   inheriting its behaviour.
2. **Worth raising separately.** If an accent-coloured link ever sits
   on an `--accent-soft` row, it fails AA on both properties. The fix
   is to darken the accent *for that context* (a dedicated
   `--accent-on-soft` token) or to lower the tint alpha — not to change
   the accent. This is a separate PR, and it applies to the Atlas
   equally. It is flagged here, not fixed here.

The ordinary text on the tinted surface is fine on both:

| On the `--bg` tint | Value |
|---|---|
| `--ink #211c16` | 13.20:1 PASS |
| `--sub #6b6052` | 4.80:1 PASS |

## Why `#327a2f` and not a neighbour

The search band produced a family of greens within ±0.10 of the Atlas
profile (`#2e7a2b`, `#307a2d`, `#317a2d`, `#327a2f`, `#337a2f`,
`#347a32`). They are visually interchangeable. `#327a2f` was picked
because:

- **hue 118°** — sage/basil territory. At 95° it reads as olive; past
  145° it reads teal.
- **saturation 0.44** — high enough to read as green, low enough not
  to look like a highlighter.
- **lightness 0.33** — the middle of the band. The darker candidates
  (`#075705`, L≈0.18) clear the same ratios many times over but read
  as near-black green, which would make the recipes property look
  heavier than the Atlas rather than equal to it.

If Alejandro prefers a specific herb, the three nearest swappable
values are `#2e7a2b` (deeper, more parsley), `#327a2f` (proposed) and
`#347a32` (lighter, more sage). All three hold every ratio above
within 0.05.

## How it would be applied

There are **two** token blocks, not one:

| File | Scope | What changes |
|---|---|---|
| `apps/web/src/styles/global.css` `:root` | the Atlas shell (gustale.com) | nothing — the Atlas keeps its terracotta |
| `apps/web/src/styles/recipes-island.css` `.gst` | the recipes island | `--accent`, `--accent-ink`, `--accent-soft` |

`recipes-island.css` already re-declares the whole palette inside
`.gst` (the recipes pages mount the island into a `.gst` container), so
the swap is scoped to that block. Note that it also declares
`--accent-soft: rgba(176, 78, 41, 0.1)` — the terracotta's RGB
literal — so **that line has to change with the accent**, or the soft
tint stays terracotta while the accent turns green.

`--accent-dark` does not exist in the recipes island's block today, and
several shared rules use it **without** a fallback (e.g.
`global.css:3980` `color: var(--accent-dark);`). So the recipes block
must declare it, or those rules resolve to an invalid value and the
property is dropped — the hover state would silently disappear rather
than error.

One caveat: `apps/web/src/styles/admin.css` sets its own accent
(`#d06c42` / `rgba(208, 108, 66, 0.14)`) for the admin panel's dark
theme, which already passes and is out of scope here.

Not applied. This is a proposal.
