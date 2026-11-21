/**
 * ADR-003 — the locales, and the routing rules.
 *
 * The core set is a FLOOR, not a ceiling. The ADR says: "plus each
 * dish's own language, where it differs from the core set (e.g. a dish
 * with a Greek name adds `el`)". The dish names already prove it: a
 * dish has a name in Tagalog, Vietnamese, Korean, Greek, Thai and more,
 * so the site must be able to serve those.
 *
 * This module is the single source of truth for:
 *   - which locales exist;
 *   - which of them are RIGHT-TO-LEFT;
 *   - which Noto font each one needs;
 *   - how a locale URL is built;
 *   - how the browser-language suggestion is made.
 */

/** The core locale set. English is the base. */
export const CORE_LOCALES = [
  "en",
  "es",
  "de",
  "fr",
  "pt",
  "id",
  "zh",
  "ja",
  "ar",
  "hi",
] as const;

export type CoreLocale = (typeof CORE_LOCALES)[number];

/**
 * The locales the site ships pages in.
 *
 * These are the ones with enough translated content to be worth a
 * static page per locale. The set is deliberately SMALL: a locale page
 * that is 95% English with a notice on every dish is worse than no
 * locale page at all, and it multiplies the build.
 */
export const SITE_LOCALES: CoreLocale[] = [
  "en",
  "es",
  "de",
  "fr",
  "pt",
  "id",
  "zh",
  "ja",
  "ar",
  "hi",
];

/** The locales that render right-to-left. */
export const RTL_LOCALES = new Set<string>(["ar"]);

/** The locales that have a Noto face of their own. */
export const NOTO_FONTS: Record<string, { family: string; subset: string }> = {
  en: { family: "Noto Sans", subset: "latin" },
  es: { family: "Noto Sans", subset: "latin" },
  de: { family: "Noto Sans", subset: "latin" },
  fr: { family: "Noto Sans", subset: "latin" },
  pt: { family: "Noto Sans", subset: "latin" },
  id: { family: "Noto Sans", subset: "latin" },
  zh: { family: "Noto Sans SC", subset: "chinese-simplified" },
  ja: { family: "Noto Sans JP", subset: "japanese" },
  ar: { family: "Noto Naskh Arabic", subset: "arabic" },
  hi: { family: "Noto Sans Devanagari", subset: "devanagari" },
};

/** The native name of each locale, in the locale itself. */
export const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  es: "Español",
  de: "Deutsch",
  fr: "Français",
  pt: "Português",
  id: "Bahasa Indonesia",
  zh: "中文",
  ja: "日本語",
  ar: "العربية",
  hi: "हिन्दी",
};

export function isSiteLocale(value: string): value is CoreLocale {
  return (SITE_LOCALES as readonly string[]).includes(value);
}

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale);
}

/**
 * The locale path prefix for a URL.
 *
 * English gets NO prefix: the ADR says the URLs are
 * `/{locale}/dishes/{slug}`, but the English site is the canonical
 * one, and `gustale.com/dishes/masala-dosa` is the URL that should
 * rank. So English is at the root and the other locales are prefixed.
 *
 * That keeps the existing 121 dish URLs stable — which the ADR's
 * "stable slugs" requirement is really about — and keeps the SEO
 * value in the English pages.
 */
export function localePrefix(locale: string): string {
  return locale === "en" ? "" : `/${locale}`;
}

/** The URL of a dish in a locale. The slug never changes. */
export function dishUrl(locale: string, slug: string): string {
  return `${localePrefix(locale)}/dishes/${slug}`;
}

/** The URL of the dish list in a locale. */
export function dishListUrl(locale: string): string {
  return `${localePrefix(locale)}/dishes`;
}

/**
 * The `hreflang` alternates for a dish.
 *
 * Reciprocal on every page: `es` points at `en` and `en` points at
 * `es`. Plus `x-default` pointing at the English URL.
 */
export function hreflangAlternates(
  slug: string,
  locales: string[],
  origin: string,
): Array<{ hreflang: string; href: string }> {
  const out: Array<{ hreflang: string; href: string }> = [];
  for (const locale of locales) {
    out.push({
      hreflang: locale,
      href: `${origin}${dishUrl(locale, slug)}`,
    });
  }
  out.push({
    hreflang: "x-default",
    href: `${origin}${dishUrl("en", slug)}`,
  });
  return out;
}

