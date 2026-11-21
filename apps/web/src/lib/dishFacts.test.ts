import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alsoCalledNames,
  buildDishFacts,
  type DishDimension,
  type DishName,
  type DishPlaceAssociation,
  ownLanguage,
  ownLanguageName,
  primaryDimension,
} from "./dishFacts.ts";
import { DISH_FACT_KEYS, DISH_FACT_MISSING } from "./dishSections.ts";

const dim = (
  vocabulary: string,
  slug: string,
  name: string,
  isPrimary = true,
): DishDimension => ({
  vocabulary,
  valueId: `${vocabulary}-${slug}`,
  slug,
  name,
  isPrimary,
});

const nm = (
  name: string,
  language = "en",
  kind = "endonym",
  isPrimary = false,
): DishName => ({
  language,
  script: "Latn",
  name,
  kind,
  isPrimary,
});

describe("primaryDimension", () => {
  it("finds the primary value of a vocabulary", () => {
    const dims = [
      dim("family", "casserole", "Casserole"),
      dim("technique", "frying", "Frying"),
    ];
    assert.equal(primaryDimension(dims, "family")?.name, "Casserole");
  });

  it("ignores a non-primary value when a primary one exists", () => {
    const dims = [
      dim("family", "stew", "Stew", false),
      dim("family", "casserole", "Casserole", true),
    ];
    assert.equal(primaryDimension(dims, "family")?.slug, "casserole");
  });

  it("returns undefined for a vocabulary the dish does not have", () => {
    assert.equal(primaryDimension([], "family"), undefined);
  });
});

describe("the dish's own language comes first (D21-13)", () => {
  const names = [
    nm("مسقعة", "ar"),
    nm("ムサカ", "ja"),
    nm("Musaca", "es"),
    nm("μουσακάς", "el"),
  ];

  it("leads with the name in the origin country's language", () => {
    // The blueprint's complaint: the Greek name was missing while
    // Arabic, Hindi, Japanese and Chinese were shown. When the name
    // IS there, it must lead.
    const out = alsoCalledNames(names, "Moussaka", "GR");
    assert.equal(out[0], "μουσακάς");
  });

  it("keeps the rest of the names after it", () => {
    const out = alsoCalledNames(names, "Moussaka", "GR");
    assert.equal(out.length, 4);
    assert.ok(out.includes("Musaca"));
    assert.ok(out.includes("ムサカ"));
  });

  it("keeps the API order when the dish has no name in its own language", () => {
    // The data gap the blueprint names: no Greek name on the record.
    // The row must not reorder on a guess.
    const withoutGreek = names.filter((n) => n.language !== "el");
    const out = alsoCalledNames(withoutGreek, "Moussaka", "GR");
    assert.deepEqual(out, ["مسقعة", "ムサカ", "Musaca"]);
  });

  it("keeps the API order when the country has no mapping", () => {
    const out = alsoCalledNames(names, "Moussaka", "ZZ");
    assert.deepEqual(out, ["مسقعة", "ムサカ", "Musaca", "μουσακάς"]);
  });

  it("keeps the API order when there is no origin country", () => {
    const out = alsoCalledNames(names, "Moussaka", null);
    assert.deepEqual(out, ["مسقعة", "ムサカ", "Musaca", "μουσακάς"]);
  });

  it("maps the languages the corpus needs", () => {
    const cases: Array<[string, string]> = [
      ["GR", "el"],
      ["TR", "tr"],
      ["IT", "it"],
      ["IL", "he"],
      ["TH", "th"],
      ["VN", "vi"],
      ["PH", "tl"],
      ["IN", "hi"],
      ["CN", "zh"],
      ["JP", "ja"],
    ];
    for (const [iso, language] of cases) {
      const own = ownLanguage(
        [{ ...nm(`x-${language}`, language), isPrimary: true }],
        iso,
      );
      assert.equal(own, language, `${iso} should map to ${language}`);
    }
  });
});

