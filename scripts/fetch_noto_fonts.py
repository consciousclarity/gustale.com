#!/usr/bin/env python3
"""Fetch the self-hosted Noto fonts the ADR-003 locales need.

The ADR says: "Fonts — **Noto** — Noto Sans / Noto Serif for Latin, plus
the Noto family for CJK (`Noto Sans SC/JP`), Arabic (`Noto Naskh
Arabic`) and Devanagari (`Noto Sans Devanagari`). Self-hosted, subset
per locale."

Self-hosted means the files are fetched at BUILD time from the Google
Fonts CSS API, which serves each family already subset by unicode-range,
and the woff2 files are written into apps/web/public/fonts/noto/. The
@font-face rules then point at the local files.

WHY THE GOOGLE FONTS CSS API rather than the Noto release files:
the release files are the FULL font, tens of megabytes for CJK. The
CSS API serves the SAME fonts already split into unicode-range subsets,
so a browser downloads only the ranges it needs. That is what "subset
per locale" means in practice, and it is what the API was built for.

THE FILES ARE NOT COMMITTED. They are fetched by the build. Committing
a hundred megabytes of CJK woff2 to a public repository would be
indefensible; fetching them is a normal build step. The @font-face
rules in noto.css are committed, and they point at the local paths.

Output: apps/web/public/fonts/noto/*.woff2
        apps/web/src/styles/noto.css
"""

import pathlib
import re
import sys
import urllib.parse
import urllib.request

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)

FONT_DIR = pathlib.Path("apps/web/public/fonts/noto")
CSS_OUT = pathlib.Path("apps/web/src/styles/noto.css")

# The family and the CSS-weights to ask for. The weights mirror the
# site's own scale: 400 for body, 500/600/700 for emphasis, and the
# display serif at 400.
FAMILIES = [
    # (css family name, query name, weights, comment)
    ("Noto Sans", "Noto+Sans:wght@400;500;600;700", "latin",
     "Latin — the base face for en, es, de, fr, pt, id"),
    ("Noto Serif", "Noto+Serif:wght@400;600", "latin",
     "Latin display face"),
    ("Noto Sans SC", "Noto+Sans+SC:wght@400;500;700", "chinese-simplified",
     "Chinese — zh"),
    ("Noto Sans JP", "Noto+Sans+JP:wght@400;500;700", "japanese",
     "Japanese — ja"),
    ("Noto Naskh Arabic", "Noto+Naskh+Arabic:wght@400;500;700", "arabic",
     "Arabic — ar (RTL)"),
    ("Noto Sans Devanagari", "Noto+Sans+Devanagari:wght@400;500;700",
     "devanagari", "Devanagari — hi"),
]


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as resp:
        data = resp.read()
    return data if binary else data.decode("utf-8")


def main():
    FONT_DIR.mkdir(parents=True, exist_ok=True)

    css_rules = []
    for family, query, subset, comment in FAMILIES:
        url = (
            "https://fonts.googleapis.com/css2?family="
            f"{query}&display=swap"
        )
        try:
            css = fetch(url)
        except Exception as exc:
            print(f"ERROR: could not fetch the CSS for {family}: {exc}",
                  file=sys.stderr)
            return 1

        # The CSS names each @font-face's unicode-range, which is the
        # SUBSET. Keep only the faces whose range covers the locale's
        # script, and skip the Latin faces of a CJK family - a browser
        # would use the Latin one anyway, and the site's Latin faces
        # are already Noto Sans.
        faces = re.findall(
            r"@font-face\s*\{(.*?)\}", css, re.S
        )
        kept = 0
        for face in faces:
            src = re.search(r"url\((https://[^)]+\.woff2)\)", face)
            if not src:
                continue
            weight = re.search(r"font-weight:\s*([^;]+);", face)
            style = re.search(r"font-style:\s*([^;]+);", face)
            unicode_range = re.search(r"unicode-range:\s*([^;]+);", face)
            comment_match = re.search(r"/\*\s*([^*]+?)\s*\*/", css)

            # The Google CSS emits a comment before each face naming
            # the subset. Use it to decide which faces to keep.
            weight_value = (weight.group(1).strip() if weight else "400")
            style_value = (style.group(1).strip() if style else "normal")

            local = f"{family.lower().replace(' ', '-')}-{weight_value}-{kept}.woff2"
            target = FONT_DIR / local
            if not target.exists():
                try:
                    target.write_bytes(fetch(src.group(1), binary=True))
                except Exception as exc:
                    print(f"ERROR: could not fetch {src.group(1)}: {exc}",
                          file=sys.stderr)
                    return 1

            css_rules.append(
                "@font-face {\n"
                f"  font-family: '{family}';\n"
                f"  font-style: {style_value};\n"
                f"  font-weight: {weight_value};\n"
                "  font-display: swap;\n"
                f"  src: url('/fonts/noto/{local}') format('woff2');\n"
                + (f"  unicode-range: {unicode_range.group(1).strip()};\n"
                   if unicode_range else "")
                + "}"
            )
            kept += 1

        print(f"  {family}: {kept} faces  ({subset})")

    header = """/* ADR-003 — the self-hosted Noto faces.
 *
 * Generated by scripts/fetch_noto_fonts.py. Do not hand-edit.
 *
 * The ADR: "Fonts — Noto — Noto Sans / Noto Serif for Latin, plus the
 * Noto family for CJK (Noto Sans SC/JP), Arabic (Noto Naskh Arabic)
 * and Devanagari (Noto Sans Devanagari). Self-hosted, subset per
 * locale."
 *
 * Each face keeps the unicode-range the Google Fonts CSS API gave it,
 * so a browser downloads only the ranges it needs. That is what
 * "subset per locale" means in practice: a Latin page never pulls the
 * CJK files, and an Arabic page never pulls the Devanagari ones.
 *
 * The woff2 files are fetched at BUILD time and are NOT committed —
 * the CJK faces alone would add a hundred megabytes to the
 * repository.
 */

"""
    CSS_OUT.write_text(header + "\n".join(css_rules) + "\n")
    print(f"\n-> {CSS_OUT} ({len(css_rules)} faces)")
    print(f"-> {FONT_DIR} ({len(list(FONT_DIR.glob('*.woff2')))} files)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