/**
 * Suggest a locale from the browser's `Accept-Language`.
 *
 * SUGGEST, NOT FORCE. The ADR is explicit: "A locale chooser or a
 * banner offers the detected locale; the page renders in English unless
 * the user chooses. No automatic redirect that hides content."
 *
 * So this function's result is a SUGGESTION for the banner — nothing
 * ever redirects on it.
 */
export function suggestLocale(
  acceptLanguage: string | null,
): CoreLocale | null {
  if (!acceptLanguage) return null;
  const wanted = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      return { tag: tag.trim().toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((p) => p.tag && !Number.isNaN(p.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of wanted) {
    const base = tag.split("-")[0];
    if (isSiteLocale(base)) return base;
  }
  return null;
}

/**
 * The locale variants of a PATH.
 *
 * WHY THIS EXISTS
 * ---------------
 * The footer's language switcher has to work on EVERY page, not only
 * on the dish pages that build their own `localeUrls`. Only dish pages
 * did, so the home page, the families, the lineages and every other
 * page had NO language switcher in the footer at all.
 *
 * This derives the variants from the path itself: the same path with
 * the locale prefix swapped.
 *
 * ONLY WHERE THE VARIANT EXISTS
 * ------------------------------
 * The site builds ONE locale-prefixed route: `/[locale]/dishes/[slug]`.
 * There is no `/es/` home page and no `/es/families`. So a locale link
 * is only honest on a page whose locale variant actually exists — a
 * dish page.
 *
 * `localeUrlForPath` returns null for a path that has no locale
 * variant, and the footer then shows the current language on its own
 * rather than offering links that 404.
 *
 * D21-9 widens this: once a locale page is published and indexed, it
 * becomes a real variant, and the switcher lists it. Until then the
 * switcher lists what is actually there.
 */
export function localeUrlForPath(
  locale: string,
  pathname: string,
): string | null {
  // A dish page: /dishes/<slug> or /<locale>/dishes/<slug>.
  const dish = pathname.match(/^\/(?:([a-z]{2})\/)?dishes\/([a-z0-9-]+)\/?$/i);
  if (dish) {
    const slug = dish[2];
    return dishUrl(locale, slug);
  }
  // Everything else has no locale variant yet.
  return null;
}

/**
 * The locale variants of a path that exist, keyed by locale.
 *
 * Only the current locale is guaranteed to exist — every page is
 * served in English. A locale is included when its variant path can be
 * built.
 */
export function localeUrlsForPath(
  pathname: string,
  locales: readonly string[] = SITE_LOCALES,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of locales) {
    const url = localeUrlForPath(locale, pathname);
    if (url) out[locale] = url;
  }
  return out;
}

/**
 * The origin the site is served from.
 *
 * ONE SITE. The origin is `https://gustale.com` — for the geo variant,
 * for the recipes variant, and for every canonical, every `hreflang`
 * alternate, every `og:url` and every JSON-LD block.
 *
 * The retired encyclopedia host was the origin of the recipes
 * VARIANT before the cutover. It is gone: a build that still pointed
 * its canonicals at it would tell a crawler that the old host is the
 * real one, and the old host is now a 301.
 *
 * `PUBLIC_SITE_ORIGIN` is set in CI, and it is what the staging build
 * uses to give itself its own origin and its own canonical URLs. The
 * fallback is derived from the build domain, so a local build still
 * produces working hreflang URLs.
 *
 * It lives HERE, in a module, rather than in a page's frontmatter: an
 * Astro page compiles its frontmatter into a module where a `const`
 * declared in the same file is NOT visible to the exported
 * `getStaticPaths` at the moment Astro calls it. A plain import is.
 */
export function siteOrigin(): string {
  const explicit = import.meta.env.PUBLIC_SITE_ORIGIN;
  if (explicit) return explicit;
  const domain = import.meta.env.PUBLIC_DOMAIN ?? "recipes";
  // The staging origin (WP-00b). A staging build is the SAME site on
  // its own host, with its own canonical URLs -- pointing them at
  // gustale.com would tell a crawler that the staging copy is the
  // real one.
  if (domain === "staging") return "https://staging.gustale.com";
  // One site. Both variants. The geo variant and the recipes variant
  // are skins of gustale.com, and their canonicals say so.
  return "https://gustale.com";
}
