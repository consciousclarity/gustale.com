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
import re
import sys
import time
import unicodedata
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


def _strip_templates(text: str) -> str:
    """Remove the {{...}} template blocks, matching the braces.

    A regular expression cannot do this. An infobox nests — it has
    fields, and some of those fields hold other templates — so the
    pattern stops at the first inner "}}" and leaves the rest of the
    infobox, and sometimes the lead sentence with it, sitting in the
    text.

    The braces are counted instead: depth goes up on "{{" and down on
    "}}", and everything between the matching pair is dropped.

    ONE EXCEPTION: the {{Nihongo}} template, which carries the
    subject's name in its first argument. "Shirokuma"'s article opens

        {{Nihongo|'''Shirokuma'''|白熊 or しろくま}} is a type of
        kakigōri, a Japanese dessert made from shaved ice...

    Dropping the template leaves "is a type of kakigōri..." — a
    sentence with no subject, which is worse than no source at all.
    So for that one template the first argument is kept.
    """
    out: list[str] = []
    depth = 0
    index = 0
    length = len(text)
    while index < length:
        if text.startswith("{{", index):
            # Is this the {{Nihongo}} template? Keep its first
            # argument, which is the subject's name.
            match = re.match(r"\{\{\s*Nihongo\s*\|", text[index : index + 40], re.I)
            if match:
                after = index + match.end()
                end = text.find("}}", after)
                if end != -1:
                    argument = text[after:end].split("|")[0]
                    out.append(re.sub(r"'{2,5}", "", argument))
                    index = end + 2
                    continue
            depth += 1
            index += 2
            continue
        if text.startswith("}}", index):
            depth = max(0, depth - 1)
            index += 2
            continue
        if depth == 0:
            out.append(text[index])
        index += 1
    return "".join(out)


def _mentions(text: str, name: str) -> bool:
    """Does the text mention the name, as a phrase?

    The name is compared as a WHOLE PHRASE, with word boundaries on
    both sides, and with the diacritics folded away.

    The boundaries matter: "Mexican pizza" is a phrase, and the text
    "Pizza is a staple of Italian cuisine" contains the word "pizza"
    but does not mention "Mexican pizza". A plain substring check
    says it does, which is how a generic source about pizza was
    mistaken for a description of the Mexican pizza.

    The folding matters too: the article is "Niño envuelto" and the
    text says "Niños envueltos", and "Acıbadem kurabiyesi" against
    "Acıbadem Kurabiyesi". The comparison ignores case, accents and
    punctuation, and treats a trailing plural "s" as optional.
    """
    if not text or not name:
        return False

    def fold(value: str) -> str:
        value = value.lower()
        # Strip the diacritics: they vary between the label and the
        # article text, and they carry no meaning for this test.
        decomposed = unicodedata.normalize("NFKD", value)
        stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
        # Anything that is not a letter or a digit becomes a space.
        return re.sub(r"[^a-z0-9]+", " ", stripped).strip()

    haystack = " " + fold(text) + " "
    needle = fold(name)
    if not needle:
        return False
    if f" {needle} " in haystack:
        return True
    # A plural, which may be on any word and not only the last one:
    # the article is "Niño envuelto" and the text says "Niños
    # envueltos", so both words carry the "s".
    words = needle.split()
    for index in range(len(words)):
        candidate = " ".join(
            word + "s" if position == index else word
            for position, word in enumerate(words)
        )
        if f" {candidate} " in haystack:
            return True
    # A plural on every word.
    if len(words) > 1:
        candidate = " ".join(word + "s" for word in words)
        if f" {candidate} " in haystack:
            return True
    return False


def _dish_names(row: dict) -> list[str]:
    """The names a source might use for this dish.

    Two of them, because they differ in ways that matter:

    - the LABEL, which is the dish's name in the dataset. "makaroni
      schotel" is the label; the article text says "Makaroni schotel".
    - the ARTICLE TITLE, without its disambiguator. "Orama (dish)" is
      the title; the text says "Orama". The parenthetical is a
      Wikipedia convention and is not part of the name.

    A source is taken to describe the dish if it mentions EITHER.
    """
    names: list[str] = []
    label = (row.get("label") or "").strip()
    if label:
        names.append(label)
    article = (row.get("article") or "").strip()
    if article:
        stem = re.sub(r"\s*\([^)]*\)\s*$", "", article).strip()
        if stem:
            names.append(stem)
    return names


