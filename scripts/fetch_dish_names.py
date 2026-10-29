#!/usr/bin/env python3
"""Resolve the Wikidata items for the dishes, and fetch their names.

ADR-003 layer 2: "Seeded from Wikidata (CC0): P1705 (native label),
P1448 (official name), P2561 (romanization), plus the English article
title."

THE DISHES HAVE NO WIKIDATA ID. The link to one is the English
Wikipedia article, which the sources table already carries for most
dishes: https://en.wikipedia.org/wiki/Moussaka. The Wikipedia API
returns that article's wikibase_item, which IS the dish's Wikidata
QID.

So the pipeline is:

  1. the dish's English Wikipedia article (from the sources table, or
     from its canonical name) -> the Wikidata QID;
  2. that item's labels, aliases and sitelinks -> the names in every
     language;
  3. P1705 / P1448 / P2561 -> the native label, the official name and
     the romanization, which are the name KINDS.

THE THREE KINDS come from three different places, and this matters:

  - An ENDONYM is a name in the language the dish belongs to. It is
    the label of the Wikidata item in that language, so it comes from
    the sitelinks: the sitelink for `id.wikipedia.org` is the
    Indonesian name, for `ja.wikipedia.org` the Japanese one, and so
    on. Those are the dish's own names.
  - A ROMANIZATION is explicitly marked: P2561. It is the transliteration
    of the endonym into Latin script, so it gets script 'Latn'.
  - An EXONYM is a name for the dish in a language that is NOT the
    dish's own. The English label is the obvious one; the labels of
    the other language editions of the Wikipedia article are the
    rest.

WHAT MAKES A NAME PRIMARY: the endonym when the dish has one in that
language, else the exonym. Exactly one per (dish, language).

Output: /tmp/dish_names.json —
    { dish_slug: [ {language, script, name, kind, is_primary}, ... ] }
"""

import json
import pathlib
import re
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

OUT_PATH = pathlib.Path("/tmp/dish_names.json")
QID_PATH = pathlib.Path("/tmp/dish_qids.json")
UA = "gustale-reference-seed/1.0 (https://gustale.com)"

# The ISO 15924 script for a language's Wikipedia domain. The domain
# tells us the script for the non-Latin ones; Latin-script languages
# are 'Latn'.
LANGUAGE_SCRIPTS = {
    "ar": "Arab",
    "bn": "Beng",
    "el": "Grek",
    "he": "Hebr",
    "hi": "Deva",
    "ja": "Jpan",
    "ko": "Kore",
    "ru": "Cyrl",
    "ta": "Taml",
    "te": "Telu",
    "th": "Thai",
    "uk": "Cyrl",
    "zh": "Hans",
    "zh-yue": "Hant",
    "zh-classical": "Hant",
}

# The core locale set. English is the dishes table's canonical_name.
CORE_LOCALES = ["es", "de", "fr", "pt", "id", "zh", "ja", "ar", "hi"]


def api(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 503):
                time.sleep(8 * (attempt + 1))
                continue
            return None
        except Exception:
            time.sleep(5 * (attempt + 1))
    return None


def wp_api(host, **params):
    params = dict(params, format="json", formatversion="2")
    url = f"https://{host}/w/api.php?{urllib.parse.urlencode(params)}"
    return api(url)


# The script subtags Wikidata uses in its monolingual text tags, and
# the ISO 15924 code they mean. 'hani' is Han script (Hans or Hant
# depending on the language), 'hira' is Kana.
SCRIPT_TAGS = {
    "hani": "Hans",
    "hant": "Hant",
    "hira": "Jpan",
    "hans": "Hans",
    "latn": "Latn",
    "cyrl": "Cyrl",
    "arab": "Arab",
    "deva": "Deva",
}


def script_for(language):
    if language in LANGUAGE_SCRIPTS:
        return LANGUAGE_SCRIPTS[language]
    return "Latn"


def wikidata_qid_for_article(title):
    """The Wikidata QID of an English Wikipedia article."""
    data = wp_api("en.wikipedia.org", action="query", prop="pageprops",
                  titles=title, redirects="1")
    if not data:
        return None
    pages = (data.get("query") or {}).get("pages") or []
    for page in pages:
        qid = (page.get("pageprops") or {}).get("wikibase_item")
        if qid:
            return qid
    return None


def fetch_item(qid):
    """The item's labels, aliases and sitelinks."""
    data = api(f"https://www.wikidata.org/w/api.php?action=wbgetentities"
               f"&ids={qid}&props=labels|aliases|sitelinks&languages="
               f"{'|'.join(CORE_LOCALES)}|en|en-x-old"
               f"&sitefilter={'|'.join(f'{l}.wikipedia' for l in CORE_LOCALES)}"
               f"&format=json")
    if not data:
        return None
    return (data.get("entities") or {}).get(qid)


