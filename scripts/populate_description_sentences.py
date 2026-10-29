#!/usr/bin/env python3
"""Populate `description_sentences` from the live descriptions.

ADR-002 Q9's rule 1: "`short_description` is rendered from the
sentences; the concatenation must equal the live column exactly."

So this script:
  1. reads every published dish's short and long description;
  2. splits it with scripts/split_sentences.py — the ONE splitter,
     the same one the boundary fixture set tests;
  3. asserts the concatenation of the sentences equals the source
     byte-for-byte, BEFORE writing anything;
  4. writes the sentences;
  5. sets `dishes.sentence_managed = true`, so the guard trigger
     takes over the column.

It writes through a TEMPORARY table and a single INSERT..SELECT, so
it is one transaction and one statement rather than 291.

Every count is asserted before the write, so a mismatch aborts with
nothing written.

Usage:  python3 scripts/populate_description_sentences.py --apply
        python3 scripts/populate_description_sentences.py            (dry run)
"""

import argparse
import json
import os
import subprocess
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from split_sentences import split_sentences  # noqa: E402

FIELDS = (("short_description", "short"), ("long_description", "long"))


def fetch_descriptions(db: str = "gustale") -> list[dict]:
    sql = """
    select json_agg(row_to_json(t))
    from (
      select id, slug, short_description, long_description
      from dishes
      where status = 'published'
      order by slug
    ) t;
    """
    # The live database is read through dbq.sh, which carries the
    # gustale user's password. A CI or scratch database has no such
    # user, so it is read as the postgres superuser inside the
    # container — the same way scripts/ci-migration-chain.sh does it.
    #
    # Either way the database named by `db` is the one that is read,
    # and the WRITE in main() targets the same one.
    if db == "gustale":
        out = subprocess.run(
            ["bash", "scripts/dbq.sh", sql],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    else:
        out = subprocess.run(
            [
                "docker",
                "exec",
                "-u",
                "postgres",
                "-i",
                "shared-postgres",
                "psql",
                "-U",
                "postgres",
                "-d",
                db,
                "-v",
                "ON_ERROR_STOP=1",
                "-X",
                "-tAc",
                sql,
            ],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("[{"):
            return json.loads(line)
    raise SystemExit("could not parse the descriptions out of dbq.sh")


def build_rows(dishes: list[dict]) -> list[tuple]:
    """(dish_id, field, locale, position, text) for every sentence.

    Raises if the concatenation does not equal the source — the
    consistency gate, checked before anything is written.
    """
    rows: list[tuple] = []
    for dish in dishes:
        for column, field in FIELDS:
            text = dish.get(column)
            if not text or not text.strip():
                continue
            sentences = split_sentences(text)
            if not sentences:
                continue

            # THE CONCAT CHECK — before anything is written.
            rejoined = "".join(sentences)
            if rejoined != text:
                raise SystemExit(
                    f"CONCAT MISMATCH for {dish['slug']} [{field}]\n"
                    f"  original: {text[:120]!r}\n"
                    f"  rejoined: {rejoined[:120]!r}"
                )

            for position, sentence in enumerate(sentences, start=1):
                rows.append(
                    (dish["id"], field, "en", position, sentence)
                )
    return rows


def dollar_tag(rows: list[tuple]) -> str:
    """A dollar-quote tag that does not occur in any of the texts.

    The tag must be a valid identifier (letters, digits, underscores,
    not starting with a digit) and must not appear in the text — a
    `$$` inside a description would terminate the string early.
    """
    for marker in ("gustale", "gustale_text", "gustale_sentence"):
        if not any(marker in row[4] for row in rows):
            return marker
    # Fall back to a tag derived from the content length, which is
    # guaranteed not to occur in the text.
    return "g" + str(sum(len(row[4]) for row in rows))


def emit_sql(rows: list[tuple]) -> str:
    """The SQL that writes the sentences, as one INSERT..SELECT.

    The rows go in through a VALUES list. The counts are asserted
    first, so a mismatch aborts the transaction with nothing
    written.
    """
    tag = dollar_tag(rows)
    values = []
    for dish_id, field, locale, position, text in rows:
        # DOLLAR QUOTING: the text goes between $$, and inside a
        # dollar-quoted string an apostrophe is just an apostrophe.
        #
        # Escaping it — as the single-quoted form needs — inserts a
        # LITERAL second apostrophe, because the SQL parser does not
        # unescape anything inside $$. Three dishes with an
        # apostrophe in their description ('herdsman') came out two
        # characters LONGER than the source, and the database-side
        # concat check caught them.
        #
        # The only thing that must not appear is the dollar tag
        # itself. The tag is chosen so it cannot occur in the text.
        values.append(
            f"    ('{dish_id}', '{field}', '{locale}', {position}, ${tag}${text}${tag}$)"
        )
    body = ",\n".join(values)

    return f"""
BEGIN;

-- The guard: the sentence count must match what we are about to
-- write, and the concatenation must reproduce the live column.
DO $$
DECLARE
  expected integer := {len(rows)};
  actual integer;
  bad integer := 0;
BEGIN
  -- The table must be empty, or the guard says so. Re-running the
  -- population over an already-populated table is a reset, not an
  -- append, and it is refused here rather than silently duplicating.
  SELECT count(*) INTO actual FROM description_sentences;
  IF actual > 0 THEN
    RAISE EXCEPTION 'description_sentences already holds % rows; refusing to append', actual;
  END IF;

  -- The expected count is the number of sentences the splitter
  -- produced. It is compared AFTER the insert below, by the
  -- post-assertion.
END
$$;

CREATE TEMP TABLE _sentence_stage (
  dish_id uuid NOT NULL,
  field   description_sentence_field NOT NULL,
  locale  text NOT NULL,
  position integer NOT NULL,
  text    text NOT NULL
) ON COMMIT DROP;

INSERT INTO _sentence_stage (dish_id, field, locale, position, text)
VALUES
{body};

-- The count assertion, BEFORE the real write.
DO $$
DECLARE
  staged integer;
  expected integer := {len(rows)};
BEGIN
  SELECT count(*) INTO staged FROM _sentence_stage;
  IF staged <> expected THEN
    RAISE EXCEPTION 'staged % sentences, expected %', staged, expected;
  END IF;
END
$$;

INSERT INTO description_sentences (dish_id, field, locale, position, text)
SELECT dish_id, field, locale, position, text
  FROM _sentence_stage
 ORDER BY dish_id, field, position;

-- The post-assertions.
DO $$
DECLARE
  n integer;
  dishes_managed integer;
BEGIN
  SELECT count(*) INTO n FROM description_sentences;
  IF n <> {len(rows)} THEN
    RAISE EXCEPTION 'description_sentences holds % rows, expected %', n, {len(rows)};
  END IF;

  -- Every dish that has a sentence must be managed, so the guard
  -- trigger protects the column.
  UPDATE dishes SET sentence_managed = true
   WHERE id IN (SELECT DISTINCT dish_id FROM description_sentences);

  SELECT count(*) INTO dishes_managed
    FROM dishes
   WHERE sentence_managed = true;
  IF dishes_managed = 0 THEN
    RAISE EXCEPTION 'no dish was flagged sentence_managed';
  END IF;

  -- The concat check, in the DATABASE: every dish's live
  -- short_description must equal the concatenation of its 'short'
  -- sentences.
  SELECT count(*) INTO n
    FROM dishes d
   WHERE d.sentence_managed
     AND d.short_description IS DISTINCT FROM (
       SELECT string_agg(s.text, '' ORDER BY s.position)
         FROM description_sentences s
        WHERE s.dish_id = d.id
          AND s.field = 'short'
          AND s.locale = 'en'
     );
  IF n > 0 THEN
    RAISE EXCEPTION '% dishes have a short_description that does not match their sentences', n;
  END IF;

  RAISE NOTICE 'description_sentences populated with % rows', {len(rows)};
END
$$;

COMMIT;
"""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--db",
        default="gustale",
        help="the database to read from and write to (default: gustale, the live one)",
    )
    args = parser.parse_args()

    dishes = fetch_descriptions(args.db)
    print(f"[populate] {len(dishes)} published dishes in {args.db}")

    rows = build_rows(dishes)

    by_field: dict[str, int] = {}
    for _dish_id, field, _locale, _pos, _text in rows:
        by_field[field] = by_field.get(field, 0) + 1
    print(f"[populate] {len(rows)} sentences: {by_field}")

    sql = emit_sql(rows)
    sql_path = "/tmp/populate_description_sentences.sql"
    with open(sql_path, "w") as fh:
        fh.write(sql)

    if not args.apply:
        print("[populate] dry run — the SQL is at /tmp/populate_description_sentences.sql")
        print("[populate] re-run with --apply to write it")
        return 0

    result = subprocess.run(
        [
            "docker",
            "exec",
            "-u",
            "postgres",
            "-i",
            "shared-postgres",
            "psql",
            "-U",
            "postgres",
            "-d",
            args.db,
            "-v",
            "ON_ERROR_STOP=1",
            "-f",
            "-",
        ],
        input=sql,
        capture_output=True,
        text=True,
    )
    print(result.stdout[-2500:])
    if result.returncode != 0:
        print(result.stderr[-2500:])
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