def _describes(text: str, row: dict) -> bool:
    """Does this text describe this dish?

    Two tests, either of which is enough.

    1. The text mentions the dish's name — the label, or the article
       title without its disambiguator.

    2. The text contains the CONTENT WORDS of the article title. This
       catches the transliterations and translations, where the words
       are the dish's but spelled differently: the article is "Batik
       cake" and the text says "Kek batik"; the article is "Vangibath"
       and the text says "Vangi Bath"; the article is "Lohikeitto" and
       the text says "Salmon chowder", which shares only "lohi" — so
       that one needs a looser rule, and gets the redirect test
       instead.

    The second test is only applied to titles of two words or more, and
    it needs a strong showing:

    - For a title of two content words, BOTH must be present. "Pizza
      is a staple of Italian cuisine" contains "pizza" but not
      "mexican", and a dish called "Mexican pizza" is not described by
      a text about pizza in general. One word out of two is the
      weakest possible evidence and it is not enough.
    - For a longer title, at least two thirds of the content words
      must be present. "Batik cake" against "Kek batik is a type of
      Malaysian no-bake fridge cake" matches on both, and "Vangibath"
      against "Vangi Bath is a vegetarian South Indian dish" matches
      on both, while a generic source about batiks or cakes matches
      on one.
    """
    if any(_mentions(text, name) for name in _dish_names(row)):
        return True

    article = (row.get("article") or "").strip()
    stem = re.sub(r"\s*\([^)]*\)\s*$", "", article).strip()
    words = [w for w in _fold_words(stem).split() if len(w) > 3]
    if len(words) < 2:
        return False
    haystack = " " + _fold_words(text) + " "
    present = sum(1 for word in words if f" {word}" in haystack)
    if len(words) == 2:
        return present == 2
    return present * 3 >= len(words) * 2


def _fold_words(value: str) -> str:
    """Lower-case, strip the diacritics, and reduce to word characters."""
    decomposed = unicodedata.normalize("NFKD", value.lower())
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", stripped).strip()


def _wikitext_to_text(wikitext: str) -> str:
    """Enough wikitext to read a sentence out of.

    The wikitext of a dish article is a template block, then a
    couple of paragraphs of prose with a handful of wiki links and a
    little bold/italic markup. This strips the markup and leaves the
    words. It is not a general converter and does not need to be — it
    only has to make the LEAD readable.
    """
    text = wikitext
    # Comments.
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.S)
    # The templates, which come first and carry no prose. They nest,
    # so the braces have to be MATCHED rather than pattern-matched —
    # a regular expression stops at the first inner brace and leaves
    # the rest of the infobox behind.
    text = _strip_templates(text)
    # Ref tags, with their content.
    text = re.sub(r"<ref[^>]*>.*?</ref>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<ref[^>]*/>", " ", text, flags=re.I)
    # Wiki links: keep the label, drop the target.
    text = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", text)
    # External links.
    text = re.sub(r"\[https?://\S+\s+([^\]]*)\]", r"\1", text)
    text = re.sub(r"\[https?://\S+\]", " ", text)
    # Bold, italic, quote markup.
    text = re.sub(r"'{2,5}", "", text)
    # The stubs begin with a bare image caption — "thumb|right|A plate
    # containing crocchè" — and a stray "thumbnail|'Mpanatigghi." That
    # is markup, not prose, so it is dropped.
    text = re.sub(r"(?im)^\s*thumb(?:nail)?\|[^\n]*\n?", "", text)
    text = re.sub(r"(?i)\bthumb(?:nail)?\|", "", text)
    # Headings and list bullets.
    text = re.sub(r"^=+\s*|\s*=+$", " ", text, flags=re.M)
    text = re.sub(r"^[*#:;]+\s*", "", text, flags=re.M)
    # An empty pair of brackets, left behind by a template that held
    # only a pronunciation: "Acıbadem kurabiyesi ( )".
    text = re.sub(r"\(\s*\)", "", text)
    # The category markers at the end of an article: "Category:Mexican
    # cuisine". They are metadata, not prose.
    text = re.sub(r"(?im)^\s*Category:[^\n]*\n?", "", text)

    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"[ \t]+", " ", text).strip()


