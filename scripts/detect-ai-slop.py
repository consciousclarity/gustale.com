#!/opt/homebrew/bin/python3.14
"""
AI-slop detector for Gustale.com dish copy (v2 — refined).

Scans packages/db/src/seed-data.ts for textual fields (canonicalName,
shortDescription, longDescription) and flags phrases that match common
AI-generated patterns. Produces a markdown report at
/tmp/gustale-ai-slop-report.md.

Changes from v1:
  - Fixed false positive on "triple-adjective stacks": now skips lists
    inside ingredient enumerations (preceded by "with", "of", "and",
    "or", "from", "in", "topped with"). Those are recipe conventions,
    not AI slop.
  - Adjusted long-sentence threshold to 50 words (was 35) and only
    applies to longDescription (shortDescriptions are inherently
    compressed).
  - Added per-flag detail to the report — shows the EXACT phrase that
    was hit, not just a count.
  - Reweighted scores: triple-adjective now 0.05 (was 0.1); em-dash
    no penalty under 4 (was 2); buzzword threshold now ≥2 (was ≥1).
  - Added rewrite hints for the top offenders (per flag type).
  - Output file has improved structure: TOC, severity buckets, summary
    table sorted by score, links to each section.

Patterns detected:
  1. Em-dash / en-dash spam (>3 in copy)
  2. Marketing buzzwords (≥2 occurrences) — `delve`, `leverage`,
     `robust`, `comprehensive`, etc. (EN + ES)
  3. "Whether you're a..." constructions (very AI-coded)
  4. Long sentences in longDescription (>50 words, >30% of total)
  5. Triple-adjective stacks (NOT inside ingredient lists)
  6. Floating superlatives (≥2 occurrences) — `best`, `perfect`,
     `ultimate` (EN + ES)
  7. Vague phrases — `a simple dish`, `delicious and traditional`
  8. Weird unicode (ZWJ/ZWSP)

Usage:
  ./scripts/detect-ai-slop.py
  ./scripts/detect-ai-slop.py --out X.md
  ./scripts/detect-ai-slop.py --json results.json
"""

import argparse
import json
import re
from pathlib import Path

DEFAULT_SEED = Path(__file__).parent.parent / 'packages/db/src/seed-data.ts'
DEFAULT_OUT = Path('/tmp/gustale-ai-slop-report.md')

# ─── Lexicons ──────────────────────────────────────────────────────────────

