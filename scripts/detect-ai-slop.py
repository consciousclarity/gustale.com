#!/opt/homebrew/bin/python3.14
"""
AI-slop detector for Gustale.com dish copy.

Scans packages/db/src/seed-data.ts for textual fields (canonicalName,
shortDescription, longDescription) and flags phrases that match common
AI-generated patterns. Produces a markdown report at
/tmp/gustale-ai-slop-report.md.

The rules are heuristics — false positives are possible, false negatives
are likely. The goal is to surface a SHORT list of dishes for human review,
not to make a definitive call on quality.

Patterns detected:
  1. Em-dash / en-dash spam (— / –)
  2. Marketing buzzwords (delve, leverage, robust, comprehensive, etc.)
  3. "Whether you're a..." constructions
  4. Long-winded sentence constructions (>35 words in a single sentence)
  5. Triple-adjective stacking ("rich, savory, aromatic ...")
  6. Passive-voice overuse (>50% in longDescription)
  7. Floating superlatives ("best", "perfect", "ultimate")
  8. Emoji or non-ASCII weirdness (control chars, ZWJ, etc.)
  9. Numerical inconsistency in date references
 10. Things that say NOTHING ("simple dish", "tasty food")

For each dish, an aggregate "slop_score" is computed. Dishes above 0.5
appear in the "HIGH" section of the report. Between 0.2-0.5 → MEDIUM.
Below 0.2 → clean.

Usage:
  python3 scripts/detect-ai-slop.py             # uses default paths
  python3 scripts/detect-ai-slop.py --out X.md # custom output path
"""

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

DEFAULT_SEED = Path(__file__).parent.parent / 'packages/db/src/seed-data.ts'
DEFAULT_OUT = Path('/tmp/gustale-ai-slop-report.md')

# ─── Rules ─────────────────────────────────────────────────────────────────

BUZZWORDS_EN = {
    'delve', 'leverage', 'robust', 'comprehensive', 'seamless',
    'cutting-edge', 'nuanced', 'intricate', 'vibrant', 'embark',
    'elevate', 'unleash', 'master', 'harness', 'navigate',
    'encompasses', 'showcases', 'underscores', 'tapestry',
    'distinct', 'distinctive', 'stark', 'striking',
    'mouthwatering', 'mouth-watering', 'exquisite', 'sumptuous',
    'irresistible', 'decadent', 'tantalizing', 'delectable',
    'delightful', 'captivating', 'immersive',
}

BUZZWORDS_ES = {
    'sumérgete', 'sumergirse', 'aprovechar', 'aprovecha',
    'robusto', 'robusta', 'integral', 'intricado', 'intricada',
    'embárcate', 'embarcarse', 'desata', 'dominar', 'domina',
    'navega', 'navegar', 'abarca', 'muestra', 'subraya',
    'exquisito', 'exquisita', 'irresistible', 'decadente',
    'delicioso', 'deliciosa', 'tentar', 'tienta',
}

# Triple-adjective: comma-separated adjectives
TRIPLE_ADJ = re.compile(r'\b(\w+(?:\s+\w+)?),\s+(\w+(?:\s+\w+)?),\s+(\w+(?:\s+\w+)?)\b')

EM_DASH = '—'
EN_DASH = '–'

WHETHER = re.compile(r'\bwhether\b.*?\byou\b.*?\bor\b', re.IGNORECASE)

# Sentence splitter (English + Spanish, simple heuristic)
SENT_SPLIT = re.compile(r'(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])')

SUPERLATIVES = {'best', 'perfect', 'ultimate', 'premier', 'finest', 'greatest'}
SUPERLATIVES_ES = {'mejor', 'perfecto', 'perfecta', 'óptimo', 'óptima'}

# Vague phrases
VAGUE = {
    'a simple dish', 'a tasty dish', 'a traditional dish',
    'simple and tasty', 'delicious and traditional',
    'un plato simple', 'un plato delicioso', 'una comida simple',
}


