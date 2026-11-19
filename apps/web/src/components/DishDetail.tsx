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
              {/* WP-B2. "Origin unrecorded" is gone — the same blueprint
                rule as the meta cell: no dish has an "Origin" field in
                the UI. When there is no associated place there is
                simply no eyebrow place line; the eyebrow keeps the
                first-attested dates, which ARE a documented record and
                are labelled as such. */}
              {origin?.name}
              {dish.originDateEarliest && (
                <span className="coord">
                  first attested {dish.originDateEarliest}
                  {dish.originDateLatest &&
                  dish.originDateLatest !== dish.originDateEarliest
                    ? `–${dish.originDateLatest}`
                    : ""}
                </span>
              )}
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

            <div className="rec-byline">
              <span className="av" />
              <span>
                By{" "}
                <b>
                  {dish.createdBy
                    ? dish.createdBy.displayName
                    : "an unknown editor"}
                </b>
              </span>
              {dish.lastEditedBy &&
                dish.lastEditedBy.id !== dish.createdBy?.id && (
                  <span>
                    · last edited by <b>{dish.lastEditedBy.displayName}</b>
                  </span>
                )}
              <span className="star">
                {dish.viewCount.toLocaleString()} views
              </span>
            </div>

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
          <div>
            Created by{" "}
            {dish.createdBy ? (
              <strong>{dish.createdBy.displayName}</strong>
            ) : (
              "an unknown editor"
            )}
            {dish.lastEditedBy &&
              dish.lastEditedBy.id !== dish.createdBy?.id && (
                <>
                  {" · last edited by "}
                  <strong>{dish.lastEditedBy.displayName}</strong>
                </>
              )}
          </div>
          <div>
            {dish.viewCount.toLocaleString()} view
            {dish.viewCount === 1 ? "" : "s"}
            {dish.editCount > 0 && (
              <>
                {" · "}
                {dish.editCount} edit{dish.editCount === 1 ? "" : "s"}
              </>
            )}
            {dish.contributorCount > 0 && (
              <>
                {" · "}
                {dish.contributorCount} contributor
                {dish.contributorCount === 1 ? "" : "s"}
              </>
            )}
          </div>
          <div className="muted">
            Last updated {new Date(dish.updatedAt).toISOString().slice(0, 10)}
          </div>
        </footer>
      </div>
    </article>
  );
}
