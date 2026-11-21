import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  localeUrlForPath,
  localeUrlsForPath,
  SITE_LOCALES,
} from "./locales.ts";

/**
 * THE FOOTER'S LANGUAGE SWITCHER — the paths it may offer.
 *
 * The footer switcher has to work on every page. It used to render a
 * link for every site locale on every page that had one, and only the
 * dish pages had one, so most pages had no switcher at all.
 *
 * These tests pin the rule that makes the new footer honest: a locale
 * is offered ONLY where the page actually exists in that locale. The
 * site builds one locale-prefixed route, `/[locale]/dishes/[slug]`, so
 * a dish page has a variant in every locale and nothing else does.
 */
describe("localeUrlForPath — a locale variant, or null", () => {
  it("gives a dish page a variant in every locale", () => {
    assert.equal(
      localeUrlForPath("en", "/dishes/moussaka-greek"),
      "/dishes/moussaka-greek",
    );
    assert.equal(
      localeUrlForPath("es", "/dishes/moussaka-greek"),
      "/es/dishes/moussaka-greek",
    );
    assert.equal(
      localeUrlForPath("ja", "/dishes/moussaka-greek"),
      "/ja/dishes/moussaka-greek",
    );
  });

  it("reads the slug out of a locale-prefixed dish path", () => {
    assert.equal(
      localeUrlForPath("de", "/de/dishes/moussaka-greek"),
      "/de/dishes/moussaka-greek",
    );
    assert.equal(
      localeUrlForPath("en", "/es/dishes/moussaka-greek"),
      "/dishes/moussaka-greek",
    );
  });

  it("tolerates a trailing slash", () => {
    assert.equal(
      localeUrlForPath("fr", "/dishes/moussaka-greek/"),
      "/fr/dishes/moussaka-greek",
    );
  });

  it("gives NO variant to a page that has no locale route", () => {
    // The site builds no /es/ home page and no /es/families.
    assert.equal(localeUrlForPath("es", "/"), null);
    assert.equal(localeUrlForPath("es", "/families"), null);
    assert.equal(localeUrlForPath("es", "/lineages"), null);
    assert.equal(localeUrlForPath("es", "/places"), null);
    assert.equal(localeUrlForPath("es", "/about"), null);
    assert.equal(localeUrlForPath("es", "/about/evidence"), null);
    assert.equal(localeUrlForPath("es", "/recipes"), null);
  });

  it("does not mistake a dish LIST for a dish page", () => {
    // /dishes is the list, and the site builds no /es/dishes list.
    assert.equal(localeUrlForPath("es", "/dishes"), null);
  });

  it("does not mistake a family or place page for a dish", () => {
    assert.equal(localeUrlForPath("es", "/family/dumpling"), null);
    assert.equal(localeUrlForPath("es", "/place/greece"), null);
  });
});

describe("localeUrlsForPath — the set the switcher may offer", () => {
  it("offers every locale on a dish page", () => {
    const urls = localeUrlsForPath("/dishes/moussaka-greek");
    assert.equal(Object.keys(urls).length, SITE_LOCALES.length);
    assert.equal(urls.en, "/dishes/moussaka-greek");
    assert.equal(urls.es, "/es/dishes/moussaka-greek");
  });

  it("offers NOTHING on a page with no locale route", () => {
    // The footer then shows the current language alone, rather than
    // nine links that all 404.
    assert.deepEqual(localeUrlsForPath("/"), {});
    assert.deepEqual(localeUrlsForPath("/families"), {});
    assert.deepEqual(localeUrlsForPath("/about/evidence"), {});
  });

  it("honours an explicit locale list", () => {
    const urls = localeUrlsForPath("/dishes/moussaka-greek", ["en", "es"]);
    assert.deepEqual(urls, {
      en: "/dishes/moussaka-greek",
      es: "/es/dishes/moussaka-greek",
    });
  });
});