def romanization_of(qid):
    """P2561 — the romanization, with its script."""
    data = api(f"https://www.wikidata.org/w/api.php?action=wbgetclaims"
               f"&entity={qid}&property=P2561&format=json")
    if not data:
        return None
    claims = (data.get("claims") or {}).get("P2561") or []
    for claim in claims:
        value = (claim.get("mainsnak") or {}).get("datavalue") or {}
        if value.get("type") == "monolingualtext":
            text = (value.get("value") or {}).get("text")
            if text:
                return text.strip()
    return None


def native_labels_of(qid):
    """P1705 — the native label, which is the endonym.

    P1705's VALUE IS A MONOLINGUALTEXT, so it carries its own language
    tag: ('phở', 'vi'), ('寿司', 'ja-hani'), ('すし', 'ja-hira'). That
    tag is the whole point of the property - it says which language the
    name is written IN, which is what makes the name an endonym rather
    than an exonym.

    So this returns (language, text, script) triples, and the script
    comes from the tag's script subtag when it has one: 'ja-hani' is
    Han ('Hans'), 'ja-hira' is Kana ('Jpan').
    """
    data = api(f"https://www.wikidata.org/w/api.php?action=wbgetclaims"
               f"&entity={qid}&property=P1705&format=json")
    if not data:
        return []
    out = []
    for claim in (data.get("claims") or {}).get("P1705") or []:
        value = (claim.get("mainsnak") or {}).get("datavalue") or {}
        if value.get("type") != "monolingualtext":
            continue
        payload = value.get("value") or {}
        text = (payload.get("text") or "").strip()
        tag = (payload.get("language") or "").strip()
        if not text or not tag:
            continue
        language, _, script_tag = tag.partition("-")
        out.append((language, text, script_tag))
    return out


def official_names_of(qid):
    """P1448 — the official name, with its language tag."""
    data = api(f"https://www.wikidata.org/w/api.php?action=wbgetclaims"
               f"&entity={qid}&property=P1448&format=json")
    if not data:
        return []
    out = []
    for claim in (data.get("claims") or {}).get("P1448") or []:
        value = (claim.get("mainsnak") or {}).get("datavalue") or {}
        if value.get("type") != "monolingualtext":
            continue
        payload = value.get("value") or {}
        text = (payload.get("text") or "").strip()
        tag = (payload.get("language") or "").strip()
        if not text or not tag:
            continue
        language, _, script_tag = tag.partition("-")
        out.append((language, text, script_tag))
    return out


def names_for(qid, english_title):
    """The names for one dish, in every language we can find."""
    item = fetch_item(qid)
    if not item:
        return []

    labels = item.get("labels") or {}
    sitelinks = item.get("sitelinks") or {}

    candidates = {}

    def add(language, name, kind, script=None):
        if not name:
            return
        name = name.strip()
        if not name:
            return
        script = script or script_for(language)
        key = (language, script, name, kind)
        candidates[key] = {"language": language, "script": script,
                           "name": name, "kind": kind}

    # 1. The ENDONYMS: the sitelink titles. The sitelink for
    #    `idwiki` is the dish's Indonesian name, for `jawiki` its
    #    Japanese one. These are the dish's OWN names, in its own
    #    languages.
    #
    #    The KEY FORMAT MATTERS: the API returns 'eswiki', 'jawiki',
    #    'zhwiki' - no dot. The first attempt looked for
    #    'es.wikipedia' and matched nothing, so every name came out as
    #    an exonym and no endonym was ever found. The `sitefilter`
    #    parameter is also ignored by the API, so every sitelink comes
    #    back and the language has to be read off the key.
    for site, link in sitelinks.items():
        if not site.endswith("wiki"):
            continue
        language = site[: -len("wiki")]
        # 'zh_yue' and 'zh_classical' are the traditional-Chinese
        # editions; they are handled by the ZH mapping below.
        if language in ("zh_yue", "zh_classical"):
            language = "zh"
        if language not in CORE_LOCALES:
            continue
        add(language, link.get("title"), "endonym")

    # 2. The NATIVE LABELS: P1705. The language tag on each one says
    #    which language the name is written in, which is what makes it
    #    an endonym. 'phở' (vi), '寿司' (ja-hani), 'すし' (ja-hira).
    for language, text, script_tag in native_labels_of(qid):
        script = SCRIPT_TAGS.get(script_tag) if script_tag else None
        add(language, text, "endonym", script)

    # 3. The ROMANIZATION: P2561. It is a transliteration of the
    #    endonym into Latin script, so its script is Latn. The tag
    #    says which language it romanizes.
    data = api(f"https://www.wikidata.org/w/api.php?action=wbgetclaims"
               f"&entity={qid}&property=P2561&format=json")
    for claim in ((data or {}).get("claims") or {}).get("P2561") or []:
        value = (claim.get("mainsnak") or {}).get("datavalue") or {}
        if value.get("type") != "monolingualtext":
            continue
        payload = value.get("value") or {}
        text = (payload.get("text") or "").strip()
        tag = (payload.get("language") or "").strip()
        if not text or not tag:
            continue
        language, _, _ = tag.partition("-")
        add(language, text, "romanization", "Latn")

    # 4. The OFFICIAL name: P1448. It is the name the dish is formally
    #    known by, so it is the endonym in its own language.
    for language, text, script_tag in official_names_of(qid):
        script = SCRIPT_TAGS.get(script_tag) if script_tag else None
        add(language, text, "endonym", script)

    # 4. The EXONYMS: the item's labels in the core locales. A label in
    #    a language the dish does not have a sitelink for is a name for
    #    the dish used in THAT language - an exonym.
    for language in CORE_LOCALES:
        entry = labels.get(language)
        if not entry:
            continue
        value = (entry.get("value") or "").strip()
        if not value:
            continue
        # If the dish has an endonym in this language, the label is the
        # same thing and is already covered.
        already = any(
            c["language"] == language and c["name"] == value
            for c in candidates.values()
        )
        if already:
            continue
        add(language, value, "exonym")

    # The English name is the dish's canonical_name in the dishes
    # table, so English names are the exonyms.
    if english_title:
        add("en", english_title, "exonym")

    out = list(candidates.values())

    # ONE PRIMARY per (dish, language): the endonym when there is one,
    # else the exonym, else the romanization.
    by_language = {}
    for entry in out:
        by_language.setdefault(entry["language"], []).append(entry)
    for language, entries in by_language.items():
        order = {"endonym": 0, "exonym": 1, "romanization": 2}
        entries.sort(key=lambda e: order.get(e["kind"], 3))
        entries[0]["is_primary"] = True
        for entry in entries[1:]:
            entry["is_primary"] = False

    return out


