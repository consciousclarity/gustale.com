import { buildDishFacts, type DishPlaceAssociation } from "../lib/dishFacts";
import { selectDishHeroMedia } from "../lib/dishMedia";
import { buildSectionLinks, DISH_SECTION_IDS } from "../lib/dishSections";
import { filterHref, type PathPageSlugs } from "../lib/filterPages";
import type {
  DishCategory,
  DishDetailCore,
  DishDimension,
  DishMediaAttachment,
  DishName,
  DishOrigin,
  DishPreparation,
  DishTag,
} from "../types/dish";
import { DishCover } from "./DishCover";
import { DishFactsTable } from "./DishFactsTable";
import { DishGallery } from "./DishGallery";
import { DishSectionNav } from "./DishSectionNav";
import { EvidenceLabel } from "./EvidenceLabel";

export interface DishDetailProps {
  dish: DishDetailCore;
  origin: DishOrigin | null;
  categories: DishCategory[];
  tags: DishTag[];
  media: DishMediaAttachment[];
  /** Filtered lists that have a static path page (no-JS links). */
  pathPages?: PathPageSlugs | null;
  /**
   * The Pool A publication badge. When true, the page shows a visible
   * notice that the dish's claims are not yet evidenced.
   */
  unevidenced?: boolean;
  /**
   * The journey's state.
   *
   * It distinguishes the three states the brief requires: a dish with
   * a verified chronology ("history"), a dish with no verified
   * chronology (a RESEARCH GAP), and a journey that could not be
   * fetched (an OPERATIONAL failure). They are not the same thing and
   * the page must not present them as the same thing.
   *
   * The overview island only needs it to decide whether the nav offers
   * a link to the History section, which is rendered further down the
   * page by DishContentSections.
   */

  // ── WP-C2: the mockup's page ──────────────────────────────────────────

  /**
   * The dish's vocabulary dimensions, for the facts table.
   */
  dimensions?: DishDimension[];
  /**
   * The dish's names, for the facts table's "also called" row.
   */
  names?: DishName[];
  /**
   * The dish's place associations, for the facts table's "associated
   * with" row.
   */
  places?: DishPlaceAssociation[];
  /**
   * The preparation METHODS of the dish.
   *
   * They are TECHNIQUES, so they go into the Technique row of the
   * facts table -- not under the heading "Prepared components", which
   * promises the ingredients the dish is built FROM.
   */
  preparations?: DishPreparation[];

  // ── The nav's flags ────────────────────────────────────────────────
  //
  // One boolean per section the nav can link to. They describe the
  // WHOLE PAGE, not just this island: the sections below the map are
  // rendered by `DishContentSections`, and the map is an island of its
  // own.
  //
  // They are booleans rather than the data itself because the overview
  // does not render those sections — it would have to receive data it
  // does not use, only to answer a question the page already knows.

  /** Whether the page renders the "Where it belongs" section. */
  hasWhere?: boolean;
  /** Whether the page renders the History section. */
  hasHistory?: boolean;
  /**
   * Whether the page renders a Connections section.
   *
   * The overview island does not render it — the section belongs to
   * `DishContentSections`, below the map — but the NAV lives here and
   * must know about it, or it would omit a link to a section that is
   * on the page.
   */
  hasConnections?: boolean;
  /** Whether the page renders the Variants section. */
  hasVariants?: boolean;
  /** Whether the page renders the Ingredients section. */
  hasIngredients?: boolean;
  /** Whether the page renders a Recipes section. Same reason. */
  hasRecipes?: boolean;
  /** Whether the page renders the Sources section. */
  hasSources?: boolean;
}

/**
 * Editorial dish detail — media-first.
 * Full-bleed cover leads; copy and meta sit in a quieter inner column.
 */
