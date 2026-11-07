#!/usr/bin/env python3
"""
Independently verify the recipes accent proposal's contrast ratios.

WHY THIS FILE EXISTS
--------------------
docs/RECIPES-ACCENT-PROPOSAL.md states a table of contrast ratios for
the proposed herb green. Those numbers were computed by the author of
the proposal. Applying a palette to a public site on the strength of
a number in a document is exactly the failure mode this project
exists to prevent: a doc that is wrong looks identical to a doc that
is right.

So: recompute every ratio from the WCAG 2.1 relative-luminance
definition, independently, and compare against what the doc claims.
Also check the recipes surface's actual token values, and — the part
that matters most — find every place in the CSS where accent-coloured
text sits on an accent-soft tint, because THAT is the combination the
proposal admits fails 4.5:1.

Reads the tokens from the CSS file; never prints a secret.
"""

import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parents[2] / "apps/web/src/styles/recipes-island.css"

# ── WCAG 2.1 relative luminance ────────────────────────────────────────


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = (srgb_to_linear(v / 255) for v in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg: tuple[int, int, int], bg: tuple[int, int, int]) -> float:
    l1, l2 = luminance(fg), luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def blend(fg: tuple[int, int, int], bg: tuple[int, int, int], alpha: float):
    """Composite fg at `alpha` over bg."""
    return tuple(round(f * alpha + b * (1 - alpha)) for f, b in zip(fg, bg))  # type: ignore[return-value]


# ── read the tokens from the CSS ───────────────────────────────────────

css = CSS.read_text()


GLOBAL_CSS = CSS.parent / "global.css"
global_css = GLOBAL_CSS.read_text() if GLOBAL_CSS.exists() else ""

# The SHIPPED theme. `recipes-island.css` holds the approved accent but
# is not in the build; `recipes-theme.css` is what actually reaches
# production. Both must agree, or the accent that ships is not the
# accent that was approved.
#
# This is checked, not assumed: the two files can drift, and a drift
# here is invisible until someone looks at the rendered site.
THEME_CSS = CSS.parent / "recipes-theme.css"
theme_css = THEME_CSS.read_text() if THEME_CSS.exists() else ""


def token(name: str) -> str:
    """Find a token in the recipes island, falling back to global.css.

    The recipes island defines its own --accent / --accent-ink /
    --accent-soft but INHERITS --accent-dark from global.css. A
    checker that only looked in one file would report a missing token
    as a fatal error, which is indistinguishable from a real defect.
    """
    m = re.search(rf"--{name}:\s*([^;]+);", css)
    if m:
        return m.group(1).strip()
    if global_css:
        m = re.search(rf"--{name}:\s*([^;]+);", global_css)
        if m:
            return m.group(1).strip() + "   (inherited from global.css)"
    sys.exit(f"token --{name} not found in {CSS} or {GLOBAL_CSS}")


def raw_token(name: str) -> str:
    """The token value with no annotation, for parsing."""
    return token(name).split("   (inherited")[0].strip()


def hex_token(name: str) -> tuple[int, int, int]:
    v = raw_token(name)
    if not v.startswith("#"):
        sys.exit(f"--{name} is not a hex colour: {v}")
    return hex_rgb(v)


def rgba_token(name: str):
    m = re.search(rf"--{name}:\s*rgba\(([^)]+)\)", css)
    if not m:
        sys.exit(f"--{name} is not an rgba colour: {raw_token(name)}")
    parts = [float(x) for x in m.group(1).split(",")]
    return parts[0], parts[1], parts[2], parts[3]  # r, g, b, alpha


print("=" * 72)
print("RECIPES ACCENT — independently recomputed contrast")
print("=" * 72)
print(f"  --accent      {token('accent')}")
print(f"  --accent-dark {token('accent-dark')}")
print(f"  --accent-ink  {token('accent-ink')}")
print(f"  --accent-soft {token('accent-soft')}")
print(f"  --bg          {token('bg')}")
print(f"  --card        {token('card')}")
print()

accent = hex_token("accent")
accent_dark = hex_token("accent-dark")
accent_ink = hex_token("accent-ink")
bg = hex_token("bg")
card = hex_token("card")
white = (255, 255, 255)

