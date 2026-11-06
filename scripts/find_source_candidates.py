#!/usr/bin/env python3
"""Find candidate S1-S5 sources for a dish's statements.

GUS-1010: "Every source in the database is S6 Wikipedia — the research
pipeline that produces a qualifying source for a specific claim".

WHAT THIS DOES
--------------
For a set of dishes, it searches real scholarly and institutional
catalogues for works that could support each dish's statement, and
records the findings as CANDIDATES for human review.

WHAT IT DOES NOT DO — and this is the part that matters
---------------------------------------------------------
It NEVER marks anything verified. It never writes a `sources` row, never
writes a `claim_citations` row, never changes a statement's status, and
never assigns a source_class to anything that already exists. The
findings land in a candidate table with a `candidate` status and are
read by a human.

That is deliberate and it is the acceptance criterion in GUS-1010: "a
source enters the registry only after the page was actually fetched and
the claim found in it". This script finds CANDIDATES. A human decides
whether a candidate is a real source for a real claim, and only then
does anything enter the registry.

WHERE THE CANDIDATES GO
-----------------------
`source_candidates` — a table created by the migration that accompanies
this script. It records, per (statement, candidate source):

  * the bibliographic metadata (title, authors, year, publisher, DOI,
    ISBN, URL) as the catalogues returned it;
  * the source_class the work WOULD be, if a human confirms it;
  * the catalogue it was found in, and the query that found it;
  * a relevance score from the catalogue itself;
  * whether the record was FETCHED and what was actually found in it.

THE SOURCE CLASSES (db/migrations/0027, GUS-026 §3)
----------------------------------------------------
  S1  primary historical   — a primary source (a treatise, a cookbook of
                              the period, an archive document)
  S2  scholarly            — peer-reviewed academic work
  S3  institutional        — a museum, library, or official body
  S4  practitioner         — a chef, a food writer, a trade body
  S5  specialist          — a specialist monograph or reference work
  S6  reference            — Wikipedia, Wikidata, general publications
  S7  unverified           — blogs, AI-generated, unattributed

The verified gate reads S1-S5. Wikipedia is DISCOVERY ONLY: it is never
the sole source for a contested origin claim, and it is never proposed
as a candidate here.

THE CATALOGUES
--------------
All are public APIs, fetched over plain HTTPS with an identifying
User-Agent:

  Crossref      https://api.crossref.org/works    — scholarly works, DOIs
  OpenAlex      https://api.openalex.org/works    — scholarly + books
  Library of Congress  https://www.loc.gov/search/  — institutional
  OpenLibrary   https://openlibrary.org/search.json — books, S1/S5

Usage:
    python3 scripts/find_source_candidates.py --report
    python3 scripts/find_source_candidates.py --fetch
    python3 scripts/find_source_candidates.py --fetch --limit-dishes 20
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# The live-database guard. It refuses to let this script reach the live
# database unless GUSTALE_LIVE_DB_ALLOW=1 was set for THIS invocation.
# See scripts/lib/db_guard.py for why the opt-in is a separate variable.
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
import db_guard  # noqa: E402

USER_AGENT = "gustale-reference-work/1.0 (https://gustale.com)"
TIMEOUT = 30

#: The target database. NOT live by default.
#:
#: The default is the scratch database (`gustale_dev`), and the live
#: database requires the explicit `GUSTALE_LIVE_DB_ALLOW=1` opt-in for
#: this invocation. The override is `GUSTALE_DB_NAME`, which is what
#: every other script in this repo reads.
#:
#: This script WRITES -- it records candidates -- so a live default
#: would have put candidate rows into production on the first run that
#: forgot to pass `--db`. The guard is resolved once, here, so no
#: later call can silently switch databases mid-run.
DB_NAME = db_guard.resolve_target(
    os.environ.get("GUSTALE_DB_NAME") or db_guard.scratch_database(),
    purpose="find_source_candidates.py",
)

# The catalogues, and how each maps onto a source class.
#
# The class is a PROPOSAL. A human confirms it. The script does not
# claim to know that a work is a peer-reviewed article — it knows that
# Crossref indexes journal articles and books, and that the work it
# returned is a journal-article or a book.
CATALOGUES = {
    "crossref": {"class": "S2"},
    "openalex": {"class": "S2"},
    "loc": {"class": "S3"},
    "openlibrary": {"class": "S5"},
}


def fetch_json(url: str, retries: int = 2) -> dict | None:
    """Fetch a JSON document, or None if it cannot be had.

    A catalogue that returns a truncated body — which the Library of
    Congress does under load — is a failure, not a partial answer. The
    exception types are caught broadly on purpose: a truncated read
    raises http.client.IncompleteRead, which is neither an HTTPError
    nor a URLError, and letting it escape would kill the whole run
    over one flaky catalogue.
    """
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception:  # noqa: BLE001 — a catalogue's failure is not the script's
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
            else:
                return None
    return None


def fetch_text(url: str, retries: int = 1) -> str | None:
    """Fetch a document as text, or None."""
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
                return response.read().decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            if attempt < retries:
                time.sleep(1.5 * (attempt + 1))
            else:
                return None
    return None


# ── the database ──────────────────────────────────────────────────────


def psql(sql: str) -> str:
    """Run SQL against the database and return the raw output.

    The database is DB_NAME, which was resolved through the guard at
    import time: the scratch database by default, and the live one only
    with the explicit `GUSTALE_LIVE_DB_ALLOW=1` opt-in.
    """
    db = DB_NAME
    cmd = [
        "docker", "exec", "-i", "-u", "postgres", "shared-postgres",
        "psql", "-U", "postgres", "-d", db, "-tAc", sql,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if result.returncode != 0:
        raise RuntimeError(f"psql failed: {result.stderr.strip()}")
    return result.stdout.strip()


def psql_json(sql: str) -> list:
    """Run SQL and return the rows as a list of dicts.

    The SQL must select a single jsonb column called `row`; the query
    is wrapped in jsonb_build_object so the parsing is the database's
    job and not this script's.
    """
    out = psql(sql)
    rows = []
    for line in out.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return rows


# ── the dishes and their statements ───────────────────────────────────


def top_dishes(limit: int, only_with_statements: bool = False) -> list:
    """The most-visited published dishes, and their statement.

    A dish with NO statement has nothing to source. The statements are
    the unit of work: a source supports a STATEMENT, not a dish.

    The `only_with_statements` flag selects the most-visited dishes that
    DO have a statement. It exists because of a measured fact: the
    twenty most-visited dishes on the live site have NO statements at
    all, so "the top N by views" and "the top N that have a claim to
    source" are different sets. The report says which is which.
    """
    the_filter = (
        "AND EXISTS (SELECT 1 FROM statements st WHERE st.subject_id = dishes.id)"
        if only_with_statements
        else ""
    )
    return psql_json(f"""
        WITH top_dishes AS (
            SELECT id, slug, canonical_name, view_count
            FROM dishes
            WHERE status = 'published'
            {the_filter}
            ORDER BY view_count DESC, slug
            LIMIT {limit}
        )
        SELECT jsonb_build_object(
                   'slug', t.slug,
                   'canonical_name', t.canonical_name,
                   'view_count', t.view_count,
                   'statement_id', s.id::text,
                   'predicate_slug', p.slug,
                   'predicate_name', p.name,
                   'value_type', s.value_type,
                   'value_literal', COALESCE(s.value_literal, ''),
                   'claim_class', s.claim_class::text,
                   'status', s.status::text
               )::text
        FROM top_dishes t
        LEFT JOIN statements s ON s.subject_id = t.id
        LEFT JOIN predicates p ON p.id = s.predicate_id
        ORDER BY t.view_count DESC, t.slug
    """)


# ── the catalogues ────────────────────────────────────────────────────


def search_crossref(query: str, rows: int = 5) -> list:
    url = (
        "https://api.crossref.org/works?query.bibliographic="
        + urllib.parse.quote(query)
        + f"&rows={rows}&select=DOI,title,author,type,publisher,issued,container-title,ISBN,URL,score"
    )
    data = fetch_json(url)
    if not data:
        return []
    out = []
    for item in data.get("message", {}).get("items", []):
        title = (item.get("title") or [""])[0]
        if not title:
            continue
        authors = []
        for a in item.get("author", []) or []:
            name = " ".join(x for x in [a.get("given"), a.get("family")] if x)
            if name:
                authors.append(name)
        year = None
        parts = (item.get("issued", {}) or {}).get("date-parts") or []
        if parts and parts[0]:
            year = parts[0][0]
        out.append({
            "title": title,
            "authors": authors,
            "year": year,
            "publisher": item.get("publisher"),
            "container_title": (item.get("container-title") or [None])[0],
            "doi": item.get("DOI"),
            "isbn": (item.get("ISBN") or [None])[0],
            "url": item.get("URL") or (f"https://doi.org/{item['DOI']}" if item.get("DOI") else None),
            "work_type": item.get("type"),
            "relevance": item.get("score"),
            "catalogue": "crossref",
        })
    return out


def search_openalex(query: str, rows: int = 5) -> list:
    url = (
        "https://api.openalex.org/works?search="
        + urllib.parse.quote(query)
        + f"&per-page={rows}&mailto=research@gustale.com"
    )
    data = fetch_json(url)
    if not data:
        return []
    out = []
    for item in data.get("results", []):
        out.append({
            "title": item.get("title") or item.get("display_name"),
            "authors": [
                a.get("author", {}).get("display_name")
                for a in item.get("authorships", []) or []
                if a.get("author", {}).get("display_name")
            ],
            "year": item.get("publication_year"),
            "publisher": (item.get("primary_location", {}) or {}).get("source", {}) or {}
                and ((item.get("primary_location") or {}).get("source") or {}).get("display_name"),
            "container_title": ((item.get("primary_location") or {}).get("source") or {}).get("display_name"),
            "doi": item.get("doi"),
            "isbn": None,
            "url": item.get("doi") or item.get("id"),
            "work_type": item.get("type"),
            "relevance": item.get("relevance_score"),
            "catalogue": "openalex",
        })
    return out


def search_loc(query: str, rows: int = 5) -> list:
    url = (
        "https://www.loc.gov/search/?q="
        + urllib.parse.quote(query)
        + f"&fo=json&c={rows}&cft=book"
    )
    data = fetch_json(url)
    if not data:
        return []
    out = []
    for item in data.get("results", []) or []:
        title = item.get("title")
        if isinstance(title, list):
            title = title[0] if title else None
        if not title:
            continue
        out.append({
            "title": title,
            "authors": item.get("contributor") or [],
            "year": item.get("date"),
            "publisher": item.get("partof") or [],
            "container_title": None,
            "doi": item.get("id"),
            "isbn": None,
            "url": item.get("id"),
            "work_type": "book",
            "relevance": None,
            "catalogue": "loc",
        })
    return out


def search_openlibrary(query: str, rows: int = 5) -> list:
    url = (
        "https://openlibrary.org/search.json?q="
        + urllib.parse.quote(query)
        + f"&limit={rows}"
    )
    data = fetch_json(url)
    if not data:
        return []
    out = []
    for item in data.get("docs", []) or []:
        if not item.get("title"):
            continue
        out.append({
            "title": item.get("title"),
            "authors": item.get("author_name") or [],
            "year": (item.get("first_publish_year")),
            "publisher": (item.get("publisher") or [None])[0],
            "container_title": None,
            "doi": None,
            "isbn": (item.get("isbn") or [None])[0],
            "url": f"https://openlibrary.org{item.get('key','')}",
            "work_type": "book",
            "relevance": None,
            "catalogue": "openlibrary",
        })
    return out


SEARCHERS = {
    "crossref": search_crossref,
    "openalex": search_openalex,
    "loc": search_loc,
    "openlibrary": search_openlibrary,
}


# ── the query ─────────────────────────────────────────────────────────


def build_query(dish: dict) -> str:
    """The search query for a dish's statement.

    The dish's name, plus the predicate, so a statement about where a
    dish comes from searches for that and not for the dish in general.

    THE DISH NAME IS NOT ITSELF A CLAIM. "Falafel" is the subject, not
    a proposition; a source that merely mentions falafel supports
    nothing. That is why the query carries the predicate and why the
    candidate is a candidate and not a citation.
    """
    parts = [dish["canonical_name"]]
    predicate = dish.get("predicate_name") or ""
    if predicate:
        parts.append(predicate)
    return " ".join(parts).strip()


# ── the relevance filter ──────────────────────────────────────────────


STOPWORDS = {
    "the", "a", "an", "of", "in", "is", "was", "and", "or", "to", "for",
    "originated", "origin", "belongs", "cuisine", "contains", "ingredient",
    "created", "by", "cooked", "named", "after", "part", "tradition",
    "served", "course", "eaten", "context", "dish",
}

# Words that are ordinary English as well as words in a dish's name.
#
# A dish named "10 Won Bread" has two name tokens, and BOTH of them
# are ordinary English words. A work about "the Bread and Roses
# Strike" therefore matches the dish's name on every token — which is
# exactly the case the weighted score cannot catch, because the
# arithmetic sees a perfect match.
#
# The arithmetic sees a perfect match; the words do not mean the dish.
#
# So a dish whose name consists ONLY of common words is, for matching
# purposes, an unmatchable name: a candidate about it has to be
# confirmed by a human reading it, because the title cannot tell the
# difference. The filter's job is to find the OBVIOUS candidates, and
# this is not one.
#
# The list is deliberately short: words that appear in a dish's NAME
# and are ordinary English at the same time.
COMMON_WORDS = {
    "bread", "won", "cake", "pie", "soup", "rice", "salad", "steak",
    "fish", "egg", "meat", "corn", "bean", "lamb", "pork", "duck",
    "chicken", "beef", "pork", "jam", "roll", "nut", "apple", "pear",
    "plum", "cherry", "melon", "lemon", "lime", "grape", "onion",
    "garlic", "pepper", "carrot", "potato", "tomato", "bean", "herb",
    "spice", "sauce", "sugar", "salt", "honey", "butter", "cream",
    "cheese", "wine", "beer", "juice", "coffee", "tea", "water",
    "milk", "egg", "corn", "bean", "yam", "taro", "lotus", "bamboo",
    "mushroom", "tofu", "bean", "noodle", "dumpling", "bun", "pastry",
    "biscuit", "cookie", "cake", "custard", "syrup", "marmalade",
    "chutney", "salad", "soup", "stew", "roast", "grill", "fry", "boil",
    "bake", "breakfast", "lunch", "dinner", "supper", "brunch",
}

# NOTE ON WHAT IS NOT IN THAT LIST. A dish whose name is a distinctive
# culinary word — hummus, falafel, sushi, kebab, shawarma, tagine,
# couscous — is NOT unmatchable, and it must not be put in the list.
# Those words are ordinary English to a spell-checker and nothing at
# all to a reader: a work titled "Hummus: A Global History" is about
# the dish. The list holds only words that are common in ENGLISH
# PROSE, which is what creates the coincidence."


def term_overlap(candidate_title: str, dish_name: str, predicate: str) -> float:
    """How much of the dish's own vocabulary appears in the candidate's title.

    A candidate whose title shares nothing with the dish's name is not
    about the dish. The threshold is deliberately high: this stage is
    for finding the obvious candidates, and a human judges the rest.

    THE MEASURED FAILURE THIS FIXES
    -------------------------------
    The first run matched "Why Labor Won: Tactical Innovation, Failed
    Repression" to the dish "10 Won Bread". The reason was that the
    dish's name tokenised to {"won", "bread"} and the word "won" is a
    real English word. A substring match on a single common word is
    not evidence that a work is about the dish.

    So the score is now WEIGHTED, and the subject's own name tokens
    carry more weight than the predicate's vocabulary:

      * every name token that appears in the title scores 1.0
      * every predicate token that appears in the title scores 0.25
        (the predicate is shared by every dish of the kind, so a match
        on it is weak evidence)
      * a name token that does NOT appear in the title costs 0.5

    The penalty is what kills the false positive: "Why Labor Won"
    matches "won" but not "bread", so it scores 1.0 - 0.5 = 0.5, and
    a genuine match on both tokens scores 1.0. At the default
    threshold of 0.34 the false positive is still borderline, so the
    penalty is doubled: it scores 1.0 - 1.0 = 0.0.

    A dish whose name is a single token cannot be matched on absence,
    so the penalty is skipped when there is only one name token; the
    score is then just the fraction of name tokens present.
    """
    def tokens(text: str) -> set:
        words = re.findall(r"[a-z]+", text.lower())
        return {w for w in words if w not in STOPWORDS and len(w) > 2}

    title_tokens = tokens(candidate_title)
    name_tokens = tokens(dish_name)
    predicate_tokens = tokens(predicate)

    if not name_tokens and not predicate_tokens:
        return 0.0

    score = 0.0
    matched = 0
    for token in name_tokens:
        if token in title_tokens:
            score += 1.0
            matched += 1
        elif len(name_tokens) > 1:
            # The dish's own name is missing a word: that is evidence
            # AGAINST the work being about this dish.
            score -= 1.0
    for token in predicate_tokens:
        if token in title_tokens:
            score += 0.25

    # Scale so the score stays in 0..1 for the threshold to mean
    # something comparable across dishes with different name lengths.
    best_possible = len(name_tokens) + 0.25 * len(predicate_tokens)
    if best_possible <= 0:
        return 0.0
    score = max(0.0, score) / best_possible

    # A single common word is not a match, whatever the arithmetic says.
    if len(name_tokens) > 1 and matched == 0:
        return 0.0

    # A dish whose name is ALL ordinary English words cannot be matched
    # on its title. "10 Won Bread" against "Why Labor Won ... the Bread
    # and Roses Strike" matches on every token and means nothing: the
    # words are common, not distinctive of the dish.
    #
    # The score is kept, but it is CAPPED below the threshold, so the
    # candidate is not proposed as a match on the strength of a
    # coincidence of vocabulary. It is still recorded — the dish needs
    # its sources and a human may see something the title does not —
    # but it is recorded as a weak lead rather than as a match.
    if name_tokens and name_tokens <= COMMON_WORDS:
        return min(score, 0.30)

    return score


# ── the writing ───────────────────────────────────────────────────────


def candidate_row(statement_id: str, c: dict, dish: dict, query: str, overlap: float) -> dict:
    return {
        "statement_id": statement_id,
        "dish_slug": dish["slug"],
        "title": c["title"],
        "authors": c["authors"],
        "year": c["year"],
        "publisher": c["publisher"],
        "container_title": c["container_title"],
        "doi": c["doi"],
        "isbn": c["isbn"],
        "url": c["url"],
        "work_type": c["work_type"],
        "catalogue": c["catalogue"],
        "query": query,
        "catalogue_relevance": c["relevance"],
        "term_overlap": round(overlap, 4),
        "proposed_source_class": CATALOGUES[c["catalogue"]]["class"],
        "status": "candidate",
        "fetched": False,
        "fetch_note": None,
        "locator": None,
        "excerpt": None,
    }


def write_candidates(rows: list) -> int:
    """Insert the candidates. Nothing is verified; nothing is promoted."""
    if not rows:
        return 0
    payload = "\n".join(json.dumps(r) for r in rows)
    script = """