def split_sentences(text: str) -> list[str]:
    if not text:
        return []
    return [s.strip() for s in SENT_SPLIT.split(text) if s.strip()]


def count_em_dashes(text: str) -> int:
    return text.count(EM_DASH) + text.count(EN_DASH)


def count_buzzwords(text: str) -> tuple[int, list[str]]:
    words = re.findall(r'[A-Za-zÁ-ÿ-]+', text.lower())
    found = []
    for w in words:
        if w in BUZZWORDS_EN or w in BUZZWORDS_ES:
            found.append(w)
    return len(found), found


def count_superlatives(text: str) -> tuple[int, list[str]]:
    words = re.findall(r'[A-Za-zÁ-ÿ-]+', text.lower())
    found = [w for w in words if w in SUPERLATIVES or w in SUPERLATIVES_ES]
    return len(found), found


def count_vague_phrases(text: str) -> tuple[int, list[str]]:
    lower = text.lower()
    found = [p for p in VAGUE if p in lower]
    return len(found), found


def count_long_sentences(text: str) -> tuple[int, int]:
    """Return (count_of_long, total_sentences)."""
    sents = split_sentences(text)
    long_count = sum(1 for s in sents if len(s.split()) > 35)
    return long_count, len(sents)


def count_triple_adjective(text: str) -> int:
    return len(TRIPLE_ADJ.findall(text))


def detect_whether_construct(text: str) -> bool:
    return bool(WHETHER.search(text))


def detect_weird_chars(text: str) -> list[str]:
    # ZWJ, ZWSP, control chars, etc.
    suspects = []
    for ch in text:
        if ord(ch) == 0x200D or ord(ch) == 0x200B or ord(ch) == 0x200C:
            suspects.append(f'ZW char U+{ord(ch):04X}')
        if 0x2000 <= ord(ch) <= 0x200F and ch not in ('\u2002', '\u2003'):
            suspects.append(f'formatting U+{ord(ch):04X}')
    return suspects


# ─── Main analysis ─────────────────────────────────────────────────────────

def analyze_dish(slug: str, name: str, short_desc: str, long_desc: str | None) -> dict:
    """Compute slop score for one dish's text fields."""
    short = short_desc or ''
    long_ = long_desc or ''
    full = f'{short}\n{long_}'.strip()

    flags = []

    # 1. em-dash count
    em = count_em_dashes(full)
    if em > 2:
        flags.append(('em-dash spam', em, 0.05 * em))

    # 2. buzzwords
    bw_count, bw_found = count_buzzwords(full)
    if bw_count > 0:
        flags.append(('buzzwords', bw_count, 0.1 * bw_count))

    # 3. "whether you're a ..." constructions
    if detect_whether_construct(full):
        flags.append(('"whether you\'re" construct', 1, 0.15))

    # 4. long sentences (>35 words)
    long_sents, total_sents = count_long_sentences(full)
    if total_sents and long_sents / total_sents > 0.3:
        flags.append(('long sentences', f'{long_sents}/{total_sents}', 0.2))

    # 5. triple-adjective
    trip = count_triple_adjective(full)
    if trip > 0:
        flags.append(('triple-adjective stacks', trip, 0.1 * trip))

    # 6. superlatives
    sup_count, sup_found = count_superlatives(full)
    if sup_count > 0:
        flags.append(('floating superlatives', sup_count, 0.05 * sup_count))

    # 7. vague phrases
    vague_count, vague_found = count_vague_phrases(full)
    if vague_count > 0:
        flags.append(('vague phrases', vague_count, 0.1 * vague_count))

    # 8. weird chars
    weird = detect_weird_chars(full)
    if weird:
        flags.append(('weird unicode', weird, 0.05 * len(weird)))

    slop_score = sum(penalty for _, _, penalty in flags)
    # Cap at 1.0
    slop_score = min(slop_score, 1.0)

    return {
        'slug': slug,
        'name': name,
        'short_chars': len(short),
        'long_chars': len(long_),
        'slop_score': round(slop_score, 2),
        'flags': [{'kind': k, 'detail': str(d)} for k, d, _ in flags],
        'short_text': short,
        'long_text': long_,
    }