describe("the native-script name under the H1 (D21-13)", () => {
  it("returns the name in the dish's own language and script", () => {
    const own = ownLanguageName(
      [
        { language: "ja", script: "Jpan", name: "ムサカ", kind: "endonym", isPrimary: true },
        { language: "el", script: "Grek", name: "μουσακάς", kind: "endonym", isPrimary: true },
      ],
      "Moussaka",
      "GR",
    );
    assert.deepEqual(own, {
      name: "μουσακάς",
      language: "el",
      script: "Grek",
    });
  });

  it("returns nothing when the record has no name in its own language", () => {
    const own = ownLanguageName(
      [{ language: "ja", script: "Jpan", name: "ムサカ", kind: "endonym", isPrimary: true }],
      "Moussaka",
      "GR",
    );
    assert.equal(own, undefined);
  });

  it("returns nothing when the own-language name IS the canonical name", () => {
    // Printing it under the H1 would only repeat the title.
    const own = ownLanguageName(
      [{ language: "el", script: "Grek", name: "Moussaka", kind: "endonym", isPrimary: true }],
      "Moussaka",
      "GR",
    );
    assert.equal(own, undefined);
  });

  it("prefers the primary name of that language", () => {
    const own = ownLanguageName(
      [
        { language: "el", script: "Grek", name: "μουσακάδα", kind: "endonym", isPrimary: false },
        { language: "el", script: "Grek", name: "μουσακάς", kind: "endonym", isPrimary: true },
      ],
      "Moussaka",
      "GR",
    );
    assert.equal(own?.name, "μουσακάς");
  });
});

describe("alsoCalledNames", () => {
  it("drops the dish's own canonical name", () => {
    // "Moussaka; Moussaka" is noise.
    const out = alsoCalledNames([nm("Moussaka")], "Moussaka");
    assert.deepEqual(out, []);
  });

  it("keeps the other names", () => {
    const out = alsoCalledNames(
      [nm("Moussaka"), nm("Musaca", "es"), nm("Mousakas", "en")],
      "Moussaka",
    );
    assert.deepEqual(out, ["Musaca", "Mousakas"]);
  });

  it("drops a duplicate that differs only in case", () => {
    const out = alsoCalledNames([nm("Musaca", "es"), nm("musaca", "fr")], "X");
    assert.deepEqual(out, ["Musaca"]);
  });
});