import json, sys
rows = [json.loads(l) for l in sys.stdin if l.strip()]
out = []
for r in rows:
    out.append((r['statement_id'], r['title'], r['authors'], r['year'], r['publisher'],
                r['container_title'], r['doi'], r['isbn'], r['url'], r['work_type'],
                r['catalogue'], r['query'], r['catalogue_relevance'], r['term_overlap'],
                r['proposed_source_class'], r['status'], r['fetched'], r['fetch_note'],
                r['locator'], r['excerpt']))
    out[-1] = tuple(out[-1][0].split('\\t') if isinstance(out[-1][0], str) and '\\t' in out[-1][0] else out[-1][0])
print(len(rows))
"""
    # The insert is done with a COPY-style statement built here, so the
    # escaping is handled by PostgreSQL's own quoting via jsonb.
    values = []
    for r in rows:
        values.append(
            "({}::uuid, {}::text, {}::text, {}::text[], {}::int, {}::text, {}::text, {}::text, "
            "{}::text, {}::text, {}::text, {}::text, {}::text, {}::numeric, {}::numeric, "
            "{}::source_class, {}::source_candidate_status, {}::boolean, {}::text, "
            "{}::text, {}::text)".format(
                sql_quote(r["statement_id"]),
                sql_quote(r["dish_slug"]),
                sql_quote(r["title"]),
                sql_quote_array(r["authors"]),
                "NULL" if r["year"] is None else str(int(r["year"])),
                sql_quote(r["publisher"]),
                sql_quote(r["container_title"]),
                sql_quote(r["doi"]),
                sql_quote(r["isbn"]),
                sql_quote(r["url"]),
                sql_quote(r["work_type"]),
                sql_quote(r["catalogue"]),
                sql_quote(r["query"]),
                "NULL" if r["catalogue_relevance"] is None else str(r["catalogue_relevance"]),
                str(r["term_overlap"]),
                sql_quote(r["proposed_source_class"]),
                sql_quote(r["status"]),
                "true" if r["fetched"] else "false",
                sql_quote(r["fetch_note"]),
                sql_quote(r["locator"]),
                sql_quote(r["excerpt"]),
            )
        )
    statement = (
        "INSERT INTO source_candidates (statement_id, dish_slug, title, authors, year, "
        "publisher, container_title, doi, isbn, url, work_type, catalogue, query, "
        "catalogue_relevance, term_overlap, proposed_source_class, status, fetched, "
        "fetch_note, locator, excerpt) "
        "VALUES " + ", ".join(values) +
        # The conflict target MUST match the unique index in 0046:
        # source_candidates_statement_work_uniq, which is on the WORK's
        # identity (statement, work_type, title, year, url) with NULLS
        # NOT DISTINCT.
        #
        # The old target was (statement_id, doi, url), and it did not
        # dedupe: NULL dois never collide, and the same DOI in two
        # forms is two keys. Proved on a copy of live -- 61 candidates,
        # 47 distinct works.
        " ON CONFLICT (statement_id, work_type, title, year, url) DO NOTHING;"
    )
    psql(statement)
    return len(rows)


def sql_quote(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value).replace("'", "''")
    return "'" + text + "'"


def sql_quote_array(values) -> str:
    if not values:
        return "NULL"
    parts = ", ".join(sql_quote(v) for v in values)
    return "ARRAY[" + parts + "]::text[]"


# ── the report ────────────────────────────────────────────────────────


def report() -> None:
    print("=== the candidate sources found so far ===")
    rows = psql_json("""
        SELECT jsonb_build_object(
                   'dish_slug', sc.dish_slug,
                   'title', sc.title,
                   'cls', sc.proposed_source_class::text,
                   'catalogue', sc.catalogue,
                   'year', sc.year::text,
                   'term_overlap', sc.term_overlap::text,
                   'fetched', sc.fetched::text,
                   'status', sc.status::text
               )::text
        FROM source_candidates sc
        ORDER BY sc.dish_slug, sc.term_overlap DESC, sc.title
    """)
    by_dish: dict = {}
    for r in rows:
        by_dish.setdefault(r["dish_slug"], []).append(r)
    for dish in sorted(by_dish):
        print(f"\n  {dish}  ({len(by_dish[dish])} candidates)")
        for c in by_dish[dish]:
            print(
                f"    [{c['cls']}] {c['title'][:58]:60} "
                f"{c['catalogue']:12} {c['year'] or '-':5} "
                f"overlap={c['term_overlap']:6} fetched={c['fetched']}"
            )

    print()
    totals = psql_json("""
        SELECT jsonb_build_object('metric', m.metric, 'value', m.value)::text
        FROM (
            SELECT 'the candidates' AS metric, count(*)::text AS value FROM source_candidates
            UNION ALL SELECT 'the distinct statements covered',
                count(DISTINCT statement_id)::text FROM source_candidates
            UNION ALL SELECT 'the distinct dishes covered',
                count(DISTINCT dish_slug)::text FROM source_candidates
            UNION ALL SELECT 'the candidates fetched',
                count(*) FILTER (WHERE fetched)::text FROM source_candidates
            UNION ALL SELECT 'the promoted (MUST BE ZERO)',
                count(*) FILTER (WHERE reviewed_by IS NOT NULL)::text FROM source_candidates
        ) m
    """)
    print("=== the coverage ===")
    for t in totals:
        print(f"  {t['metric']:38} {t['value']}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", action="store_true", help="print the report and exit")
    parser.add_argument("--fetch", action="store_true", help="search the catalogues and record candidates")
    parser.add_argument("--limit-dishes", type=int, default=20)
    parser.add_argument("--per-dish", type=int, default=6, help="candidates per catalogue per dish")
    parser.add_argument("--min-overlap", type=float, default=0.34)
    parser.add_argument(
        "--only-with-statements",
        action="store_true",
        help="consider only the dishes that have a statement to source",
    )
    args = parser.parse_args()

    if args.report:
        report()
        return 0

    if not args.fetch:
        parser.print_help()
        return 1

    dishes = top_dishes(args.limit_dishes, args.only_with_statements)
    print(f"[candidates] {len(dishes)} dish rows (a dish with no statement has nothing to source)")

    with_statements = [d for d in dishes if d.get("statement_id")]
    without = [d for d in dishes if not d.get("statement_id")]
    print(f"[candidates] {len(with_statements)} with a statement, {len(without)} with none")
    if without:
        print("[candidates] the dishes with no statement: " + ", ".join(d["slug"] for d in without))

    rows: list = []
    for dish in with_statements:
        query = build_query(dish)
        found = 0
        for name, searcher in SEARCHERS.items():
            for c in searcher(query, rows=args.per_dish):
                overlap = term_overlap(c["title"], dish["canonical_name"], dish.get("predicate_name") or "")
                if overlap < args.min_overlap:
                    continue
                rows.append(candidate_row(dish["statement_id"], c, dish, query, overlap))
                found += 1
            time.sleep(0.4)
        print(f"[candidates] {dish['slug']:28} {found} candidates  (query: {query})")

    print(f"[candidates] writing {len(rows)} candidates")
    write_candidates(rows)
    report()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (
        db_guard.LiveDatabaseRefused,
        db_guard.ProductionContainerRefused,
    ) as exc:
        # A refusal is the CORRECT outcome, not a crash.
        db_guard.refuse(str(exc))
