import type {
  DishCategory,
  DishCitation,
  DishDetailCore,
  DishIngredient,
  DishMediaAttachment,
  DishOrigin,
  DishPreparation,
  DishTag,
  DishVariant,
} from '../types/dish';
import { DishGallery } from './DishGallery';
import { AlsoExplore } from './AlsoExplore';

export interface DishDetailProps {
  dish: DishDetailCore;
  origin: DishOrigin | null;
  variants: DishVariant[];
  ingredients: DishIngredient[];
  categories: DishCategory[];
  tags: DishTag[];
  preparations: DishPreparation[];
  sources: DishCitation[];
  media: DishMediaAttachment[];
}

const HERO_TONES = ['#D98A53', '#C8743C'] as const;

/**
 * Renders the full editorial dish detail view (same design language as the
 * gustale.recipes "Gustale Recipes" template). All data is server-rendered
 * into the island props (SSR-safe) — no client-side fetch.
 */
export function DishDetail({
  dish,
  origin,
  variants,
  ingredients,
  categories,
  tags,
  preparations,
  sources,
  media,
}: DishDetailProps) {
  const primaryCategory = categories.find((c) => c.isPrimary) ?? categories[0] ?? null;

  return (
    <article className="dish-page">
      {/* ─── Breadcrumb ────────────────────────────────────────────────── */}
      <div className="crumb">
        <a href="/dishes">Dishes</a>
        {primaryCategory && (
          <>
            <span className="sep">›</span>
            <a href={`/dishes?category=${encodeURIComponent(primaryCategory.slug)}`}>
              {primaryCategory.name}
            </a>
          </>
        )}
        <span className="sep">›</span>
        <span style={{ color: 'var(--ink)' }}>{dish.name}</span>
      </div>

      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <header className="rec-hero">
        <div>
          <div className="rec-eyebrow">
            {origin?.name ?? 'Origin unrecorded'}
            {dish.originDateEarliest && (
              <span className="coord">
                first attested {dish.originDateEarliest}
                {dish.originDateLatest && dish.originDateLatest !== dish.originDateEarliest
                  ? `–${dish.originDateLatest}`
                  : ''}
              </span>
            )}
          </div>

          <h1 className="rec-title">{dish.name}</h1>

          {dish.description && (
            <p className="rec-intro">{dish.description}</p>
          )}

          <div className="rec-byline">
            <span className="av" />
            <span>
              By{' '}
              <b>{dish.createdBy ? dish.createdBy.displayName : 'an unknown editor'}</b>
            </span>
            {dish.lastEditedBy && dish.lastEditedBy.id !== dish.createdBy?.id && (
              <span>
                · last edited by <b>{dish.lastEditedBy.displayName}</b>
              </span>
            )}
            <span className="star">{dish.viewCount.toLocaleString()} views</span>
          </div>

          <div className="rec-meta">
            <div className="cell">
              <div className="k">Origin</div>
              <div className="v" style={{ fontSize: 19 }}>{origin?.name ?? '—'}</div>
            </div>
            <div className="cell">
              <div className="k">Variants</div>
              <div className="v">{variants.length}</div>
            </div>
            <div className="cell">
              <div className="k">Category</div>
              <div className="v" style={{ fontSize: 19 }}>{primaryCategory?.name ?? '—'}</div>
            </div>
            <div className="cell">
              <div className="k">Contributors</div>
              <div className="v">{dish.contributorCount}</div>
            </div>
          </div>

          {tags.length > 0 && (
            <div className="rec-tags">
              {tags.map((t) => (
                <span key={t.tagId} className="tag-chip">{t.name}</span>
              ))}
            </div>
          )}
        </div>

        <div className="rec-heroimg">
          <div
            className="ph"
            style={{
              height: 360,
              borderRadius: 'var(--radius)',
              background: `repeating-linear-gradient(135deg, ${HERO_TONES[0]} 0 14px, ${HERO_TONES[1]} 14px 28px)`,
            }}
          >
            <span>{dish.name.toLowerCase()}</span>
          </div>
          <div className="cap">
            <span>HERO · 4:3</span>
            <span>{(origin?.isoCode ?? origin?.name ?? '').toString().toUpperCase()}</span>
          </div>
        </div>
      </header>

      {/* ─── Regional variants band ───────────────────────────────────── */}
      {variants.length > 0 && (
        <section className="world" aria-labelledby="variants-heading">
          <div>
            <div className="tag">The same dish, localized</div>
            <h2 id="variants-heading">Regional variants</h2>
            <p>
              {variants.length} variant{variants.length === 1 ? '' : 's'} of {dish.name} told
              differently across regions and traditions.
            </p>
          </div>
          <div className="world-list">
            {variants.map((v) => (
              <a key={v.id} href={`/dishes/${v.slug}`} className="world-item">
                <span className="pin" />
                <span className="wnm">{v.name}</span>
                <span className="wrg">{v.creatorName ?? v.description ?? ''}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ─── Body: ingredients + preparation ──────────────────────────── */}
      <div className="rec-body">
        {ingredients.length > 0 && (
          <aside className="ing-col" aria-labelledby="ingredients-heading">
            <h2 id="ingredients-heading" className="col-h">Ingredients</h2>
            <div className="col-sub">{ingredients.length} ITEM{ingredients.length === 1 ? '' : 'S'}</div>
            <div className="ing-list">
              {ingredients.map((ing) => (
                <div className="ing" key={ing.ingredientId}>
                  <span className="qty">
                    {ing.quantity ?? ''}{ing.quantity && ing.unit ? ` ${ing.unit}` : ing.unit ?? ''}
                  </span>
                  <span className="nm">
                    <a href={`/ingredients/${ing.slug}`}>{ing.name}</a>
                    {ing.isOptional && <small> optional</small>}
                    {ing.preparationNote && <small>{ing.preparationNote}</small>}
                  </span>
                </div>
              ))}
            </div>
          </aside>
        )}

        {preparations.length > 0 && (
          <section aria-labelledby="preparation-heading">
            <h2 id="preparation-heading" className="col-h">Preparation</h2>
            <div className="col-sub">
              {preparations.length} METHOD{preparations.length === 1 ? '' : 'S'}
            </div>
            <div className="method-list">
              {preparations.map((prep, idx) => (
                <div className="step" key={prep.id}>
                  <div className="marker disp">{String(idx + 1).padStart(2, '0')}</div>
                  <div>
                    <div className="stxt" style={{ fontWeight: 600, marginBottom: 6 }}>
                      {prep.methodName}
                    </div>
                    <p className="stxt">
                      {prep.steps ?? 'No detailed steps recorded yet.'}
                    </p>
                    {(prep.durationMinutes != null || prep.difficulty) && (
                      <span className="stime">
                        {prep.durationMinutes != null && <>⏱ <b>{prep.durationMinutes}</b> min</>}
                        {prep.durationMinutes != null && prep.difficulty && ' · '}
                        {prep.difficulty}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ─── "You may also explore" — same cuisine / method / region ── */}
      {(categories.length > 0 || preparations.length > 0 || origin) && (
        <section className="section" aria-label="You may also explore">
          <div className="sec-rule">
            <h2>You may also explore</h2>
          </div>
          <AlsoExplore
            categories={categories}
            preparations={preparations}
            originName={origin?.name ?? null}
          />
        </section>
      )}

      {/* ─── Sources / Citations ───────────────────────────────────────── */}
      {sources.length > 0 && (
        <section className="section" aria-labelledby="sources-heading">
          <div className="sec-rule">
            <h2 id="sources-heading">Sources</h2>
          </div>
          <ol className="source-list">
            {sources.map((cite) => (
              <li key={cite.id} className="source-card">
                {cite.claimText && (
                  <p>
                    <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Claim:</span>{' '}
                    {cite.claimText}
                  </p>
                )}
                <p>
                  {cite.citationText ? (
                    <span dangerouslySetInnerHTML={{ __html: cite.citationText }} />
                  ) : (
                    <>
                      {cite.title ?? cite.sourceType}
                      {cite.authors && ` — ${cite.authors}`}
                      {cite.year && ` (${cite.year})`}
                      {cite.publisher && `, ${cite.publisher}`}
                    </>
                  )}
                </p>
                {cite.url && (
                  <a href={cite.url} target="_blank" rel="noopener noreferrer" className="source-url">
                    {cite.url}
                  </a>
                )}
                {cite.reliability && <span className="reliability-pill">{cite.reliability}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ─── Full description (long-form article) ──────────────────────── */}
      {/* Per the editor layout, long_description appears AFTER Sources so the
          reader sees citations before the full narrative that cites them.
          short_description stays in the hero as the dish intro.            */}
      {dish.longDescription && (
        <section className="section" aria-labelledby="long-description-heading">
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

      {/* ─── Media (gallery) ───────────────────────────────────────────── */}
      <DishGallery media={media} />

      {/* ─── Editor / provenance ──────────────────────────────────────── */}
      <footer className="dish-foot">
        <div>
          Created by{' '}
          {dish.createdBy ? <strong>{dish.createdBy.displayName}</strong> : 'an unknown editor'}
          {dish.lastEditedBy && dish.lastEditedBy.id !== dish.createdBy?.id && (
            <>
              {' · last edited by '}
              <strong>{dish.lastEditedBy.displayName}</strong>
            </>
          )}
        </div>
        <div>
          {dish.viewCount.toLocaleString()} view{dish.viewCount === 1 ? '' : 's'}
          {' · '}
          {dish.editCount} edit{dish.editCount === 1 ? '' : 's'}
          {' · '}
          {dish.contributorCount} contributor{dish.contributorCount === 1 ? '' : 's'}
        </div>
        <div className="muted">
          Last updated {new Date(dish.updatedAt).toISOString().slice(0, 10)}
        </div>
      </footer>
    </article>
  );
}
