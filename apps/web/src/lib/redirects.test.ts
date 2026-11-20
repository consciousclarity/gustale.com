import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  activeRedirects,
  REDIRECT_RULES,
  redirectFor,
} from "./redirects.ts";

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
      assert.notEqual(r.from, r.to, `${r.from} does not point at itself`);
    }
  });
});

describe("redirects — WP-C3's three rules are active", () => {
  it("activates /map, /regions and /place now that WP-C3 has landed", () => {
    const active = new Set(activeRedirects().map((r) => r.from));
    assert.ok(active.has("/map"), "/map is redirected to /atlas");
    assert.ok(active.has("/regions"), "/regions is redirected to /places");
    assert.ok(active.has("/place"), "/place is redirected to /places");
  });

  it("still holds back the rules whose targets do not exist", () => {
    const active = new Set(activeRedirects().map((r) => r.from));
    assert.ok(!active.has("/lineages"), "/lineages is held: /history is WP-C4");
    assert.ok(!active.has("/family"), "/family is held: /families is WP-C1");
  });

  it("points the three active rules at pages WP-C3 actually builds", () => {
    assert.equal(redirectFor("/map"), "/atlas");
    assert.equal(redirectFor("/regions"), "/places");
    assert.equal(redirectFor("/place"), "/places");
  });

  it("carries the rest of the path onto a prefix rule", () => {
    assert.equal(redirectFor("/place/greece"), "/places/greece");
    assert.equal(redirectFor("/map?family=curry"), null);
  });
});
