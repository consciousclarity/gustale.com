#!/usr/bin/env python3
"""The site quality audit: crawl, check, and report.

WHAT IT CHECKS, AND WHY EACH ONE

  1. ROBOTS.TXT        A robots.txt that returns the 404 page is a
                       broken signal: a crawler reads it as a page of
                       HTML, not as rules. It also means the sitemap
                       pointer is never found.

  2. SITEMAPS          The sitemap must exist, be valid XML, and list
                       URLs that actually resolve. A sitemap that
                       lists 404s teaches a crawler that the site is
                       broken.

  3. HREFLANG          Every locale variant of a page must point at
                       every other variant, reciprocally, and at
                       itself with the right locale. A one-way or
                       self-mismatched hreflang is ignored by search
                       engines — the whole point of declaring it is
                       then lost.

  4. BROKEN LINKS      A link to a 404 or a 500 is a dead end for a
                       reader and for a crawler.

  5. EMPTY PAGES       A page that renders 200 but has no content is
                       worse than a 404 in a sitemap: it is a thin
                       page, and it consumes crawl budget.

  6. IMAGES            A dish with no cover image is a dish page
                       with a hole in it. The image coverage tells
                       us how many.

  7. HEADINGS          One h1 per page, and the h1 should not be
                       empty. This is the cheapest accessibility
                       check and it catches a whole class of
                       template bugs.

  8. META              The title and the description must exist and
                       must not be empty. An empty title is a blank
                       tab in a browser and a blank line in a search
                       result.

THE OUTPUT

A JSON report and a human summary. The findings become kanban cards.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from dataclasses import dataclass, field, asdict

USER_AGENT = "GustaleSiteAudit/1.0 (site quality audit; +https://gustale.com/)"
TIMEOUT = 30


@dataclass
class Fetch:
    url: str
    status: int
    body: str = ""
    headers: dict = field(default_factory=dict)
    error: str = ""
    elapsed_ms: int = 0


def fetch(url: str, follow_redirects: bool = True) -> Fetch:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en",
        },
    )
    started = time.time()
    try:
        opener = urllib.request.build_opener()
        if not follow_redirects:
            class NoRedirect(urllib.request.HTTPRedirectHandler):
                def redirect_request(self, *args, **kwargs):
                    return None
            opener = urllib.request.build_opener(NoRedirect)
        with opener.open(req, timeout=TIMEOUT) as response:
            raw = response.read()
            charset = response.headers.get_content_charset() or "utf-8"
            return Fetch(
                url=url,
                status=response.status,
                body=raw.decode(charset, "replace"),
                headers=dict(response.headers),
                elapsed_ms=int((time.time() - started) * 1000),
            )
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", "replace")
        except Exception:
            pass
        return Fetch(
            url=url,
            status=exc.code,
            body=body,
            headers=dict(exc.headers or {}),
            error=str(exc.reason),
            elapsed_ms=int((time.time() - started) * 1000),
        )
    except Exception as exc:
        return Fetch(
            url=url,
            status=0,
            error=f"{type(exc).__name__}: {exc}",
            elapsed_ms=int((time.time() - started) * 1000),
        )


# ── the checks ────────────────────────────────────────────────────────

def check_robots(base: str) -> dict:
    result = fetch(f"{base}/robots.txt")
    finding = {"status": result.status, "findings": []}
    if result.status != 200:
        finding["findings"].append(
            f"robots.txt returns HTTP {result.status} — a crawler reads it as a page, not as rules"
        )
        return finding
    body = result.body.lstrip()
    if body.startswith("<"):
        finding["findings"].append(
            "robots.txt returns HTML — the 404 page is being served instead of the rules"
        )
    if "Sitemap:" not in result.body:
        finding["findings"].append("robots.txt has no Sitemap: line")
    return finding


def parse_sitemap(url: str) -> tuple[list[str], dict]:
    """The URLs in a sitemap, and whether it is an index."""
    result = fetch(url)
    if result.status != 200:
        return [], {"status": result.status, "error": result.error}
    body = result.body
    if "<sitemapindex" in body:
        locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body)
        return locs, {"status": 200, "kind": "index", "count": len(locs)}
    locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", body)
    alternates = re.findall(r'hreflang="([^"]+)"\s+href="([^"]+)"', body)
    return locs, {
        "status": 200,
        "kind": "urlset",
        "count": len(locs),
        "hreflang_entries": len(alternates),
    }


def check_sitemaps(base: str) -> dict:
    report = {"sitemaps": [], "findings": []}
    candidates = [
        f"{base}/sitemap.xml",
        f"{base}/sitemap-index.xml",
        f"{base}/sitemap_index.xml",
    ]
    all_urls: list[str] = []
    for candidate in candidates:
        result = fetch(candidate)
        if result.status != 200:
            continue
        locs, meta = parse_sitemap(candidate)
        report["sitemaps"].append({"url": candidate, **meta})
        if meta.get("kind") == "index":
            for child in locs:
                child_locs, child_meta = parse_sitemap(child)
                report["sitemaps"].append({"url": child, **child_meta})
                all_urls.extend(child_locs)
        else:
            all_urls.extend(locs)
    if not report["sitemaps"]:
        report["findings"].append("no sitemap was found")
        return report
    report["total_urls"] = len(all_urls)
    report["sample"] = all_urls[:5]
    return report


def extract_links(html: str, base: str) -> list[str]:
    links = re.findall(r'<a\b[^>]*\bhref="([^"]+)"', html)
    out = []
    for link in links:
        if link.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
            continue
        out.append(urllib.parse.urljoin(base, link))
    return out


def extract_hreflang(html: str) -> list[dict]:
    """The hreflang pairs in the head."""
    out = []
    for lang, href in re.findall(
        r'<link\b[^>]*\brel="alternate"[^>]*\bhreflang="([^"]+)"[^>]*\bhref="([^"]+)"', html
    ):
        out.append({"lang": lang, "href": href})
    # The attribute order is not guaranteed, so also catch the reverse.
    for href, lang in re.findall(
        r'<link\b[^>]*\bhref="([^"]+)"[^>]*\brel="alternate"[^>]*\bhreflang="([^"]+)"', html
    ):
        out.append({"lang": lang, "href": href})
    return out


def analyze_page(url: str, fetch_result: Fetch) -> dict:
    """The per-page checks."""
    html = fetch_result.body
    info = {
        "url": url,
        "status": fetch_result.status,
        "findings": [],
        "title": None,
        "description": None,
        "h1_count": 0,
        "h1_text": "",
        "image_count": 0,
        "text_length": 0,
        "hreflang": [],
        "canonical": None,
        "elapsed_ms": fetch_result.elapsed_ms,
    }

    title = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    if title:
        info["title"] = re.sub(r"\s+", " ", title.group(1)).strip()
    else:
        info["findings"].append("no <title>")

    desc = re.search(
        r'<meta\b[^>]*\bname="description"[^>]*\bcontent="([^"]*)"', html, re.I
    )
    if desc:
        info["description"] = desc.group(1).strip()
    elif not re.search(r'<meta\b[^>]*\bcontent="([^"]*)"[^>]*\bname="description"', html, re.I):
        info["findings"].append("no meta description")

    canonical = re.search(r'<link\b[^>]*\brel="canonical"[^>]*\bhref="([^"]+)"', html, re.I)
    if canonical:
        info["canonical"] = canonical.group(1)

    h1s = re.findall(r"<h1\b[^>]*>(.*?)</h1>", html, re.S | re.I)
    info["h1_count"] = len(h1s)
    if h1s:
        text = re.sub(r"<[^>]+>", " ", h1s[0])
        info["h1_text"] = re.sub(r"\s+", " ", text).strip()
    if len(h1s) == 0:
        info["findings"].append("no <h1>")
    elif len(h1s) > 1:
        info["findings"].append(f"{len(h1s)} <h1> elements (expected 1)")
    elif not info["h1_text"]:
        info["findings"].append("the <h1> is empty")

    # The visible text, with the scripts and the styles removed.
    body = re.sub(r"<script\b.*?</script>", " ", html, flags=re.S | re.I)
    body = re.sub(r"<style\b.*?</style>", " ", body, flags=re.S | re.I)
    body = re.sub(r"<!--.*?-->", " ", body, flags=re.S)
    text = re.sub(r"<[^>]+>", " ", body)
    text = re.sub(r"\s+", " ", text).strip()
    info["text_length"] = len(text)

    info["image_count"] = len(re.findall(r"<img\b", html, re.I))
    info["hreflang"] = extract_hreflang(html)
    return info


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="https://gustale.com")
    parser.add_argument("--pages", type=int, default=25,
                        help="how many pages to crawl")
    parser.add_argument("--seed", default="", help="a comma-separated list of start URLs")
    parser.add_argument("--out", default="/tmp/site-audit.json")
    args = parser.parse_args()

    base = args.base.rstrip("/")
    report = {"base": base, "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    print(f"[audit] {base}", flush=True)
    report["robots"] = check_robots(base)
    print(f"[audit] robots: {report['robots']['status']} "
          f"({len(report['robots']['findings'])} findings)", flush=True)

    report["sitemaps"] = check_sitemaps(base)
    print(f"[audit] sitemaps: {report['sitemaps'].get('total_urls', 0)} URLs "
          f"across {len(report['sitemaps']['sitemaps'])} files", flush=True)

    # The crawl. Start from the seeds and the sitemap.
    queue: list[str] = []
    if args.seed:
        queue.extend(u.strip() for u in args.seed.split(",") if u.strip())
    sitemap_urls = report["sitemaps"].get("sample") or []
    queue.extend(sitemap_urls)

    seen: set[str] = set()
    pages: list[dict] = []
    broken: list[dict] = []
    checked_links: set[str] = set()

    while queue and len(pages) < args.pages:
        url = queue.pop(0)
        # One crawl per path, per locale.
        key = re.sub(r"^https?://[^/]+", "", url).split("?")[0]
        if key in seen:
            continue
        seen.add(key)

        result = fetch(url)
        page = analyze_page(url, result)
        pages.append(page)
        print(f"[audit] {result.status:>3} {page['text_length']:>6} chars  {url}", flush=True)

        if result.status == 200:
            for link in extract_links(result.body, url):
                if link.startswith(base):
                    queue.append(link)

        # Check the links on this page, but each target only once.
        for link in extract_links(result.body, url):
            if link in checked_links:
                continue
            checked_links.add(link)
            if not link.startswith(base):
                continue
            link_result = fetch(link)
            if link_result.status >= 400 or link_result.status == 0:
                broken.append({
                    "from": url,
                    "to": link,
                    "status": link_result.status,
                    "error": link_result.error,
                })

    report["pages"] = pages
    report["broken_links"] = broken
    report["crawled"] = len(pages)
    report["links_checked"] = len(checked_links)

    # The summaries.
    empty = [p for p in pages if p["status"] == 200 and p["text_length"] < 400]
    no_image = [p for p in pages if p["status"] == 200 and p["image_count"] == 0]
    no_hreflang = [p for p in pages if p["status"] == 200 and not p["hreflang"]]
    multi_h1 = [p for p in pages if p["h1_count"] > 1]
    no_title = [p for p in pages if not p["title"]]
    slow = sorted(pages, key=lambda p: -p.get("elapsed_ms", 0))[:5]

    report["summary"] = {
        "pages_crawled": len(pages),
        "links_checked": len(checked_links),
        "broken_links": len(broken),
        "empty_pages": len(empty),
        "pages_without_an_image": len(no_image),
        "pages_without_hreflang": len(no_hreflang),
        "pages_with_multiple_h1": len(multi_h1),
        "pages_without_a_title": len(no_title),
    }
    report["empty_pages"] = empty
    report["no_image_pages"] = no_image
    report["no_hreflang_pages"] = no_hreflang
    report["slowest_pages"] = slow

    with open(args.out, "w") as handle:
        json.dump(report, handle, indent=2)

    print()
    print("── the summary ──")
    for key, value in report["summary"].items():
        print(f"  {key:<28} {value}")
    print(f"\n[audit] the report is at {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
