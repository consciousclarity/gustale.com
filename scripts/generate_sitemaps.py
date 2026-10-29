#!/usr/bin/env python3
"""Generate the per-locale sitemaps and the sitemap index.

ADR-003: "**Sitemap** — **Per-locale** sitemap, referenced from
`sitemap.xml` by index."

So the output is:

    sitemap.xml          the index, listing one sitemap per locale
    sitemap-en.xml       the English URLs
    sitemap-es.xml       the Spanish URLs
    ...

The URLs are read from the built dist/ directory, so the sitemap lists
exactly the pages that exist — no 404s in a sitemap, which is the whole
point of generating it from the build output rather than from the
database.

Each locale's sitemap lists that locale's pages, and every dish entry
carries the `xhtml:link` alternates for the other locales, so a search
engine that reads them learns the whole locale set from one entry.

Output: <dist>/sitemap.xml
        <dist>/sitemap-<locale>.xml
"""

import argparse
import pathlib
import sys
import xml.etree.ElementTree as ET

SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
XHTML_NS = "http://www.w3.org/1999/xhtml"

# The locales that get a sitemap. English is the base, at the root.
LOCALES = ["en", "es", "de", "fr", "pt", "id", "zh", "ja", "ar", "hi"]

# The pages that are not dish pages, per locale. The homepage and the
# dish list are in every locale.
SHARED_PAGES = ["", "dishes/"]


def site_origin(domain: str) -> str:
    return "https://gustale.com" if domain == "geo" else "https://gustale.recipes"


def locale_prefix(locale: str) -> str:
    """English is at the root; the others are prefixed."""
    return "" if locale == "en" else f"/{locale}"


def collect_dish_slugs(dist: pathlib.Path, domain: str) -> list[str]:
    """The dish slugs that exist in the build.

    The geo build flattens dist/dishes/<slug>/index.html to
    dist/dishes/<slug>.html; the recipes build keeps the nested form.
    Both are handled here.
    """
    slugs = set()
    dishes = dist / "dishes"
    if not dishes.exists():
        return []

    for entry in dishes.iterdir():
        if entry.is_dir():
            if (entry / "index.html").exists():
                slugs.add(entry.name)
        elif entry.suffix == ".html" and entry.name != "index.html":
            slugs.add(entry.stem)

    # The geo build drops /map/, and the recipes build drops nothing
    # else — but the locale pages are only on the geo domain for now.
    return sorted(slugs)


def url_entry(
    ET_: ET.ElementTree,
    parent: ET.Element,
    loc: str,
    alternates: dict[str, str],
    lastmod: str | None = None,
) -> None:
    url = ET_.SubElement(parent, f"{{{SITEMAP_NS}}}url")
    ET_.SubElement(url, f"{{{SITEMAP_NS}}}loc").text = loc
    if lastmod:
        ET_.SubElement(url, f"{{{SITEMAP_NS}}}lastmod").text = lastmod

    for locale, href in alternates.items():
        link = ET_.SubElement(url, f"{{{XHTML_NS}}}link")
        link.set("rel", "alternate")
        link.set("hreflang", locale)
        link.set("href", href)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dist", default="apps/web/dist")
    parser.add_argument("--domain", default="recipes")
    parser.add_argument("--locales", default=",".join(LOCALES))
    args = parser.parse_args()

    dist = pathlib.Path(args.dist)
    if not dist.exists():
        print(f"ERROR: {dist} does not exist - run the build first", file=sys.stderr)
        return 1

    origin = site_origin(args.domain)
    locales = [l.strip() for l in args.locales.split(",") if l.strip()]
    slugs = collect_dish_slugs(dist, args.domain)

    # The locale pages are only built for the geo domain for now, and
    # the sitemap must not list URLs that 404.
    if args.domain != "geo":
        locales = ["en"]

    print(f"[sitemap] domain={args.domain} origin={origin}")
    print(f"[sitemap] {len(slugs)} dishes, locales: {', '.join(locales)}")

    ET.register_namespace("", SITEMAP_NS)
    ET.register_namespace("xhtml", XHTML_NS)

    # ── the per-locale sitemaps ────────────────────────────────────────
    for locale in locales:
        root = ET.Element(f"{{{SITEMAP_NS}}}urlset")
        prefix = locale_prefix(locale)

        # The shared pages.
        for page in SHARED_PAGES:
            path = f"{prefix}/{page}" if page else f"{prefix}/"
            if path == "/":
                path = "/"
            url_entry(ET, root, f"{origin}{path}", {})

        # The dishes. Every entry carries the alternates, so one entry
        # tells a search engine the whole locale set.
        for slug in slugs:
            alternates = {
                l: f"{origin}{locale_prefix(l)}/dishes/{slug}" for l in locales
            }
            alternates["x-default"] = f"{origin}/dishes/{slug}"
            url_entry(
                ET, root, f"{origin}{prefix}/dishes/{slug}", alternates
            )

        out = dist / f"sitemap-{locale}.xml"
        ET.ElementTree(root).write(
            out, encoding="utf-8", xml_declaration=True
        )
        print(f"[sitemap] wrote {out.name} ({len(root)} urls)")

    # ── the index ──────────────────────────────────────────────────────
    index = ET.Element(f"{{{SITEMAP_NS}}}sitemapindex")
    for locale in locales:
        sm = ET.SubElement(index, f"{{{SITEMAP_NS}}}sitemap")
        ET.SubElement(sm, f"{{{SITEMAP_NS}}}loc").text = (
            f"{origin}/sitemap-{locale}.xml"
        )
        ET.SubElement(sm, f"{{{SITEMAP_NS}}}lastmod").text = "2026-10-29"

    out = dist / "sitemap.xml"
    ET.ElementTree(index).write(out, encoding="utf-8", xml_declaration=True)
    print(f"[sitemap] wrote {out.name} ({len(index)} sitemaps)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
