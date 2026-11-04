/**
 * The suite's own configuration is load-bearing, so it gets a test.
 *
 * WHY THIS FILE EXISTS
 *
 * Every test file in this suite talks to ONE database — the one in
 * apps/api/.env — and they all see the same rows. Vitest's default is
 * to run the test FILES in parallel. So while `dishes-write` publishes
 * a dish, `atlas-counts` can be reading the site-wide aggregate that
 * counts published dishes, and the two reads disagree.
 *
 * That is a time-of-check/time-of-use race, and it is not
 * hypothetical: the suite failed 1 run in 20 with
 *
 *   FAIL test/atlas-counts.test.ts > counts the dishes ONCE,
 *        not once per association
 *   AssertionError: expected 8 to be 7
 *
 * The fix is `fileParallelism: false` in apps/api/vitest.config.ts,
 * which stops the files from corrupting each other's data.
 *
 * WHY THE FIX NEEDS A TEST
 *
 * Because a config setting that makes the suite correct is invisible.
 * Delete the one line, or a future edit re-enables parallelism, and
 * the suite goes back to being wrong — intermittently, in CI, on a
 * green-looking run. That is the same shape as the false-green gates
 * this repository has already had to fix (a SQL assertion floor that
 * asserted nothing; a lint that checked zero files).
 *
 * So the setting is asserted here, in the suite, where a change to it
 * cannot land silently.
 */

import { describe, expect, it } from "vitest";
import config from "../vitest.config.js";

describe("the test suite's own configuration", () => {
  it("runs the test FILES one after another, not in parallel", () => {
    // The whole suite shares ONE database. Two files writing to it at
    // the same time corrupt each other's data — and the corruption
    // shows up as an intermittent failure in whichever test happens to
    // read a site-wide aggregate.
    expect(config.test?.fileParallelism).toBe(false);
  });

  it("still runs the whole test directory", () => {
    // A narrower `include` would quietly drop files from the suite,
    // and a dropped file cannot fail.
    expect(config.test?.include).toContain("test/**/*.test.ts");
  });
});
