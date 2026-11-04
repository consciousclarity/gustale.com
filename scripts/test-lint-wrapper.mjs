#!/usr/bin/env node
// The regression test for the lint wrapper.
//
// WHAT THIS PROVES
// ----------------
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
// The `--no-errors-on-unmatched` flag tells biome not to fail when its
// pattern matches no files. At the ROOT of the monorepo that flag
// applies to the whole tree, so a misconfigured `files.includes` or a
// renamed directory produces a lint that examined zero files and
// reported success.
//
// A gate that examined nothing has not passed. It has not run.
//
// THE TEST
// --------
// The wrapper is exercised against a real biome, in a temporary
// directory, with a config that matches no files. The wrapper takes
// its arguments from the environment so the test can point it at a
// different directory.
//
// Usage:
//     node scripts/test-lint-wrapper.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const repoRoot = new URL("..", import.meta.url).pathname;
const wrapper = join(repoRoot, "scripts", "run-lint.mjs");

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}` + (detail ? ` -- ${detail}` : ""));
  }
}

// Run the wrapper in a given directory.
function runWrapper(cwd, extraArgs = []) {
  return spawnSync(process.execPath, [wrapper, ...extraArgs], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, GUSTALE_LINT_CWD: cwd },
  });
}

console.log("=== the lint wrapper's tests ===");

const tmp = mkdtempSync(join(tmpdir(), "gustale-lint-"));

try {
  // ── 1. a directory where biome matches NO files must FAIL ──────────
  //
  // A config whose `files.includes` names only *.xyz, in a directory
  // with no .xyz files: biome checks 0 files.
  const { mkdirSync } = await import("node:fs");
  const { execFileSync } = await import("node:child_process");

  const empty = join(tmp, "empty");
  mkdirSync(empty, { recursive: true });
  writeFileSync(join(empty, ".gitignore"), "");
  writeFileSync(
    join(empty, "biome.jsonc"),
    JSON.stringify({
      $schema: "https://biomejs.dev/schemas/2.5.5/schema.json",
      files: { includes: ["**/*.xyz"] },
    }),
  );
  // Biome needs a git repo (the config enables `vcs.useIgnoreFile`),
  // and it counts the CONFIG file itself as a checked file. So the
  // "zero files" case puts the config outside the directory biome
  // scans, via `--config-path`.

  // A config that matches no files AT ALL. The config file itself is
  // excluded from the count by naming only a pattern that cannot match
  // it.
  writeFileSync(
    join(empty, "biome.jsonc"),
    JSON.stringify({
      $schema: "https://biomejs.dev/schemas/2.5.5/schema.json",
      files: { includes: ["**/*.never-a-real-extension"] },
    }),
  );
  execFileSync("git", ["init", "-q"], { cwd: empty });

  // A CLI pattern that matches NO files at all. This is the real
  // zero-file case: biome prints "Checked 0 files" and exits 0.
  const r = runWrapper(empty, ["does-not-exist-*.xyz"]);
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;

  check(
    "a lint that checked ZERO files FAILS",
    r.status !== 0,
    `the exit was ${r.status}, expected non-zero`,
  );
  check(
    "the failure says it did not run",
    /did not run|examined nothing/i.test(out),
    `the output was: ${out.slice(-400)}`,
  );
  check(
    "the failure is an ::error:: annotation",
    out.includes("::error::"),
    `the output was: ${out.slice(-400)}`,
  );

  // ── 2. the wrapper reports the count it asserted on ────────────────
  check(
    "the wrapper reports how many files biome checked",
    /the files biome checked:\s*0/.test(out),
    `the output was: ${out.slice(-400)}`,
  );

  // ── 3. a real file that violates a rule must FAIL ─────────────────
  //
  // The wrapper must not have broken the gate: a genuine lint error
  // still has to fail.
  const broken = join(tmp, "broken");
  mkdirSync(broken, { recursive: true });
  writeFileSync(join(broken, ".gitignore"), "");
  writeFileSync(
    join(broken, "biome.jsonc"),
    JSON.stringify({
      $schema: "https://biomejs.dev/schemas/2.5.5/schema.json",
      formatter: { enabled: true, indentStyle: "space", indentWidth: 2 },
      linter: { enabled: true, rules: { preset: "recommended" } },
    }),
  );
  // Badly formatted: biome's formatter will flag it.
  writeFileSync(join(broken, "bad.ts"), "export const x    =    1;\n");
  execFileSync("git", ["init", "-q"], { cwd: broken });

  const r2 = runWrapper(broken, ["bad.ts"]);
  check(
    "a real lint error still FAILS",
    r2.status !== 0,
    `the exit was ${r2.status}, expected non-zero`,
  );
  check(
    "the real lint error checked at least one file",
    /the files biome checked:\s*[1-9]/.test(
      `${r2.stdout ?? ""}${r2.stderr ?? ""}`,
    ),
    `the output was: ${(`${r2.stdout ?? ""}${r2.stderr ?? ""}`).slice(-400)}`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

console.log();
console.log(
  `=== the lint wrapper's tests: ${passed} passed, ${failed} failed ===`,
);
process.exit(failed === 0 ? 0 : 1);
