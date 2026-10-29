#!/usr/bin/env python3
"""Find the CJK translations that are model degeneration, not translation.

THE PROBLEM

A model can lose the script mid-generation and produce text that
LOOKS like the target language while carrying English — or a
half-formed token — straight through it. Real examples that reached
the catalogue:

    ナシゴレンは.ENGLISH_ID.
    today's samosas are a staple across India, Pakistan, Bangladesh,
      Nepal, and acro
    「Mie bakso」は黄色い麺とライスバーミンブリ Shilat served with
      yellow noodles and rice vermicelli
    マ{tabak}テルは、溶き卵、刻みねぎや青ねぎ、す minced 肉を Crete
      にABLESで焼いたものを
    gado-gadoはslides、METI diplomacy、narration、in the broader
      Indonesian sense.
    グラスゴーで発明されたことから、イギリスの国民料理Frequently
      considered a British national dish

None of these is recoverable. The beginning and the end are two
different sentences, and the middle is debris.

THE DETECTION

A Latin run inside CJK text is DEBRIS when:

  (a) it is an ALLCAPS run of four or more letters — a dish name is
      never shouted ('UTRANCE', 'ESO', 'PIN_POLICY_SERVING_PREFERENCE');
  (b) it is a word that is neither in the English source nor a
      capitalised proper noun of twenty characters or fewer, and it is
      long, or the row has an ALLCAPS run; or
  (c) it is a run of three or more Latin words containing an ordinary
      English function word — 'served with', 'are a staple' — which is
      an English PHRASE, not a name.

WHAT IS DELIBERATELY NOT FLAGGED

A Chinese or Japanese sentence legitimately KEEPS the original dish
name in Latin:

    Babi guling是巴厘岛式烤全猪。
    Bakso是印度尼西亚的肉丸汤或肉糜汤。
    Martabak manis 是一种以 apam balik 为基础制成的厚实甜味折叠煎饼
    经过几个世纪，葡萄牙的 carne de vinha d'alhos 逐渐演变成了 vindaloo。

Those are correct, and the detector knows the difference.

Usage:

    python3 scripts/find_cjk_debris.py --list
    python3 scripts/find_cjk_debris.py --ids
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# The English function words that mark a run as a PHRASE rather than a
# name. A name is 'Martabak manis' or 'ras el hanout'; a phrase is
# 'served with yellow noodles'.
FUNCTION_WORDS = (
    "with|and|are|is|was|the|of|in|for|to|a|an|that|this|served|"
    "staple|considered|across|generally|often|used|made|from|as|"
    "its|their|which|when|where|while|after|before|into|about"
)


def load_rows() -> list[dict]:
    """The CJK translations with a meaningful Latin ratio, plus their sources."""
    sql = """
    select json_agg(row_to_json(t)) from (
      select t.id, t.locale, t.text, s.text as src
        from description_sentence_translations t
        join description_sentences s on s.id = t.source_sentence_id
       where t.locale in ('ja','zh')
         and length(t.text) - length(regexp_replace(t.text, '[A-Za-z]', '', 'g')) > 6
         and (length(t.text) - length(regexp_replace(t.text, '[A-Za-z]', '', 'g'))::float
              / length(t.text)) > 0.12
    ) t;
    """
    out = subprocess.run(
        ["bash", str(REPO / "scripts" / "dbq.sh"), sql],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    for line in out.splitlines():
        line = line.strip()
        if line.startswith('[{"'):
            return json.loads(line)
    return []


def is_debris(text: str, source: str) -> str | None:
    """The reason this is debris, or None if it is a real translation."""
    source_words = set(w.lower().strip(".,") for w in source.split())
    latin = re.findall(r"[A-Za-z]{2,}", text)

    # (a) An ALLCAPS run.
    allcaps = [w for w in latin if w.isupper() and len(w) > 3]
    if allcaps:
        return f"an ALLCAPS run: {allcaps[:3]}"

    # (b) A word that is neither in the source nor a capitalised
    # proper noun.
    debris = []
    for word in latin:
        if word.lower() in source_words:
            continue
        if word[:1].isupper() and len(word) <= 20:
            continue
        debris.append(word)

    # (c) A run of three or more Latin words that contains an English
    # function word — a PHRASE, not a name.
    for match in re.finditer(r"[A-Za-z]{2,}[ ][A-Za-z]{2,}[ ][A-Za-z]{2,}", text):
        run = match.group(0)
        if re.search(rf"(?:^| )(?:{FUNCTION_WORDS})( |$)", run, re.IGNORECASE):
            # ...unless the run is the source's own name.
            if run.lower() in source.lower():
                continue
            return f"an English phrase: {run!r}"

    # (d) A long stray token.
    long_tokens = [w for w in debris if len(w) > 12]
    if long_tokens:
        return f"a long stray token: {long_tokens[:3]}"

    # (e) A two-word run where the second is capitalised and the first
    # is not — ' Frequently considered' — and one of the words is not
    # in the source.
    for match in re.finditer(r"[A-Za-z]{2,}[ ][A-Z][a-z]{2,}", text):
        run = match.group(0)
        if run[:1].isupper():
            continue
        words = run.split()
        if any(w.lower().strip(".,") not in source_words for w in words):
            if run.lower() in source.lower():
                continue
            return f"an English fragment: {run!r}"

    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--list", action="store_true", help="show the rows")
    parser.add_argument("--ids", action="store_true", help="only the ids")
    parser.add_argument("--sql", action="store_true", help="a DELETE statement")
    args = parser.parse_args()

    rows = load_rows()
    debris = []
    for row in rows:
        reason = is_debris(row["text"], row["src"])
        if reason:
            debris.append({**row, "reason": reason})

    print(f"[cjk-debris] {len(debris)} of {len(rows)} flagged rows are debris")
    for row in debris:
        print(f"  [{row['locale']}] {row['text'][:70]}")
        print(f"      {row['reason']}")

    if args.ids:
        for row in debris:
            print(row["id"])
    if args.sql:
        ids = ", ".join(f"'{r['id']}'" for r in debris)
        print(f"DELETE FROM description_sentence_translations WHERE id IN ({ids});")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
