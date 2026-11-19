/**
 * WP-B2 — the legacy associations, published as Unverified.
 *
 * THE CONTRACT THIS FILE PROVES
 *
 * The blueprint's rule for the associations work package is one sentence:
 * "Every dish shows where it belongs, honestly." It has two halves, and
 * this test holds both:
 *
 *   1. EVERY DISH SHOWS WHERE IT BELONGS — the association must actually
 *      reach the public API. Before WP-B2 the answer was no: all 2,713
 *      rows sat at `publication_state = 'draft'` and `/api/places` served
 *      nothing at all.
 *
 *   2. HONESTLY — the rows are labelled Unverified, and the dish page
 *      does not call them "Origin". An association records a connection;
 *      it does not establish where a dish was invented (ADR-004 §10).
 *
 * The test is deliberately split into the parts that can be checked by
 * reading the source and the parts that need a live database. The source
 * checks run in CI with no database; the database checks run against a
 * copy of the production shape and are driven by
 * `scripts/test-legacy-associations.sh`.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** The repo root, from this file at apps/web/src/lib/. */
const REPO = join(HERE, "..", "..", "..", "..");

function read(relative: string): string {
  return readFileSync(join(REPO, relative), "utf8");
}

// ─── The migration ────────────────────────────────────────────────────

describe("WP-B2 — the migration 0060", () => {
  const sql = read("db/migrations/0060_legacy_associations_published.sql");

  it("exists and is the next free number", () => {
    assert.match(sql, /0060/);
    // Two migrations must never share a number (the 0058 comment says
    // so, and it is why 0058 exists rather than 0056).
    assert.ok(
      sql.includes("0060_legacy_associations_published"),
      "the file is named for its number",
    );
  });

  it("publishes the legacy rows and types them legacy_unreviewed", () => {
    assert.match(sql, /publication_state\s*=\s*'published'/);
    assert.match(sql, /relationship_type\s*=\s*'legacy_unreviewed'/);
  });

  it("does NOT weaken the owner's reviewed rule", () => {
    // The reviewed rule (published AND evidenced AND accepted) is the
    // owner's rule of 2026-11-13. WP-B2 must leave it exactly as it
    // is, and add a SEPARATE legacy path beside it.
    assert.match(sql, /evidence_status\s*=\s*'evidenced'/);
    assert.match(sql, /review_state\s*=\s*'accepted'/);
    assert.match(
      sql,
      /published_legacy_associations_for_dish/,
      "the legacy path is a separate function",
    );
  });

  it("leaves the evidence status alone — the rows stay unevidenced", () => {
    // Publishing a row must not make it look sourced. If this migration
    // set evidence_status = 'evidenced' it would be inventing
    // evidence, which is the one thing the whole project exists to
    // avoid.
    assert.ok(
      !/SET\s+evidence_status\s*=\s*'evidenced'/i.test(sql),
      "no row is given evidence it does not have",
    );
    assert.ok(
      !/SET\s+review_state\s*=\s*'accepted'/i.test(sql),
      "no row is accepted by this migration",
    );
  });

  it("refuses a rejected row", () => {
    // A row a human rejected stays rejected. Publishing must not
    // resurrect it. The legacy rule admits only the two states a
    // human can be in without having decided anything.
    assert.match(sql, /review_state\s+IN\s*\('unreviewed',\s*'in_review'\)/);
    assert.ok(
      !/review_state\s*<>\s*'rejected'/.test(sql),
      "the exclusion is a whitelist, not a blacklist",
    );
  });

  it("records itself in the ledger", () => {
    assert.match(sql, /gus_migrations_applied/);
  });

  it("asserts its own outcome inside the transaction", () => {
    // A migration whose proof is a NOTICE after the COMMIT has proved
    // nothing. The proof has to be inside, so a failed proof rolls the
    // whole thing back.
    assert.match(sql, /0060: ok/);
    assert.match(sql, /BEGIN/);
    assert.match(sql, /COMMIT/);
  });

  it("the scalar predicate takes field values, not the table's row type", () => {
    // The API's role reads the associations through the functions. A
    // boolean that took the composite type would need the caller to
    // have already read the row, which is exactly the access the
    // design withholds. So it takes the four field values.
    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION public\.association_is_visible\(\s*p_publication_state\s+text,\s*p_relationship_type\s+text,\s*p_evidence_status\s+text,\s*p_review_state\s+text\s*\)/,
      "the scalar predicate takes the four field values",
    );
    assert.match(sql, /SECURITY DEFINER/);
  });

  it("the rule exists in exactly one place", () => {
    // Two copies of one rule can drift. The set-returning functions
    // call the boolean; they do not restate the rule.
    const legacy = sql.slice(
      sql.indexOf(
        "CREATE OR REPLACE FUNCTION public.published_legacy_associations_for_dish",
      ),
      sql.indexOf(
        "CREATE OR REPLACE FUNCTION public.published_legacy_associations_for_dish",
      ) + 2000,
    );
    assert.ok(
      !legacy.includes("p_evidence_status = 'evidenced'"),
      "the legacy function must not restate the reviewed rule",
    );
    assert.match(sql, /public\.association_is_visible\(/);
  });
});

