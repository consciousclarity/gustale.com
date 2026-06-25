import { useEffect, useState } from 'react';
import {
  getDishRelations,
  type DishRelationsResponse,
  type RelatedDish,
} from '../lib/api';

// ---------------------------------------------------------------------------
// Relation-type meta: display label, short description, accent tone.
// The order here is also the on-page display order (top → bottom).
// Strongest editorial categories first.
// ---------------------------------------------------------------------------
const RELATION_META: Record<
  string,
  { label: string; tone: 'strong' | 'medium' | 'soft'; blurb: string }
> = {
  family: {
    label: 'Same food family',
    tone: 'strong',
    blurb: 'Direct members of the same culinary form — dumpling family, noodle-soup family, rice-plate family, etc.',
  },
  'regional-cousin': {
    label: 'Regional cousins',
    tone: 'medium',
    blurb: 'Neighboring-region variations of the same underlying dish.',
  },
  diaspora: {
    label: 'Diaspora adaptations',
    tone: 'medium',
    blurb: 'Forms the dish took when carried by migration to a new home.',
  },
  'shared-ingredient': {
    label: 'Share an ingredient base',
    tone: 'soft',
    blurb: 'Built around the same key ingredient — coconut, fermented cabbage, rice, etc.',
  },
  'shared-method': {
    label: 'Share a cooking method',
    tone: 'soft',
    blurb: 'Cooked the same way: long braise, slow simmer, grill, two-stage fry, etc.',
  },
  'similar-serving': {
    label: 'Served similarly',
    tone: 'soft',
    blurb: 'Played in the same mealtime slot — street snack, breakfast porridge, festive centrepiece.',
  },
  ancestor: {
    label: 'Ancestors',
    tone: 'strong',
    blurb: 'Historical precedents the dish grew out of or adapted from.',
  },
  descendant: {
    label: 'Descendants',
    tone: 'strong',
    blurb: 'Later dishes that grew out of this one.',
  },
};

// Display order — the strongest categories at the top.
const RELATION_ORDER = [
  'family',
  'ancestor',
  'descendant',
  'regional-cousin',
  'diaspora',
  'shared-ingredient',
  'shared-method',
  'similar-serving',
];

export interface RelatedDishesProps {
  slug: string;
}

export function RelatedDishes({ slug }: RelatedDishesProps) {
  const [data, setData] = useState<DishRelationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getDishRelations(slug)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load related dishes.');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (error) {
    return (
      <section className="rel-error" aria-label="Related dishes">
        <p className="mono-sub">{error}</p>
      </section>
    );
  }

  if (!data || data.totalRelations === 0) {
    // Don't render an empty header — silence is the right answer when
    // a dish isn't yet connected to the network.
    return null;
  }

  // Sort: configured order first, unknown types after.
  const orderedTypes = Object.keys(data.relationsByType).sort((a, b) => {
    const ai = RELATION_ORDER.indexOf(a);
    const bi = RELATION_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <section className="rel-net" aria-labelledby="rel-heading">
      <div className="sec-rule">
        <h2 id="rel-heading">
          Part of the network{' '}
          <span className="mono-sub">
            · {data.totalRelations} curated relations
          </span>
        </h2>
      </div>

      {orderedTypes.map((type) => {
        const meta = RELATION_META[type];
        const entries = data.relationsByType[type] ?? [];
        if (entries.length === 0) return null;
        return (
          <div className="rel-group" key={type} data-tone={meta?.tone ?? 'soft'}>
            <header className="rel-group-head">
              <span className="rel-badge">{meta?.label ?? type}</span>
              {meta?.blurb && <span className="rel-blurb">{meta.blurb}</span>}
            </header>
            <ul className="rel-grid">
              {entries.map((d) => (
                <RelatedCard key={d.relationId} dish={d} />
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}

function RelatedCard({ dish }: { dish: RelatedDish }) {
  return (
    <li>
      <a className="rel-card" href={`/dishes/${dish.slug}`}>
        <div className="rel-card-head">
          <h3>{dish.name}</h3>
          <span className="rel-strength" aria-label={`Relation strength ${dish.strength} of 5`}>
            {'●'.repeat(dish.strength)}
            <span className="rel-strength-empty">{'●'.repeat(5 - dish.strength)}</span>
          </span>
        </div>
        <p className="rel-card-meta">
          {dish.cuisineName ? <span>{dish.cuisineName}</span> : null}
          {dish.countryName ? <span> · {dish.countryName}</span> : null}
        </p>
        {dish.reason && <p className="rel-card-reason">{dish.reason}</p>}
        {dish.shortDescription && (
          <p className="rel-card-desc">{dish.shortDescription}</p>
        )}
        <span className="rel-card-go">Explore →</span>
      </a>
    </li>
  );
}