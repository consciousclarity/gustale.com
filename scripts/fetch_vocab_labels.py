#!/usr/bin/env python3
"""Fetch the Wikidata labels for the vocabulary values, per locale.

ADR-003 layer 1: "Translate every controlled-vocabulary label once per
locale. Source: Wikidata labels (CC0) where available."

The core locale set is en, es, de, fr, pt, id, zh, ja, ar, hi. English
is the base table's own label and is NOT stored here, so this fetches
the other nine.

The API is `wbgetentities`, which takes up to 50 entities per call and
returns EVERY language's label in one response - so one call covers 50
values across all nine locales at once. For ~5,400 values that is
~110 calls, which is a light, ordinary use of the API.

Three locale details matter:

  - Chinese and Japanese need a script variant, or the label is
    ambiguous. 'zh' is simplified and 'zh-Hant' is traditional;
    'ja' is Japanese and 'ja-Latn' is the romanization. The core set
    asks for zh and ja, so those are fetched as 'zh' and 'ja'.
  - Arabic and Hindi are RTL. Wikidata stores them under 'ar' and
    'hi' with no variant, which is what the locale set asks for.
  - A label may be a monolingual text with a language tag that does
    not match the requested one (e.g. a Japanese-language label stored
    under 'ja' when 'en' was asked for). Those are skipped, not
    silently substituted.

Output: /tmp/vocab_labels.json —
    { vocabulary: { key: { locale: {"name": ..., "source": ...} } } }
"""

import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request

QID_PATH = pathlib.Path("/tmp/vocab_qids.json")
OUT_PATH = pathlib.Path("/tmp/vocab_labels.json")
UA = "gustale-reference-seed/1.0 (https://gustale.com)"

# The core locale set. English is the base table's own label, so it is
# not fetched and not stored.
CORE_LOCALES = ["es", "de", "fr", "pt", "id", "zh", "ja", "ar", "hi"]

# The language tags Wikidata uses for each locale we want. Usually the
# same, but a locale can be reached through more than one tag.
LOCALE_TAGS = {
    "es": ["es"],
    "de": ["de"],
    "fr": ["fr"],
    "pt": ["pt", "pt-BR", "pt-PT"],
    "id": ["id"],
    "zh": ["zh", "zh-Hans", "zh-CN"],
    "ja": ["ja"],
    "ar": ["ar"],
    "hi": ["hi", "hi-Latn"],
}

BATCH = 50


def api(ids, **params):
    params = dict(params, ids="|".join(ids), format="json")
    url = f"https://www.wikidata.org/w/api.php?{urllib.parse.urlencode(params)}"
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


def labels_for(entity):
    """Pull the labels for the locales we want out of one entity."""
    out = {}
    labels = entity.get("labels") or {}
    for locale, tags in LOCALE_TAGS.items():
        for tag in tags:
            entry = labels.get(tag)
            if not entry:
                continue
            value = (entry.get("value") or "").strip()
            if not value:
                continue
            out[locale] = {
                "name": value,
                # The tag it was actually found under, so a locale can be
                # traced to its source.
                "tag": tag,
                "source": "wikidata",
            }
            break
    return out


def main():
    if not QID_PATH.exists():
        print(f"ERROR: {QID_PATH} does not exist - run resolve_vocab_qids.py first")
        return 1

    resolved = json.loads(QID_PATH.read_text())

    # Flatten to a list of (vocabulary, key, qid), and build a reverse
    # map so the labels can be looked up by QID.
    items = []
    for vocab, mapping in resolved.items():
        for key, qid in mapping.items():
            items.append((vocab, key, qid))
    print(f"{len(items)} values with a QID to fetch")

    # Fetch in batches of 50.
    fetched = {}
    for i in range(0, len(items), BATCH):
        batch = items[i:i + BATCH]
        qids = sorted({qid for _, _, qid in batch})
        data = api(qids, action="wbgetentities", props="labels")
        if not data:
            print(f"  batch {i // BATCH + 1}: FAILED to fetch, skipping")
            continue
        entities = data.get("entities") or {}
        for vocab, key, qid in batch:
            entity = entities.get(qid)
            if not entity:
                continue
            labels = labels_for(entity)
            if labels:
                fetched.setdefault(vocab, {})[key] = labels
        if (i // BATCH) % 10 == 0:
            print(f"  {i + len(batch)}/{len(items)} fetched")

    OUT_PATH.write_text(json.dumps(fetched, indent=1, ensure_ascii=False))
    print(f"\nwrote {OUT_PATH}")
    total = sum(len(v) for v in fetched.values())
    print(f"{total} values have at least one non-English label")
    for vocab, mapping in fetched.items():
        counts = {}
        for labels in mapping.values():
            for locale in labels:
                counts[locale] = counts.get(locale, 0) + 1
        print(f"  {vocab:<22} {len(mapping):>5} values  {counts}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
