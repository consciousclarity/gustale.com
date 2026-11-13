import type { CSSProperties } from "react";
import { lazy, Suspense } from "react";
import type {
  DishJourneyBeat,
  DishJourneyLineage,
  DishJourneyMovement,
} from "../lib/api";
import {
  CONFIDENCE_LABELS,
  EVIDENCE_KIND_LABELS,
  formatJourneyDate,
  hasJourneyDate,
  isMembershipLineageRole,
  lineageCaveat,
  lineageMembersLabel,
  lineageRoleLabel,
  lineageRoleShort,
  PLACE_ROLE_LABELS,
} from "../lib/journey";
import { LegacyJourney } from "./LegacyJourney";

export type {
  JourneyBeat,
  JourneyLineageLink,
} from "../lib/journey";

/**
 * The per-chapter map card is loaded lazily.
 *
 * `DishJourney` is reachable from the LEGACY path, so a static import of
 * the map card would put the pilot's map component into the chunk every
 * dish page loads. A dynamic import splits it into its own chunk, which
 * is only fetched when the pilot actually renders a map.
 */
const LazyJourneyMapCard = lazy(async () => {
  const mod = await import("./JourneyMapCard");
  return { default: mod.JourneyMapCard };
});

export interface DishJourneyProps {
  dishName: string;
  /** `history` = chapters exist. `gap` = no verified chronology. */
  status: "history" | "gap" | "unavailable";
  beats: DishJourneyBeat[];
  movements?: DishJourneyMovement[];
  lineages?: DishJourneyLineage[];
  /**
   * The new presentation (separate map cards, visible lineage section).
   * Off by default; the pilot gates it per dish.
   */
  presentation?: boolean;
}

/**
 * The dish Journey — the historical spine of the page.
 *
 * Structure follows the approved reference:
 *
 *   1. The journey heading and lede.
 *   2. The chapters, each with its own dated record, claim and source.
 *   3. ONE MAP PER CHAPTER, laid out side by side so the reader can
 *      compare them. This is the reference's central idea and it is
 *      kept: six chapters means six maps, not one overlaid map.
 *   4. The lineage association, immediately after the journey.
 *
 * Editorial rules this component enforces:
 *
 *   * Every chapter keeps the precision its source supports. A missing
 *     date is never rendered as 0 or as the current year.
 *   * Confidence and evidence type are labelled separately.
 *   * A movement is drawn only when a source supports it.
 *   * A lineage relationship is described in the words the recorded role
 *     actually supports. A non-directional role is never drawn as an
 *     ancestor or a descendant.
 *   * A research gap is stated plainly. It is not an empty section, and
 *     it is never dressed up with invented milestones.
 */