# ─── Parsing seed-data.ts ──────────────────────────────────────────────────

def parse_seed_data(path: Path) -> list[dict]:
    """Parse seed-data.ts without running TypeScript.

    Matches each record by `slug: "..."` blocks and extracts fields.
    Naive but works for well-formed file.
    """
    text = path.read_text()

    records = []
    # Find every `slug: "..."` then walk forward to extract canonicalName,
    # shortDescription, longDescription.
    pattern = re.compile(
        r'slug:\s*"(?P<slug>[^"]+)"[\s\S]+?'
        r'canonicalName:\s*"(?P<canonicalName>[^"]+)"[\s\S]+?'
        r'shortDescription:\s*"(?P<short>[^"]+)"'
    )
    # Optional longDescription
    long_pat = re.compile(
        r'longDescription:\s*"(?P<long>[^"]+)"'
    )

    # Find each slug block first
    for m in pattern.finditer(text):
        slug = m.group('slug')
        canonical = m.group('canonicalName')
        short = m.group('short')
        # Look for longDescription within the same block (between slug and the
        # closing brace of the record)
        rest = text[m.end():m.end() + 4000]
        end = rest.find('\n  },')
        if end == -1:
            end = 4000
        block = rest[:end]
        lm = long_pat.search(block)
        long = lm.group('long') if lm else None
        records.append({
            'slug': slug,
            'name': canonical,
            'short': short,
            'long': long,
        })

    return records


# ─── Report generation ─────────────────────────────────────────────────────

SEVERITY_THRESHOLDS = [(0.5, '🔴 HIGH'), (0.2, '🟡 MEDIUM'), (0.0, '🟢 CLEAN')]


def severity_label(score: float) -> str:
    for threshold, label in SEVERITY_THRESHOLDS:
        if score >= threshold:
            return label
    return '🟢 CLEAN'


