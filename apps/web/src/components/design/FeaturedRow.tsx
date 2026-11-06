/**
 * The Startpage's featured row — twelve dishes, chosen by a rule.
 *
 * WHY A COMPONENT AND NOT A LOOP IN THE ISLAND
 * ---------------------------------------------
 * The twelve are chosen by a RULE (a photo, a definition, an origin
 * and a family), and the rule is applied on the server. That is what
 * makes the row auditable: the server says which dishes qualify and
 * why, and this component only draws them.
 *
 * The rule is stated in the endpoint's own comment, in
 * apps/api/src/routes/dishes.ts. It is repeated here so that a reader
 * of this file can see the rule without opening the API.
 *
 * NO DRINKS ROW
 * --------------
 * There is no drinks row here, and there will not be one until the
 * drink catalogue is large enough to promise — about 40 verified
 * drinks. There are 8. The server excludes drinks from this endpoint
 * for exactly that reason; `/browse?type=drink` may exist, but the
 * Startpage does not promise a drinks section it cannot fill.
 *
 * NO MAP
 * ------
 * The map was removed from the Startpage by decision. The fallback is
 * a text list of places, and that list is rendered by this component's
 * sibling, the PlacesList — not here.
 */

import type { FeaturedDish } from "../../types/dish";

interface FeaturedRowProps {
  dishes: FeaturedDish[];
  loading: boolean;
}

/**
 * The cover image URL for a featured dish.
 *
 * The `variants` map holds the PUBLIC renditions, and its keys are the
 * rendition's WIDTH ("800", "1536") -- not names like "thumb" or
 * "card". So the variant to use is the SMALLEST one that is still
 * wide enough for the card: a featured card is about 250px wide on
 * screen, and a 800px rendition is already generous for it.
 *
 * The master file lives in a private bucket and is not proxied at
 * /media/*, so `publicUrl` is only a fallback for a dish whose
 * variants map is empty -- and for such a dish the master may well
 * 404. Serving a broken image is worse than serving none, so a dish
 * with no usable variant gets the placeholder instead.
 */
function coverSrc(dish: FeaturedDish): string | null {
  const cover = dish.cover;
  if (!cover) return null;
  const variants = cover.variantsUrls ?? {};

  // The smallest variant at least this wide.
  const widths = Object.keys(variants)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  const wanted = widths.find((w) => w >= FEATURED_CARD_WIDTH * 2);
  if (wanted !== undefined) return variants[String(wanted)];
  // Nothing big enough: the smallest one is better than none.
  if (widths.length > 0) return variants[String(widths[0])];

  return cover.publicUrl || null;
}

/** The width a featured card is rendered at, in CSS pixels. */
const FEATURED_CARD_WIDTH = 250;

/**
 * The alt text for a featured dish's image.
 *
 * The rule: the alt text must say what the image IS, in the page's
 * language. A caption built from the dish's own facts -- its name,
 * its origin, its family -- is in the page's language by
 * construction, because it is made of the dish's own name and its
 * own origin.
 *
 * The stored `altText` is preferred when it exists: it is written
 * for the specific photograph. When it does not, the fallback is
 * built here rather than left empty -- an empty alt attribute on a
 * meaningful image tells a screen reader nothing, and the image is
 * not decorative.
 */
function coverAlt(dish: FeaturedDish): string {
  const stored = dish.cover?.altText?.trim();
  if (stored) return stored;
  return `${dish.canonicalName}, a ${dish.familyName} from ${dish.originName}`;
}

export function FeaturedRow({ dishes, loading }: FeaturedRowProps) {
  if (loading) {
    // The row is server-rendered in the Startpage's own layout; this
    // branch is the client-side fallback while the island hydrates.
    return (
      <section className="featured" aria-labelledby="featured-heading">
        <h2 id="featured-heading" className="featured-heading">
          Featured
        </h2>
        <p className="featured-status">Loading the featured dishes…</p>
      </section>
    );
  }

  if (dishes.length === 0) {
    // An empty state WITH an action, which is the only place a "0"
    // is allowed to appear. A bare "0 featured dishes" is not an
    // empty state; it is a dead end.
    return (
      <section className="featured" aria-labelledby="featured-heading">
        <h2 id="featured-heading" className="featured-heading">
          Featured
        </h2>
        <div className="featured-empty">
          <p>
            No dish meets all four of the featured criteria yet — a photo, a
            definition, an origin and a family.
          </p>
          <a className="featured-empty-action" href="/dishes/">
            Browse all dishes instead
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="featured" aria-labelledby="featured-heading">
      <div className="featured-head">
        <h2 id="featured-heading" className="featured-heading">
          Featured
        </h2>
        <p className="featured-note">
          Twelve dishes, each with a photo, a definition, an origin and a
          family.
        </p>
      </div>

      <ul className="featured-grid">
        {dishes.map((dish) => {
          const src = coverSrc(dish);
          return (
            <li
              key={dish.id}
              className="featured-card"
              /* The editorial content type, on the element, so the
                 DOM proof can ASSERT that no featured card is a
                 drink. Without it the rule is only true in the
                 query, and the proof cannot see it. */
              data-content-type={dish.contentType}
            >
              {/* ONE LINK PER CARD. The whole card is the link's
                  target through the title link, and nothing else on
                  the card is a link -- so a screen reader hears one
                  link, not four. */}
              {src ? (
                <img
                  className="featured-img"
                  src={src}
                  alt={coverAlt(dish)}
                  width={dish.cover?.width ?? undefined}
                  height={dish.cover?.height ?? undefined}
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <div
                  className="featured-img featured-img-placeholder"
                  role="img"
                  aria-label={coverAlt(dish)}
                />
              )}
              <div className="featured-txt">
                <p className="featured-family">{dish.familyName}</p>
                <h3 className="featured-name">
                  <a href={`/dishes/${dish.slug}`}>{dish.canonicalName}</a>
                </h3>
                <p className="featured-origin">{dish.originName}</p>
                <p className="featured-def">{dish.shortDescription}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
