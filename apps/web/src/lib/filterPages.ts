/**
 * Which filtered dish lists get a STATIC page.
 *
 *   /dishes/region/<slug>/      one per origin with >= MIN_STATIC_DISHES dishes
 *   /dishes/category/<slug>/    one per category with >= MIN_STATIC_DISHES dishes
 *   /dishes/technique/<slug>/   one per technique with >= MIN_STATIC_DISHES dishes
 *
 * WHY STATIC PAGES AT ALL: the site is static HTML. `/dishes?region=X`
 * cannot differ from `/dishes` in the server HTML, so without JavaScript a
 * filter link would show the unfiltered list. A path page carries the
 * filtered list in its HTML, so it works with JavaScript disabled.
 *
 * WHY A THRESHOLD: 178 origins exist, most with one or two dishes.
 * Origins below the threshold stay reachable through the client-side
 * filter (`/dishes?region=X`) -- links to them use the query form.
 *
 * This module is the single source of truth for "does a path page exist?",
 * so the page generator and every link builder agree.
 */
import { getCategories, listAllDishes, listDishes } from "./api";
import { slugify } from "./slug";

export const MIN_STATIC_DISHES = 5;

export type FilterKind = "region" | "category" | "technique";

export interface FilterPageEntry {
  kind: FilterKind;
  slug: string;
  /** Display name ("Indonesia", "Stew", "Curry"). */
  name: string;
  /** The value the API filter takes (origin name, or a slug). */
  value: string;
  total: number;
}

export type FilterPageIndex = Record<
  FilterKind,
  Record<string, FilterPageEntry>
>;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

let cached: Promise<FilterPageIndex> | null = null;

export function getFilterPageIndex(): Promise<FilterPageIndex> {
  cached ??= buildIndex();
  return cached;
}

async function buildIndex(): Promise<FilterPageIndex> {
  const index: FilterPageIndex = { region: {}, category: {}, technique: {} };
  const all = await listAllDishes({ status: "published" });

  // Regions: count by EXACT origin name.
  const origins = new Map<string, number>();
  const methods = new Map<string, string>();
  for (const d of all.dishes) {
    if (d.originName)
      origins.set(d.originName, (origins.get(d.originName) ?? 0) + 1);
    if (d.methodSlug) methods.set(d.methodSlug, d.methodName ?? d.methodSlug);
  }
  for (const [name, total] of origins) {
    if (total < MIN_STATIC_DISHES) continue;
    const slug = slugify(name);
    if (!slug) continue;
    index.region[slug] = { kind: "region", slug, name, value: name, total };
  }

  // Categories and techniques: the API's own total for the exact filter.
  const cats = (await getCategories()).categories;
  const catTotals = await mapLimit(cats, 8, async (c) => ({
    c,
    total:
      (await listDishes({ status: "published", category: c.slug, limit: 1 }))
        .total ?? 0,
  }));
  for (const { c, total } of catTotals) {
    if (total < MIN_STATIC_DISHES) continue;
    index.category[c.slug] = {
      kind: "category",
      slug: c.slug,
      name: c.name,
      value: c.slug,
      total,
    };
  }
  const techTotals = await mapLimit([...methods], 8, async ([slug, name]) => ({
    slug,
    name,
    total:
      (await listDishes({ status: "published", technique: slug, limit: 1 }))
        .total ?? 0,
  }));
  for (const t of techTotals) {
    if (t.total < MIN_STATIC_DISHES) continue;
    index.technique[t.slug] = {
      kind: "technique",
      slug: t.slug,
      name: t.name,
      value: t.slug,
      total: t.total,
    };
  }
  return index;
}

/** The compact form passed to components (serialised into islands). */
export type PathPageSlugs = Record<FilterKind, string[]>;

export function pathPageSlugs(index: FilterPageIndex): PathPageSlugs {
  return {
    region: Object.keys(index.region),
    category: Object.keys(index.category),
    technique: Object.keys(index.technique),
  };
}

/**
 * The link for a filter value: the path page when one exists, otherwise
 * the query form (handled client-side by DishExplorer).
 *
 * `slug` is the value's slug for category/technique; regions derive theirs
 * from the origin name with the site's slug helper.
 */
export function filterHref(
  pages: PathPageSlugs | null | undefined,
  kind: FilterKind,
  value: string,
): string {
  const s = kind === "region" ? slugify(value) : value;
  if (pages?.[kind]?.includes(s)) return `/dishes/${kind}/${s}/`;
  return `/dishes?${kind}=${encodeURIComponent(value)}`;
}