sr, sg, sb, salpha = rgba_token("accent-soft")
bg_blend = blend((sr, sg, sb), bg, salpha)
card_blend = blend((sr, sg, sb), card, salpha)
white_blend = blend((sr, sg, sb), white, salpha)

print("RATIOS — accent on each surface (text needs 4.5:1)")
print("-" * 72)
checks = [
    ("accent on white", accent, white, 4.5),
    ("accent on cream (--bg)", accent, bg, 4.5),
    ("accent on card (--card)", accent, card, 4.5),
    ("accent-ink on accent", accent_ink, accent, 4.5),
    ("accent-dark on white (hover)", accent_dark, white, 4.5),
    ("accent vs bg (focus ring, non-text)", accent, bg, 3.0),
    ("accent vs card (focus ring, non-text)", accent, card, 3.0),
]
all_pass = True
for label, fg, bgc, need in checks:
    r = contrast(fg, bgc)
    ok = r >= need
    all_pass &= ok
    print(f"  {label:<38} {r:>5.2f}:1  need {need}  {'PASS' if ok else 'FAIL'}")

print()
print("RATIOS — accent on its OWN soft tint (the known defect)")
print("-" * 72)
for label, bgc, note in [
    ("accent on --bg-blend", bg_blend, "surface tinted with --accent-soft"),
    ("accent on --card-blend", card_blend, "surface tinted with --accent-soft"),
    ("accent on white-blend", white_blend, "surface tinted with --accent-soft"),
]:
    r = contrast(accent, bgc)
    ok = r >= 4.5
    print(f"  {label:<38} {r:>5.2f}:1  {'PASS' if ok else 'FAIL'}  ({note})")

print()
print("THE ACTUAL PROBLEM: accent-coloured text sitting on an accent-soft background")
print("-" * 72)

# Parse the CSS into (selector, body) rules, then find every rule that
# sets an --accent-soft background, and every rule that sets accent-
# coloured text WHOSE SELECTOR TARGETS THAT ELEMENT OR A DESCENDANT
# OF IT.
#
# The descendant case is the one that matters: `.step .stime` sets the
# tint and `.step .stime b` sets accent-coloured text inside it. A
# checker that only looks inside the tinting rule's own body finds
# nothing and reports a clean sheet.

lines = css.split("\n")


def strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    return text


def parse_rules(text: str):
    """Yield (selector, body, line_no) for each top-level rule."""
    text = strip_comments(text)
    out = []
    i = 0
    line = 1
    n = len(text)
    while i < n:
        ch = text[i]
        if ch == "\n":
            line += 1
            i += 1
            continue
        if ch == "{":
            # walk back to the selector start
            j = i - 1
            while j >= 0 and text[j] not in ";}{}\n":
                j -= 1
            selector = text[j + 1 : i].strip()
            # find the matching close brace
            depth = 0
            k = i
            while k < n:
                if text[k] == "{":
                    depth += 1
                elif text[k] == "}":
                    depth -= 1
                    if depth == 0:
                        break
                k += 1
            body = text[i + 1 : k]
            out.append((selector, body, line))
            line += body.count("\n")
            i = k + 1
            continue
        i += 1
    return out


rules = parse_rules(css)

# Which selectors set an accent-soft BACKGROUND?
# "accent-soft" also appears in box-shadow, which paints a halo, not a
# surface — a text node does not sit on a box-shadow.
tinted = [
    (sel, body, ln)
    for (sel, body, ln) in rules
    if re.search(r"(?<![-\w])background\s*:[^;]*accent-soft", body)
]
# Which selectors set accent-coloured TEXT?
# A plain substring match would also catch "border-color: var(--accent)",
# which is a border, not text.
accent_text = [
    (sel, body, ln)
    for (sel, body, ln) in rules
    if re.search(r"(?<![-\w])color\s*:\s*var\(--accent\)", body)
]

print(f"  rules setting an --accent-soft background : {len(tinted)}")
for sel, _b, ln in tinted:
    print(f"      line {ln:>4}  {sel}")
print(f"  rules setting accent-coloured text        : {len(accent_text)}")
print()


def base_classes(selector: str) -> set[str]:
    return set(re.findall(r"\.([A-Za-z_][\w-]*)", selector))


