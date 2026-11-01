/**
 * The family page's taxonomy panel.
 *
 * WHY THIS EXISTS
 *
 * The brief's §P4 acceptance criterion says:
 *
 *   > The family page states its dimension, its definition and its
 *   > inclusion criteria, and explains that classification does not
 *   > imply common ancestry.
 *
 * The last clause is the one that matters. A reader who sees "N dishes
 * in the Dumpling family" will otherwise conclude those dishes share an
 * origin — and classification does NOT mean ancestry. The brief's own
 * product principles say it:
 *
 *   > Similarity does not establish descent.
 *   > Never infer ancestry from shared names, ingredients, shape,
 *   > geography or category membership.
 *
 * So the panel says so, in words, right next to the number.
 *
 * THE DIMENSION
 *
 * The taxonomy has FIVE dimensions — family, technique, course,
 * ingredient category and context — and they are NOT interchangeable.
 * "Dumplings" as a FAMILY (a food form) is a different claim from
 * "Steamed" as a TECHNIQUE (a preparation method). The dimension is
 * what tells the reader which kind of grouping they are looking at, so
 * it is stated rather than assumed.
 *
 * IT IS AN ISLAND
 *
 * The taxonomy is fetched when the panel approaches the viewport, so the
 * page stays static and fast.
 */

import { useEffect, useState } from "react";
import type { FamilyTaxonomy } from "../lib/api";
import { ApiError, getFamilyTaxonomy } from "../lib/api";

export default function FamilyTaxonomyPanel({ slug }: { slug: string }) {
  const [data, setData] = useState<FamilyTaxonomy | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [reason, setReason] = useState("");

  useEffect(() => {
    let cancelled = false;
    setState("loading");

    getFamilyTaxonomy(slug)
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
      <section
        className="section fam-taxonomy"
        aria-labelledby="fam-taxonomy-heading"
      >
        <h2 id="fam-taxonomy-heading">About this group</h2>
        <p className="sub">Loading the taxonomy…</p>
      </section>
    );
  }

  if (state === "error" || !data) {
    return (
      <section
        className="section fam-taxonomy"
        aria-labelledby="fam-taxonomy-heading"
      >
        <h2 id="fam-taxonomy-heading">About this group</h2>
        <p className="alert alert-warning">
          The taxonomy could not be loaded ({reason}). The dishes below are
          unaffected.
        </p>
      </section>
    );
  }

  const { family, inclusion, notAncestry, counts } = data;

  return (
    <section
      className="section fam-taxonomy"
      aria-labelledby="fam-taxonomy-heading"
    >
      <h2 id="fam-taxonomy-heading">About this group</h2>

      <dl className="fam-taxonomy__facts">
        <div>
          <dt>Dimension</dt>
          <dd>
            <strong>{family.dimensionLabel}</strong>
            {family.dimensionExplanation ? (
              <span className="fam-taxonomy__explain">
                {family.dimensionExplanation}
              </span>
            ) : null}
          </dd>
        </div>

        <div>
          <dt>Dishes</dt>
          <dd>{counts.dishes}</dd>
        </div>

        {family.definition ? (
          <div>
            <dt>Definition</dt>
            <dd>{family.definition}</dd>
          </div>
        ) : null}

        <div>
          <dt>What is included</dt>
          <dd>
            {inclusion.hasCriteria ? (
              inclusion.criteria
            ) : (
              <>
                The vocabulary does not yet record a rule for what belongs in
                this group, so the list below is the dishes currently filed
                under it. That is a gap in the vocabulary, not a definition.
              </>
            )}
          </dd>
        </div>
      </dl>

      <p className="fam-taxonomy__not-ancestry">{notAncestry}</p>
    </section>
  );
}
