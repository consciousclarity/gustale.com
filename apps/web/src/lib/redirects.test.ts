import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeRedirects, REDIRECT_RULES, redirectFor } from "./redirects.ts";

describe("redirects — the map", () => {
  it("names every old path the blueprint's redirect map requires", () => {
    const froms = REDIRECT_RULES.map((r) => r.from);
    for (const required of [
      "/map",
      "/regions",
      "/lineages",
      "/family",
      "/place",
    ]) {
      assert.ok(froms.includes(required), `${required} is in the redirect map`);
    }
  });

  it("gives every rule a reason and the package that builds its target", () => {
    for (const r of REDIRECT_RULES) {
      assert.ok(r.reason.length > 20, `${r.from} has a reason`);
      assert.ok(
        r.targetBuiltBy.length > 2,
        `${r.from} names its target's package`,
      );
    }
  });

  it("never redirects a path to itself", () => {
    for (const r of REDIRECT_RULES) {
      assert.notEqual(r.from, r.to, `${r.from} moves`);
    }
  });
});

describe("redirects — no 301 to a 404", () => {
  // THE RULE. A redirect that points at a page which does not exist is
  // worse than no redirect: it tells a search engine the page is gone
  // and gives the reader a dead end.
  //
  // The check is against the paths that are REAL on production today.
  // A rule may only be active if its target is one of these.
  const PATHS_THAT_EXIST = new Set([
    "/",
    "/dishes",
    "/families",
    "/lineages",
    "/about",
    "/about/evidence",
    "/map",
    "/regions",
    "/family/curry",
    "/place/greece",
    "/login",
  ]);

  it("every ACTIVE rule points at a path that exists", () => {
    for (const r of activeRedirects()) {
      assert.ok(
        PATHS_THAT_EXIST.has(r.to),
        `${r.from} -> ${r.to}: the target must exist, or the rule is held`,
      );
    }
  });

  it("the held rules name the package that will release them", () => {
    const held = REDIRECT_RULES.filter((r) => !r.targetExists);
    assert.ok(held.length > 0, "there are held rules");
    for (const r of held) {
      assert.match(
        r.targetBuiltBy,
        /^WP-[A-Z]\d+$/,
        `${r.from} names a package`,
      );
    }
  });
});

describe("redirectFor", () => {
  it("returns null for a path that does not move", () => {
    assert.equal(redirectFor("/dishes/empanada"), null);
    assert.equal(redirectFor("/"), null);
    assert.equal(redirectFor("/about/evidence"), null);
  });

  it("redirects the exact path when a rule is active", () => {
    // Whichever rules are active, the exact path maps to the target.
    for (const r of activeRedirects()) {
      assert.equal(redirectFor(r.from), r.to);
    }
  });

  it("redirects a sub-path and keeps the rest of it", () => {
    for (const r of activeRedirects()) {
      assert.equal(redirectFor(`${r.from}/some-slug`), `${r.to}/some-slug`);
    }
  });

  it("does not redirect a path that merely starts with the same letters", () => {
    // `/families` must not be caught by a `/family` rule.
    assert.equal(redirectFor("/families"), null);
    assert.equal(redirectFor("/family-of-ideas"), null);
  });
});
