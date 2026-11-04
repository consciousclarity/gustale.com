import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // We need the DATABASE_URL to be set. The CI/local dev .env at
    // apps/api/.env supplies it; vitest will not auto-load it though.
    // Tests should source it from process.env directly.

    // ── THE TEST FILES MUST NOT RUN IN PARALLEL ─────────────────────
    //
    // Every test file in this suite talks to ONE database — the one in
    // apps/api/.env — and they all see the SAME rows. Vitest's default
    // is to run the test FILES in parallel, so while `dishes-write`
    // is publishing a dish, `atlas-counts` is reading the site-wide
    // aggregate that counts published dishes.
    //
    // That is a time-of-check/time-of-use race, and it is not
    // hypothetical. The suite failed 1 run in 20 with
    //
    //   FAIL test/atlas-counts.test.ts > counts the dishes ONCE,
    //        not once per association
    //   AssertionError: expected 8 to be 7
    //
    // — the two endpoints disagreed because a sibling file published a
    // dish between the two reads. The same race, reproduced on demand
    // by publishing and unpublishing a dish while the file runs, failed
    // 1 run in 6.
    //
    // WHY NOT FIX IT IN EACH TEST
    //
    // The obvious alternative — make every test that reads a
    // site-wide aggregate take a lock, or compare against a value it
    // computed itself — cannot work here: the endpoints under test
    // compute SITE-WIDE aggregates inside the API, over rows the test
    // cannot pin. The route takes no lock and offers no
    // request-scoped transaction (there is no AsyncLocalStorage or
    // per-request DB handle in apps/api/src), so a test cannot make
    // the API's read atomic with respect to a concurrent writer.
    //
    // The honest fix is to stop the concurrency at its source: the
    // files share a database, so the files must not run at the same
    // time. `fileParallelism: false` runs the files one after another
    // within the same worker, and each file's own tests still run
    // concurrently — so the suite is no slower in any meaningful way.
    //
    // This is a TEST-ONLY setting. It changes no production code and
    // no production behaviour; it only stops the test files from
    // corrupting each other's data.
    fileParallelism: false,
  },
});
