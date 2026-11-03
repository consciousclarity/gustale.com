/**
 * Vitest setup — loaded before any test runs.
 *
 * Loads apps/api/.env into process.env so the env-validator in src/env.ts
 * finds DATABASE_URL, SESSION_SECRET, BETTER_AUTH_SECRET, and the MinIO
 * credentials. Without this, env.ts calls process.exit(1) and vitest
 * reports "process.exit unexpectedly called".
 *
 * Only loaded during tests; production code paths are unchanged.
 *
 * ---------------------------------------------------------------------------
 * THE LIVE-DATABASE ASSERTION
 * ---------------------------------------------------------------------------
 * The test suite MUST NOT run against the live database. The live database
 * is what the site serves; a test that writes to it corrupts production,
 * and a test that only reads it can still change the numbers a test asserts
 * on (which is exactly how an atlas count test became flaky).
 *
 * This matters because the DSN is not under the test's control:
 *
 *   * `dotenv` does NOT override an existing DATABASE_URL, so a stale
 *     DATABASE_URL in the shell silently wins over apps/api/.env. That is
 *     a live trap in this repo, not a hypothetical.
 *   * the default target for a diagnostic is a scratch database, and
 *     reaching the live one requires an explicit GUSTALE_LIVE_DB_ALLOW=1.
 *
 * So the assertion below is the backstop: if the resolved DSN points at
 * the live database, the suite REFUSES TO RUN rather than quietly
 * damaging production.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "..", ".env") });

/**
 * The live production database name.
 *
 * This is DUPLICATED from scripts/lib/db_guard.py rather than imported:
 * that module is Python, and this file is TypeScript. The rule is the
 * same in both places -- the live database is reachable only by an
 * explicit, per-invocation opt-in (GUSTALE_LIVE_DB_ALLOW=1) -- and the
 * scanner in scripts/check-no-live-db-defaults.py holds this file to
 * it, so the two cannot drift apart silently.
 */
const LIVE_DB = "gustale";

/** Is live access permitted in this process? */
function liveAllowed(): boolean {
  return process.env.GUSTALE_LIVE_DB_ALLOW === "1";
}

/**
 * The database name in a postgres DSN.
 *
 * Handles the URL form (postgresql://user:pw@host:port/db?opts) and the
 * keyword form (dbname=x host=y).
 */
function databaseNameFromDsn(dsn: string): string | null {
  if (!dsn) return null;

  if (dsn.includes("://")) {
    let rest = dsn.split("://", 2)[1] ?? "";
    rest = rest.split("?", 1)[0] ?? "";
    rest = rest.split("#", 1)[0] ?? "";
    const at = rest.lastIndexOf("@");
    if (at !== -1) rest = rest.slice(at + 1);
    const slash = rest.lastIndexOf("/");
    if (slash === -1) return null;
    const name = rest.slice(slash + 1);
    return name || null;
  }

  const m = /(?:^|\s)dbname\s*=\s*(\S+)/.exec(dsn);
  if (m) return m[1]!.replace(/^['"]|['"]$/g, "");
  return null;
}

const dsn = process.env.DATABASE_URL ?? "";
const dbName = databaseNameFromDsn(dsn);

if (dbName === LIVE_DB) {
  // The ONLY way past this is an explicit, per-invocation opt-in — the
  // same variable the rest of the toolchain uses. It exists so that
  // reaching live is always a deliberate act.
  if (!liveAllowed()) {
    console.error(
      [
        "",
        "  REFUSED: the test suite would run against the LIVE database",
        `  (${LIVE_DB}).`,
        "",
        "  The test suite must never run against production: it can write",
        "  to it, and even a read-only test can change the numbers another",
        "  test asserts on.",
        "",
        "  The DATABASE_URL resolved to the live database. This usually",
        "  means a stale DATABASE_URL is set in the shell — dotenv does",
        "  NOT override an existing one, so the shell wins silently.",
        "",
        "  Point the tests at a scratch database:",
        "",
        "      GUSTALE_SCRATCH_DB=gustale_dev <your test command>",
        "",
        "  ...or unset the stale variable so apps/api/.env is used:",
        "",
        "      env -u DATABASE_URL <your test command>",
        "",
      ].join("\n"),
    );
    process.exit(1);
  }
}
