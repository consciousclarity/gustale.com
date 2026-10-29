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


def fetch_lead(title: str) -> str | None:
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

    missing = [
        row for row in pool
        if row.get("slug") and row.get("article") and row.get("slug") not in leads
    ]
    print(f"[leads] {len(leads)} cached, {len(missing)} to fetch")

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

    LEADS_FILE.write_text(json.dumps(leads, ensure_ascii=False, indent=1))
    print(f"[leads] fetched {fetched}; the cache now holds {len(leads)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
