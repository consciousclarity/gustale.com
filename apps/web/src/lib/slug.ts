/**
 * The site's one slug helper for place / category / technique names.
 *
 * It was a private function in PlacesList.tsx (the Places directory's
 * `/places/<slug>` links). It lives here now so the static
 * `/dishes/region/<slug>/` pages, the Places directory and the dish
 * pages' "Same region" link all derive the SAME slug from the same name.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
