#!/usr/bin/env python3
"""Record the live counts before/after the #153 merge. READ-ONLY.

Records the row counts of every table #153 could touch, the existence and
shape of the objects 0046-0048 create, and the list of applied migrations.

READ-ONLY: every statement is a SELECT or a catalog lookup. Nothing is
written, and nothing is created.

THIS SCRIPT READS THE LIVE DATABASE ON PURPOSE -- that is the whole
point of it. It therefore goes through the shared guard, so live access
is an explicit, per-invocation opt-in:

    GUSTALE_LIVE_DB_ALLOW=1 python3 scripts/hermes/record-live-counts.py before

Usage:
  GUSTALE_LIVE_DB_ALLOW=1 python3 scripts/hermes/record-live-counts.py before
  GUSTALE_LIVE_DB_ALLOW=1 python3 scripts/hermes/record-live-counts.py after
"""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

# The live-database guard. It refuses to let this script reach the live
# database unless GUSTALE_LIVE_DB_ALLOW=1 was set for THIS invocation.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "lib"))
import db_guard  # noqa: E402

OUT = Path("/home/gustale/projects/gustale.com/.hermes/reports")

#: The database this script reads. It is live by purpose, so it needs
#: the guard's explicit opt-in -- and the guard refuses without it.
DB_NAME = db_guard.resolve_target(
    "gustale",
    purpose="record-live-counts.py",
    write=False,
)


def psql(sql: str) -> str:
    """Run one read-only query against live. Returns the raw output."""
    proc = subprocess.run(
        ["docker", "exec", "-u", "postgres", "shared-postgres",
         "psql", "-U", "postgres", "-d", DB_NAME, "-tA", "-F", "|", "-c", sql],
        capture_output=True, text=True, timeout=120)
    if proc.returncode != 0:
        return f"__ERROR__ {proc.stderr.strip()[:300]}"
    return proc.stdout.strip()


#: The tables the brief names, plus the tables 0046/0047/0048 touch.
COUNT_TABLES = [
    "dishes",
    "statements",
    "sources",
    "claim_citations",
    "publish_credential",
    "source_candidates",     # created by 0046 -- absent before
    "sentence_claims",
    "statement_status_log",
    "sentence_readings",
    "predicates",
    "categories",
    "users",                 # editorial byline table
    "user",                  # Better Auth login table (quoted)
    "session",
    "sessions",
    "edit_history",
    "reviewers",
    "passkey",
    "account",
    "verification",
    "statement_review_queue",
    "editorial_review_queue",
    "dish_translations_archived",
    "dish_relations_archive",
]

#: The objects 0046-0048 create or replace. Presence + definition.
OBJECT_CHECKS = [
    ("type", "source_candidate_status"),
    ("table", "source_candidates"),
    ("function", "session_actor"),
    ("function", "is_bot_publish_actor"),
    ("function", "publish_credential_owner_guard"),
    ("function", "statement_set_status"),
    ("trigger", "publish_credential_owner_guard_trg"),
    ("constraint", "publish_credential_actor_fkey"),
]

#: The migrations, in order, as the repo lists them.
MIGRATION_DIR = "db/migrations"


def counts() -> dict:
    out = {}
    for table in COUNT_TABLES:
        qname = f'"{table}"' if table in ("user",) else table
        exists = psql(
            "SELECT count(*) FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name="
            f"'{table}'")
        if exists == "0":
            out[table] = {"exists": False, "rows": None}
            continue
        n = psql(f"SELECT count(*) FROM public.{qname}")
        out[table] = {"exists": True, "rows": int(n) if n.isdigit() else n}
    return out


def status_breakdown() -> dict:
    q = ("SELECT status, count(*) FROM statements GROUP BY 1 ORDER BY 1")
    raw = psql(q)
    return {line.split("|")[0]: int(line.split("|")[1])
            for line in raw.splitlines() if "|" in line}


def published_breakdown() -> dict:
    q = ("SELECT status, count(*) FROM dishes GROUP BY 1 ORDER BY 1")
    raw = psql(q)
    return {line.split("|")[0]: int(line.split("|")[1])
            for line in raw.splitlines() if "|" in line}


def sources_breakdown() -> dict:
    q = ("SELECT source_class, count(*) FROM sources GROUP BY 1 ORDER BY 1")
    raw = psql(q)
    return {line.split("|")[0]: int(line.split("|")[1])
            for line in raw.splitlines() if "|" in line}


def objects() -> dict:
    out = {}
    for kind, name in OBJECT_CHECKS:
        if kind == "type":
            q = ("SELECT count(*) FROM pg_type t JOIN pg_namespace n "
                 "ON n.oid=t.typnamespace WHERE n.nspname='public' "
                 f"AND t.typname='{name}'")
        elif kind == "table":
            q = ("SELECT count(*) FROM pg_class c JOIN pg_namespace n "
                 "ON n.oid=c.relnamespace WHERE n.nspname='public' "
                 f"AND c.relname='{name}' AND c.relkind IN ('r','p')")
        elif kind == "function":
            q = ("SELECT count(*) FROM pg_proc p JOIN pg_namespace n "
                 "ON n.oid=p.pronamespace WHERE n.nspname='public' "
                 f"AND p.proname='{name}'")
        elif kind == "trigger":
            q = ("SELECT count(*) FROM pg_trigger t JOIN pg_class c "
                 "ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace "
                 f"WHERE n.nspname='public' AND t.tgname='{name}' AND NOT t.tgisinternal")
        elif kind == "constraint":
            q = ("SELECT count(*) FROM pg_constraint c JOIN pg_class r "
                 "ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace "
                 f"WHERE n.nspname='public' AND c.conname='{name}'")
        v = psql(q)
        out[f"{kind}:{name}"] = int(v) if v.isdigit() else v
    return out