def is_ancestor_or_self(tint_sel: str, txt_sel: str) -> bool:
    """Does the text rule target the tinted element or a descendant?

    A class-name intersection alone is not enough: `.world-item .pin`
    and `.world-item .wcd` are SIBLINGS — the `.pin` is not an
    ancestor of the `.wcd`, so the `.wcd` does not sit on the pin's
    tint. The text rule's selector must be the tint selector itself,
    or extend it with a descendant combinator.
    """
    # normalise: drop pseudo-classes/attributes for the comparison
    t = tint_sel.replace('[data-on="1"]', "").strip()
    x = txt_sel.replace('[data-on="1"]', "").strip()
    if x == t:
        return True
    # the text selector must start with the tint selector and continue
    # with a descendant/child combinator
    if x.startswith(t + " ") or x.startswith(t + ">"):
        return True
    return False


problems = []
for tint_sel, tint_body, tint_ln in tinted:
    if not base_classes(tint_sel):
        continue
    for txt_sel, txt_body, txt_ln in accent_text:
        if not base_classes(txt_sel):
            continue
        if is_ancestor_or_self(tint_sel, txt_sel):
            problems.append((tint_ln, tint_sel, txt_ln, txt_sel))

if problems:
    for tint_ln, tint_sel, txt_ln, txt_sel in problems:
        print()
        print(f"  !! the tint is set at line {tint_ln}: {tint_sel}")
        print(f"     and accent-coloured text at line {txt_ln}: {txt_sel}")
        print(
            f"     -> contrast {contrast(accent, bg_blend):.2f}:1 on the tinted surface, needs 4.5:1"
        )
    print()
    print(f"  -> {len(problems)} place(s) where accent-coloured text sits on the tint.")
else:
    print("  none found")

print()
print("=" * 72)

# ── the shipped theme must match the approved island ────────────────────
#
# `recipes-island.css` holds the approved accent. `recipes-theme.css` is
# what actually reaches production. If they drift, the accent that
# ships is not the accent that was approved -- and nothing else in the
# build would notice, because both files are individually valid CSS.
#
# So the agreement is CHECKED here, not assumed.
theme_ok = True
if theme_css:
    print("  THE SHIPPED THEME vs THE APPROVED ISLAND")
    for name in ("accent", "accent-dark", "accent-ink", "accent-soft"):
        island_m = re.search(rf"--{name}:\s*([^;]+);", css)
        theme_m = re.search(rf"--{name}:\s*([^;]+);", theme_css)
        island_v = island_m.group(1).strip() if island_m else None
        theme_v = theme_m.group(1).strip() if theme_m else None

        # The island may leave a token to global.css; in that case the
        # theme must not invent a value for it.
        if island_v is None:
            inherited = re.search(rf"--{name}:\s*([^;]+);", global_css)
            island_v = inherited.group(1).strip() if inherited else None
            island_v = f"{island_v} (from global.css)" if island_v else None

        if island_v and theme_v:
            # Compare the colour VALUE. The island's value may carry a
            # provenance note ("#327a2f   (from global.css)"), so the
            # note is stripped -- but NOT with split("("), which would
            # also eat the "rgba(" of a colour.
            island_pure = re.sub(r"\s+\(.*\)$", "", island_v).strip()
            theme_pure = re.sub(r"\s+\(.*\)$", "", theme_v).strip()
            if island_pure.lower() == theme_pure.lower():
                print(f"    OK   --{name}: {theme_v}")
            else:
                print(f"    FAIL --{name}: theme {theme_v} != island {island_v}")
                theme_ok = False
        elif theme_v and not island_v:
            print(f"    FAIL --{name}: the theme defines {theme_v} but the island defines nothing")
            theme_ok = False
        else:
            print(f"    --   --{name}: not overridden by the theme (inherited)")
    print()
else:
    print("  THE SHIPPED THEME: recipes-theme.css not found — the accent does NOT reach production")
    theme_ok = False
    print()

if all_pass and not problems and theme_ok:
    print("RESULT: every text ratio passes AND no accent-on-tint text exists AND the theme matches")
elif not theme_ok:
    print("RESULT: the shipped theme does NOT match the approved accent")
elif all_pass:
    print("RESULT: text ratios pass, but accent-on-tint text EXISTS — must be fixed")
else:
    print("RESULT: a text ratio FAILS — the accent must not be applied as-is")
print("=" * 72)

sys.exit(0 if (all_pass and not problems and theme_ok) else 1)
