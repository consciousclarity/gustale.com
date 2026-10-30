#!/usr/bin/env python3
"""Fetch the Wikipedia lead for every Pool A dish, and cache it.

WHY A CACHE

The similarity check compares the site's description against the
Wikipedia lead it was derived from. That comparison has to be
repeatable — a check that needs a live fetch every time is a check
that fails when Wikipedia is slow, and a gate that fails for the
wrong reason is a gate people disable.

So the leads are fetched ONCE, cached, and the check reads the
cache. The cache is the record of what the source actually said on
the day, which is what the attribution citation points at too.

Usage:

    python3 scripts/fetch_pool_a_leads.py            # fetch the missing ones
    python3 scripts/fetch_pool_a_leads.py --report   # just report
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
POOL_FILE = REPO / "data" / "pool_a.json"
LEADS_FILE = REPO / "data" / "pool_a_leads.json"

USER_AGENT = "gustale-reference-work/1.0 (https://gustale.com)"

# How many paragraphs of the article BODY to keep when the lead was
# too short to describe the dish. Two is enough to carry the
# what-and-how; the rest is history.
BODY_PARAGRAPHS = 2


def fetch_lead(title: str) -> str | None:
    """The lead of a Wikipedia article, or None.

    THE REST SUMMARY ENDPOINT IS NOT ALWAYS ENOUGH

    The REST summary endpoint (rest_v1/page/summary) returns a SHORT
    summary, and for some articles that summary is degenerate — for
    "Braaibroodjie" it returns the single character "'" with the
    description "South African cuisine". The article itself is fine.

    A one-character lead is not a lead. If it reached the similarity
    check, the check would compare the site's description against "'"
    and find it 100% different — which would mark a copied description
    as ORIGINAL. That is the worst possible failure for this check: it
    would wave through exactly the descriptions it exists to catch.

    So a degenerate extract is not accepted. The action API is asked
    for the full intro instead, which returns the real lead.
    """
    extract = _summary_extract(title)
    if extract and _is_degenerate(extract):
        extract = _action_extract(title)
    return extract


def _is_degenerate(extract: str) -> bool:
    """An extract too short or too broken to be a lead."""
    stripped = extract.strip()
    if len(stripped) < 40:
        return True
    # Mostly punctuation and quotes — the shape of a broken extract.
    letters = sum(1 for ch in stripped if ch.isalnum())
    return letters < len(stripped) * 0.3


def _summary_extract(title: str) -> str | None:
    url = (
        "https://en.wikipedia.org/api/rest_v1/page/summary/"
        + urllib.parse.quote(title.replace(" ", "_"))
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except Exception:
        return None
    extract = payload.get("extract")
    return extract.strip() if extract else None


def _action_extract(title: str) -> str | None:
    """The full intro, from the action API.

    The REST summary endpoint truncates; this one does not. It is the
    fallback for the articles whose summary is degenerate.
    """
    url = (
        "https://en.wikipedia.org/w/api.php?action=query&prop=extracts"
        "&exintro=1&explaintext=1&format=json&redirects=1&titles="
        + urllib.parse.quote(title.replace(" ", "_"))
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except Exception:
        return None
    pages = payload.get("query", {}).get("pages", {})
    for page in pages.values():
        extract = page.get("extract")
        if extract:
            return extract.strip()
    return None


def _action_extract_full(title: str) -> str | None:
    """The WHOLE article body, from the action API.

    `exintro=1` returns only the LEAD PARAGRAPH, and for an article
    that a dish's title REDIRECTS to, the lead paragraph can be about
    a different thing entirely.

    The case that matters: the dish "Baked ziti" redirects to the
    article "Ziti", which is about the PASTA SHAPE. Its lead is one
    sentence — "Ziti or zite is a shape of extruded pasta originating
    in the Italian region of Sicily." — and it says nothing at all
    about baking, the dish, or the sauce. No honest description of
    baked ziti can be written from it, because the facts are not
    there.

    But the BODY of that article does describe the baked preparation:
    "In baked macaroni dishes, these tubes are used unbroken". So
    for a lead that is short, the body is fetched as well, and the
    two are kept together — the lead first, then the rest of the
    article. The writer then has the facts, and the grounding check
    still decides what may be claimed.

    # This is only used when the lead is short. A long lead already
    # carries the substance, and pulling the whole article for every
    # dish would make the prompt enormous for no gain.
    #
    # The body is CAPPED. "Bai ye" redirects to "Tofu skin", whose
    # article runs to 6,122 characters — most of it history of the
    # use of tofu skin in Chinese, Korean and Japanese cooking. A
    # writer given all of it will start reaching for the parts that
    # are furthest from the dish, and the grounding check will then
    # reject the description for claiming something the dish does not
    # need. The first paragraphs carry the what-and-how; the rest is
    # history, which the lead paragraph usually does not cover
    # either, and which this project's evidence model would not let
    # the writer assert anyway.
    """
    url = (
        "https://en.wikipedia.org/w/api.php?action=query&prop=extracts"
        "&explaintext=1&format=json&redirects=1&titles="
        + urllib.parse.quote(title.replace(" ", "_"))
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except Exception:
        return None
    pages = payload.get("query", {}).get("pages", {})
    for page in pages.values():
        extract = page.get("extract")
        if not extract:
            continue
        paragraphs = [p.strip() for p in extract.strip().split("\n\n") if p.strip()]
        return "\n\n".join(paragraphs[:BODY_PARAGRAPHS]).strip()
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report", action="store_true")
    parser.add_argument("--delay", type=float, default=0.12)
    args = parser.parse_args()

    pool = json.loads(POOL_FILE.read_text())
    leads: dict[str, str] = {}
    if LEADS_FILE.exists():
        leads = json.loads(LEADS_FILE.read_text())

    # The slug is derived the SAME WAY the import derives it, by
    # importing the function rather than copying it — a second
    # implementation of a slug rule is a second chance to be wrong,
    # and a mismatch here would silently compare the wrong lead
    # against the wrong dish.
    sys.path.insert(0, str(REPO / "scripts"))
    from import_pool_a import slugify  # noqa: E402

    for row in pool:
        if "slug" not in row:
            row["slug"] = slugify(row.get("article") or row.get("label") or "")

    # A slug is "missing" if it is not cached AT ALL — OR if what is
    # cached is DEGENERATE.
    #
    # The second case is the one that matters. A degenerate lead (one
    # character, or mostly punctuation) is worse than no lead: the
    # similarity check compares against it and finds our description
    # 100% different, which marks a VERBATIM COPY as original. That is
    # the check waving through exactly what it exists to catch.
    #
    # Without this, a degenerate lead that had already been cached was
    # trusted forever — the fetcher skipped it as "already cached" and
    # never noticed. The cache has to be VALIDATED, not just present.
    degenerate_cached = [
        slug
        for slug, text in leads.items()
        if isinstance(text, str) and _is_degenerate(text)
    ]
    if degenerate_cached:
        shown = ", ".join(degenerate_cached[:8])
        more = "..." if len(degenerate_cached) > 8 else ""
        print(
            f"[leads] {len(degenerate_cached)} cached lead(s) are degenerate "
            f"and will be re-fetched: {shown}{more}"
        )

    missing = [
        row
        for row in pool
        if row.get("slug")
        and row.get("article")
        and (row["slug"] not in leads or row["slug"] in degenerate_cached)
    ]
    print(
        f"[leads] {len(leads)} cached "
        f"({len(leads) - len(degenerate_cached)} usable), "
        f"{len(missing)} to fetch"
    )

    if args.report:
        if leads:
            sample = list(leads.items())[:3]
            for slug, text in sample:
                print(f"  {slug}: {text[:90]}")
        return 0

    fetched = 0
    for row in missing:
        text = fetch_lead(row["article"])
        if text:
            leads[row["slug"]] = text
            fetched += 1
        time.sleep(args.delay)
        if fetched % 100 == 0 and fetched:
            print(f"[leads] {fetched}/{len(missing)}")
            LEADS_FILE.write_text(json.dumps(leads, ensure_ascii=False, indent=1))

    # ── Backfill the SHORT leads with the full article body ───────
    #
    # A lead under 200 characters is usually a dish whose article is
    # a REDIRECT to a differently-titled article, and the lead
    # paragraph of THAT article is about something else. "Baked ziti"
    # redirects to "Ziti", whose lead is one sentence about a pasta
    # shape and says nothing about baking.
    #
    # The body of the same article does carry the facts, so the body
    # is fetched and appended. Only short leads are affected: a long
    # lead already holds the substance, and fetching every article
    # in full would be a thousand large fetches for no gain.
    #
    # This runs as its own pass so the main fetch stays fast, and it
    # only ever APPENDS — a lead that already has its body is left
    # alone.
    short_slugs = [
        row
        for row in pool
        if row.get("slug")
        and row.get("article")
        and row["slug"] in leads
        and len(leads[row["slug"]]) < 200
        and "── full article ──" not in leads[row["slug"]]
    ]
    if short_slugs:
        print(f"[leads] backfilling {len(short_slugs)} short lead(s) with the article body")
        backfilled = 0
        for row in short_slugs:
            body = _action_extract_full(row["article"])
            if body and len(body) > len(leads[row["slug"]]):
                leads[row["slug"]] = (
                    leads[row["slug"]] + "\n\n── full article ──\n" + body
                )
                backfilled += 1
            time.sleep(args.delay)
            if backfilled % 50 == 0 and backfilled:
                print(f"[leads] backfilled {backfilled}/{len(short_slugs)}")
                LEADS_FILE.write_text(json.dumps(leads, ensure_ascii=False, indent=1))
        print(f"[leads] backfilled {backfilled}")

    LEADS_FILE.write_text(json.dumps(leads, ensure_ascii=False, indent=1))
    print(f"[leads] fetched {fetched}; the cache now holds {len(leads)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
