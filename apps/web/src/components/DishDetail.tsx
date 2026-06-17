import type {
  DishCategory,
  DishCitation,
  DishDetailCore,
  DishIngredient,
  DishMediaAttachment,
  DishOrigin,
  DishPreparation,
  DishVariant,
} from '../types/dish';
import { DishGallery } from './DishGallery';

export interface DishDetailProps {
  dish: DishDetailCore;
  origin: DishOrigin | null;
  variants: DishVariant[];
  ingredients: DishIngredient[];
  categories: DishCategory[];
  preparations: DishPreparation[];
  sources: DishCitation[];
  media: DishMediaAttachment[];
}

/**
 * Renders the full Wikipedia-style dish detail view.
 * All data is server-rendered into the island props (SSR-safe).
 * No client-side fetch — by the time this mounts, the data is already there.
 */
export function DishDetail({
  dish,
  origin,
  variants,
  ingredients,
  categories,
  preparations,
  sources,
  media,
}: DishDetailProps) {
  const primaryCategory = categories.find((c) => c.isPrimary) ?? categories[0] ?? null;

  return (
    <article className="mx-auto max-w-4xl space-y-10 px-4 py-8">
      {/* ─── Hero ──────────────────────────────────────────────────────── */}
      <header className="space-y-4 border-b border-slate-200 pb-8">
        <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
          {primaryCategory && (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              {primaryCategory.name}
            </span>
          )}
          {origin && (
            <span>
              Origin: <strong className="text-slate-700">{origin.name}</strong>
              {origin.isoCode && (
                <span className="ml-1 text-slate-400">({origin.isoCode})</span>
              )}
            </span>
          )}
          {dish.originDateEarliest && (
            <span>
              First attested: <strong className="text-slate-700">{dish.originDateEarliest}</strong>
              {dish.originDateLatest && dish.originDateLatest !== dish.originDateEarliest && (
                <>–{dish.originDateLatest}</>
              )}
            </span>
          )}
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
          {dish.name}
        </h1>

        {dish.description && (
          <p className="text-lg leading-relaxed text-slate-700">
            {dish.description}
          </p>
        )}

        {dish.longDescription && (
          <p className="text-base leading-relaxed text-slate-600">
            {dish.longDescription}
          </p>
        )}
      </header>

      {/* ─── Variants ──────────────────────────────────────────────────── */}
      {variants.length > 0 && (
        <section aria-labelledby="variants-heading" className="space-y-3">
          <h2 id="variants-heading" className="text-2xl font-bold text-slate-900">
            Regional variants
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {variants.map((v) => (
              <li
                key={v.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <h3 className="font-semibold text-slate-900">
                  <a
                    href={`/dishes/${v.slug}`}
                    className="hover:text-emerald-700"
                  >
                    {v.name}
                  </a>
                </h3>
                {v.description && (
                  <p className="mt-1 text-sm text-slate-600">{v.description}</p>
                )}
                {v.creatorName && (
                  <p className="mt-2 text-xs text-slate-400">
                    Attributed to: {v.creatorName}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Ingredients ───────────────────────────────────────────────── */}
      {ingredients.length > 0 && (
        <section aria-labelledby="ingredients-heading" className="space-y-3">
          <h2 id="ingredients-heading" className="text-2xl font-bold text-slate-900">
            Ingredients
          </h2>
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {ingredients.map((ing) => (
              <li
                key={ing.ingredientId}
                className="flex items-baseline justify-between gap-4 px-4 py-3"
              >
                <div className="flex items-baseline gap-2">
                  <a
                    href={`/ingredients/${ing.slug}`}
                    className="font-medium text-slate-900 hover:text-emerald-700"
                  >
                    {ing.name}
                  </a>
                  {ing.isOptional && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      optional
                    </span>
                  )}
                  {ing.preparationNote && (
                    <span className="text-sm text-slate-500">
                      ({ing.preparationNote})
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-sm tabular-nums text-slate-600">
                  {ing.quantity && <span>{ing.quantity}</span>}
                  {ing.unit && <span className="ml-1">{ing.unit}</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ─── Preparation ───────────────────────────────────────────────── */}
      {preparations.length > 0 && (
        <section aria-labelledby="preparation-heading" className="space-y-3">
          <h2 id="preparation-heading" className="text-2xl font-bold text-slate-900">
            Preparation
          </h2>
          {preparations.map((prep, idx) => (
            <div
              key={prep.id}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-slate-900">
                  {prep.methodName}
                </h3>
                <div className="flex gap-3 text-xs text-slate-500">
                  {prep.durationMinutes != null && (
                    <span>{prep.durationMinutes} min</span>
                  )}
                  {prep.difficulty && <span>· {prep.difficulty}</span>}
                </div>
              </div>
              {prep.steps ? (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                  {prep.steps}
                </p>
              ) : (
                <p className="mt-3 text-sm italic text-slate-400">
                  No detailed steps recorded yet.
                </p>
              )}
              {idx < preparations.length - 1 && (
                <div className="mt-5 border-t border-slate-100" />
              )}
            </div>
          ))}
        </section>
      )}

      {/* ─── Sources / Citations ───────────────────────────────────────── */}
      {sources.length > 0 && (
        <section aria-labelledby="sources-heading" className="space-y-3">
          <h2 id="sources-heading" className="text-2xl font-bold text-slate-900">
            Sources
          </h2>
          <ol className="space-y-3">
            {sources.map((cite) => (
              <li
                key={cite.id}
                className="rounded-md border border-slate-200 bg-white p-4 text-sm"
              >
                {cite.claimText && (
                  <p className="text-slate-700">
                    <span className="font-medium text-slate-900">Claim:</span>{' '}
                    {cite.claimText}
                  </p>
                )}
                <p className="mt-1 text-slate-600">
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
                  <a
                    href={cite.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block break-all text-xs text-emerald-700 hover:underline"
                  >
                    {cite.url}
                  </a>
                )}
                {cite.reliability && (
                  <span className="ml-3 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    Reliability: {cite.reliability}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ─── Media (gallery) ───────────────────────────────────────────── */}
      <DishGallery media={media} />

      {/* ─── Editor / provenance ──────────────────────────────────────── */}
      <footer className="space-y-2 border-t border-slate-200 pt-6 text-xs text-slate-500">
        <div>
          Created by{' '}
          {dish.createdBy ? (
            <strong className="text-slate-700">{dish.createdBy.displayName}</strong>
          ) : (
            'an unknown editor'
          )}
          {dish.lastEditedBy && dish.lastEditedBy.id !== dish.createdBy?.id && (
            <>
              {' · last edited by '}
              <strong className="text-slate-700">
                {dish.lastEditedBy.displayName}
              </strong>
            </>
          )}
        </div>
        <div>
          {dish.viewCount.toLocaleString()} view{dish.viewCount === 1 ? '' : 's'}
          {' · '}
          {dish.editCount} edit{dish.editCount === 1 ? '' : 's'}
          {' · '}
          {dish.contributorCount} contributor
          {dish.contributorCount === 1 ? '' : 's'}
        </div>
        <div className="text-slate-400">
          Last updated {new Date(dish.updatedAt).toISOString().slice(0, 10)}
        </div>
      </footer>
    </article>
  );
}