/**
 * ESM twin of src/lib/collectDishFamilies.ts for validate-build.mjs.
 * Keep algorithms in sync: page limit 100, offset paging, max-page guard.
 */

export const DISH_LIST_PAGE_LIMIT = 100;
export const DISH_LIST_MAX_PAGES = 101;
export const LATE_PAGE_FAMILY_SLUG = 'late-page-family';

export async function collectFamiliesFromPublishedDishes(
  apiBase,
  fetchImpl = fetch,
) {
  const bySlug = new Map();
  let offset = 0;

  for (let pageNum = 0; pageNum < DISH_LIST_MAX_PAGES; pageNum++) {
    const url =
      `${apiBase}/api/dishes?status=published` +
      `&limit=${DISH_LIST_PAGE_LIMIT}&offset=${offset}`;
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(`GET /api/dishes failed: ${res.status}`);
    }
    const json = await res.json();
    const dishes = json.dishes ?? [];

    for (const d of dishes) {
      if (!d.familySlug || bySlug.has(d.familySlug)) continue;
      bySlug.set(d.familySlug, {
        slug: d.familySlug,
        name: d.familyName ?? d.familySlug,
        description: null,
      });
    }

    if (dishes.length < DISH_LIST_PAGE_LIMIT) break;
    offset += dishes.length;
    if (offset >= 10000) break;
  }

  return [...bySlug.values()];
}

/** Pure domain resolver — mirrors src/lib/domain.ts resolveGustaleDomain. */
export function resolveGustaleDomain(raw) {
  return raw === 'geo' ? 'geo' : 'recipes';
}