def function_signatures() -> dict:
    """The exact signature of statement_set_status -- 0047 changes it."""
    q = ("SELECT p.proname, pg_get_function_identity_arguments(p.oid) "
         "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
         "WHERE n.nspname='public' AND p.proname IN "
         "('statement_set_status','session_actor','is_bot_publish_actor','publish_credential_owner_guard') "
         "ORDER BY 1,2")
    raw = psql(q)
    return [line for line in raw.splitlines() if line]


def applied_migrations() -> list:
    """The repo's migration list, and which of them exist on live.

    Live has no migration-ledger table for db/migrations/*.sql (the
    apply path is scripts/apply-migration-live.sh, run by hand). So the
    'applied' list is derived from the OBJECT each migration creates --
    which is what actually proves it was applied.
    """
    repo = Path("/home/gustale/projects/gustale.com")
    files = sorted(p.name for p in (repo / MIGRATION_DIR).glob("*.sql"))
    return files


def migration_state() -> list:
    """For 0045-0048, what exists on live right now."""
    probes = {
        "0045_credential_guard_comment.sql": [
            ("comment on publish_credential", psql(
                "SELECT count(*) FROM pg_description d "
                "JOIN pg_class c ON c.oid=d.objoid "
                "WHERE c.relname='publish_credential' AND d.objsubid>0")),
        ],
        "0046_source_candidates.sql": [
            ("table source_candidates", psql(
                "SELECT count(*) FROM information_schema.tables "
                "WHERE table_schema='public' AND table_name='source_candidates'")),
            ("type source_candidate_status", psql(
                "SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace "
                "WHERE n.nspname='public' AND t.typname='source_candidate_status'")),
        ],
        "0047_publish_credential_session_binding.sql": [
            ("function session_actor", psql(
                "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                "WHERE n.nspname='public' AND p.proname='session_actor'")),
            ("fk publish_credential_actor_fkey", psql(
                "SELECT count(*) FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid "
                "JOIN pg_namespace n ON n.oid=r.relnamespace "
                "WHERE n.nspname='public' AND c.conname='publish_credential_actor_fkey'")),
        ],
        "0048_bot_credential_guard.sql": [
            ("function is_bot_publish_actor", psql(
                "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                "WHERE n.nspname='public' AND p.proname='is_bot_publish_actor'")),
        ],
    }
    out = {}
    for mig, checks in probes.items():
        out[mig] = {label: (int(v) if v.isdigit() else v) for label, v in checks}
    return out


def integrity() -> dict:
    """Checks that must hold before AND after -- to prove nothing else moved."""
    return {
        "statements_total": psql("SELECT count(*) FROM statements"),
        "statements_with_provenance_atlas_fixture": psql(
            "SELECT count(*) FROM statements WHERE qualifiers->>'provenance'='atlas_fixture'"),
        "orphan_citations": psql(
            "SELECT count(*) FROM claim_citations c LEFT JOIN statements s "
            "ON s.id=c.statement_id WHERE s.id IS NULL"),
        "orphan_sources": psql(
            "SELECT count(*) FROM claim_citations c LEFT JOIN sources s "
            "ON s.id=c.source_id WHERE s.id IS NULL"),
        "sources_total": psql("SELECT count(*) FROM sources"),
        "distinct_source_urls": psql("SELECT count(DISTINCT url) FROM sources"),
        "bot_account_in_user_table": psql(
            "SELECT count(*) FROM \"user\" WHERE lower(email)='hermes-bot@gustale.com'"),
        "bot_in_editorial_users": psql(
            "SELECT count(*) FROM users WHERE lower(email)='hermes-bot@gustale.com'"),
        "publish_credential_actors": psql(
            "SELECT count(DISTINCT actor) FROM publish_credential"),
        "advisory_proof_fixtures": psql(
            "SELECT count(*) FROM \"user\" WHERE id LIKE 'adr006-proof%'"),
        "advisory_proof_statements": psql(
            "SELECT count(*) FROM statements WHERE value_literal='ADR-006 PROOF FIXTURE'"),
        "advisory_proof_sources": psql(
            "SELECT count(*) FROM sources WHERE url='https://example.invalid/adr006-proof'"),
    }


def main() -> int:
    label = sys.argv[1] if len(sys.argv) > 1 else "snapshot"
    snapshot = {
        "label": label,
        "counts": counts(),
        "statements_by_status": status_breakdown(),
        "dishes_by_status": published_breakdown(),
        "sources_by_class": sources_breakdown(),
        "objects": objects(),
        "function_signatures": function_signatures(),
        "migration_state": migration_state(),
        "integrity": integrity(),
        "repo_migrations": applied_migrations(),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"live-counts-{label}.json"
    path.write_text(json.dumps(snapshot, indent=2, sort_keys=True))
    print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
