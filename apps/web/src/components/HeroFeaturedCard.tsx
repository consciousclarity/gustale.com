import { useState, useEffect } from 'react';
import type { FeaturedDish } from '../types/dish';
import { getMediaSignedUrl } from '../lib/api';

export default function HeroFeaturedCard({ dishes }: { dishes: FeaturedDish[] }) {
  const [i, setI] = useState(0);
  const [cover, setCover] = useState<string | null>(null);

  // Auto-rotate ~6s unless reduced-motion or <2 dishes.
  useEffect(() => {
    if (dishes.length < 2) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const t = setInterval(() => setI((p) => (p + 1) % dishes.length), 6000);
    return () => clearInterval(t);
  }, [dishes.length]);

  const d = dishes[i];

  // Fetch a signed URL for the active dish's cover, if it has one.
  useEffect(() => {
    setCover(null);
    if (!d?.coverMediaId) return;
    let alive = true;
    getMediaSignedUrl(d.coverMediaId)
      .then((r) => { if (alive) setCover(r.url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [d?.coverMediaId]);

  if (!d) {
    return <div className="hero-fcard hero-fcard-empty" aria-hidden="true" />;
  }

  return (
    <a className="hero-fcard" href={`/dishes/${d.slug}`}>
      <div
        className="hero-fcard-img"
        style={
          cover
            ? { backgroundImage: `url(${cover})` }
            : { background: 'repeating-linear-gradient(135deg, var(--accent-soft) 0 14px, var(--card) 14px 28px)' }
        }
      />
      <div className="hero-fcard-body">
        <span className="hero-fcard-place">{d.originName ?? '—'}</span>
        <h3 className="hero-fcard-name">{d.canonicalName}</h3>
        <p className="hero-fcard-story">{d.shortDescription ?? ''}</p>
        <span className="hero-fcard-meta">{d.relationCount} links</span>
      </div>
      {dishes.length > 1 && (
        <div className="hero-fcard-dots">
          {dishes.map((x, idx) => (
            <button
              key={x.slug}
              className="hero-fcard-dot"
              data-on={idx === i ? '1' : '0'}
              aria-label={`Show ${x.canonicalName}`}
              onClick={(e) => { e.preventDefault(); setI(idx); }}
            />
          ))}
        </div>
      )}
    </a>
  );
}
