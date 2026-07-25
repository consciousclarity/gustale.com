/**
 * Shared helpers for MapLibre dish maps when multiple dishes share a
 * coordinate (country centroids, etc.). Never jitter — expand hits to the
 * full coincident stack and disambiguate in the UI.
 */

/** Decimal places for grouping exact shared centroids (API ~4 places). */
export const COORD_KEY_PRECISION = 4;

/** Stable key for genuine identical coordinates (not nearby places). */
export function coordKey(lat: number, lng: number): string {
  return `${lng.toFixed(COORD_KEY_PRECISION)},${lat.toFixed(COORD_KEY_PRECISION)}`;
}

/**
 * Coerce API/JSON values to a finite number. `0` is valid (not missing).
 * Empty strings and non-numeric values return null.
 */
export function parseCoord(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function countCoincidentByCoord<T extends { lat: number; lng: number }>(
  dishes: readonly T[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of dishes) {
    const k = coordKey(d.lat, d.lng);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** First-wins by slug; preserves encounter order. */
export function dedupeDishesBySlug<T extends { slug: string }>(
  dishes: readonly T[],
): T[] {
  const seen = new Map<string, T>();
  for (const d of dishes) {
    if (!d.slug || seen.has(d.slug)) continue;
    seen.set(d.slug, d);
  }
  return [...seen.values()];
}

export function dishesAtCoordKey<
  T extends { lat: number; lng: number; slug: string },
>(dishes: readonly T[], key: string): T[] {
  return dedupeDishesBySlug(
    dishes.filter((d) => coordKey(d.lat, d.lng) === key),
  );
}

export function allShareSameCoordKey<T extends { lat: number; lng: number }>(
  dishes: readonly T[],
): boolean {
  if (dishes.length <= 1) return true;
  const first = dishes[0];
  if (!first) return true;
  const key0 = coordKey(first.lat, first.lng);
  return dishes.every((d) => coordKey(d.lat, d.lng) === key0);
}

/**
 * MapLibre often returns only the topmost circle when several share a pixel.
 * Expand any hit to the full coincident stack via shared lat/lng.
 */
export function expandToCoincidentStack<
  T extends { lat: number; lng: number; slug: string },
>(hitDishes: readonly T[], allDishes: readonly T[]): T[] {
  const hit = dedupeDishesBySlug(hitDishes);
  if (hit.length === 0) return hit;
  const sample = hit[0];
  if (!sample) return hit;
  const stack = dishesAtCoordKey(allDishes, coordKey(sample.lat, sample.lng));
  return stack.length > 1 ? stack : hit;
}