export function DishJourney({
  dishName,
  status,
  beats,
  movements = [],
  lineages = [],
  presentation = false,
}: DishJourneyProps) {
  // The existing P1-1 presentation is preserved exactly. The new one
  // (separate map cards, per-chapter evidence, visible lineage) is
  // additive and scoped by the `dj--v2` class.
  const sectionClass = presentation ? "dj dj--v2" : "dj";

  if (status === "unavailable") {
    return (
      <section className={sectionClass} aria-labelledby="journey-heading">
        <div className="dj__intro">
          <p className="dj__eyebrow">How this dish moved</p>
          <h2 id="journey-heading">Journey</h2>
        </div>
        <p className="dj__state dj__state--unavailable">
          The historical journey for {dishName} is temporarily unavailable. This
          is a loading problem, not a statement about the dish&rsquo;s history.
        </p>
      </section>
    );
  }

  if (status === "gap" || beats.length === 0) {
    return (
      <section className={sectionClass} aria-labelledby="journey-heading">
        <div className="dj__intro">
          <p className="dj__eyebrow">How this dish moved</p>
          <h2 id="journey-heading">Journey</h2>
          <p className="dj__lede">
            We have not yet verified a dated chronology for {dishName}.
          </p>
        </div>
        <div className="dj__state dj__state--gap">
          <p>
            The history of {dishName} is still being researched. A dated chapter
            appears here only when a traceable historical record supports it, so
            this page stays empty rather than showing a history we cannot stand
            behind.
          </p>
          <p className="dj__state-note">
            This is a research gap, not a claim that the dish is new.
          </p>
        </div>
      </section>
    );
  }

  const sorted = [...beats].sort((a, b) => a.sequence - b.sequence);
  // How many chapters sit side by side. The reference shows three on a
  // wide screen, two on a tablet and one on a phone; the CSS media
  // queries reduce the column count, and the component sets the
  // desktop value here.
  const columns = Math.min(sorted.length, 3);
  const coordinateBeats = sorted.filter(
    (b) =>
      typeof b.lat === "number" &&
      typeof b.lng === "number" &&
      Number.isFinite(b.lat) &&
      Number.isFinite(b.lng),
  );

  // The existing presentation: one combined path map, timeline beats.
  // Unchanged, so no dish outside the pilot is affected.
  if (!presentation) {
    return (
      <LegacyJourney dishName={dishName} beats={sorted} lineages={lineages} />
    );
  }

  return (
    <section className={sectionClass} aria-labelledby="journey-heading">
      <div className="dj__intro">
        <p className="dj__eyebrow">How this dish moved</p>
        <h2 id="journey-heading">Journey</h2>
        <p className="dj__lede">
          Key records in the story of {dishName} — places, dates as precisely as
          the source allows, and what each record does and does not establish.
        </p>
      </div>

      {/*
        The grid lays the chapters out in rows of `--djc-columns`. Each
        chapter needs to know its column within the row and which row it
        is in, so its map and its text land in the same column, directly
        above one another.
      */}
      <div
        className="dj__chapters"
        style={{ "--djc-columns": String(columns) } as CSSProperties}
      >
        {sorted.map((beat, index) => (
          <Chapter
            key={beat.id}
            beat={beat}
            number={index + 1}
            total={sorted.length}
            column={(index % columns) + 1}
            row={Math.floor(index / columns)}
            coordinateBeats={coordinateBeats}
            movements={movements}
          />
        ))}
      </div>

      {lineages.length > 0 && (
        <div className="dj__lineage-block">
          {lineages.map((lineage) => (
            <LineageNote key={lineage.slug} lineage={lineage} />
          ))}
        </div>
      )}
    </section>
  );
}

