import type { DishMediaAttachment } from "../types/dish";

/**
 * Media item shown in the full-bleed dish hero.
 * Prefer an explicit cover; otherwise the first item by position.
 * Callers that render a secondary gallery must exclude this item by mediaId.
 */
export function selectDishHeroMedia(
  media: DishMediaAttachment[],
): DishMediaAttachment | null {
  const explicitCover = media.find((m) => m.role === "cover");
  if (explicitCover) return explicitCover;
  if (media.length === 0) return null;
  return [...media].sort((a, b) => a.position - b.position)[0] ?? null;
}