export function DishDetail({
  dish,
  origin,
  categories,
  tags,
  media,
  pathPages = null,
  unevidenced = false,
  dimensions = [],
  names = [],
  places = [],
  preparations = [],
  hasWhere = false,
  hasHistory = false,
  hasConnections = false,
  hasVariants = false,
  hasIngredients = false,
  hasRecipes = false,
  hasSources = false,
}: DishDetailProps) {
  const primaryCategory =
    categories.find((c) => c.isPrimary) ?? categories[0] ?? null;

  /*
   * THE EYEBROW'S VOCABULARY PARTS: the family and the course.
   *
   * The brief's eyebrow is "Dish · Casserole · Main course" -- the
   * kind, the FAMILY, and the COURSE. The `categories` list carries
   * both, but it does not say which is which, so the order is decided
   * here from the controlled vocabulary rather than from the order
   * the rows happen to arrive in.
   *
   * The family is the primary category: it is the classification the
   * dish belongs to, and it is the one the site calls its family
   * everywhere else. The course is the remaining category that is a
   * course.
   *
   * A TECHNIQUE is deliberately not in the eyebrow. "Frying" is a
   * technique, and the mockup's eyebrow has no technique slot; the
   * technique belongs to the facts table's Technique row, where it
   * is labelled as a technique. Putting it in the eyebrow would
   * also put it next to the family, which reads as if the two were
   * the same kind of classification.
   */
  //
  // THE COURSE SLUGS ARE READ FROM THE LIVE TAXONOMY, NOT GUESSED.
  //
  // Measured on live, 2026-11-21, over all 1,474 published dishes,
  // the categories that ever appear alongside a primary category are:
  //
  //   main-course 94 | appetizer 23 | street-snack 11 | soup 11 |
  //   rice-dish 10  | noodle-soup 8 | kebab 8 | stew 7 | bread 6 |
  //   curry 5       | stir-fry 5 | pancake 5 | sandwich 4 | sauce 4 |
  //   dumpling 4    | dessert 3 | salad 3 | casserole 2 | fried-rice 1 |
  //   pasta 1       | breaded-cutlet 1 | egg-dish 1
  //
  // Only the first four of those are COURSES. "soup", "kebab" and
  // "curry" are FORMS -- the same word as "casserole" -- and putting
  // a form in the course slot would print "Dish · Casserole · Stew",
  // which is two forms and no course.
  //
  // THE LIST IS MEASURED AGAINST THE SITE'S OWN COURSE VOCABULARY.
  //
  // The API's `course` facet is built from `dish_dish_courses` ->
  // `dish_courses` -- the three vocabularies it collects in one query.
  // `/api/dishes/map` returns that vocabulary live:
  //
  //     course: appetizer, dessert, main-course
  //
  // and the 121 mapped dishes carry them 25 / 3 / 88 times, with 5
  // carrying no course at all.
  //
  // An earlier version of this set also listed `side`, `side-dish`,
  // `starter` and `street-snack`. NONE of those is a course in the
  // site's data: they are slugs that exist nowhere, in either
  // vocabulary. A set that mixes the two vocabularies prints an
  // eyebrow that calls a dish a "Starter" because it was filed under
  // a category the site has since replaced.
  const COURSE_SLUGS = new Set(["appetizer", "dessert", "main-course"]);

  //
  // THE FAMILY COMES FROM THE `dimensions` ARRAY, NOT FROM `categories`.
  //
  // There are two vocabularies in the database and the API returns
  // both. `categories` is the LEGACY one (the `categories` table,
  // 152 rows, mostly "*-cuisine" words such as "indonesian-cuisine"
  // and "japanese-cuisine"). `dimensions` is the CURRENT one
  // (`dish_dish_families` -> `dish_families`, filtered to the LISTED
  // families) and it names its own vocabulary on every row:
  //
  //   { "vocabulary": "family",    "slug": "casserole", "name": "Casserole" }
  //   { "vocabulary": "cuisine",   "slug": "greek",      "name": "Greek" }
  //   { "vocabulary": "technique", "slug": "frying",     "name": "Frying" }
  //
  // Reading the family out of `categories` was WRONG, and measurably
  // so: only 121 of the 1,474 published dishes carry a category at
  // all, and for 102 of those the PRIMARY category is a "*-cuisine"
  // word. Under the old rule those 102 dishes would have printed
  // "Dish · Indonesian cuisine" where the dish's family is really
  // something else. The dimensions array says which vocabulary a
  // value belongs to, so it cannot be confused with a cuisine.
  //
  // The legacy `categories` array is still read for the COURSE,
  // because `dish_dish_courses` carries zero rows and the course
  // dimension is populated only through the legacy table. That is
  // recorded here rather than hidden: it is a known gap in the
  // current data, not a claim that the legacy table is the plan.
  // THE FAMILY, WITHOUT THE `isPrimary` CONDITION.
  //
  // `dish_dish_families` has a UNIQUE constraint on `dish_id`, so a
  // dish has AT MOST ONE family row -- and its `is_primary` column
  // DEFAULTS TO FALSE. A lookup that required `isPrimary` would
  // therefore drop the family of any dish whose row happens to carry
  // the default, and the eyebrow would silently lose its middle part.
  //
  // Today the API hardcodes `true AS is_primary` for the family
  // branch of the dimensions query, so the flag is always true on
  // the wire. The lookup does not depend on that: it takes the
  // family's own row, which is unique anyway, and the API's
  // `status = 'active'` filter has already excluded retired rows.
  const familyDimension = dimensions.find(
    (d) => d.vocabulary === "family",
  );

  const eyebrowParts: DishCategory[] = [];
  const seenSlugs = new Set<string>();

  if (familyDimension) {
    eyebrowParts.push({
      categoryId: familyDimension.valueId,
      slug: familyDimension.slug,
      name: familyDimension.name,
      isPrimary: true,
    });
    seenSlugs.add(familyDimension.slug);
  }

  for (const category of categories) {
    if (seenSlugs.has(category.slug)) continue;
    if (!COURSE_SLUGS.has(category.slug)) continue;
    seenSlugs.add(category.slug);
    eyebrowParts.push({
      categoryId: category.categoryId,
      slug: category.slug,
      name: category.name,
      isPrimary: category.isPrimary,
    });
  }
  /**
   * The href for one eyebrow part.
   *
   * A part that came from the `family` dimension links to the
   * family's own filter. A part that came from the legacy
   * `categories` links to the category filter, because that is the
   * vocabulary the category filter reads -- and the course values
   * are in that vocabulary.
   */
  const eyebrowHref = (part: DishCategory): string => {
    if (part.slug === familyDimension?.slug && familyDimension) {
      return `/dishes?family=${encodeURIComponent(part.slug)}`;
    }
    return filterHref(pathPages, "category", part.slug);
  };

  const heroMedia = selectDishHeroMedia(media);

  // ── WP-C2: the facts table and the connections ─────────────────────────
  //
  // The facts table is built from what the API returned and NOTHING
  // else. A row that has no value says "No evidence", which is a
  // statement about the record rather than about the dish.
  const facts = buildDishFacts({
    canonicalName: dish.name,
    dimensions,
    names,
    places,
    unevidenced,
    preparations,
  });

  // The in-page nav. The ORDER is the mockup's; the MEMBERSHIP is data —
  // a section the page does not render gets no link, so the nav can
  // never point at an anchor that is not on the page.
  //
  // The flags describe the WHOLE page, not just this island: the
  // sections below the map are rendered by DishContentSections, and
  // the map itself is an island of its own.
  const sectionLinks = buildSectionLinks({
    hasWhere,
    hasHistory,
    hasConnections,
    hasVariants,
    hasIngredients,
    hasRecipes,
    hasSources,
  });

  return (
    <article
      id={DISH_SECTION_IDS.overview}
      className="dish-page"
      aria-labelledby={DISH_SECTION_IDS.overviewTitle}
    >
      <div className="dish-page-inner">
        {/* ─── Breadcrumb ────────────────────────────────────────────────── */}
        <div className="crumb">
          <a href="/dishes">Dishes</a>
          {primaryCategory && (
            <>
              <span className="sep">›</span>
              <a href={filterHref(pathPages, "category", primaryCategory.slug)}>
                {primaryCategory.name}
              </a>
            </>
          )}
          <span className="sep">›</span>
          <span style={{ color: "var(--ink)" }}>{dish.name}</span>
        </div>

        {/* ─── Title block and cover, side by side ────────────────────── */}
        {/*
            THE COVER SITS BESIDE THE TITLE.

            The mockup puts the cover image in the Overview, next to
            the title and the introduction -- not as a full-bleed band
            above them. That is the whole point of the change: a
            full-bleed 720px hero made the page's first impression a
            dark rectangle waiting for JavaScript, and it pushed the
            title itself below the fold.

            On a wide screen the title block and the 4:3 photograph sit
            side by side. On a narrow screen they stack, photograph
            first, and the title follows.
        */}
        <div className="dish-overview-head">
          <header className="rec-hero rec-hero--text">
            <div className="rec-eyebrow">
              {/*
                THE EYEBROW: kind · family · course (D21-3).

                The brief asks for "Dish · Casserole · Main course",
                as in the mockup, and says "No legacy date (D21-3)".

                What it USED to print was the legacy origin name and
                the first-attested dates:

                    "Greece  first attested 1920–1950"

                Three things were wrong with that. "Greece" was the
                LEGACY origin -- discovery data, carried over from
                the old places and traditions list, which ADR-004 and
                the atlas-STYLE rules both say must never read as a
                claim about where a dish came from. The dates were
                the legacy origin DATE range, and they were presented
                as a documented record ("first attested") when the
                row they come from is unreviewed. And neither of them
                said what the dish IS: the eyebrow answered "where
                and when" for a page whose reader arrived asking "what
                is this".

                The eyebrow now answers the question the reader
                actually has, using the controlled vocabulary:
                the kind ("Dish"), the family, and the course. The
                places a dish is associated with have their own
                section, "Where it belongs", and they say so.

                The dates are not lost -- they are in the History
                section, which is where a chronology belongs and
                where the evidence for it is shown.
              */}
              <span className="rec-eyebrow__kind">
                {dish.contentType ? (
                  dish.contentType.charAt(0).toUpperCase() +
                  dish.contentType.slice(1)
                ) : (
                  "Dish"
                )}
              </span>
              {/*
                Each part links to the filter that actually filters it.

                THE FAMILY links to `?family=<slug>`. That is the
                API's canonical family filter, and it reads
                `dish_dish_families` -> `dish_families` -- the same
                table the family dimension comes from. A family link
                that landed on `?category=<slug>` would return the
                LEGACY list instead, which is a different vocabulary
                and, for most families, an EMPTY one.

                THE COURSE links to the category filter, and that is
                deliberate rather than an oversight. The API's
                `category` filter reads the legacy `categories` table,
                and the COURSE VALUES LIVE THERE -- `main-course`,
                `appetizer` and `dessert` are rows in it. The API's
                own `course` facet is built from `dish_courses`, and
                there is no `?course=` query parameter at all, so
                linking a course as `?course=<slug>` would produce a
                URL that silently ignores the filter.

                `filterHref` resolves the course to its static page
                `/dishes/category/main-course/` when the list is big
                enough to have one, and to the query form otherwise.
              */}
              {eyebrowParts.map((part) => (
                <span className="rec-eyebrow__part" key={part.slug}>
                  {" · "}
                  <a href={eyebrowHref(part)}>{part.name}</a>
                </span>
              ))}
            </div>

            <h1 className="rec-title" id={DISH_SECTION_IDS.overviewTitle}>
              {dish.name}
            </h1>

            {dish.description && (
              <p className="rec-intro">{dish.description}</p>
            )}

            {/* The Pool A publication badge. A dish that is published and
              classified but whose claims are not yet evidenced says so,
              visibly, next to the prose it applies to. The notice is
              text, not colour alone — WCAG 1.4.1. */}
            {unevidenced && (
              <p className="rec-evidence" role="note">
                {/* THE EVIDENCE LABEL — the shared badge. This used to
                  print the raw database value "unevidenced", while the
                  journey printed "Possible" and "Parallel tradition"
                  for the same underlying state. Two vocabularies for
                  one thing. Now it is the site's four labels.

                  The sentence below is the meaning of the label, and it
                  says it in the site's own words. */}
                <EvidenceLabel
                  evidenceStatus="unevidenced"
                  hasSource={false}
                  subject="claim"
                />
                <span className="rec-evidence__text">
                  This dish was found through Wikipedia and is classified, but
                  its claims have not yet been checked against a source. Treat
                  the details as a starting point, not as settled fact.
                </span>
              </p>
            )}

            {/*
                NO BYLINE, NO VIEW COUNT (D21-8).

                The brief: "Byline and view counts go (D21-8)."

                The byline said "By an unknown editor" for every
                migrated dish -- the accounts that imported the old
                data are not the people who wrote the entries, so the
                byline attributed the page to a name that has nothing
                to do with it. And the view count is a popularity
                counter on an encyclopedia: it rewards whatever was
                imported first and tells the reader nothing about
                whether the entry is any good.

                Neither has any place on a reference page. The
                provenance that DOES matter -- when the entry was
                last updated -- stays in the footer.
            */}

            {/* ─── The facts table (WP-C2) ──────────────────────────────── */}
            {/* The mockup puts a label/value table directly under the
              introduction. It replaces the old meta grid: the grid was a
              row of counters ("Variants 3", "Contributors 2") and one
              value, and the counters were the part that told a reader
              nothing.

              The table says the same things and one more — WHERE the dish
              belongs — and every row that has no value says "No
              evidence", which is a statement about the record rather than
              about the dish. */}
            <DishFactsTable rows={facts} dishName={dish.name} />
            {tags.length > 0 && (
              <div className="rec-tags">
                {tags.map((t) => (
                  <span key={t.tagId} className="tag-chip">
                    {t.name}
                  </span>
                ))}
              </div>
            )}
          </header>

          {/* The cover photograph. It renders as a plain <img> with a
            srcset that describes the box it occupies, so the browser
            picks the 800w file on a phone. */}
          <DishCover dishName={dish.name} origin={origin} media={media} />
        </div>

        {/* ─── The in-page nav (WP-C2) ─────────────────────────────────── */}
        {/* The mockup's nav: Overview · Where · History · Connections ·
            Variants · Ingredients · Recipes · Sources.

            The ORDER is fixed by the mockup. The MEMBERSHIP is data: a
            section the page does not render gets no link, so the nav can
            never point at an anchor that is not on the page.

            It is rendered on the server, inside the overview island, so
            it costs no extra JavaScript. */}
        <DishSectionNav dishName={dish.name} links={sectionLinks} />
        {/* ─── Full description ──────────────────────────────────────────── */}
        {dish.longDescription && (
          <section
            className="section"
            aria-labelledby="long-description-heading"
          >
            <div className="sec-rule">
              <h2 id="long-description-heading">About this dish</h2>
            </div>
            <div className="prose">
              {dish.longDescription.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </section>
        )}

        {/* ─── Secondary gallery (hero media excluded by mediaId) ──────── */}
        <DishGallery
          media={media}
          excludeMediaId={heroMedia?.mediaId ?? null}
        />

        {/* ─── Editor / provenance ──────────────────────────────────────── */}
        <footer className="dish-foot">
          {/*
              NO BYLINE (D21-8).

              This footer used to read "Created by <name>" -- or
              "an unknown editor" -- followed by "· last edited by
              <name>".

              Both were removed because both are FALSE for the
              migrated corpus. These dishes were imported, and the
              import wrote every one of them under the same
              account, so the footer attributed thousands of
              unrelated entries to a single name that had no
              editorial relationship to any of them. "An unknown
              editor" is no better: it reads as "this entry has no
              author" when the truth is "the authorship is a
              mechanical artefact of the import and carries no
              information".

              A byline is a claim that a person vouched for this
              entry. The site cannot make that claim for an
              imported record, so it makes none.

              What the reader can actually use -- when the entry was
              last updated -- stays.
          */}
          {/*
              NO VIEW COUNT, NO EDIT COUNT, NO CONTRIBUTOR COUNT (D21-8).

              The footer's second line was "3,421 views · 2 edits ·
              2 contributors". A view count on an encyclopedia entry
              is a popularity counter; the edit and contributor
              counts are the numbers the site's own WORKFLOW
              produces, and printing them on a public page tells the
              reader that a dish has been touched twice without
              saying whether either touch improved it.
          */}
          <div className="muted">
            Last updated {new Date(dish.updatedAt).toISOString().slice(0, 10)}
          </div>
        </footer>
      </div>
    </article>
  );
}
