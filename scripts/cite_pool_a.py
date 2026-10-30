#!/usr/bin/env python3
"""Classify the sources and attach the S6 discovery citations.

WHAT THIS DOES

Three things, in order:

1. CLASSIFY THE EXISTING SOURCES. Every source with a
   `*.wikipedia.org` URL and no class gets S6 — "reference: discovery
   and terminology only". The existing 142 were created before the
   classification pass ran, so all 142 are still NULL. The rule
   itself is ADR-002's: S6 is what Wikipedia IS, and the caveat the
   ADR names is handled here — `/wiki/<article>` is S6, but
   `/wiki/File:...` and a `wikidata.org/wiki/Q...` URL are NOT an
   encyclopedia article and are left unclassified rather than
   mislabelled.

2. CREATE ONE SOURCE PER DISH'S WIKIPEDIA ARTICLE. A dish with no
   source row cannot have a citation, and the citation is what makes
   the description attributable. The source is the article the dish
   came from.

3. ATTACH THE DISCOVERY CITATION to each dish's origin statement.
   ONE citation per dish, `stance = 'supports'`, pointing at the S6
   source, with the excerpt being the sentence from the article that
   establishes the dish's existence and its place.

THE POINT OF THE S6 CITATION

The statement STAYS at `research_pending`. The citation is not
evidence for the origin claim — S6 is "discovery and terminology
only" and can never stand alone. The citation is ATTRIBUTION: it
records where the description came from, so a reader (and a reviewer)
can see that the dish's text is derived from that article rather than
invented.

That distinction is the whole point, and it is enforced by the
GUS-026 §3.1 gate: the origin statement cannot become `verified`
while its only citation is S6.

Usage:

    python3 scripts/cite_pool_a.py --dry-run
    python3 scripts/cite_pool_a.py --apply
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.parse
import uuid
from pathlib import Path

# The slug derivation is IMPORTED, not copied. The importer created
# the dishes; if the two scripts derived slugs differently the
# citations would silently land on nothing. Importing the importer's
# own function makes that impossible.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_pool_a import slugify  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
POOL_FILE = REPO / "data" / "pool_a.json"

ADMIN = "00000000-0000-0000-0000-000000000001"


# The database this script writes to. "gustale" is the live one; the
# dry run sets it to an exact copy so the script can be exercised
# without touching live data.
TARGET_DATABASE = "gustale"


def db(sql: str) -> str:
    """Run SQL against TARGET_DATABASE.

    When the target is the live database this goes through dbq.sh,
    which owns the credential handling. Any other target is a scratch
    copy inside the same container, reached with psql directly.

    The SQL is passed to dbq.sh on STDIN, not as an argument: a
    generated statement runs to tens of kilobytes, and a single
    argument that long overflows the exec argument list ("Argument
    list too long"). dbq.sh reads its query from stdin when none is
    given.
    """
    if TARGET_DATABASE == "gustale":
        out = subprocess.run(
            ["bash", str(REPO / "scripts" / "dbq.sh")],
            input=sql,
            capture_output=True,
            text=True,
        )
        if out.returncode != 0:
            raise RuntimeError(
                f"dbq.sh failed: {out.stderr.strip()}\n--- the SQL was ---\n{sql[:800]}"
            )
        return out.stdout
    return db_on(TARGET_DATABASE, sql)


def db_on(database: str, sql: str) -> str:
    """Run SQL against a NAMED database.

    The default target is the live `gustale`. A named target is used
    for the dry run on an exact copy, so the script can be exercised
    without touching the live data.

    The SQL goes in on STDIN, not as an argument: the generated
    statements run to tens of kilobytes, and a command-line argument
    of that size overflows the exec argument list.
    """
    out = subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            "-u",
            "postgres",
            "shared-postgres",
            "psql",
            "-U",
            "postgres",
            "-d",
            database,
            "-tA",
            "-f",
            "-",
        ],
        input=sql,
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        # psql's own message is the useful one — "relation does not
        # exist", a syntax error, a constraint violation. It is
        # surfaced rather than swallowed into a bare exit code.
        raise RuntimeError(
            f"psql failed against {database}: {out.stderr.strip()}\n"
            f"--- the SQL was ---\n{sql[:800]}"
        )
    return out.stdout


def db_rows(sql: str) -> list[dict]:
    out = db("select coalesce(json_agg(row_to_json(t)), '[]'::json) from (" + sql + ") t")
    # psql WRAPS a long value across several lines, so the JSON does
    # not arrive as one line. The whole output is stripped of the
    # psql furniture and the first JSON array is extracted from it.
    text = out.strip()
    start = text.find("[{")
    if start == -1:
        return []
    # The array runs to its matching close bracket.
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "[":
            depth += 1
        elif text[i] == "]":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    return []


def sql_literal(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def classify_existing_sources() -> int:
    """Set S6 on the encyclopedia sources that have no class.

    The rule is the URL's SHAPE, not just its domain: an article is
    `/wiki/<Title>`, and a file or a Wikidata item is not an
    encyclopedia article.
    """
    rows = db_rows(
        """
        select id, url, title
          from sources
         where source_class is null
           and url ~* '^https?://[a-z-]+\\.wikipedia\\.org/wiki/[^:]+$'
        """
    )
    if not rows:
        print("[cite] no unclassified encyclopedia sources")
        return 0

    ids = ", ".join(sql_literal(r["id"]) for r in rows)
    db(
        f"""
        update sources
           set source_class = 'S6',
               source_classed_at = now(),
               source_classed_by = {sql_literal(ADMIN)}
         where id in ({ids});
        """
    )
    print(f"[cite] classified {len(rows)} sources as S6")

    # And report what is left unclassified, so nothing is silently
    # left in an unknown state.
    left = db_rows(
        "select id, url, title from sources where source_class is null"
    )
    if left:
        print(f"[cite] {len(left)} sources remain unclassified:")
        for row in left[:10]:
            print(f"          {row.get('url')}")
    return len(rows)


def build_sources(pool: list[dict]) -> dict[str, str]:
    """One S6 source per dish's Wikipedia article.

    Keyed by the dish's slug, so the citation can find it.
    """
    by_slug = {
        r["slug"]: r
        for r in db_rows(
            """
            select slug, id, canonical_name as name
              from dishes
             where created_by = 'wikidata-derived'
            """
        )
    }

    # A source per ARTICLE URL, so two dishes from the same article
    # share the source.
    url_to_source: dict[str, str] = {}
    for r in db_rows(
        """
        select id, url from sources where url is not null
        """
    ):
        url_to_source[r["url"]] = r["id"]

    to_create: list[tuple[str, str, str]] = []  # (id, title, url)
    slug_to_source: dict[str, str] = {}

    for row in pool:
        article = row.get("article")
        label = row.get("label")
        # The pool file has no `slug` key — the slug is DERIVED, and it
        # must be derived exactly as the importer derived it, or the
        # citation lands on nothing. The importer uses
        # slugify(article or label); this mirrors that, and the two
        # are checked against each other below.
        slug = slugify(article or label or "")
        if not slug or not article or slug not in by_slug:
            continue
        url = f"https://en.wikipedia.org/wiki/{urllib.parse.quote(article.replace(' ', '_'))}"
        source_id = url_to_source.get(url)
        if not source_id:
            source_id = str(uuid.uuid4())
            url_to_source[url] = source_id
            to_create.append((source_id, label or article, url))
        slug_to_source[slug] = source_id

    if to_create:
        values = ",\n  ".join(
            f"({sql_literal(sid)}, 'web', {sql_literal(title)}, {sql_literal(url)}, "
            f"'Wikipedia, The Free Encyclopedia', 'en', 'secondary', "
            f"{sql_literal(ADMIN)}, 'S6', now(), {sql_literal(ADMIN)})"
            for sid, title, url in to_create
        )
        db(
            f"""
            insert into sources
              (id, source_type, title, url, publisher, language, reliability,
               created_by, source_class, source_classed_at, source_classed_by)
            values
              {values}
            on conflict (id) do nothing;
            """
        )
        print(f"[cite] created {len(to_create)} S6 sources")

    return slug_to_source


def attach_citations(pool: list[dict], slug_to_source: dict[str, str]) -> int:
    """One S6 discovery citation per dish, on its origin statement."""
    dishes = {
        r["slug"]: r
        for r in db_rows(
            """
            select d.slug, d.id as dish_id, d.short_description,
                   s.id as statement_id
              from dishes d
              join statements s on s.subject_id = d.id
                                and s.subject_type = 'dish'
             where d.created_by = 'wikidata-derived'
            """
        )
    }

    # The excerpt: the first sentence of the dish's own description.
    # That is the sentence the article establishes, and it is what
    # the citation points at.
    def excerpt_of(text: str) -> str:
        if not text:
            return ""
        parts = text.replace("\n", " ").split(". ")
        first = parts[0].strip()
        if not first.endswith("."):
            first += "."
        return first[:400]

    values: list[str] = []
    for row in pool:
        # The slug is DERIVED here too, for the same reason it is
        # derived in build_sources — the pool file has no `slug` key.
        # Both must use the importer's slugify so they agree.
        slug = slugify(row.get("article") or row.get("label") or "")
        source_id = slug_to_source.get(slug)
        dish = dishes.get(slug)
        if not source_id or not dish or not dish.get("statement_id"):
            continue
        excerpt = excerpt_of(dish.get("short_description") or "")
        if not excerpt:
            continue
        values.append(
            f"({sql_literal(str(uuid.uuid4()))}, {sql_literal(dish['statement_id'])}, "
            f"{sql_literal(source_id)}, 'supports', {sql_literal(excerpt)}, "
            f"now(), true, now())"
        )

    if not values:
        print("[cite] no citations to attach")
        return 0

    db(
        f"""
        insert into claim_citations
          (id, statement_id, source_id, stance, excerpt, retrieved_at,
           excerpt_validated, created_at)
        values
          {",\n  ".join(values)}
        on conflict do nothing;
        """
    )
    print(f"[cite] attached {len(values)} discovery citations")
    return len(values)


def main() -> int:
    global TARGET_DATABASE

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--database",
        default="gustale",
        help=(
            "The database to write to. The default is the live one. "
            "Point it at an exact copy for a dry run on real data."
        ),
    )
    args = parser.parse_args()

    TARGET_DATABASE = args.database
    if TARGET_DATABASE != "gustale":
        print(f"[cite] the target database: {TARGET_DATABASE}")

    pool = json.loads(POOL_FILE.read_text())
    print(f"[cite] {len(pool)} Pool A dishes")

    if not args.apply:
        print("[cite] dry run — re-run with --apply")
        # Still report what WOULD happen.
        classified = db_rows(
            """
            select count(*) as n from sources
             where source_class is null
               and url ~* '^https?://[a-z-]+\\.wikipedia\\.org/wiki/[^:]+$'
            """
        )
        print(f"[cite] {classified[0]['n'] if classified else 0} sources to classify as S6")
        return 0

    classify_existing_sources()
    slug_to_source = build_sources(pool)
    attach_citations(pool, slug_to_source)

    # The report.
    final = db_rows(
        """
        select
          (select count(*) from sources where source_class = 'S6') as s6_sources,
          (select count(*) from sources where source_class is null) as unclassified,
          (select count(*) from claim_citations) as the_citations,
          (select count(*) from statements where status = 'research_pending') as still_pending
        """
    )
    print(f"[cite] the final state: {final[0] if final else '?'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
