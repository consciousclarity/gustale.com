# PR 1 — Design tokens, contrast, focus ring, 24px targets, axe in CI

**Branch:** `fix/a11y-tokens-focus-targets`
**Base:** `origin/main`
**Status:** open for review. Not merged, not deployed.

---

## What this PR does

Five things, all in service of the same goal: make the site's
accessibility a **property the build enforces** instead of something
that has to be noticed by hand.

1. **Contrast** — verified, not changed. Every text/background pair in
   the token set already passes WCAG AA. The values in the original
   brief were stale; the repo's current values are already correct, and
   this PR proves it rather than "fixing" a non-problem.
2. **Focus ring** — one ring, everywhere, including the seven form
   controls that had `outline: none` and no replacement.
3. **24px targets** — the header search button (22×14) and the
   obscured "Sign in" button.
4. **axe in CI** — a new job that fails the build on any WCAG A/AA
   violation in the built site.
5. **A focus audit axe does not have** — axe-core 4.10.2 has *no* rule
   for a visible focus indicator, so the gate checks SC 2.4.7 itself.

---

## The defects this fixes

All three were live in production on every page of the site.

| # | Defect | WCAG | Where |
|---|--------|------|-------|
| 1 | Search submit button was **22×14px** | SC 2.5.8 Target Size (Minimum) | header, every page |
| 2 | "Sign in" button **partially obscured** by the overflowing nav (39.4×2px of clear space) | SC 2.5.8 Target Size (Minimum) | header, every page |
| 3 | **7 controls painted no focus indicator** | SC 2.4.7 Focus Visible | search input, filter input, 2 filter selects, 2 checkboxes, reset button |

### Defect 1 — the 22×14 search button

The button's only child is a 14×14 SVG icon, and its padding only added
8px on the left. The icon *was* the hit area.

```
before:  <button class="gs-submit"><svg width="14" height="14">…</svg></button>
         → 22px × 14px

after:   min-width: 24px; min-height: 24px;  /* the glyph stays 14px */
         → 24px × 24px
```

`margin: -4px 0` pulls the extra height back out of the row, so the
compact header search does not grow.

### Defect 2 — the header overlap

`.gst-navlinks` was `flex: 0 1 auto`. At 1280px it shrank to 432px
while its five `white-space: nowrap` links — which do not shrink —
overflowed the shrunken box by 55px. The overflow slid under
`.gst-navr`, so "About" sat *underneath* the "Sign in" button.

```
before (1280px):  [brand][switch][search][Explore Places Food families History&conn About] Sign in
                                                                ^^^^^^^^^^^^^^^^^^^^^^^^^^^ overflows by 55px
                                                                                          ^^^^^ overlapped

after:            .gst-navlinks { flex: 0 0 auto }
                  the links keep their natural width; the brand and the
                  search field give up space instead (both already had
                  flex-shrink: 1), so nothing overlaps.
```

The consequence of `flex: 0 0 auto` is that the header needs more room
than 1280px, so the **mobile breakpoint moves from 960px to 1200px**.
Below 1200px the primary nav, the header search and the property switch
collapse into the menu button — the same thing that already happened
below 960px.

Verified at 961 / 1000 / 1100 / 1200 / 1201 / 1240 / 1280 / 1281 / 1366 /
1440 / 1600 / 1920px: **0px overlap at every width**, and the header
height does not change (68px row, 69px header) at any width.

### Defect 3 — no focus indicator

Seven controls had `outline: none` and no replacement. The search
field's wrapper had a `:focus-within` glow, but that glow belongs to
the *wrapper*, not the control — a keyboard user tabbing into the
field saw the field's chrome change and nothing else.

The fix gives the control its own ring, and keeps the wrapper glow as a
redundant second cue.

---

## Contrast: verified, deliberately unchanged

The brief proposed `#B8552F` as the accent. That value is **stale** —
the repo moved to `#b04e29` on 2026-10-30 precisely because the old
value failed on the warm cream background. Measured again here with
explicit WCAG relative-luminance arithmetic:

### Text pairs (need 4.5:1)

