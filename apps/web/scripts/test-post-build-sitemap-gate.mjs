#!/usr/bin/env node
/**
 * The post-build sitemap gate's tests.
 *
 * WHAT THIS PROVES
 * ----------------
 * `apps/web/scripts/post-build.mjs` used to catch a sitemap-generation
 * failure, log it, and exit 0. That is a false green: the build
 * succeeded, CI went green, the image was pushed, the containers were
 * swapped — and the site was left with no sitemap. Nothing alerts. The
 * degradation is invisible until the traffic is gone.
 *
 * Each test below makes the sitemap generator fail in a controlled way
 * and asserts that post-build.mjs EXITS NON-ZERO — the gate must fail
 * on ABSENCE (no sitemap), not just on a wrong sitemap.
 *
 * USAGE
 * -----
 *   node apps/web/scripts/test-post-build-sitemap-gate.mjs
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

let passed = 0;
let failed = 0;

function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/**
 * Build a throwaway copy of apps/web with a broken sitemap generator,
 * and run post-build.mjs against it.
 *
 * post-build.mjs resolves the repo root relative to ITS OWN url, so a
 * copy of apps/web in a temp dir resolves the repo root to the temp
 * dir. That is exactly what we want: we can then replace the temp
 * dir's scripts/generate_sitemaps.mjs with one that fails.
 */
function makeWorkspace({ generatorFails }) {
  const ws = mkdtempSync(join(tmpdir(), "post-build-gate-"));
  const webDir = join(ws, "apps", "web");
  mkdirSync(webDir, { recursive: true });

  // The minimal tree post-build.mjs needs: scripts/, and a dist/.
  mkdirSync(join(webDir, "scripts"), { recursive: true });
  cpSync(
    join(scriptDir, "post-build.mjs"),
    join(webDir, "scripts", "post-build.mjs"),
  );

  // The repo-root scripts/ dir, where the generator lives.
  mkdirSync(join(ws, "scripts"), { recursive: true });
  if (generatorFails) {
    writeFileSync(
      join(ws, "scripts", "generate_sitemaps.mjs"),
      [
        "// A generator that always fails, standing in for a broken one.",
        "console.error('[generate_sitemaps] simulated failure');",
        "process.exit(1);",
      ].join("\n"),
    );
  } else {
    writeFileSync(
      join(ws, "scripts", "generate_sitemaps.mjs"),
      [
        "// A generator that succeeds.",
        "console.log('[generate_sitemaps] simulated success');",
        "process.exit(0);",
      ].join("\n"),
    );
  }

  // A dist with enough dish directories to pass the completeness floor.
  const dishes = join(webDir, "dist", "dishes");
  mkdirSync(dishes, { recursive: true });
  for (let i = 0; i < 25; i++) {
    const slug = join(dishes, `dish-${i}`);
    mkdirSync(slug, { recursive: true });
    writeFileSync(join(slug, "index.html"), "<html></html>");
  }

  return { ws, webDir };
}

function runPostBuild(ws, env = {}) {
  // BOTH streams are captured and CONCATENATED. The sitemap failure
  // message goes to stderr, so a test that only looked at stdout would
  // miss it -- which is very close to the false green this gate is
  // meant to prevent.
  const r = spawnSync(
    "node",
    [join(ws, "apps", "web", "scripts", "post-build.mjs")],
    {
      cwd: join(ws, "apps", "web"),
      env: { ...process.env, PUBLIC_DOMAIN: "recipes", ...env },
      encoding: "utf8",
    },
  );
  return {
    code: r.status === null ? 1 : r.status,
    out: `${r.stdout ?? ""}\n${r.stderr ?? ""}`,
  };
}

console.log("=== the post-build sitemap gate's tests ===");

// ── 1. A FAILING generator must FAIL the build ───────────────────────
{
  const { ws } = makeWorkspace({ generatorFails: true });
  const r = runPostBuild(ws);
  check(
    "a failing sitemap generator FAILS the build",
    r.code !== 0,
    `the exit code was ${r.code}`,
  );
  check(
    "the failure says the sitemap is the reason",
    /sitemap generation FAILED/i.test(r.out),
    "no sitemap failure message",
  );
  rmSync(ws, { recursive: true, force: true });
}