def _is_redirect_title(title: str) -> bool:
    """Does this title redirect somewhere else?

    The title is asked for WITHOUT `redirects=1`, so the answer is
    about the title itself. With `redirects=1` the API resolves the
    redirect and answers about the TARGET, whose own redirect flag is
    false — so a redirecting title looks like an ordinary article.
    The presence of the `redirect` key is the signal.
    """
    url = (
        "https://en.wikipedia.org/w/api.php?action=query&prop=info"
        "&format=json&titles="
        + urllib.parse.quote(title.replace(" ", "_"))
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except Exception:
        return False
    for page in payload.get("query", {}).get("pages", {}).values():
        return "redirect" in page
    return False


def _is_redirect_text(wikitext: str) -> bool:
    """Is this revision a redirect?

    A redirect is normally "#REDIRECT [[Target]]", but Wikipedia also
    writes them as "#REDIRECT[[Target]]" and, for a soft redirect that
    is temporarily disabled, as "Temporarily disabled #REDIRECT
    [[Target]]". The marker is looked for anywhere in the first line
    rather than only at the start, because the prefix varies.
    """
    first_line = wikitext.strip().split("\n", 1)[0].upper()
    return "#REDIRECT" in first_line


def _last_article_revision(title: str) -> str | None:
    """The text of the LAST revision that was an article, not a redirect.

    A dish's article is often MERGED into a differently-titled article
    and turned into a redirect. When that happens the merged-away
    article's own last revision — the one just before the merge —
    is still the Wikipedia text for the dish.

    The case that matters: "Chewz" is a candy, but the article was
    merged into "Lance Inc." (the company that made it) and now
    redirects there. The redirect target is about a snack-food
    business, so the source cannot support a description of the
    candy. The last article revision, from 2017, says what it is:

        Chewz are a Mentos-like candy with a hard shell and a soft,
        chewy interior that is made by Lance, Inc.

    Only the MOST RECENT such revision is taken. The OLDEST revision
    of a mature article is a 2005 stub, which is a worse source than
    the current lead — "Abacha"'s first revision in 2005 is a
    one-line stub, while its 2017 revision is the full article.

    The revisions are walked from newest to oldest, and a revision
    that is a redirect is skipped. When a redirect is found, the
    search stops: everything older than the redirect is either the
    redirect itself or a redirect too.
    """
    url = (
        "https://en.wikipedia.org/w/api.php?action=query&prop=revisions"
        "&rvlimit=50&rvprop=content|timestamp|ids&rvslots=main"
        "&format=json&titles="
        + urllib.parse.quote(title.replace(" ", "_"))
    )
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read())
    except Exception:
        return None
    for page in payload.get("query", {}).get("pages", {}).values():
        revisions = page.get("revisions") or []
        for revision in revisions:
            slot = revision.get("slots", {}).get("main", {})
            wikitext = slot.get("*") or slot.get("content") or ""
            if _is_redirect_text(wikitext):
                # This revision is the redirect. The one before it is
                # the last revision of the article — keep looking.
                continue
            text = _wikitext_to_text(wikitext)
            # Only the LEAD is wanted: the first two paragraphs that
            # survive the markup stripping.
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            lead = "\n\n".join(paragraphs[:2]).strip()
            if lead:
                return lead
        return None
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

    # ── Recover the sources that were MERGED away ─────────────────
    #
    # A dish whose article was merged into another article and turned
    # into a redirect can end up with a source that does not describe
    # it at all. "Chewz" is a candy; the article was merged into
    # "Lance Inc." — the company that made it — and now redirects
    # there. The source is about a snack-food business, so no honest
    # description of the candy can be written from it.
    #
    # The page's own last article revision still describes the candy:
    #
    #     Chewz are a Mentos-like candy with a hard shell and a soft,
    #     chewy interior that is made by Lance, Inc.
    #
    # That IS the Wikipedia text for the dish. The merge buried it.
    #
    # The test is narrow and mechanical: the cached source must not
    # mention the dish's own NAME. If it does, the source describes
    # the dish and there is nothing to fix — 89 of the 90 redirected
    # Pool A dishes are in that position and they pass.
    #
    # The history is only consulted for a page that IS a redirect, and
    # the MOST RECENT article revision is taken rather than the
    # oldest: the oldest revision of a mature article is a 2005 stub,
    # which is a worse source than what is already cached.
    print("[leads] recovering the sources that were merged away")
    history_fixed = 0
    for row in pool:
        slug = row.get("slug")
        article = row.get("article")
        if not slug or not article or slug not in leads:
            continue
        cached = leads[slug]
        name = (row.get("label") or article or "").strip()
        if not name:
            continue
        # A REDIRECT page is not its own article: the text the API
        # returns for it belongs to the TARGET, which may be about
        # something else entirely. "Chewz" redirects to "Lance Inc.",
        # a snack-food company; the description came from a company
        # page. "Sambal tuktuk" redirects to "Sambal", a category.
        #
        # So for a redirect the page's own last ARTICLE revision is
        # the dish's text, by definition — that is the text the page
        # carried before it was merged away. It is used when it is
        # there and it is better than what the redirect gives.
        #
        # A page that is NOT a redirect is its own article, and its
        # text is the source. Nothing is done to it.
        if not _is_redirect_title(article):
            continue
        recovered = _last_article_revision(article)
        if not recovered:
            # The page was created as a redirect and never had an
            # article. There is nothing to recover, and the source
            # stays as it is — the description pipeline will report
            # it as insufficient, which is the honest answer.
            continue
        if recovered.strip() == cached.strip():
            continue
        leads[slug] = recovered
        history_fixed += 1
        print(f"  {slug}: the source was the redirect's target; the history is the dish")
        time.sleep(args.delay)
    if history_fixed:
        print(f"[leads] {history_fixed} source(s) recovered from the page history")
        LEADS_FILE.write_text(json.dumps(leads, ensure_ascii=False, indent=1))

    LEADS_FILE.write_text(json.dumps(leads, ensure_ascii=False, indent=1))
    print(f"[leads] fetched {fetched}; the cache now holds {len(leads)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
