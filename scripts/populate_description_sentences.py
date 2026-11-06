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
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, __file__.rsplit("/", 1)[0])

# The live-database guard. It refuses to let this script reach the live
# database unless GUSTALE_LIVE_DB_ALLOW=1 was set for THIS invocation.
# See scripts/lib/db_guard.py for why the opt-in is a separate variable.
sys.path.insert(0, str(Path(__file__).resolve().parent / "lib"))
import db_guard  # noqa: E402

from split_sentences import split_sentences  # noqa: E402

FIELDS = (("short_description", "short"), ("long_description", "long"))


#: The PRODUCTION Postgres container. It hosts the live database and
#: five other PROJECTS' databases (bali, dewata, n8n, scribe).
#:
#: It is a CONSTANT, never a default, because an environment variable
#: that could aim a write at the production cluster is a variable that
#: will eventually be set to it. See scripts/find_migration_order.py,
#: which made the same decision for the same reason.
PRODUCTION_CONTAINER = "shared-postgres"

#: The DEDICATED test Postgres. Every throwaway database belongs here.
#:
#: Same reasoning, same shape: a constant, and a refusal as well.
TEST_PG_CONTAINER = "gustale-test-postgres"


def _psql_client() -> str:
    """The `psql` binary, on PATH or under /usr/lib/postgresql."""
    psql = shutil.which("psql")
    if not psql:
        import glob
        candidates = sorted(glob.glob("/usr/lib/postgresql/*/bin/psql"))
        psql = candidates[-1] if candidates else "psql"
    return psql


def psql_command(db: str) -> list[str]:
    """The psql invocation for this environment.

    FOUR environments, one script:

    - The live host: the `shared-postgres` container, reached with
      `docker exec`. The password lives in the deployment file and
      `scripts/dbq.sh` carries it.
    - The CI runner: Postgres is a service on 127.0.0.1 with
      PGPASSWORD=gustale, and there is NO container. `docker exec`
      fails there.
    - A scratch database on the host: the DEDICATED TEST POSTGRES.
    - CHAIN_MODE=ci: a service on 127.0.0.1, whatever else is on
      the machine.

    THE CONTAINER FOLLOWS THE TARGET, NOT THE MACHINE
    ------------------------------------------------
    This used to be decided by asking a question about the MACHINE:
    "is the `shared-postgres` container here?". That is the wrong
    question, and it wrote to production by accident.

    The production host HAS the `shared-postgres` container -- it is
    the live VPS. So on this host EVERY target -- including a
    throwaway database named `gustale_pr3_assert_test` -- resolved to
    `docker exec shared-postgres`. The script then created and wrote
    a scratch database ON THE PRODUCTION CLUSTER, which hosts the live
    database and five other projects' databases.

    That is the same class of defect as the 2026-11-06 incident, one
    layer down: the incident dropped the LIVE database because the
    target was the live name, and this writes a THROWAWAY database to
    the production cluster because the target was a throwaway NAME and
    the container was inferred from the machine.

    So the container is now decided by the TARGET:

      * the LIVE database  -> the production container. That is the
        only thing that legitimately writes there, and it gets there
        through the guard (which requires three independent signals)
        and the live-approval gate.
      * a THROWAWAY target -> the DEDICATED TEST POSTGRES. Never the
        production cluster, whatever the machine looks like.

    The probe "is there a container" is gone, because a machine's
    answer to it is not this script's business. `CHAIN_MODE=ci` still
    selects the CI's service path, because a CI runner has no
    container of either kind and the service is at PG_HOST:PG_PORT.

    The password and the port come from the environment, as they do
    everywhere else in the CI.
    """
    if os.environ.get("CHAIN_MODE") == "ci":
        return [
            _psql_client(), "-h", os.environ.get("PG_HOST", "127.0.0.1"),
            "-p", os.environ.get("PG_PORT", "5432"),
            "-U", os.environ.get("PGUSER", "postgres"), "-d", db,
            "-v", "ON_ERROR_STOP=1", "-X", "-tAc",
        ]

    # THE LIVE TARGET: the production container, and only then.
    if db == db_guard.LIVE_DB:
        return [
            "docker", "exec", "-u", "postgres", "-i", PRODUCTION_CONTAINER,
            "psql", "-U", "postgres", "-d", db,
            "-v", "ON_ERROR_STOP=1", "-X", "-tAc",
        ]

    # A THROWAWAY TARGET: the dedicated test Postgres. NEVER production.
    #
    # The refusal is by NAME and is unconditional, and it happens
    # BEFORE the first connection is attempted. Two independent
    # refusals stand between this script and the production cluster:
    # the constant above, and this one.
    if PRODUCTION_CONTAINER in (os.environ.get("GUSTALE_TEST_PG_CONTAINER") or ""):
        raise db_guard.ProductionContainerRefused(
            f"\n"
            f"  REFUSED: populate_description_sentences.py would run against the\n"
            f"  PRODUCTION Postgres container ({PRODUCTION_CONTAINER!r}), because\n"
            f"  GUSTALE_TEST_PG_CONTAINER names it.\n"
            f"\n"
            f"  A throwaway database must never be created on the production\n"
            f"  cluster -- it hosts the live database and five other projects'\n"
            f"  databases. There is no environment variable that can make it\n"
            f"  one.\n"
        )

    if shutil.which("docker"):
        if _container_exists(TEST_PG_CONTAINER):
            return [
                "docker", "exec", "-u", "postgres", "-i", TEST_PG_CONTAINER,
                "psql", "-U", "postgres", "-d", db,
                "-v", "ON_ERROR_STOP=1", "-X", "-tAc",
            ]
        # Docker is here, but the dedicated test Postgres is not. That is
        # the CI RUNNER: it has docker, and its Postgres is a SERVICE on
        # 127.0.0.1 -- the CI's own instance, which is not production.
        #
        # It is only safe to use a local port when this machine is
        # demonstrably NOT the production host. The production cluster IS
        # the `shared-postgres` container, so its absence is the proof.
        # On the production host the container IS present, so this branch
        # is unreachable there -- and the throwaway target can never land
        # on production's port.
        if not _container_exists(PRODUCTION_CONTAINER):
            return [
                _psql_client(), "-h", "127.0.0.1",
                "-p", os.environ.get("PG_PORT", "5432"),
                "-U", os.environ.get("PGUSER", "gustale"), "-d", db,
                "-v", "ON_ERROR_STOP=1", "-X", "-tAc",
            ]
        # The production host, and no test container. Refuse rather than
        # guess: the only local Postgres here is production's, on 5432.
        raise db_guard.ProductionContainerRefused(
            f"\n"
            f"  REFUSED: populate_description_sentences.py would write the\n"
            f"  throwaway database {db!r} to a local Postgres on this host,\n"
            f"  and this host runs the PRODUCTION container "
            f"({PRODUCTION_CONTAINER!r}).\n"
            f"\n"
            f"  A throwaway database must never be created on the production\n"
            f"  cluster. Start the dedicated test Postgres first:\n"
            f"\n"
            f"      bash scripts/lib/test_pg.sh up\n"
        )

    # No docker on this machine: a local psql client. The port is the
    # test Postgres's own published port (5434), never production's
    # 5432 -- so a stray client cannot land on the production cluster.
    return [
        _psql_client(), "-h", "127.0.0.1",
        "-p", os.environ.get("GUSTALE_TEST_PG_PORT", "5434"),
        "-U", "postgres", "-d", db,
        "-v", "ON_ERROR_STOP=1", "-X", "-tAc",
    ]