| Foreground | Background | Ratio | |
|---|---|---|---|
| `#211c16` | `#f6f1e7` | 15.02:1 | PASS |
| `#211c16` | `#fbf8f1` | 15.94:1 | PASS |
| `#6b6052` | `#f6f1e7` | 5.45:1 | PASS |
| `#6b6052` | `#fbf8f1` | 5.79:1 | PASS |
| `#b04e29` | `#f6f1e7` | 4.70:1 | PASS |
| `#b04e29` | `#fbf8f1` | 4.99:1 | PASS |
| `#94391e` | `#f6f1e7` | 6.52:1 | PASS |
| `#fbefe6` | `#b04e29` | 4.69:1 | PASS |
| `#fbefe6` | `#94391e` | 6.49:1 | PASS |

### Focus ring candidates (need 3:1 vs every adjacent surface)

| Candidate | on `--bg` | on `--card` | on white | |
|---|---|---|---|---|
| `#b04e29` (current `--accent`) | 4.70 | 4.99 | 5.29 | PASS |
| `#94391e` (current `--accent-dark`) | 6.52 | 6.92 | 7.33 | PASS |

### The stale value, for the record

```
#B8552F on --bg   4.26:1   ← FAILS AA (needs 4.5)
#B8552F on --card 4.52:1
#b04e29 on --bg   4.70:1   ← passes
#b04e29 on --card 4.99:1
```

**So: no token value changes in this PR.** What changes is that the
tokens are now *named* for the job they do, so the next person does not
have to re-derive this:

```css
--focus-ring: var(--accent);
--focus-ring-width: 2px;
--focus-ring-offset: 3px;
--target-min: 24px;
```

The recipes accent (herb green) is a separate PR and is **not** in this
one.

---

## The axe gate

**New file:** `scripts/hermes/axe-accessibility-gate.mjs`
**New CI job:** `a11y` in `.github/workflows/ci.yml`

### What it does

Builds the geo site against the in-repo mock API (the same way the
Docker build does — GHA runner IPs are blocked by the VPS firewall),
serves `apps/web/dist/` over a local static server, and runs axe-core
against 6 pages × 2 viewports:

| Page | Why |
|---|---|
| `/` | the Atlas home |
| `/about` | the lightest page — catches header-only defects |
| `/families` | the filter selects and checkboxes |
| `/regions` | the filter selects |
| `/lineages` | the lineage search input |
| `/dishes/empanada` | a dish page |

Viewports: **1280×800** (desktop — where the overlap reproduced) and
**393×851** (mobile — a different header code path, since the nav
collapses below 1200px).