// ── 2. A MISSING generator must FAIL the build ───────────────────────
//    (the "absence" case — the file is not there at all)
{
  const ws = mkdtempSync(join(tmpdir(), "post-build-gate-"));
  const webDir = join(ws, "apps", "web");
  mkdirSync(join(webDir, "scripts"), { recursive: true });
  cpSync(
    join(scriptDir, "post-build.mjs"),
    join(webDir, "scripts", "post-build.mjs"),
  );
  mkdirSync(join(ws, "scripts"), { recursive: true });
  // NO generate_sitemaps.mjs — the generator is absent.
  const dishes = join(webDir, "dist", "dishes");
  mkdirSync(dishes, { recursive: true });
  for (let i = 0; i < 25; i++) {
    const slug = join(dishes, `dish-${i}`);
    mkdirSync(slug, { recursive: true });
    writeFileSync(join(slug, "index.html"), "<html></html>");
  }
  const r = runPostBuild(ws);
  check(
    "a MISSING sitemap generator FAILS the build",
    r.code !== 0,
    `the exit code was ${r.code}`,
  );
  rmSync(ws, { recursive: true, force: true });
}

// ── 3. A WORKING generator must SUCCEED ──────────────────────────────
{
  const { ws } = makeWorkspace({ generatorFails: false });
  const r = runPostBuild(ws);
  check(
    "a working sitemap generator succeeds",
    r.code === 0,
    `the exit code was ${r.code}: ${r.out.slice(-300)}`,
  );
  rmSync(ws, { recursive: true, force: true });
}

// ── 4. The escape hatch still works, and says so LOUDLY ──────────────
{
  const { ws } = makeWorkspace({ generatorFails: true });
  const r = runPostBuild(ws, { ALLOW_NO_SITEMAP: "1" });
  check(
    "ALLOW_NO_SITEMAP=1 permits the build to continue",
    r.code === 0,
    `the exit code was ${r.code}`,
  );
  check(
    "the escape hatch warns loudly",
    /WARNING/i.test(r.out) && /ALLOW_NO_SITEMAP/i.test(r.out),
    "no loud warning",
  );
  rmSync(ws, { recursive: true, force: true });
}

// ── 5. The gate must NOT be silently satisfied by an empty dist ──────
//    A build that produced almost nothing must still fail (the
//    completeness floor), so the sitemap gate is never the only thing
//    standing between a broken build and a shipped image.
{
  const ws = mkdtempSync(join(tmpdir(), "post-build-gate-"));
  const webDir = join(ws, "apps", "web");
  mkdirSync(join(webDir, "scripts"), { recursive: true });
  cpSync(
    join(scriptDir, "post-build.mjs"),
    join(webDir, "scripts", "post-build.mjs"),
  );
  mkdirSync(join(ws, "scripts"), { recursive: true });
  writeFileSync(
    join(ws, "scripts", "generate_sitemaps.mjs"),
    "console.log('ok'); process.exit(0);",
  );
  const dishes = join(webDir, "dist", "dishes");
  mkdirSync(dishes, { recursive: true });
  // Only 2 dish dirs — well under the floor of 20.
  for (let i = 0; i < 2; i++) {
    const slug = join(dishes, `dish-${i}`);
    mkdirSync(slug, { recursive: true });
    writeFileSync(join(slug, "index.html"), "<html></html>");
  }
  const r = runPostBuild(ws);
  check(
    "a partial dist still FAILS (the completeness floor holds)",
    r.code !== 0,
    `the exit code was ${r.code}`,
  );
  rmSync(ws, { recursive: true, force: true });
}

console.log();
console.log(
  `=== the post-build sitemap gate's tests: ${passed} passed, ${failed} failed`,
);
process.exit(failed === 0 ? 0 : 1);