def main():
    def q(sql):
        out = subprocess.run(["bash", "scripts/dbq.sh", sql],
                             capture_output=True, text=True, timeout=180)
        rows = []
        for line in out.stdout.splitlines():
            line = line.strip()
            if not line or "|" not in line:
                continue
            parts = [p.strip() for p in line.split("|")]
            if set(parts[0]) <= {"-", " ", "+"}:
                continue
            if parts[0] in ("slug", "count"):
                continue
            rows.append(parts)
        return rows

    # The dishes, with the English Wikipedia article for each: the
    # sources table's URL when it has one, otherwise the canonical
    # name.
    dishes = []
    # The citations table is polymorphic: (target_type, target_id).
    # There is no dish_citations table.
    for slug, canonical, url in q(
        "select d.slug, d.canonical_name, "
        "  (select s.url from citations c "
        "    join sources s on s.id = c.source_id "
        "   where c.target_type = 'dish' and c.target_id = d.id "
        "     and s.url like 'https://en.wikipedia.org/wiki/%' "
        "   order by c.id limit 1) "
        "from dishes d where d.status = 'published' order by d.slug;"
    ):
        title = None
        if url:
            # The URL's last segment is percent-encoded:
            # 'https://en.wikipedia.org/wiki/Acaraj%C3%A9'. It must be
            # decoded before it is used as an article title, or the
            # Wikipedia API finds no article and the dish gets no QID.
            title = urllib.parse.unquote(url.rsplit("/", 1)[-1])
        dishes.append({"slug": slug, "canonical": canonical, "title": title})

    print(f"{len(dishes)} published dishes")

    qids = {}
    names = {}
    stats = {"no_article": 0, "no_qid": 0, "no_names": 0, "ok": 0}

    for i, dish in enumerate(dishes):
        title = dish["title"] or dish["canonical"]
        qid = wikidata_qid_for_article(title)
        if not qid:
            stats["no_qid"] += 1
            continue
        qids[dish["slug"]] = qid
        found = names_for(qid, dish["canonical"])
        if not found:
            stats["no_names"] += 1
            continue
        names[dish["slug"]] = found
        stats["ok"] += 1
        if (i + 1) % 10 == 0:
            print(f"  {i + 1}/{len(dishes)} resolved")

    QID_PATH.write_text(json.dumps(qids, indent=1, ensure_ascii=False))
    OUT_PATH.write_text(json.dumps(names, indent=1, ensure_ascii=False))
    print(f"\nstats: {stats}")
    print(f"-> {QID_PATH}")
    print(f"-> {OUT_PATH}")

    total = sum(len(v) for v in names.values())
    print(f"{total} names across {len(names)} dishes")
    for locale in CORE_LOCALES:
        count = sum(
            1 for v in names.values()
            for n in v if n["language"] == locale
        )
        print(f"  {locale}: {count} names")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
