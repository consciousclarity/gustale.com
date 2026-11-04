#!/usr/bin/env node
// The lint wrapper.
//
// WHY THIS EXISTS
// ---------------
// `biome check --max-diagnostics none --no-errors-on-unmatched .` can
// exit 0 while having checked NOTHING.
//
// PROVED with biome 2.5.15:
//
//     $ biome check --max-diagnostics none --no-errors-on-unmatched "does-not-exist-*.xyz"
//     Checked 0 files in 1343µs. No fixes applied.
//     $ echo $?
//     0
//
// The `--no-errors-on-unmatched` flag is what makes this possible: it
// tells biome not to fail when its pattern matches no files. That flag
// is useful for the monorepo's per-package invocations, where a
// package may legitimately have no files of a given type -- but at the
// ROOT, where the flag also applies to the whole tree, it means a
// misconfigured `files.includes` or a renamed directory would produce
// a lint that examined zero files and reported success.
//
// A gate that examined nothing has not passed. It has not run.
//
// WHAT THIS DOES
// --------------
// Runs biome exactly as before, and then asserts that biome actually
// checked some files. The count comes from biome's own summary output,
// not from a separate file walk, so it cannot disagree with what biome
// did.
//
// The floor is deliberately low (1). It is not trying to catch a
// shrinking codebase -- it is catching the case where the gate did not
// examine anything at all. A stricter floor belongs with the decision
// to ratchet the parked rules from "warn" back to "error", which is a
// separate piece of work with its own 573-warning cleanup.
//
// EXIT CODES
// ----------
//   0  biome passed AND checked at least one file
//   1  biome failed, OR biome checked no files, OR biome could not run
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const repoRoot = new URL("..", import.meta.url).pathname;

// The directory to lint. The default is the repo root; the test hook
// (GUSTALE_LINT_CWD) points it at a temporary directory so the
// wrapper's own behaviour can be tested without touching the repo.
const lintCwd = process.env.GUSTALE_LINT_CWD || repoRoot;

// The biome binary, resolved the same way `pnpm exec biome` would.
let biomeBin;
try {
  biomeBin = require.resolve("@biomejs/biome/bin/biome");
} catch {
  biomeBin = null;
}

// The floor: biome must have examined at least this many files.
const MIN_FILES = 1;

console.log("=== the lint ===");

// The paths to check. The default is the whole tree; the test hook
// passes a pattern that matches no files at all.
const targets = process.argv.slice(2);
if (targets.length === 0) targets.push(".");

let result;
if (biomeBin) {
  result = spawnSync(
    process.execPath,
    [
      biomeBin,
      "check",
      "--max-diagnostics",
      "none",
      "--no-errors-on-unmatched",
      ...targets,
    ],
    { cwd: lintCwd, encoding: "utf8" },
  );
} else {
  console.error(
    "::error::could not resolve @biomejs/biome -- the lint did not run. Run `pnpm install`.",
  );
  process.exit(1);
}

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");

// ── the assertion: biome must have checked some files ──────────────────
//
// Biome's summary line is "Checked N files in Xms." It is the count of
// files biome actually examined, so it is the number that matters --
// not a count of files that exist.
const m = output.match(/Checked\s+(\d+)\s+files?/i);
if (!m) {
  console.error(
    "::error::the lint produced no file count -- it did not run, or it failed before it started. A gate that did not run is not a gate that passed.",
  );
  process.exit(1);
}

const checked = Number(m[1]);
console.log(`  the files biome checked: ${checked}`);

if (checked < MIN_FILES) {
  console.error(
    `::error::the lint checked ${checked} files (the floor is ${MIN_FILES}). It examined nothing, so it did not pass -- it did not run.`,
  );
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log("=== the lint: OK ===");
