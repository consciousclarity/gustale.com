/**
 * THE NGINX REDIRECT RULES — the two bugs this file exists to catch.
 *
 * WHAT WENT WRONG
 * ---------------
 * WP-C3 switched `/place` -> `/places`, `/regions` -> `/places` and
 * `/map` -> `/atlas` on. The generator emitted each one as
 *
 *     location ^~ /place {
 *         return 301 /places$is_args$args;
 *     }
 *
 * and that has TWO faults:
 *
 * 1. THE SUFFIX IS DROPPED. `/place/greece` is the place DETAIL page.
 *    The rule sent it to `/places` and threw `greece` away, so the
 *    detail page could never be reached from its old URL.
 *
 * 2. THE PREFIX MATCHES THE NEW PATH TOO. `^~ /place` is a PREFIX
 *    match, and `/places` starts with `/place`. So the rule matched
 *    `/places` -- the NEW index -- and redirected it to itself:
 *
 *        /places -> /places -> /places -> ...
 *
 *    An infinite redirect loop. `curl -L` gives up after 50 hops.
 *
 * The fix is a REGEX location with a boundary:
 *
 *     location ~ ^/place(?<suffix>/.*)?$ {
 *         rewrite ^/place(?<suffix>/.*)$ /places$suffix permanent;
 *         return 301 /places$is_args$args;
 *     }
 *
 * The character after the old prefix must be a slash or the end, so
 * `/places` does NOT match and is served instead.
 *
 * These assertions are about the GENERATED TEXT. The proof that the
 * text behaves this way is the staging curl table in PR #278, run
 * against a real nginx.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { nginxRedirectBlock } from "../../scripts/generate-redirect-rules.mjs";

const RULES = [
  {
    from: "/place",
    to: "/places",
    builtBy: "WP-C3",
    targetExists: true,
  },
  {
    from: "/regions",
    to: "/places",
    builtBy: "WP-C3",
    targetExists: true,
  },
  {
    from: "/map",
    to: "/atlas",
    builtBy: "WP-C3",
    targetExists: true,
  },
];

const block = nginxRedirectBlock(RULES);

test("the redirect rules are REGEX locations, not prefix locations", () => {
  assert.ok(
    !block.includes("location ^~ /place"),
    "/place is not a `^~` prefix location: that would match /places too",
  );
  assert.ok(
    !block.includes("location ^~ /map"),
    "/map is not a `^~` prefix location",
  );
  assert.ok(
    !block.includes("location ^~ /regions"),
    "/regions is not a `^~` prefix location",
  );
});

test("each old prefix is matched with a BOUNDARY", () => {
  assert.ok(
    block.includes("location ~ ^/place(?<suffix>/.*)?$ {"),
    "/place is matched with a boundary, so /places does not match it",
  );
  assert.ok(
    block.includes("location ~ ^/map(?<suffix>/.*)?$ {"),
    "/map is matched with a boundary",
  );
  assert.ok(
    block.includes("location ~ ^/regions(?<suffix>/.*)?$ {"),
    "/regions is matched with a boundary",
  );
});

test("the SUFFIX is carried across, so the detail page survives", () => {
  assert.ok(
    block.includes("rewrite ^/place(?<suffix>/.*)$ /places$suffix permanent;"),
    "/place/greece becomes /places/greece, not /places",
  );
  assert.ok(
    block.includes("rewrite ^/map(?<suffix>/.*)$ /atlas$suffix permanent;"),
    "/map/x becomes /atlas/x",
  );
});

test("the redirects are 301, not 302", () => {
  assert.ok(
    !block.includes("redirect;"),
    "no redirect is a 302; a moved page must be a 301",
  );
  assert.ok(
    (block.match(/permanent;/g) ?? []).length >= 3,
    "every active rule uses `permanent`",
  );
  assert.ok(block.includes("return 301 "), "the fallback is a 301");
});

test("the QUERY STRING survives", () => {
  assert.ok(
    block.includes("$is_args$args"),
    "the query string is carried on every rule",
  );
});

test("a rule whose target is not built yet is held back", () => {
  const held = nginxRedirectBlock([
    ...RULES,
    {
      from: "/family",
      to: "/families",
      builtBy: "WP-C1",
      targetExists: false,
    },
  ]);
  assert.ok(
    !held.includes("location ~ ^/family"),
    "/family is held: /families does not exist yet",
  );
  assert.ok(
    held.includes("# HELD"),
    "the block says which rules it held back and why",
  );
});