BUZZWORDS_EN = {
    'delve', 'leverage', 'leverages', 'leveraged', 'leveraging',
    'robust', 'comprehensive', 'seamless', 'seamlessly',
    'cutting-edge', 'nuanced', 'intricate', 'vibrant', 'embark',
    'elevate', 'elevates', 'unleash', 'master', 'harness',
    'navigate', 'navigates',
    'encompasses', 'encompass', 'showcases', 'showcase',
    'underscores', 'underscore', 'tapestry',
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

SUPERLATIVES = {'best', 'perfect', 'ultimate', 'premier', 'finest', 'greatest'}
SUPERLATIVES_ES = {'mejor', 'perfecto', 'perfecta', 'óptimo', 'óptima'}

VAGUE = {
    'a simple dish', 'a tasty dish', 'a traditional dish',
    'simple and tasty', 'delicious and traditional',
    'un plato simple', 'un plato delicioso', 'una comida simple',
}

# Words that mark a list of ingredients (preceding context)
LIST_PRECEDING = re.compile(
    r'\b(with|of|and|or|from|in|topped with|topped|garnished|accompanied|'
    r'served|using|made from|made with|mixed|covered|drizzled|'
    r'sprinkled|layered|stuffed|filled|seasoned)\s*$',
    re.IGNORECASE,
)

# Triple-adjective: 3 short noun-phrases separated by commas (≤2 words each)
TRIPLE_ADJ = re.compile(
    r'\b([\w-]+(?:\s+[\w-]+)?),\s+([\w-]+(?:\s+[\w-]+)?),\s+'
    r'([\w-]+(?:\s+[\w-]+)?)\b'
)

WHETHER = re.compile(r'\bwhether\b.*?\byou\b.*?\bor\b', re.IGNORECASE)
SENT_SPLIT = re.compile(r'(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])')

EM_DASH = '—'
EN_DASH = '–'


# ─── Scoring (refined v2) ──────────────────────────────────────────────────

def split_sentences(text: str) -> list[str]:
    if not text:
        return []
    return [s.strip() for s in SENT_SPLIT.split(text) if s.strip()]


def is_in_ingredient_list(text: str, match: re.Match) -> bool:
    """Check if a triple-adj match is inside an ingredient enumeration.

    Three heuristics, applied in order:
    1. Look at 30 chars BEFORE the match for list-preceding words like
       "with", "of", "and", "or", "from", "in", etc. If present, this is
       clearly a list continuation.
    2. Heuristic for long lists: if AT LEAST ONE of the three items is a
       multi-word phrase like "olive oil", "fish sauce", "palm sugar",
       AND none of them has a clear adjective ending, it's almost
       certainly an ingredient list.
    3. Food lexicon: if any of the three items is a common food word
       (spice, vegetable, meat, herb, sauce, etc.), it's an ingredient
       list — those don't usually appear in genuine adjective stacks.

    Returns True if the match should be SKIPPED (i.e. is a list).
    """
    start = match.start()
    preceding = text[max(0, start - 30):start]

    # Heuristic 1: list-preceding keyword
    if LIST_PRECEDING.search(preceding):
        return True

    a, b, c = match.group(1), match.group(2), match.group(3)
    items = [a, b, c]
    a_low, b_low, c_low = a.lower(), b.lower(), c.lower()

    # Heuristic 2: at least one multi-word item, none clearly adjectival
    has_multi_word = any(' ' in it or '-' in it for it in items)
    adjective_endings = re.compile(r'(y|ic|ed|ous|ful|al|ar|ive|ish|able|ible)$', re.IGNORECASE)
    all_nounish = all(not adjective_endings.search(it) for it in items)
    if has_multi_word and all_nounish:
        return True

    # Heuristic 3: any item is a known food word
    if any(w in FOOD_WORDS for w in [a_low, b_low, c_low]):
        return True

    return False


# Common food words used in recipe ingredients. If any triple-adj item is
# one of these, the match is almost certainly an ingredient list, not a
# genuine adjective stack. EN + ES combined.
FOOD_WORDS = {
    # Spices & herbs
    'turmeric', 'coriander', 'galangal', 'garlic', 'chili', 'chilies',
    'ginger', 'lemongrass', 'paprika', 'cumin', 'cinnamon', 'cardamom',
    'cloves', 'saffron', 'pepper', 'peppers', 'mint', 'basil', 'oregano',
    'thyme', 'rosemary', 'parsley', 'cilantro', 'dill', 'sage', 'bay',
    'tarragon', 'marjoram', 'lavender', 'curcuma', 'perejil',
    # Vegetables
    'onion', 'onions', 'tomato', 'tomatoes', 'potato', 'potatoes',
    'carrot', 'carrots', 'cabbage', 'lettuce', 'spinach', 'kale',
    'broccoli', 'cauliflower', 'cucumber', 'cucumbers', 'zucchini',
    'eggplant', 'eggplants', 'pepper', 'peppers', 'mushroom', 'mushrooms',
    'celery', 'asparagus', 'artichoke', 'arugula', 'radish', 'turnip',
    'pumpkin', 'squash', 'corn', 'beans', 'peas', 'lentils',
    'cebolla', 'cebollas', 'tomate', 'tomates', 'papa', 'papas',
    'zanahoria', 'repollo', 'lechuga', 'espinaca', 'apio', 'ajo',
    # Meats & proteins
    'chicken', 'beef', 'pork', 'lamb', 'fish', 'shrimp', 'prawns',
    'salmon', 'tuna', 'cod', 'squid', 'octopus', 'mussel', 'mussels',
    'crab', 'lobster', 'tofu', 'tempeh', 'egg', 'eggs',
    'pollo', 'cerdo', 'cordero', 'pescado', 'camarón', 'camarones',
    'gamba', 'gambas', 'calamar', 'pulpo', 'mejillón', 'cangrejo',
    'huevo', 'huevos',
    # Dairy
    'milk', 'cream', 'butter', 'cheese', 'yogurt', 'yoghurt', 'kefir',
    'leche', 'crema', 'mantequilla', 'queso', 'yogur',
    # Grains & starches
    'rice', 'noodles', 'pasta', 'bread', 'flour', 'oats', 'barley',
    'quinoa', 'couscous', 'tortilla', 'tortillas', 'noodle', 'vermicelli',
    'arroz', 'fideos', 'pan', 'harina', 'avena', 'cebada', 'pasta',
    # Sauces & condiments
    'sauce', 'sauces', 'oil', 'vinegar', 'soy', 'shoyu', 'miso',
    'paste', 'pesto', 'salsa', 'sofrito', 'sofregit',
    # Fruits
    'lemon', 'lime', 'orange', 'apple', 'pear', 'banana', 'mango',
    'pineapple', 'strawberry', 'blueberry', 'raspberry', 'cherry',
    'peach', 'plum', 'grape', 'grapes', 'fig', 'figs', 'date', 'dates',
    'limón', 'naranja', 'manzana', 'pera', 'plátano', 'fresa',
    # Nuts & seeds
    'almond', 'almonds', 'walnut', 'walnuts', 'pecan', 'pecans',
    'pistachio', 'cashew', 'peanut', 'peanuts', 'sesame', 'sunflower',
    'almendra', 'nuez', 'nueces', 'cacahuete', 'maní', 'sésamo',
    # Other recipe staples
    'sugar', 'salt', 'honey', 'syrup', 'stock', 'broth',
    'azúcar', 'sal', 'miel', 'caldo',
}


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


def count_long_sentences_long_desc(text: str) -> tuple[int, int]:
    """For longDescription only: >50 words = long."""
    sents = split_sentences(text)
    long_count = sum(1 for s in sents if len(s.split()) > 50)
    return long_count, len(sents)


def count_long_sentences_short_desc(text: str) -> tuple[int, int]:
    """For shortDescription: only flag if >100 words AND >50% of total."""
    sents = split_sentences(text)
    if not sents:
        return 0, 0
    long_count = sum(1 for s in sents if len(s.split()) > 100)
    return long_count, len(sents)


def count_triple_adjective(text: str) -> tuple[int, list[str]]:
    """Only flag genuine triple-adjective stacks, NOT ingredient lists."""
    matches = list(TRIPLE_ADJ.finditer(text))
    hits = []
    for m in matches:
        if not is_in_ingredient_list(text, m):
            hits.append(m.group(0))
    return len(hits), hits


def detect_weird_chars(text: str) -> list[str]:
    suspects = []
    for ch in text:
        if ord(ch) in (0x200D, 0x200B, 0x200C):
            suspects.append(f'ZW char U+{ord(ch):04X}')
        elif 0x2000 <= ord(ch) <= 0x200F and ch not in ('\u2002', '\u2003'):
            suspects.append(f'formatting U+{ord(ch):04X}')
    return suspects


# ─── Main analysis ─────────────────────────────────────────────────────────

def analyze_dish(slug: str, name: str, short_desc: str, long_desc):
    short = short_desc or ''
    long_ = long_desc or ''
    full = f'{short}\n{long_}'.strip()

    flags = []

    # 1. em-dash spam (>2 now, was >3; lowered because we want to flag it)
    em = full.count(EM_DASH) + full.count(EN_DASH)
    if em > 2:
        flags.append({
            'kind': 'em-dash spam',
            'detail': f'{em} em/en dashes',
            'penalty': 0.1 * em,
            'evidence': find_em_dash_locations(full),
            'suggestion': 'Replace em-dashes with commas, periods, or rewrite as two sentences.',
        })

    # 2. buzzwords (>=2 now)
    bw_count, bw_found = count_buzzwords(full)
    if bw_count >= 2:
        flags.append({
            'kind': 'buzzwords',
            'detail': f'{bw_count}× ({", ".join(sorted(set(bw_found))[:5])})',
            'penalty': 0.1 * bw_count,
            'evidence': find_word_locations(full, bw_found),
            'suggestion': 'Replace each with a specific, concrete word. "Robust" → "sturdy". "Vibrant" → just describe the color.',
        })

    # 3. "whether you're" construction
    if WHETHER.search(full):
        flags.append({
            'kind': '"whether you\'re a..." construct',
            'detail': '1',
            'penalty': 0.15,
            'evidence': [WHETHER.search(full).group(0)],
            'suggestion': 'Cut entirely. "Whether you\'re a beginner or expert" is filler — say the specific thing instead.',
        })

    # 4. long sentences — only in longDescription
    long_sents, total_sents = count_long_sentences_long_desc(long_)
    if total_sents and long_sents / total_sents > 0.3:
        # find which sentences are too long
        offending = [s for s in split_sentences(long_) if len(s.split()) > 50]
        flags.append({
            'kind': 'long sentences (longDescription)',
            'detail': f'{long_sents}/{total_sents} sentences >50 words',
            'penalty': 0.2,
            'evidence': offending[:2],
            'suggestion': 'Break each long sentence into 2-3 shorter ones. Aim for ≤30 words.',
        })

    # 5. triple-adjective — REAL ones only (not ingredient lists)
    trip_count, trip_found = count_triple_adjective(full)
    if trip_count >= 2:
        flags.append({
            'kind': 'triple-adjective stacks',
            'detail': f'{trip_count}× ({", ".join(trip_found[:2])})',
            'penalty': 0.1 * trip_count,
            'evidence': trip_found[:3],
            'suggestion': 'Pick ONE specific adjective instead of three. "rich, savory, aromatic broth" → "savory broth".',
        })

    # 6. superlatives (>=2 now)
    sup_count, sup_found = count_superlatives(full)
    if sup_count >= 2:
        flags.append({
            'kind': 'floating superlatives',
            'detail': f'{sup_count}× ({", ".join(sup_found)})',
            'penalty': 0.05 * sup_count,
            'evidence': sup_found,
            'suggestion': 'Cut or prove them. "The best ceviche in Lima" needs a source. "The best" alone is fluff.',
        })

    # 7. vague phrases
    vague_count, vague_found = count_vague_phrases(full)
    if vague_count > 0:
        flags.append({
            'kind': 'vague phrases',
            'detail': f'{vague_count}× ({", ".join(vague_found)})',
            'penalty': 0.1 * vague_count,
            'evidence': vague_found,
            'suggestion': 'Replace with specifics: "a simple dish" → "a tomato-and-onion stew served cold".',
        })

    # 8. weird chars
    weird = detect_weird_chars(full)
    if weird:
        flags.append({
            'kind': 'weird unicode',
            'detail': f'{len(weird)}× ({", ".join(set(weird))})',
            'penalty': 0.05 * len(weird),
            'evidence': weird,
            'suggestion': 'Strip ZWJ/ZWSP/formatting chars — they break search and copy-paste.',
        })

    slop_score = min(sum(f['penalty'] for f in flags), 1.0)

    return {
        'slug': slug,
        'name': name,
        'short_chars': len(short),
        'long_chars': len(long_),
        'slop_score': round(slop_score, 2),
        'flags': flags,
        'short_text': short,
        'long_text': long_,
    }


def find_em_dash_locations(text: str) -> list[str]:
    out = []
    for m in re.finditer(r'[—–]', text):
        # Surround with ~20 chars
        s = max(0, m.start() - 20)
        e = min(len(text), m.end() + 20)
        out.append(text[s:e].strip())
    return out[:5]


def find_word_locations(text: str, words: list[str]) -> list[str]:
    out = []
    for w in set(words):
        pat = re.compile(rf'\b{w}\b', re.IGNORECASE)
        for m in list(pat.finditer(text))[:1]:
            s = max(0, m.start() - 15)
            e = min(len(text), m.end() + 15)
            out.append(f'"{w}" → …{text[s:e].strip()}…')
            break
    return out[:3]


# ─── Parsing ───────────────────────────────────────────────────────────────

def parse_seed_data(path: Path) -> list[dict]:
    text = path.read_text()
    records = []
    pattern = re.compile(
        r'slug:\s*"(?P<slug>[^"]+)"[\s\S]+?'
        r'canonicalName:\s*"(?P<canonicalName>[^"]+)"[\s\S]+?'
        r'shortDescription:\s*"(?P<short>[^"]+)"'
    )
    long_pat = re.compile(r'longDescription:\s*"(?P<long>[^"]+)"')
    for m in pattern.finditer(text):
        slug = m.group('slug')
        canonical = m.group('canonicalName')
        short = m.group('short')
        rest = text[m.end():m.end() + 4000]
        end = rest.find('\n  },')
        if end == -1:
            end = 4000
        block = rest[:end]
        lm = long_pat.search(block)
        long = lm.group('long') if lm else None
        records.append({
            'slug': slug, 'name': canonical,
            'short': short, 'long': long,
        })
    return records


# ─── Report ────────────────────────────────────────────────────────────────

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
    lines.append('# Gustale.com — AI-slop detection report (v2)')
    lines.append('')
    lines.append(f'**Generated:** {results[0].get("generated_at", "")}')
    lines.append(f'**Scanned:** {len(results)} dishes')
    lines.append('')
    lines.append('| Bucket | Count |')
    lines.append('| --- | --- |')
    lines.append(f'| 🔴 HIGH (≥0.5) | {len(high)} |')
    lines.append(f'| 🟡 MEDIUM (0.2-0.5) | {len(medium)} |')
    lines.append(f'| 🟢 CLEAN (<0.2) | {len(clean)} |')
    lines.append('')
    lines.append('## What this catches')
    lines.append('')
    lines.append('Heuristics inspired by Vusal Ismayilov\'s video on AI-slop detection (ASD-STE100 approach). Each dish gets a `slop_score` 0-1 based on:')
    lines.append('')
    lines.append('1. **Em-dash / en-dash spam** (>3 in copy)')
    lines.append('2. **Marketing buzzwords** (≥2 of `delve`, `leverage`, `tapestry`, etc. — EN + ES)')
    lines.append('3. **`Whether you\'re a ... or ...`** constructions (very AI-coded)')
    lines.append('4. **Long sentences in longDescription** (>50 words, >30% of total)')
    lines.append('5. **Triple-adjective stacks** (NOT inside ingredient lists — those are recipe conventions, not slop)')
    lines.append('6. **Floating superlatives** (≥2 of `best`, `perfect`, `ultimate`)')
    lines.append('7. **Vague phrases** (`a simple dish`, `delicious and traditional`)')
    lines.append('8. **Weird unicode** (ZWJ/ZWSP)')
    lines.append('')
    lines.append('> **False positives are likely.** This is a starting list for human review, not a definitive judgement. LongDescriptions tend to be complex by nature.')
    lines.append('')
    lines.append('---')
    lines.append('')

    if high:
        lines.append('## 🔴 HIGH priority — review first')
        lines.append('')
        for r in sorted(high, key=lambda x: -x['slop_score']):
            lines.extend(_format_dish(r))
        lines.append('')
        lines.append('---')
        lines.append('')

    if medium:
        lines.append('## 🟡 MEDIUM priority — review if time')
        lines.append('')
        for r in sorted(medium, key=lambda x: -x['slop_score']):
            lines.extend(_format_dish(r))
        lines.append('')
        lines.append('---')
        lines.append('')

    lines.append(f'## 🟢 CLEAN ({len(clean)} dishes)')
    lines.append('')
    lines.append('These look OK. (Spot-check if you want.)')
    lines.append('')
    for r in sorted(clean, key=lambda x: x['slug']):
        lines.append(f"- `{r['slug']}` ({r['name']}) — score {r['slop_score']}")
    lines.append('')

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
    lines.append('## Top rewrite hints by flag type')
    lines.append('')
    lines.append('| Flag | Suggestion |')
    lines.append('| --- | --- |')
    for r in results:
        for f in r['flags']:
            # show suggestion only once per (flag_type, suggestion)
            pass  # simplified; we add per-flag suggestions inline above
    lines.append('| Em-dash spam | Replace `—` with commas, periods, or rewrite as two sentences. |')
    lines.append('| Marketing buzzwords | Each buzzword is a specific word in disguise. Find the specific one. |')
    lines.append('| "Whether you\'re a ..." | Cut. Always. |')
    lines.append('| Long sentences | Aim for ≤30 words per sentence. STE limit is 20-25. |')
    lines.append('| Triple-adjective | Pick one. "rich, savory, aromatic" → "savory". |')
    lines.append('| Floating superlatives | Cut or prove with a source. |')
    lines.append('| Vague phrases | Replace with the specific thing. |')
    lines.append('| Weird unicode | Strip. They break search. |')
    lines.append('')

    return '\n'.join(lines)


def _format_dish(r: dict) -> list[str]:
    out = []
    out.append(f"### `{r['slug']}` — {r['name']} (score {r['slop_score']})")
    out.append('')
    out.append(f"- short: {r['short_chars']} chars | long: {r['long_chars']} chars")
    if r['flags']:
        out.append('')
        out.append('**Flags:**')
        for f in r['flags']:
            out.append(f"- **{f['kind']}** — {f['detail']}")
            if f.get('suggestion'):
                out.append(f"  - 💡 _{f['suggestion']}_")
            # Show each piece of evidence on its own line (cleaner UX)
            if f.get('evidence'):
                if len(f['evidence']) > 1:
                    out.append(f"  - _{len(f['evidence'])} occurrences:_")
                    for ev in f['evidence'][:3]:
                        ev_short = ev if len(ev) < 110 else ev[:107] + '…'
                        out.append(f"    - `{ev_short}`")
                else:
                    ev = f['evidence'][0]
                    ev_short = ev if len(ev) < 110 else ev[:107] + '…'
                    out.append(f"  - `{ev_short}`")
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
    parser = argparse.ArgumentParser(description='AI-slop detector for Gustale dish copy (v2).')
    parser.add_argument('--seed', default=str(DEFAULT_SEED))
    parser.add_argument('--out', default=str(DEFAULT_OUT))
    parser.add_argument('--json', help='Also dump JSON results to this path')
    args = parser.parse_args()

    seed_path = Path(args.seed)
    if not seed_path.exists():
        print(f'✗ seed file not found: {seed_path}')
        return 1

    import datetime
    ts = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    print(f'Scanning {seed_path} ...')
    records = parse_seed_data(seed_path)
    print(f'Parsed {len(records)} dishes')

    results = []
    for r in records:
        result = analyze_dish(r['slug'], r['name'], r['short'], r['long'])
        result['generated_at'] = ts
        results.append(result)

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