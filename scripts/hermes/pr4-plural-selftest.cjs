#!/usr/bin/env node
/**
 * Does the PR 4 plural check actually CATCH a wrong plural?
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A gate that cannot fail is not a gate. The PR 4 DOM check reports
 * "counters with a WRONG plural: 0" — but that would also be 0 if
 * the check never matched anything.
 *
 * So this feeds the check KNOWN-BAD counters and known-good ones and
 * asserts it separates them. The same helper the real check uses is
 * imported, so this is a test of the real logic, not a copy of it.
 *
 * It is a .cjs file ON PURPOSE: Playwright resolves its module
 * dependencies from the file's own directory.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const SRC = path.join(__dirname, "pr4-startpage.cjs");

// The check lives inside the big script's main(), so this reads the
// source and evaluates the helper in isolation. If the helper is
// renamed or deleted, this fails loudly rather than silently passing.
const source = fs.readFileSync(SRC, "utf8");

// Capture the WHOLE expression, including the trailing .map(...).
// An earlier version stopped the capture before the .map, which left
// the shim returning the FILTERED FACTS instead of the mapped text —
// so every counter looked flagged and the self-test failed loudly.
// That is the point of a self-test.
const helperMatch = source.match(
  /const COUNTER_WORDS = \[([^\]]+)\];([\s\S]*?\.map\(\(c\) => c\.text\);)/,
);

if (!helperMatch) {
  console.error(
    "FAIL: could not find the plural helper in pr4-startpage.cjs — " +
      "the check may have been renamed or removed.",
  );
  process.exit(1);
}

// Rebuild the helper as a standalone function. The extracted block
// refers to `result.counterFacts`, so the shim provides a `result`
// with that shape INSIDE the function body.
// The extracted block starts with `const pluralErrors = result...`,
// which is exactly the expression the shim needs.
const helperSource = `
  const COUNTER_WORDS = [${helperMatch[1]}];
  const check = (counterFacts) => {
    const result = { counterFacts };
${helperMatch[2]}
    return pluralErrors;
  };
`;

const check = new Function(`${helperSource}; return check;`)();

const CASES = [
  // [text, number, shouldBeFlagged]
  ["1,474 dishes", 1474, false],
  ["123 families", 123, false],
  ["178 origins", 178, false],
  ["1 dish", 1, false],
  ["1 dishes", 1, true], // ← the bug the decision forbids
  ["2 dish", 2, true],
  ["0 places", 0, false],
  ["1 place", 1, false],
  ["12 dishes", 12, false],
  ["Map view", NaN, false], // not a counter at all
];

let failed = 0;
console.log("the plural check, on known inputs:");
for (const [text, number, shouldFlag] of CASES) {
  const got = check([{ text, number }]);
  const ok = got.length > 0 === shouldFlag;
  if (!ok) failed++;
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${JSON.stringify(text).padEnd(16)} ` +
      `-> ${got.length > 0 ? "FLAGGED" : "clean"} ` +
      `(expected ${shouldFlag ? "FLAGGED" : "clean"})`,
  );
}

console.log();
if (failed) {
  console.error(`PLURAL CHECK SELF-TEST FAILED: ${failed} case(s) wrong.`);
  process.exit(1);
}
console.log(`PLURAL_CHECK_SELFTEST_OK: ${CASES.length} cases, all correct.`);
