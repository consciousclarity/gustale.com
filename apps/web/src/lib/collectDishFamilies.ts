/**
 * Collect distinct dish-family slugs by paging GET /api/dishes.
 *
 * Mirrors the production list contract in apps/api/src/routes/dishes.ts:
 *   - limit: 1..100 (API max)
 *   - offset: 0..10000
 *   - response: { dishes, limit, offset } (no total/cursor)
 *
 * Stop when a page returns fewer than `pageLimit` rows, or when the
 * defensive max-page guard trips (offset ceiling).
 */

/** API max for GET /api/dishes `limit` (zod .max(100)). */
export const DISH_LIST_PAGE_LIMIT = 100;

/**
 * Defensive page cap: API offset max is 10000 → at most 100 full pages
 * of size 100, plus a thin last page. 101 iterations is enough.
 */
export const DISH_LIST_MAX_PAGES = 101;

export type DishFamilyCat = {
  slug: string;
  name: string;
  description: string | null;
};

type DishListPage = {
  dishes?: Array<{ familySlug?: string | null; familyName?: string | null }>;
  limit?: number;
  offset?: number;
};

/**
 * Page through published dishes and dedupe by familySlug.
 * Used as the /family/[slug] SSG fallback when /api/categories is empty.
 */
export async function collectFamiliesFromPublishedDishes(
  apiBase: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DishFamilyCat[]> {
  const bySlug = new Map<string, DishFamilyCat>();
  let offset = 0;

  for (let pageNum = 0; pageNum < DISH_LIST_MAX_PAGES; pageNum++) {
    const url =
      `${apiBase}/api/dishes?status=published` +
      `&limit=${DISH_LIST_PAGE_LIMIT}&offset=${offset}`;
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new Error(`GET /api/dishes failed: ${res.status}`);
    }
    const json = (await res.json()) as DishListPage;
    const dishes = json.dishes ?? [];

    for (const d of dishes) {
      if (!d.familySlug || bySlug.has(d.familySlug)) continue;
      bySlug.set(d.familySlug, {
        slug: d.familySlug,
        name: d.familyName ?? d.familySlug,
        description: null,
      });
    }

    // Last page: API returned a short page (or empty).
    if (dishes.length < DISH_LIST_PAGE_LIMIT) break;

    offset += dishes.length;
    // Offset ceiling matches API zod max (10000).
    if (offset >= 10000) break;
  }

  return [...bySlug.values()];
}
