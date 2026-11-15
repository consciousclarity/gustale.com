import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stripUrls } from "./creditText.ts";

describe("stripUrls — the credit as text", () => {
  it("drops a parenthesised URL and keeps the name", () => {
    const credit =
      "Michael Hays (https://www.flickr.com/photos/15154907@N06) — Flickr " +
      "(https://www.flickr.com/photos/15154907@N06/1753760108) via " +
      "Wikimedia Commons (https://commons.wikimedia.org/wiki/File%3AChicken_tikka_masala.jpg)";

    const out = stripUrls(credit);

    assert.ok(!out.includes("http"), "no URL survives");
    assert.ok(!out.includes("flickr.com"), "no host survives");
    assert.ok(out.includes("Michael Hays"), "the photographer's name survives");
    assert.ok(out.includes("Flickr"), "the source name survives");
    assert.ok(out.includes("Wikimedia Commons"), "the host name survives");
  });

  it("keeps a credit with no URL exactly as it was", () => {
    const credit = "Photograph by a member of the public, CC BY 4.0";
    assert.equal(stripUrls(credit), credit);
  });

  it("drops a bare URL that is not in parentheses", () => {
    const out = stripUrls("From https://example.com/photo.jpg");
    assert.ok(!out.includes("example.com"));
    assert.ok(out.includes("From"));
  });

  it("leaves no doubled separator behind", () => {
    const out = stripUrls(
      "Michael Hays (https://example.com/a) — Wikimedia (https://example.com/b)",
    );
    assert.ok(!out.includes("— —"), "the em dash is not doubled");
    assert.ok(!/\s{2,}/.test(out), "no run of whitespace is left behind");
  });

  it("is empty-safe and idempotent", () => {
    assert.equal(stripUrls(""), "");
    const once = stripUrls("A (https://example.com) — B");
    assert.equal(stripUrls(once), once);
  });

  it("leaves the caption short enough for a phone", () => {
    // The real defect: this credit was 240 characters and 553px wide at
    // a 390px viewport. The names alone are what a reader needs.
    const credit =
      "Michael Hays (https://www.flickr.com/photos/15154907@N06) — Flickr " +
      "(https://www.flickr.com/photos/15154907@N06/1753760108) via " +
      "Wikimedia Commons (https://commons.wikimedia.org/wiki/File%3AChicken_tikka_masala_%28cropped%29.jpg)";
    const out = stripUrls(credit);
    assert.ok(out.length < 100, `the credit is ${out.length} characters`);
    assert.ok(out.length < credit.length / 2);
  });
});