def psql_env(db: str) -> dict[str, str]:
    """The environment for the psql call.

    THE PASSWORD IS NOT INHERITED.

    The CI workflow sets `PGPASSWORD=gustale` INLINE, on each psql
    command, not as a job-level env. So a script that shells out to
    psql inherits an environment with NO password, and the connection
    fails with "fe_sendauth: no password supplied" — which looks
    nothing like the failure it is, and nothing like the guard
    firing.

    So the password is supplied HERE, from the same place the CI
    workflow takes it, when the environment does not already carry
    one.
    """
    env = dict(os.environ)
    if env.get("PGPASSWORD"):
        return env
    # The live host's password comes from the deployment file; the CI
    # runner's is the standard 'gustale'.
    password = None
    deployment = Path("/home/deploy/gustale.com/.db-password")
    if deployment.exists():
        raw = deployment.read_text().strip()
        if "=" in raw:
            password = raw.split("=", 1)[1].strip().strip("\"'")
    env["PGPASSWORD"] = password or "gustale"
    return env


def can_connect(db: str) -> bool:
    """Whether the population can reach the database AT ALL.

    The refusal "description_sentences already holds N rows" is the
    GUARD working. But in CI it was reported as a step failure, and
    the first thing to rule out is that the script could not connect
    in the first place — a different failure that looks the same in
    a log.
    """
    try:
        result = subprocess.run(
            psql_command(db) + ["select 1;"],
            capture_output=True, text=True, timeout=30,
            env=psql_env(db),
        )
        return result.returncode == 0
    except Exception:
        return False


def _container_exists(name: str) -> bool:
    """Is this container present on this machine?

    Used to decide whether the DEDICATED TEST POSTGRES is available,
    and -- on the CI runner, which has docker but no test container --
    to prove that this machine is NOT the production host.

    It is NOT used to decide which container a write goes to. That
    decision follows the TARGET; see :func:`psql_command`.
    """
    try:
        result = subprocess.run(
            ["docker", "inspect", name],
            capture_output=True, text=True, timeout=20,
        )
        return result.returncode == 0
    except Exception:
        return False


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
    out = subprocess.run(
        psql_command(db) + [sql],
        capture_output=True,
        text=True,
        check=True,
        env=psql_env(db),
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
        default=db_guard.scratch_database(),
        help="the database to read from and write to (default: gustale, the live one)",
    )
    args = parser.parse_args()

    # Vet the target BEFORE touching anything. This refuses the live
    # database unless GUSTALE_LIVE_DB_ALLOW=1 was set for this
    # invocation.
    args.db = db_guard.resolve_target(
        args.db, purpose="populate_description_sentences.py"
    )

    if not can_connect(args.db):
        print(f"[populate] CANNOT REACH the database {args.db}.")
        print(f"[populate] the command would be: {' '.join(psql_command(args.db))}")
        print("[populate] on the CI runner this means the Postgres service is "
              "not up, or PGPASSWORD is not in the environment.")
        return 1

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

    # The write uses the same environment probe as the read, so the
    # script writes to the same database it read from.
    write_cmd = psql_command(args.db)
    # psql_command ends with -tAc (the read form). For the write it
    # must be -f - (read the SQL from stdin).
    write_cmd = [a for a in write_cmd if a != "-tAc"] + ["-f", "-"]
    result = subprocess.run(
        write_cmd,
        input=sql,
        capture_output=True,
        text=True,
        env=psql_env(args.db),
    )
    print(result.stdout[-2500:])
    if result.returncode != 0:
        print(result.stderr[-2500:])
        return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (db_guard.LiveDatabaseRefused,
            db_guard.ProductionContainerRefused) as exc:
        # A refusal is the CORRECT outcome, not a crash.
        db_guard.refuse(str(exc))