Rule tags: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`,
`best-practice`. `target-size` is a WCAG 2.2 AA rule and is included
via the `wcag22aa` tag.

### What it fails on

| Check | Source |
|---|---|
| Every axe A/AA/best-practice violation | axe-core |
| A focusable element that paints no focus indicator | **the gate itself** — see below |

### Why the gate has its own focus check

axe-core 4.10.2 ships **104 rules, none of which match
`/focus|outline/`**. There is no axe rule for SC 2.4.7 Focus Visible.
A gate built only on axe would therefore have passed the production
site's seven indicator-less controls.

So the gate runs its own focus audit: it walks every focusable element,
focuses it, and checks whether the element itself paints an outline or
a box-shadow. `:focus-visible` is honoured, so a mouse click on a
control does not count as a failure — only a keyboard-reachable control
with no indicator does.

### Exclusions, and why each one exists

Every exclusion carries a reason string, and **the script fails if an
exclusion has no reason**. "Just disable the rule" cannot quietly
become the fix for a real defect.

| Rule | Reason |
|---|---|
| `landmark-no-duplicate-main` | PR 2 owns "one main landmark" — structure, not contrast |
| `landmark-main-is-top-level` | PR 2 |
| `landmark-unique` | PR 2 |
| `landmark-complementary-is-top-level` | PR 2 |
| `image-alt` | PR 5 owns dish-page alt text in the page language |

### The gate is proven to fail

A gate that cannot fail is worse than no gate. Three checks, all run:

**A. Against production (unfixed) — the gate FAILS:**

```
VIOLATION desktop /            [target-size] (serious) x2
VIOLATION desktop /about       [target-size] (serious) x2
VIOLATION desktop /families    [target-size] (serious) x2
VIOLATION desktop /regions     [target-size] (serious) x2
VIOLATION desktop /lineages    [target-size] (serious) x2
VIOLATION desktop /dishes/empanada [target-size] (serious) x2
axe gate: FAILED — 6 violation group(s).       exit 1
```

**B. Against this branch's build — the gate PASSES:**

```
ok   desktop /            (44 rules passed)
ok   desktop /about       (40 rules passed)
ok   desktop /families    (39 rules passed)
ok   desktop /regions     (39 rules passed)
ok   desktop /lineages    (39 rules passed)
ok   desktop /dishes/empanada (44 rules passed)
ok   mobile  /            (43 rules passed)
...
axe gate: PASSED — 0 violations across 6 pages x 2 viewports.
```

**C. Each defect class, re-introduced one at a time into the fixed
build** — the gate must catch each one:

| Defect re-introduced | Rule fired | Result |
|---|---|---|
| `.gs-submit` back to 22×14 | `target-size` | caught |
| `.gst-navlinks` back to `flex: 0 1 auto` | `target-size` | caught |
| `.gs-input:focus-visible` outline removed | `focus-visible` | caught |
| `.filt-select:focus-visible` outline removed | `focus-visible` | caught |
| `.filt-search:focus-visible` outline removed | `focus-visible` | caught |
| `.filt-toggle input:focus-visible` outline removed | `focus-visible` | caught |

```
ALL DEFECT CLASSES ARE CAUGHT
```

### The header at every width

Measured on the built site across 15 widths. "Clean" means: the nav row
does not scroll, nothing extends past the content padding, and no nav
link overlaps the right-hand block.

```
ok    961: scroll=961/961   pastRight=0  linkOverlap=0  nav=false mob=true  hdrH=69
ok   1000: scroll=1000/1000  pastRight=0  linkOverlap=0  nav=false mob=true  hdrH=69
ok   1100: scroll=1100/1100  pastRight=0  linkOverlap=0  nav=false mob=true  hdrH=69
ok   1199: scroll=1199/1199  pastRight=0  linkOverlap=0  nav=false mob=true  hdrH=69
ok   1200: scroll=1200/1200  pastRight=0  linkOverlap=0  nav=false mob=true  hdrH=69
ok   1201: scroll=1201/1201  pastRight=0  linkOverlap=0  nav=true  mob=false hdrH=69
ok   1210 … 1920 (9 widths):  pastRight=0  linkOverlap=0  nav=true  mob=false hdrH=69

ALL WIDTHS CLEAN
```

The header height is **69px at every width** — before and after. The
fix does not make the header taller; it makes the nav collapse earlier
instead of overlapping.

### The search button, measured

```
after (built): submit 24x24  |  svg glyph 14x14  |  form 164x36  |  meetsTargetSize: true
before (live):  submit 22x14  →  FAILS SC 2.5.8
```

---

## Before / after screenshots

Captured against production (before) and this branch's build (after),
at 1280×800.

| Page | Before | After |
|---|---|---|
| Home | `docs/screenshots/before/home-1280.png` | `docs/screenshots/after/home-1280.png` |
| Home header (close-up) | `docs/screenshots/before/home-1280-header.png` | `docs/screenshots/after/home-1280-header.png` |
| About | `docs/screenshots/before/about-1280.png` | `docs/screenshots/after/about-1280.png` |
| Families | `docs/screenshots/before/families-1280.png` | `docs/screenshots/after/families-1280.png` |
| Dish page | `docs/screenshots/before/dish-1280.png` | `docs/screenshots/after/dish-1280.png` |

The home page is 87,822px tall, so the home screenshot is viewport-only;
the header close-up is the element screenshot that shows the overlap.

---

## Files changed

```
apps/web/src/styles/global.css                        tokens + focus + target size + nav
apps/web/src/components/Nav.astro                     breakpoint 960px -> 1200px
scripts/hermes/axe-accessibility-gate.mjs             NEW — the gate
.github/workflows/ci.yml                              NEW — the a11y job
package.json                                          axe-core devDep + a11y:gate script
pnpm-lock.yaml                                        axe-core
```

No content, data, taxonomy or API change. No migration.

---

## Notes for the reviewer

- **This PR does not merge or deploy itself.** It opens, waits.
- The `a11y` job does **not** `continue-on-error`. A gate that can
  fail silently teaches everyone to ignore the red X.
- The a11y job `needs: [lint]` only — it does not need the API test
  job, because it builds the web site against a mock and does not
  touch the database.
- The recipe accent (herb green) is **not** here. It needs the
  contrast ratios in the table above, and it is a separate PR.
- The landmark structure (two `<main>` elements, the nested `<aside>`)
  is **PR 2**, and is excluded from the gate with that reason.