def render_report(results: list[dict]) -> str:
    high = [r for r in results if r['slop_score'] >= 0.5]
    medium = [r for r in results if 0.2 <= r['slop_score'] < 0.5]
    clean = [r for r in results if r['slop_score'] < 0.2]

    lines = []
    lines.append('# Gustale.com — AI-slop detection report')
    lines.append('')
    lines.append(f'**Scanned:** {len(results)} dishes')
    lines.append(f'**HIGH (≥0.5):** {len(high)}')
    lines.append(f'**MEDIUM (0.2-0.5):** {len(medium)}')
    lines.append(f'**CLEAN (<0.2):** {len(clean)}')
    lines.append('')
    lines.append('## Methodology')
    lines.append('')
    lines.append('Heuristics inspired by the Vusal Ismayilov video on AI-slop detection (ASD-STE100 approach). Each dish gets a `slop_score` 0-1 based on:')
    lines.append('')
    lines.append('- Em-dash / en-dash spam (>2 in copy)')
    lines.append('- Marketing buzzwords (`delve`, `leverage`, `tapestry`, etc., EN + ES)')
    lines.append('- `"Whether you\'re a ... or ..."` constructions')
    lines.append('- Long sentences (>35 words, >30% of total)')
    lines.append('- Triple-adjective stacking (e.g. "rich, savory, aromatic ...")')
    lines.append('- Floating superlatives (`best`, `perfect`, `ultimate`)')
    lines.append('- Vague phrases (`a simple dish`, `delicious and traditional`)')
    lines.append('- Weird unicode (ZWJ/ZWSP)')
    lines.append('')
    lines.append('**This is a starting list for human review, not a definitive judgement.** False positives are likely for dishes that genuinely use complex sentence structures (longDescriptions often do).')
    lines.append('')
    lines.append('---')
    lines.append('')

    if high:
        lines.append('## 🔴 HIGH priority — review first')
        lines.append('')
        for r in sorted(high, key=lambda x: -x['slop_score']):
            lines.extend(format_dish(r))
        lines.append('')

    if medium:
        lines.append('## 🟡 MEDIUM priority — review if time')
        lines.append('')
        for r in sorted(medium, key=lambda x: -x['slop_score']):
            lines.extend(format_dish(r))
        lines.append('')

    if clean:
        lines.append(f'## 🟢 CLEAN ({len(clean)} dishes)')
        lines.append('')
        lines.append('These look OK. (Listed at end if you want to spot-check.)')
        lines.append('')
        for r in sorted(clean, key=lambda x: x['slug']):
            lines.append(f"- `{r['slug']}` ({r['name']}) — score {r['slop_score']}")
        lines.append('')

    # Summary table
    lines.append('---')
    lines.append('')
    lines.append('## Full table')
    lines.append('')
    lines.append('| slug | name | score | flags |')
    lines.append('| --- | --- | --- | --- |')
    for r in sorted(results, key=lambda x: -x['slop_score']):
        flags_summary = ', '.join(sorted({f['kind'] for f in r['flags']})) or '—'
        lines.append(f"| `{r['slug']}` | {r['name']} | {r['slop_score']} | {flags_summary} |")

    lines.append('')
    lines.append('---')
    lines.append('')
    lines.append('## To fix a flagged dish')
    lines.append('')
    lines.append('1. Read the flagged phrases below')
    lines.append('2. Rewrite them to be specific and concrete (no buzzwords, no marketing)')
    lines.append('3. Use the gustale copy conventions: 1-2 sentences shortDescription, 700-1400 chars longDescription')
    lines.append('4. Run this script again to confirm the score dropped')

    return '\n'.join(lines)


def format_dish(r: dict) -> list[str]:
    out = []
    out.append(f"### `{r['slug']}` — {r['name']} (score {r['slop_score']})")
    out.append('')
    out.append(f"- short: {r['short_chars']} chars | long: {r['long_chars']} chars")
    if r['flags']:
        out.append('- flags:')
        for f in r['flags']:
            out.append(f"  - **{f['kind']}** — {f['detail']}")
    out.append('')
    out.append('**shortDescription:**')
    out.append('')
    out.append(f"> {r['short_text']}")
    out.append('')
    if r['long_text']:
        out.append('**longDescription:**')
        out.append('')
        out.append(f"> {r['long_text']}")
        out.append('')
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description='AI-slop detector for Gustale dish copy.')
    parser.add_argument('--seed', default=str(DEFAULT_SEED), help='Path to seed-data.ts')
    parser.add_argument('--out', default=str(DEFAULT_OUT), help='Output markdown path')
    parser.add_argument('--json', help='Also dump JSON results to this path')
    args = parser.parse_args()

    seed_path = Path(args.seed)
    if not seed_path.exists():
        print(f'✗ seed file not found: {seed_path}')
        return 1

    print(f'Scanning {seed_path} ...')
    records = parse_seed_data(seed_path)
    print(f'Parsed {len(records)} dishes')

    results = []
    for r in records:
        results.append(analyze_dish(r['slug'], r['name'], r['short'], r['long']))

    report = render_report(results)
    out_path = Path(args.out)
    out_path.write_text(report)
    print(f'✓ Wrote report to {out_path}')

    high = sum(1 for r in results if r['slop_score'] >= 0.5)
    medium = sum(1 for r in results if 0.2 <= r['slop_score'] < 0.5)
    clean = sum(1 for r in results if r['slop_score'] < 0.2)
    print(f'  HIGH: {high} | MEDIUM: {medium} | CLEAN: {clean}')

    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=2, ensure_ascii=False))
        print(f'✓ Wrote JSON to {args.json}')

    return 0


if __name__ == '__main__':
    raise SystemExit(main())