function Chapter({
  beat,
  number,
  total,
  column,
  row,
  coordinateBeats,
  movements,
}: {
  beat: DishJourneyBeat;
  number: number;
  total: number;
  /** The chapter's column within its row of chapters (1-based). */
  column: number;
  /** Which row of chapters this is (0-based). */
  row: number;
  coordinateBeats: DishJourneyBeat[];
  movements: DishJourneyMovement[];
}) {
  const date = formatJourneyDate(beat);
  const hasDate = hasJourneyDate(beat);

  return (
    <article className="djc" aria-labelledby={`dj-chapter-${beat.id}`}>
      <div
        className="djc__text"
        style={
          {
            "--djc-col": String(column),
            "--djc-row": String(row),
          } as CSSProperties
        }
      >
        <div className="djc__meta">
          <span className="djc__num" aria-hidden="true">
            {String(number).padStart(2, "0")}
          </span>
          <span className="djc__counter">
            {number} / {total}
          </span>
        </div>

        <h3 className="djc__title" id={`dj-chapter-${beat.id}`}>
          {beat.title ?? beat.placeName}
        </h3>

        <p className="djc__where">
          <span className="djc__place">{beat.placeName}</span>
          {hasDate && <span className="djc__date"> · {date}</span>}
          {beat.placeRole && (
            <span className="djc__role">
              {" "}
              · {PLACE_ROLE_LABELS[beat.placeRole]}
            </span>
          )}
        </p>

        <p className="djc__label">{beat.label}</p>

        <div className="djc__badges">
          {beat.evidenceKind && (
            <span className="djc__badge djc__badge--evidence">
              {EVIDENCE_KIND_LABELS[beat.evidenceKind]}
            </span>
          )}
          <span className={`djc__badge djc__badge--${beat.confidence}`}>
            {CONFIDENCE_LABELS[beat.confidence]}
          </span>
        </div>

        {beat.source && (
          <p className="djc__cite">
            {beat.source.url ? (
              <a
                href={beat.source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {beat.source.citationText ?? beat.source.title ?? "Source"}
              </a>
            ) : (
              (beat.source.citationText ?? beat.source.title)
            )}
            {beat.locator && (
              <span className="djc__locator"> · {beat.locator}</span>
            )}
            {beat.authors && (
              <span className="djc__authors"> · {beat.authors}</span>
            )}
          </p>
        )}

        {beat.scopeNote && (
          <details className="djc__scope">
            <summary>Evidence &amp; research limits</summary>
            <p>{beat.scopeNote}</p>
          </details>
        )}
      </div>

      <div
        className="djc__map"
        style={
          {
            "--djc-col": String(column),
            "--djc-row": String(row),
          } as CSSProperties
        }
      >
        <Suspense fallback={null}>
          <LazyJourneyMapCard
            beat={beat}
            coordinateBeats={coordinateBeats}
            movements={movements}
            markerNumber={number}
          />
        </Suspense>
      </div>
    </article>
  );
}

/**
 * The lineage association, shown immediately after the journey.
 *
 * The wording comes from the RECORDED role. A grouping role reads as
 * "related to", never as an ancestor or a descendant, because the data
 * does not record a descent.
 */
function LineageNote({ lineage }: { lineage: DishJourneyLineage }) {
  const members = lineage.relatedDishes ?? [];

  return (
    <div className="djl">
      <p className="djl__lead">
        {/*
          The sentence is driven by the RECORDED ROLE. For a grouping
          role it reads "Part of the X lineage — a cousin dish in the X
          lineage". For a directional role it must NOT say "part of",
          because the recorded claim is an ancestry, not a membership.
        */}
        {isMembershipLineageRole(lineage.role) ? (
          <>
            Part of the{" "}
            <a href={`/lineages/${lineage.slug}`} className="djl__name">
              {lineage.name}
            </a>{" "}
            lineage — {lineageRoleShort(lineage)}.
          </>
        ) : (
          <>
            <span className="djl__role">{lineageRoleLabel(lineage)}</span> —{" "}
            <a href={`/lineages/${lineage.slug}`} className="djl__name">
              {lineage.name}
            </a>
            .
          </>
        )}
      </p>

      {lineage.shortDescription && (
        <p className="djl__desc">{lineage.shortDescription}</p>
      )}

      {lineage.roleExplanation && (
        <p className="djl__why">{lineage.roleExplanation}</p>
      )}

      {lineage.changedElements.length > 0 && (
        <p className="djl__changed">
          <span className="djl__changed-label">What changed: </span>
          {lineage.changedElements.join(", ")}
        </p>
      )}

      {/*
        The caveat states what the data does and does not support. It
        is shown for a GROUPING, where "not a chain of descent" is the
        honest limit. It is NOT shown next to an explicit ancestry
        claim (an ancestor or a descendant role), because there the
        relationship IS a directional claim and the blanket caveat
        would contradict the sentence above it.
      */}
      {lineageCaveat(lineage) && (
        <p className="djl__uncertain">{lineageCaveat(lineage)}</p>
      )}

      {members.length > 0 && (
        <div className="djl__members">
          <h4 className="djl__members-title">{lineageMembersLabel(lineage)}</h4>
          <ul className="djl__member-list">
            {members.map((dish) => (
              <li key={dish.slug}>
                <a href={`/dishes/${dish.slug}`}>{dish.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
