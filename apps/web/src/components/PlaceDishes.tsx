/**
 * The place page's dish list — grouped by relationship type.
 *
 * WHY THIS EXISTS
 *
 * The brief's §5 (D3) makes a place first-class, and the P4 acceptance
 * criterion says:
 *
 *   > The place page heads "Dishes associated with this place" and
 *   > groups by relationship type; a shared dish appears under every
 *   > relevant published association and counts once per result set.
 *
 * So this component:
 *
 *   - GROUPS the dishes by relationship type, because the type is the
 *     claim. "This dish is associated with Israel as an established
 *     tradition" and "this dish is associated with Israel as a legacy
 *     unreviewed value" are different statements, and flattening them
 *     into one list would lose that.
 *   - shows a dish under EVERY group it belongs to, and counts the
 *     DISTINCT dishes once — which is what "counts once per result set"
 *     means.
 *   - says "Associated with", never "Origin". An association records a
 *     connection; it does not establish that the dish was invented
 *     there (ADR-004 §10).
 *   - shows the evidence as a WORD, never a number — the brief forbids
 *     numerical confidence scores.
 *   - says so when there is nothing published, rather than rendering an
 *     empty list that reads as "no dishes are associated with this
 *     place" — which is a different claim.
 */

import { useEffect, useState } from "react";
import type { PlaceResponse } from "../lib/api";
import { ApiError, getPlace } from "../lib/api";

const EVIDENCE_LABEL: Record<string, string> = {
  evidenced: "Evidenced",
  provisional: "Proposed",
  research_pending: "Being researched",
  unevidenced: "Not yet evidenced",
};

const EVIDENCE_CLASS: Record<string, string> = {
  evidenced: "atlas-evidence--evidenced",
  provisional: "atlas-evidence--provisional",
  research_pending: "atlas-evidence--pending",
  unevidenced: "atlas-evidence--unevidenced",
};

function EvidenceBadge({ status }: { status: string }) {
  return (
    <span
      className={`atlas-evidence ${EVIDENCE_CLASS[status] ?? EVIDENCE_CLASS.unevidenced}`}
    >
      {EVIDENCE_LABEL[status] ?? status}
    </span>
  );
}

export default function PlaceDishes({ slug }: { slug: string }) {
  const [data, setData] = useState<PlaceResponse | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    getPlace(slug)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setState("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setReason(
          err instanceof ApiError
            ? `API ${err.status}`
            : err instanceof Error
              ? err.message
              : "unknown",
        );
        setState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (state === "loading") {
    return (
      <section className="section" aria-labelledby="place-dishes-heading">
        <h2 id="place-dishes-heading">Dishes associated with this place</h2>
        <p className="sub">Loading the dishes…</p>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section className="section" aria-labelledby="place-dishes-heading">
        <h2 id="place-dishes-heading">Dishes associated with this place</h2>
        <p className="alert alert-warning">
          The dishes could not be loaded ({reason}).
        </p>
      </section>
    );
  }

  const groups = data?.groups ?? [];
  const placeName = data?.place.name ?? "this place";

  return (
    <section className="section" aria-labelledby="place-dishes-heading">
      <h2 id="place-dishes-heading">Dishes associated with this place</h2>

      {groups.length === 0 ? (
        <>
          <p className="sub">
            No association with {placeName} has been published yet.
          </p>
          <p className="atlas-note">
            A place is a record of where a dish is <em>connected</em>, not a
            claim that it was invented there. Associations appear here once they
            have been reviewed.
          </p>
        </>
      ) : (
        <>
          <p className="sub atlas-places__intro">
            {data?.counts.dishes ?? 0}{" "}
            {(data?.counts.dishes ?? 0) === 1 ? "dish is" : "dishes are"}{" "}
            associated with {placeName}
            {groups.length > 1 ? (
              <> under {groups.length} different kinds of association.</>
            ) : null}
          </p>

          {groups.map((group) => (
            <div className="atlas-group" key={group.relationship}>
              <h3 className="atlas-group__label">{group.label}</h3>
              <ul className="atlas-associations">
                {group.dishes.map((dish) => (
                  <li className="atlas-association" key={dish.slug}>
                    <div className="atlas-association__main">
                      <a
                        className="atlas-association__name"
                        href={`/dishes/${dish.slug}`}
                      >
                        {dish.canonicalName}
                      </a>
                    </div>
                    <EvidenceBadge status={dish.evidence.status} />
                    {dish.shortDescription ? (
                      <p className="atlas-association__explanation">
                        {dish.shortDescription}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