describe("buildDishFacts", () => {
  it("builds every row in the mockup's order", () => {
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: [],
      names: [],
      places: [],
    });
    assert.deepEqual(
      rows.map((r) => r.key),
      [...DISH_FACT_KEYS],
    );
  });

  it("reads the family, serving and technique from the dimensions", () => {
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: [
        dim("family", "casserole", "Casserole"),
        dim("serving", "main-course", "Main course"),
        dim("technique", "frying", "Frying"),
      ],
      names: [],
      places: [],
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(by.family?.value, "Casserole");
    assert.equal(by.servedAs?.value, "Main course");
    assert.equal(by.technique?.value, "Frying");
  });

  it("links a family to its page but leaves a technique as plain text", () => {
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: [
        dim("family", "casserole", "Casserole"),
        dim("technique", "frying", "Frying"),
      ],
      names: [],
      places: [],
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(by.family?.href, "/families/casserole");
    assert.equal(by.technique?.href, undefined);
  });

  it("says 'No evidence' for a fact the dish does not have", () => {
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: [],
      names: [],
      places: [],
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(by.family?.value, DISH_FACT_MISSING);
    assert.equal(by.servedAs?.value, DISH_FACT_MISSING);
    assert.equal(by.associatedWith?.value, DISH_FACT_MISSING);
  });

  it("keeps a row with no value rather than dropping it", () => {
    // A dropped row reads as silence; "No evidence" reads as a state.
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: [],
      names: [],
      places: [],
    });
    assert.equal(rows.length, DISH_FACT_KEYS.length);
  });

  it("reads the associated place, its kind and its evidence state", () => {
    // The place must be EVIDENCED to be stated. The row used to take
    // whichever place came first -- often an unevidenced legacy row --
    // so the table could print a place the site cannot state.
    const places: DishPlaceAssociation[] = [
      {
        slug: "greece",
        name: "Greece",
        relationship: "established_tradition",
        status: "evidenced",
      },
    ];
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: [],
      names: [],
      places,
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(by.associatedWith?.value, "Greece · Established tradition");
    assert.equal(by.associatedWith?.href, "/place/greece");
    // The badge uses the site's four public words, not the raw status.
    assert.equal(by.associatedWith?.evidence, "Documented");
  });

  it("says No evidence rather than printing a place it cannot state", () => {
    // An unevidenced place is a gap. The row says so about the RECORD
    // rather than printing the place as an association.
    const places: DishPlaceAssociation[] = [
      {
        slug: "greece",
        name: "Greece",
        relationship: "established_tradition",
        status: "unevidenced",
      },
    ];
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: [],
      names: [],
      places,
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(by.associatedWith?.value, DISH_FACT_MISSING);
  });

  it("skips a place that cannot be stated and takes the next one", () => {
    // The order the API returns is not the order of merit. An
    // unevidenced row first must not shadow an evidenced row behind it.
    const places: DishPlaceAssociation[] = [
      { slug: "a", name: "A", relationship: "established_tradition", status: "unevidenced" },
      { slug: "b", name: "B", relationship: "established_tradition", status: "evidenced" },
    ];
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: [],
      names: [],
      places,
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(by.associatedWith?.value, "B · Established tradition");
    assert.equal(by.associatedWith?.href, "/place/b");
  });

  it("uses the public label vocabulary, not the raw status", () => {
    // The row used to capitalise the raw status, which printed
    // "Research_pending" -- underscore and all -- to a reader.
    const places: DishPlaceAssociation[] = [
      {
        slug: "greece",
        name: "Greece",
        relationship: "established_tradition",
        status: "provisional",
      },
    ];
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: [],
      names: [],
      places,
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.ok(
      !by.associatedWith?.evidence?.includes("_"),
      "the raw status leaked into the badge",
    );
  });

  it("joins the other names with commas", () => {
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: [],
      names: [nm("Moussaka"), nm("Musaca", "es"), nm("Mousakas", "en")],
      places: [],
    });
    const by = Object.fromEntries(rows.map((r) => [r.key, r]));
    assert.equal(by.alsoCalled?.value, "Musaca, Mousakas");
  });

  it("never invents a value", () => {
    // Every value on the table must be traceable to the input.
    const dims = [dim("family", "casserole", "Casserole")];
    const names = [nm("Mousakas", "en")];
    const places: DishPlaceAssociation[] = [
      {
        slug: "greece",
        name: "Greece",
        relationship: "established_tradition",
        status: "evidenced",
      },
    ];
    const rows = buildDishFacts({
      canonicalName: "Moussaka",
      dimensions: dims,
      names,
      places,
    });
    const allowed = new Set([
      "Casserole",
      "Mousakas",
      "Greece · Established tradition",
      DISH_FACT_MISSING,
    ]);
    for (const row of rows) {
      assert.ok(
        allowed.has(row.value),
        `${row.key} = ${row.value} came from nowhere`,
      );
    }
  });
  describe("the relationship kind, in words", () => {
    it("spells out the API's machine key", () => {
      const rows = buildDishFacts({
        canonicalName: "Moussaka",
        dimensions: [],
        names: [],
        places: [
          {
            slug: "greece",
            name: "Greece",
            relationship: "established_tradition",
            status: "evidenced",
          },
        ],
      });
      const by = Object.fromEntries(rows.map((r) => [r.key, r]));
      assert.equal(by.associatedWith?.value, "Greece · Established tradition");
    });

    it("reads the migration's own label as what it actually is", () => {
      // "legacy_unreviewed" is NOT a relationship kind. It means the row
      // came from the old places & traditions list and no source supports
      // it. Printing the raw key would put a sentinel on the page.
      const rows = buildDishFacts({
        canonicalName: "Moussaka",
        dimensions: [],
        names: [],
        places: [
          {
            slug: "greece",
            name: "Greece",
            relationship: "legacy_unreviewed",
            status: "evidenced",
          },
        ],
      });
      const by = Object.fromEntries(rows.map((r) => [r.key, r]));
      assert.equal(by.associatedWith?.value, "Greece · Unverified association");
      assert.ok(
        !by.associatedWith?.value.includes("legacy_unreviewed"),
        "the machine sentinel leaked onto the page",
      );
    });

    it("shows an unknown kind rather than hiding it", () => {
      const rows = buildDishFacts({
        canonicalName: "Moussaka",
        dimensions: [],
        names: [],
        places: [
          {
            slug: "greece",
            name: "Greece",
            relationship: "some_new_kind",
            status: "evidenced",
          },
        ],
      });
      const by = Object.fromEntries(rows.map((r) => [r.key, r]));
      assert.equal(by.associatedWith?.value, "Greece · some new kind");
    });
  });
});
