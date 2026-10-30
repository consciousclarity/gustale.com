#!/usr/bin/env python3
"""Fetch cover images for the published dishes, with a licence.

WHAT THIS DOES

121 dishes are published; 11 of them had a cover image. The other 110
had none. This fetches a cover image for each of them from Wikimedia
Commons, checks the licence, and records the attribution alongside
the image so the page can show it.

THE LICENCE RULE — WHY AN IMAGE IS SKIPPED

The site's licence is CC-BY-SA-4.0 and it publishes under
AGPL-3.0. An image can only go on the site if:

  - its licence ALLOWS reuse (CC BY, CC BY-SA, CC0, or public
    domain), and
  - its licence REQUIRES attribution, the attribution is captured,
    and the credit line on the page carries it.

The licence set is checked, not assumed. An image whose licence is
"Fair use", "Non-free", "Copyrighted free use", or anything not in
the allow-list is SKIPPED — not shown with a warning, skipped. A
licence the pipeline cannot parse is also skipped, because an
unparseable licence is not a licence it can vouch for.

PD/CC0/CC-BY/CC-BY-SA images also carry the risk of being a
photograph of a PREPARED DISH rather than the dish itself. That is a
quality question, not a licence one, and the user asked for licence
discipline; the description is checked separately.

WHAT IT WRITES

Nothing to the database by itself. It writes a JSON plan
(`data/cover_images.json`) and the report. The upload and the
database write are a separate, explicit step.

THE OPTIMISATION

The site serves two widths — 800w and 1536w — as WebP. The upload
step produces both from the original, and stores the width map in
`media.variants`, the same shape the existing 11 covers use.

Usage:
    python3 scripts/fetch_cover_images.py --report
    python3 scripts/fetch_cover_images.py --fetch          # build the plan
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PLAN_FILE = REPO / "data" / "cover_images.json"

UA = "gustale-reference-work/1.0 (https://gustale.com)"

# The licences that may be used, with the label to show on the page.
#
# The key is the normalised `License` code from Commons' extmetadata.
# The value is what the page shows. Nothing outside this map is
# allowed through.
ALLOWED_LICENCES = {
    "cc-by-2.0": "CC BY 2.0",
    "cc-by-2.5": "CC BY 2.5",
    "cc-by-3.0": "CC BY 3.0",
    "cc-by-4.0": "CC BY 4.0",
    "cc-by-sa-2.0": "CC BY-SA 2.0",
    "cc-by-sa-2.5": "CC BY-SA 2.5",
    "cc-by-sa-3.0": "CC BY-SA 3.0",
    "cc-by-sa-4.0": "CC BY-SA 4.0",
    "cc0": "CC0",
    "public domain": "Public domain",
    "pd": "Public domain",
}

# The licences that are explicitly NOT usable.
#
# "fair use" and "non-free" are the two that matter: they are the
# licences that look like permission but are not. They are listed so
# that a report can say WHY an image was skipped, rather than just
# that it was.
#
# A BARE "attribution" IS ALSO REFUSED, and it used to be allowed.
#
# Commons reports `LicenseShortName = "Attribution"` with NO
# machine-readable `License` code when the uploader declared
# `{{Attribution}}` or a `Permission=` field without naming a
# Creative Commons licence. That is not a licence at all — it is the
# absence of one. Three real cases:
#
#   File:Asado 2005.jpg          "Copyright 2005 recetasgourmet.com.ar.
#                                 Permitido el uso del contenido citando
#                                 la fuente" — a copyright notice with
#                                 bespoke permission, NOT public domain
#   File:Baho.jpg                "Si tienes permiso no hay problema..."
#                                 — written permission from the author
#   File:Bingka kantang halus.jpg  no licence template at all
#
# Mapping "attribution" to "Public domain (attribution)" published a
# false licence claim on a live page. A missing licence must be
# refused, exactly like an unreadable one.
DENIED_LICENCE_MARKERS = ("fair use", "non-free", "nonfree", "copyrighted free use")

# A file name that says the image is a LOGO rather than a photograph.
#
# The file NAME is not a reliable signal — "Logo del Café" is a dish,
# "Choclologo" is a dish, and "brand_logo" is one word to a regex.
# The Commons IMAGE DESCRIPTION is, because whoever uploaded a logo
# says so:
#
#   File:Lance company logo.png      "Logo of Lance, Inc."
#   File:Extra_gum_brand_logo.png    "logo of the brand"
#
# Both are Wikipedia's lead image for a branded product, and neither
# is a picture of the food. The description is checked for the word
# "logo" (or "wordmark") used as a NOUN, which is how the description
# of a logo reads, and it is checked against the file name as a
# secondary signal.
#
# The description check is deliberately narrow: it fires on "logo"
# appearing as a standalone word. A dish description that merely
# mentions a logo ("a wrapper bearing the company logo") is about
# the food, and refusing it would cost a legitimate picture.
LOGO_DESCRIPTION_PATTERN = re.compile(
    r"\b(?:logo|wordmark|emblem)\b",
    re.IGNORECASE,
)

# A file name that says the image is a logo. Used only to BACK UP the
# description check, because a file named "..._brand_logo.png" is
# almost never a photograph.
LOGO_FILE_PATTERN = re.compile(
    r"(?:^|[^a-z])(?:brand|company|product|firm)[_ -]+logos?\b",
    re.IGNORECASE,
)

# A DESCRIPTION that is ABOUT a logo, rather than one that mentions
# one.
#
# "Logo of Lance, Inc." and "logo of the brand" describe the logo.
# "A wrapper bearing the company logo" describes a chocolate bar that
# happens to have a logo on it — that is a photograph of the food, and
# refusing it would cost a legitimate picture.
#
# So the pattern matches "logo" only where it is the HEAD of the
# description, or where it is immediately followed by a word that
# says what the logo belongs to.
#
# "Logo del Café" is a DISH, and its description starts with "Logo",
# so the head match needs a second condition: the word after "logo"
# must be a preposition or a company word, not a food word. "Logo
# of Lance, Inc." and "logo of the brand" both fit; "Logo del Café"
# does not.
LOGO_DESCRIPTION_PATTERN = re.compile(
    r"(?:"
    r"^\W*(?:the\s+|an\s+|a\s+)?logos?\s+(?:of|for|from)\b"   # "Logo of Lance, Inc."
    r"|\blogos?\s+of\s+the\b"                # "logo of the brand"
    r"|\b(?:wordmark|emblem)\b"
    r")",
    re.IGNORECASE,
)


def api(host: str, params: dict) -> dict:
    """One MediaWiki API call, with a backoff when it is rate-limited.

    Wikimedia answers 429 when too many requests arrive too quickly.
    The first run over 713 dishes hit that on 169 of them, and every
    one of those was recorded as "the Wikipedia lookup failed" — which
    is a skip, not a licence decision, and it silently threw away a
    fifth of the cover images.

    The retry waits and asks again. A 429 is a "not now", not a "no".
    """
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    delay = 2.0
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == 3:
                raise
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def strip_html(value: str | None) -> str:
    """The plain text of a Commons metadata field.

    Commons stores the artist and the credit as HTML fragments with
    links. The link is part of the attribution — "Steven Depolo" is
    not the full credit, the link to his Flickr is part of it — so
    the HTML is flattened to text with the link URL kept in
    parentheses.

    A protocol-relative URL ("//commons.wikimedia.org/...") is made
    absolute, because a bare "//" in a credit line reads as a
    mistake and some readers will not follow it.
    """
    if not value:
        return ""
    text = value
    # <a href="URL">TEXT</a> -> TEXT (URL)
    text = re.sub(
        r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        lambda m: f"{re.sub(r'<[^>]+>', '', m.group(2)).strip()} ({absolute_url(m.group(1))})",
        text,
        flags=re.S,
    )
    text = re.sub(r"<[^>]+>", " ", text)
    text = (
        text.replace("&amp;", "&")
        .replace("&quot;", '"')
        .replace("&#039;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
    )
    return re.sub(r"\s+", " ", text).strip()


def absolute_url(url: str) -> str:
    """A protocol-relative URL made absolute."""
    if url.startswith("//"):
        return "https:" + url
    return url


def normalise_licence(code: str | None, short: str | None) -> tuple[str | None, str]:
    """The licence label, or (None, reason) when it may not be used.

    The decision is made on the machine-readable `License` code first
    and the human `LicenseShortName` second. An unparseable licence
    is refused: the pipeline does not publish an image whose licence
    it could not read.
    """
    raw_code = (code or "").strip().lower()
    raw_short = (short or "").strip().lower()

    # A LICENCE PORTAL SUFFIX is not part of the licence.
    #
    # Commons tags a licence with the portal it was obtained through:
    # "cc-by-sa-2.0-kr" is the Korean CC BY-SA 2.0 portal, and it is
    # the same licence as "cc-by-sa-2.0". Likewise "cc-by-3.0-pl" is
    # the Polish CC BY 3.0 portal. The suffix is the two-letter
    # country code at the end, after a dash.
    #
    # Without this, 4 images were refused for a licence that IS in
    # the allowed set, purely because of where it was obtained.
    raw_code = re.sub(r"-[a-z]{2}$", "", raw_code)

    # The SHORT NAME is only stripped of a trailing country code when
    # what remains is still a licence we know. A blind strip is
    # dangerous: "public domain" ends in "in", so an unguarded
    # two-letter strip turns it into "public doma" and refuses a
    # perfectly good public-domain image.
    for key, label in ALLOWED_LICENCES.items():
        if raw_short == key or raw_short == label.lower():
            return label, ""
        stripped = re.sub(r"\s*[a-z]{2}$", "", raw_short).strip()
        if stripped and (stripped == key or stripped == label.lower()):
            return label, ""

    for marker in DENIED_LICENCE_MARKERS:
        if marker in raw_code or marker in raw_short:
            return None, f"the licence is {short or code} — not a reuse licence"

    if raw_code in ALLOWED_LICENCES:
        return ALLOWED_LICENCES[raw_code], ""

    if raw_code.startswith("pd") or raw_short.startswith("pd"):
        return "Public domain", ""
    if raw_short.startswith("cc0") or raw_short.startswith("cc-zero"):
        return "CC0", ""

    return None, f"the licence {short or code or '(none)'} is not in the allowed set"


def title_from_url(url: str) -> str:
    """The article title, read back out of its Wikipedia URL.

    `https://en.wikipedia.org/wiki/Abacha_(food)` gives "Abacha
    (food)". The underscores are spaces and the percent-escapes are
    decoded. A URL that is not a Wikipedia article URL gives "".
    """
    if not url:
        return ""
    m = re.search(r"/wiki/([^?#]+)", url)
    if not m:
        return ""
    return urllib.parse.unquote(m.group(1)).replace("_", " ")


def published_dishes() -> list[dict]:
    """The published dishes, with the Wikipedia title to look up.

    The title comes from the dish's own Wikipedia citation when it
    has one — that is the article the encyclopedia's entry is about,
    so its lead image is the right one. Otherwise the canonical name
    is used.

    `pool_a_batch` is selected so a caller can tell a Pool A dish
    from a legacy one. The two kinds carry their citation in
    different tables — the legacy dishes in `citations`, the Pool A
    ones in `claim_citations` — so the title lookup below has to
    consider both, and the batch number says which is which.

    THE ARTICLE TITLE COMES FROM THE URL, NOT THE SOURCE TITLE.

    `sources.title` for a Pool A dish is the dish's LABEL, not the
    article's title. "African Salad" is the label; the article is
    "Abacha (food)". "3-in-1" is the label; the article is
    "3-in-1 (fast food dish)". Looking up the label finds the wrong
    article or none at all — "3-in-1" resolves to "3-in-One Oil",
    and its lead image is a company's logo.

    The URL is exact. It is the address the citation points at, so
    the title is read back out of it.
    """
    sql = """
        select d.id::text as id,
               d.slug as slug,
               d.canonical_name as name,
               d.pool_a_batch as pool_a_batch,
               coalesce((
                   select s.url from citations c
                     join sources s on s.id = c.source_id
                    where c.target_id = d.id
                      and s.url like '%wikipedia.org/wiki/%'
                    order by c.id limit 1
               ), '') as legacy_url,
               coalesce((
                   select s.url from statements st
                     join claim_citations cc on cc.statement_id = st.id
                     join sources s on s.id = cc.source_id
                    where st.subject_type = 'dish' and st.subject_id = d.id
                      and s.url like '%wikipedia.org/wiki/%'
                    order by cc.id limit 1
               ), '') as pool_a_url
          from dishes d
         where d.status = 'published'
         order by d.slug
    """
    out = subprocess.run(
        ["bash", str(REPO / "scripts" / "dbq.sh"),
         "select coalesce(json_agg(row_to_json(t)), '[]'::json) from (" + sql + ") t"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    text = out.strip()
    start = text.find("[{")
    if start == -1:
        return []
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    return []


def already_have_cover(slugs: list[str]) -> set[str]:
    """The slugs that already have a cover, so they are not refetched."""
    if not slugs:
        return set()
    quoted = ",".join("'" + s.replace("'", "''") + "'" for s in slugs)
    sql = (
        "select coalesce(json_agg(row_to_json(t)), '[]'::json) from ("
        "select d.slug as slug from dishes d "
        "join media_attachments ma on ma.target_id = d.id "
        "where ma.role = 'cover' and d.slug in (" + quoted + ")"
        ") t"
    )
    out = subprocess.run(
        ["bash", str(REPO / "scripts" / "dbq.sh"), sql],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    text = out.strip()
    start = text.find("[{")
    if start == -1:
        return set()
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                return {r["slug"] for r in json.loads(text[start : i + 1])}
    return set()


def find_cover(dish: dict) -> dict:
    """The cover image for one dish, with its licence and attribution.

    Returns a record with either `status: "ok"` or a `status` and a
    `reason` explaining why there is no usable image.
    """
    slug = dish["slug"]
    # The article title comes from the citation's URL, which is the
    # exact article. `sources.title` is the dish's LABEL for a Pool A
    # dish ("African Salad" for an article called "Abacha (food)"),
    # and looking up the label finds the wrong article or none.
    url = dish.get("pool_a_url") or dish.get("legacy_url") or ""
    title = title_from_url(url) or dish["name"]

    record: dict = {"slug": slug, "name": dish["name"], "wiki_title": title}

    try:
        res = api(
            "en.wikipedia.org",
            {
                "action": "query",
                "prop": "pageimages",
                "piprop": "original|thumbnail",
                "pithumbsize": 1600,
                "titles": title,
                "format": "json",
                "redirects": 1,
            },
        )
    except Exception as exc:  # noqa: BLE001
        record.update(status="error", reason=f"the Wikipedia lookup failed: {exc}"[:200])
        return record

    pages = (res.get("query") or {}).get("pages") or {}
    page = None
    for value in pages.values():
        if "imageinfo" in value or "original" in value or "thumbnail" in value:
            page = value
            break
    if page is None or not (page.get("original") or page.get("thumbnail")):
        record.update(status="skipped", reason="the article has no lead image")
        return record

    source = page.get("original") or page.get("thumbnail")
    image_url = source.get("source", "")
    # The `original` source carries tracking parameters; strip them.
    image_url = image_url.split("?")[0]
    file_title = page.get("title", "")

    if not file_title.startswith("File:"):
        # The page title is the article title; the file name has to
        # come from the image URL, which carries the hashed path and
        # the file name.
        #
        # The hash path is ONE hex character, then TWO — "d/dc" for
        # Arepitas_Food_Macro.jpg — so the pattern is [0-9a-f]/[0-9a-f]{2}
        # and not two single characters. Getting that wrong made every
        # lookup resolve to an empty file title and every image skip.
        m = re.search(r"/wikipedia/commons/[0-9a-f]/[0-9a-f]{2}/([^/]+)$", image_url)
        if m:
            file_title = "File:" + urllib.parse.unquote(m.group(1))

    if not file_title.startswith("File:"):
        record.update(status="skipped", reason="the image file could not be identified")
        return record

    # The licence, from Commons.
    try:
        cres = api(
            "commons.wikimedia.org",
            {
                "action": "query",
                "titles": file_title,
                "prop": "imageinfo",
                "iiprop": "extmetadata|size|mime|url",
                "format": "json",
            },
        )
    except Exception as exc:  # noqa: BLE001
        record.update(status="error", reason=f"the Commons lookup failed: {exc}"[:200])
        return record

    cpages = (cres.get("query") or {}).get("pages") or {}
    info = None
    for value in cpages.values():
        if value.get("imageinfo"):
            info = value["imageinfo"][0]
            break
    if info is None:
        record.update(status="skipped", reason="the file has no licence metadata")
        return record

    meta = info.get("extmetadata") or {}
    licence, reason = normalise_licence(
        meta.get("License", {}).get("value"),
        meta.get("LicenseShortName", {}).get("value"),
    )
    if licence is None:
        record.update(status="skipped", reason=reason)
        return record

    artist = strip_html(meta.get("Artist", {}).get("value"))
    credit_raw = strip_html(meta.get("Credit", {}).get("value"))
    desc_raw = strip_html(meta.get("ImageDescription", {}).get("value"))

    # A BRAND OR COMPANY LOGO IS NOT A PICTURE OF THE FOOD.
    #
    # Wikipedia's lead image for a branded product is often the
    # company's logo rather than the product. Two real cases from
    # Pool A:
    #
    #   chewz      -> "File:Lance company logo.png"
    #                 ("Logo of Lance, Inc.") — the manufacturer, not
    #                 the candy
    #   extra-gum  -> "File:Extra_gum_brand_logo.png"
    #                 ("logo of the brand") — the wordmark, not the gum
    #
    # A page whose lead image is a logo has NO photograph of the
    # dish, so the honest outcome is the placeholder. The image is
    # refused by name rather than published as if it were the food.
    #
    # The DESCRIPTION is the signal, because whoever uploads a logo
    # says so. The file name is only a backstop: "Logo del Café" is
    # a dish, and "Choclologo" is a dish, so a bare "logo" in a name
    # is not enough.
    if LOGO_DESCRIPTION_PATTERN.search(desc_raw) or LOGO_FILE_PATTERN.search(file_title):
        record.update(
            status="skipped",
            reason=f"the lead image is a logo ({file_title}), not a picture of the dish",
        )
        return record

    # The credit line. The artist is the required part; the source
    # link to the file page is added so the attribution is
    # verifiable.
    file_page = (
        "https://commons.wikimedia.org/wiki/"
        + urllib.parse.quote(file_title.replace(" ", "_"))
    )
    credit = artist or "Unknown author"
    if credit_raw and credit_raw.lower() != credit.lower():
        credit = f"{credit} — {credit_raw}"
    credit = f"{credit} via Wikimedia Commons ({file_page})"

    record.update(
        status="ok",
        licence=licence,
        artist=artist,
        credit=credit,
        file_title=file_title,
        file_page=file_page,
        image_url=image_url,
        width=info.get("width") or source.get("width"),
        height=info.get("height") or source.get("height"),
        mime=info.get("mime"),
        description=desc_raw,
    )
    return record


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="build the plan")
    parser.add_argument("--report", action="store_true", help="report on the plan")
    parser.add_argument("--limit", type=int, default=0, help="only the first N")
    args = parser.parse_args()

    if args.report:
        plan = json.loads(PLAN_FILE.read_text())
    elif args.fetch:
        dishes = published_dishes()
        have = already_have_cover([d["slug"] for d in dishes])
        todo = [d for d in dishes if d["slug"] not in have]
        if args.limit:
            todo = todo[: args.limit]
        print(f"[images] {len(dishes)} published dishes, "
              f"{len(have)} already have a cover, {len(todo)} to look up")
        plan = []
        for index, dish in enumerate(todo, start=1):
            record = find_cover(dish)
            plan.append(record)
            mark = record["status"].upper()
            print(f"  [{index}/{len(todo)}] {record['slug']}: {mark}"
                  + (f" — {record.get('licence')}" if record["status"] == "ok"
                     else f" — {record.get('reason')}"))
            time.sleep(0.12)
        PLAN_FILE.write_text(json.dumps(plan, ensure_ascii=False, indent=1))
    else:
        parser.print_help()
        return 2

    ok = [r for r in plan if r["status"] == "ok"]
    skipped = [r for r in plan if r["status"] == "skipped"]
    errored = [r for r in plan if r["status"] == "error"]

    print()
    print("=" * 70)
    print(f"IMAGE PLAN — {len(plan)} dishes looked up")
    print(f"  usable          {len(ok)}")
    print(f"  skipped         {len(skipped)}")
    print(f"  errored         {len(errored)}")
    print("=" * 70)

    if skipped:
        print("\nSKIPPED — no image, or a licence that cannot be used:")
        for r in skipped:
            print(f"  {r['slug']}: {r['reason']}")
    if errored:
        print("\nERRORED:")
        for r in errored:
            print(f"  {r['slug']}: {r['reason']}")

    if ok:
        licences: dict[str, int] = {}
        for r in ok:
            licences[r["licence"]] = licences.get(r["licence"], 0) + 1
        print("\nTHE LICENCES:")
        for name, count in sorted(licences.items(), key=lambda kv: -kv[1]):
            print(f"  {count:3d}  {name}")
        print("\nTHREE EXAMPLES:")
        for r in ok[:3]:
            print(f"\n  --- {r['name']} ({r['slug']}) ---")
            print(f"  file:   {r['file_title']}")
            print(f"  licence:{r['licence']}")
            print(f"  credit: {r['credit'][:220]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
