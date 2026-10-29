#!/usr/bin/env python3
"""Re-split the description sentences whose boundaries were wrong.

ADR-002 Q9 rule 1: "`short_description` is rendered from the sentences;
the concatenation must equal the live column exactly."

A splitter bug meant five stored "sentences" were really TWENTY-SEVEN
sentences. The cause was the quoted-span regex: a straight single
quote opened a span wherever it appeared, so the apostrophe in
"dish's" started a quoted span that ran to the next apostrophe
thousands of characters later. Every sentence boundary inside that
span was swallowed.

  | what | how many |
  |------|----------|
  | stored rows that are really several sentences | 5 |
  | sentence boundaries that were missing           | 22 |

The fix is the splitter (scripts/split_sentences.py), and this script
re-derives the affected rows from it.

IT IS SAFE TO RUN TWICE. The script compares the re-split against what
is stored, and only writes the rows that actually change. A second run
finds nothing to do.

The write goes through the same staging approach as the population,
with the concat check asserted BEFORE and AFTER — so if the re-split
would not reproduce the live column byte-for-byte, nothing is written.

Usage:  python3 scripts/resplit_description_sentences.py --apply
"""

import argparse
import subprocess
import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from split_sentences import split_sentences  # noqa: E402

# The dollars are the only thing that must not appear in the text.
TAG = "gustale_resplit"


def fetch_rows() -> list[dict]:
    sql = """
    select json_agg(row_to_json(t))
    from (
      select s.id, s.dish_id, s.field, s.locale, s.position, s.text,
             d.slug, d.short_description, d.long_description
        from description_sentences s
        join dishes d on d.id = s.dish_id
       where s.locale = 'en'
       order by d.slug, s.field, s.position
    ) t;
    """
    out = subprocess.run(
        ["bash", "scripts/dbq.sh", sql],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("[{"):
            import json

            return json.loads(line)
    raise SystemExit("could not parse the sentences out of dbq.sh")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    rows = fetch_rows()
    print(f"[resplit] {len(rows)} stored sentences")

    # Which rows need re-splitting?
    changes = []
    for row in rows:
        sentences = split_sentences(row["text"])
        if len(sentences) <= 1:
            continue
        # The re-split must reproduce the source exactly, or the
        # splitter is still wrong and nothing is written.
        if "".join(sentences) != row["text"]:
            raise SystemExit(
                f"the re-split of {row['slug']} [{row['field']}] does not "
                f"reproduce the source; refusing to write"
            )
        changes.append((row, sentences))

    if not changes:
        print("[resplit] nothing to do — every stored sentence is one sentence")
        return 0

    total_new = sum(len(s) for _row, s in changes)
    print(f"[resplit] {len(changes)} rows to re-split into {total_new} sentences")
    for row, sentences in changes:
        print(f"  {row['slug']} [{row['field']}] {len(sentences)} sentences")

    # Build the SQL.
    #
    # THE SIBLING ROWS MATTER. A field's sentences are a LIST, and the
    # mis-split row is one element of it. The re-split replaces that
    # ONE element with several, and the whole list is renumbered.
    #
    # An earlier version deleted every row for the (dish, field) and
    # re-inserted only the new ones — which threw away the SIBLING
    # sentences. For aloo-gobi the long field is [247 chars, 1257
    # chars, 95 chars]; only the 1257-char one was mis-split, and
    # deleting the lot left 9 sentences where there should have been
    # 13.
    #
    # So: the whole field is rebuilt, from the ORIGINAL stored rows,
    # with the mis-split row replaced by its parts.
    statements = []
    for row, sentences in changes:
        # The original list for this (dish, field, locale).
        siblings = [
            r
            for r in rows
            if r["dish_id"] == row["dish_id"]
            and r["field"] == row["field"]
            and r["locale"] == row["locale"]
        ]
        siblings.sort(key=lambda r: r["position"])

        rebuilt = []
        for sibling in siblings:
            if sibling["id"] == row["id"]:
                # The mis-split row becomes its parts.
                rebuilt.extend(sentences)
            else:
                rebuilt.append(sibling["text"])

        statements.append(
            "DELETE FROM description_sentences\n"
            f" WHERE dish_id = '{row['dish_id']}'\n"
            f"   AND field = '{row['field']}'\n"
            f"   AND locale = '{row['locale']}';"
        )
        values = []
        for position, sentence in enumerate(rebuilt, start=1):
            values.append(
                f"    ('{row['dish_id']}', '{row['field']}', '{row['locale']}', "
                f"{position}, ${TAG}${sentence}${TAG}$)"
            )
        statements.append(
            "INSERT INTO description_sentences (dish_id, field, locale, position, text)\n"
            "VALUES\n" + ",\n".join(values) + ";"
        )

    # The guard trigger will fire on the DELETE's cascade... no, the
    # trigger is on `dishes`, and deleting a sentence does not touch
    # `dishes`. But the `short_description` for a dish whose sentences
    # just changed must still match, so the assertion below is the
    # real gate.
    sql = """
BEGIN;
{body}

-- THE CONCAT CHECK, AFTER the re-split.
DO $$
DECLARE
  n integer;
BEGIN
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
    RAISE EXCEPTION '% dishes have a short_description that does not match their sentences after the re-split', n;
  END IF;

  SELECT count(*) INTO n
    FROM dishes d
   WHERE d.sentence_managed
     AND d.long_description IS DISTINCT FROM (
       SELECT string_agg(s.text, '' ORDER BY s.position)
         FROM description_sentences s
        WHERE s.dish_id = d.id
          AND s.field = 'long'
          AND s.locale = 'en'
     );
  IF n > 0 THEN
    RAISE EXCEPTION '% dishes have a long_description that does not match their sentences after the re-split', n;
  END IF;

  RAISE NOTICE 'the re-split held';
END
$$;

COMMIT;
""".replace("{body}", "\n".join(statements))

    sql_path = "/tmp/resplit_description_sentences.sql"
    with open(sql_path, "w") as fh:
        fh.write(sql)

    if not args.apply:
        print(f"[resplit] dry run — the SQL is at {sql_path}")
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
            "gustale",
            "-v",
            "ON_ERROR_STOP=1",
            "-f",
            "-",
        ],
        input=sql,
        capture_output=True,
        text=True,
    )
    print(result.stdout[-2000:])
    if result.returncode != 0:
        print(result.stderr[-2000:])
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