// ─── The API ─────────────────────────────────────────────────────────

describe("WP-B2 — the API reads through the ONE predicate", () => {
  it("atlas.ts reads the union, not the reviewed rule alone", () => {
    const atlas = read("apps/api/src/routes/atlas.ts");
    assert.match(atlas, /visible_associations_for_dish/);
    assert.ok(
      !/FROM public\.published_associations_for_dish/.test(atlas),
      "the reviewed rule alone would hide every legacy row",
    );
  });

  it("places.ts reads the union on both of its paths", () => {
    const places = read("apps/api/src/routes/places.ts");
    // Both of the place route's paths — the place index and the one
    // place's dishes — go through the place-scoped union.
    assert.match(places, /visible_place_associations_for_place/);
    const uses = places.match(/visible_place_associations_for_place/g) ?? [];
    assert.equal(uses.length, 2, "both paths read the union");
    assert.ok(
      !/FROM dish_place_associations a/.test(places),
      "no path reads the table directly and bypasses the predicate",
    );
  });

  it("the union is called as a LATERAL join, not from a bare FROM", () => {
    // A set-returning function whose argument names a table that is
    // joined LATER is a Postgres error: "missing FROM-clause entry for
    // table g". The table is not in scope until the JOIN that follows
    // it. So the call has to be a CROSS JOIN LATERAL from the table.
    //
    // This is the bug that made /api/places return 500 on the first
    // run of WP-B2, so it gets its own test rather than riding on the
    // "reads the union" one above.
    const places = read("apps/api/src/routes/places.ts");
    // The bug is a call whose ARGUMENT is a column of a table that is
    // joined LATER. A bound parameter (${place.id}) is fine — the
    // value is known before the query runs. A column reference (g.id)
    // is not — g is not in scope until the JOIN that follows it.
    assert.ok(
      !/FROM public\.visible_place_associations_for_place\(\s*[a-z]\w*\.\w+\s*\)/.test(
        places,
      ),
      "the union must not be called with a column of a table joined later",
    );
    assert.match(
      places,
      /CROSS JOIN LATERAL public\.visible_place_associations_for_place/,
      "the place index calls the union as a LATERAL join",
    );
  });

  it("atlas-counts.ts counts with the same predicate the route serves", () => {
    const counts = read("apps/api/src/routes/atlas-counts.ts");
    assert.match(counts, /visible_associations_for_dish/);
    assert.ok(
      !/published_associations_for_dish/.test(counts),
      "a count that disagrees with what the API serves is worse than no count",
    );
  });

  it("search.ts reads the union, so a place is findable once it is published", () => {
    const search = read("apps/api/src/routes/search.ts");
    assert.match(search, /visible_place_associations_for_place/);
  });

  // THE LEGACY-ROW DEFINITION. This is the assertion that catches the
  // mistake the CI fixture made possible: a definition that recognised
  // legacy rows only by their PROVENANCE would miss the 1,235 legacy
  // tradition rows on production, because those rows carry
  // 'legacyStatus' and 'legacyProvenance' qualifiers and no legacy
  // provenance of their own.
  //
  // The definition must therefore accept the QUALIFIERS too, and it
  // must accept them by their 'legacy' PREFIX — so a qualifier the
  // backfill adds later cannot be missed.
  it("the migration defines ONE legacy-row rule, and it accepts the qualifiers", () => {
    const migration = read(
      "db/migrations/0060_legacy_associations_published.sql",
    );
    assert.match(
      migration,
      /CREATE OR REPLACE FUNCTION public\.association_is_legacy_row\(\s*p_provenance\s+text,\s*p_qualifiers\s+jsonb/,
      "the legacy-row rule must take the provenance AND the qualifiers",
    );
    assert.match(
      migration,
      /jsonb_object_keys/,
      "the rule must look at the qualifier NAMES, not at a fixed list of them",
    );
    assert.match(
      migration,
      /LIKE 'legacy%/,
      "the rule must accept any qualifier whose name begins with 'legacy'",
    );
  });

  it("the transformation uses that one rule, not a hard-coded provenance list", () => {
    const migration = read(
      "db/migrations/0060_legacy_associations_published.sql",
    );
    const updates =
      migration.match(/UPDATE public\.dish_place_associations/g) ?? [];
    assert.ok(
      updates.length >= 3,
      "the migration updates the type, the evidence and the publication",
    );
    for (const match of migration.matchAll(
      /UPDATE public\.dish_place_associations[\s\S]{0,400}?WHERE([^;]*);/g,
    )) {
      assert.match(
        match[1],
        /public\.association_is_legacy_row/,
        "every UPDATE must select its rows with the one legacy-row rule",
      );
    }
    // The prose in the header mentions the provenance list — it
    // explains how to reverse the migration — so the check is on the
    // CODE, not on the comments.
    const code = migration
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");
    assert.ok(
      !/WHERE provenance IN \(/.test(code),
      "a hard-coded provenance list would miss the rows whose only marker is a qualifier",
    );
  });

  it("the migration asserts no FIXED count, so it runs on the CI fixture too", () => {
    const migration = read(
      "db/migrations/0060_legacy_associations_published.sql",
    );
    assert.ok(
      !/expected 2713/.test(migration),
      "the count in the message is live's; the ASSERTION must be shape-based",
    );
    assert.match(
      migration,
      /association_is_legacy_row\(provenance, qualifiers\)/,
      "the legacy-row count must come from the one rule",
    );
  });

  it("labels the legacy group Unverified, in the public vocabulary", () => {
    const places = read("apps/api/src/routes/places.ts");
    assert.match(
      places,
      /legacy_unreviewed:\s*"Unverified associations"/,
      "the group heading says what the reader needs to know",
    );
  });
});

// ─── The UI ──────────────────────────────────────────────────────────

describe("WP-B2 — no dish has an 'Origin' field in the UI", () => {
  // The check has to look at what is RENDERED, not at the word
  // "Origin". The type is still called `DishOrigin` and the comments
  // explain why the label is gone — a grep for the bare word would
  // fail on both and prove nothing.
  //
  // So the comments come out FIRST, and then the word is looked for
  // in what is left: a JSX text node, or a string value.
  const RENDERED_ORIGIN = [
    />\s*Origin\s*</, // a JSX text node
    /"Origin"/, // a string value
    /'Origin'/, // a string value
    /Origin unrecorded/, // the placeholder text
  ];

  /** The source with every comment removed. */
  function code(relative: string): string {
    return read(relative)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  }

  it("the dish page has no 'Origin' meta cell", () => {
    const source = code("apps/web/src/components/DishDetail.tsx");
    for (const pattern of RENDERED_ORIGIN) {
      assert.ok(
        !pattern.test(source),
        `DishDetail.tsx still renders "Origin" (${pattern})`,
      );
    }
  });

  it("the cover fallback has no 'Origin unrecorded'", () => {
    const source = code("apps/web/src/components/DishCover.tsx");
    for (const pattern of RENDERED_ORIGIN) {
      assert.ok(
        !pattern.test(source),
        `DishCover.tsx still renders "Origin" (${pattern})`,
      );
    }
  });

  it("no dish page renders the word Origin at all", () => {
    // The belt to the braces: the two dish-page components that could
    // carry a place label, checked together.
    for (const file of [
      "apps/web/src/components/DishDetail.tsx",
      "apps/web/src/components/DishCover.tsx",
    ]) {
      const source = code(file);
      for (const pattern of RENDERED_ORIGIN) {
        assert.ok(
          !pattern.test(source),
          `${file} still renders "Origin" (${pattern})`,
        );
      }
      // The TYPE may still be called DishOrigin — the data field is
      // still called origin on the wire — but no LABEL may say Origin.
      assert.ok(
        !/className="k">\s*Origin/.test(source),
        `${file} still has an Origin meta cell`,
      );
    }
  });

  it("the associations section groups the legacy rows under their own heading", () => {
    const atlasPlaces = read("apps/web/src/components/AtlasPlaces.tsx");
    assert.match(
      atlasPlaces,
      /label:\s*"Unverified associations"/,
      "the legacy rows get a heading of their own, not 'Other associations'",
    );
    assert.match(atlasPlaces, /types:\s*\["legacy_unreviewed"\]/);
  });

  it("the legacy group comes LAST — the order is presentation metadata", () => {
    const atlasPlaces = read("apps/web/src/components/AtlasPlaces.tsx");
    const legacyAt = atlasPlaces.indexOf('id: "legacy"');
    const emergenceAt = atlasPlaces.indexOf('id: "emergence"');
    assert.ok(
      legacyAt > emergenceAt,
      "unverified comes after the evidenced groups",
    );
  });
});
