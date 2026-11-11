/// <reference path="../../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_API_BASE?: string;
  /** Build-time domain: `geo` (gustale.com Atlas) or `recipes` (gustale.recipes). */
  readonly PUBLIC_DOMAIN?: "geo" | "recipes" | string;
  /**
   * Optional CARTO basemap key. Public browser-side token (like a Mapbox
   * public token), not a server secret. Unset = keyless vector basemap.
   */
  readonly PUBLIC_CARTO_API_KEY?: string;
  /**
   * The origin the site is served from, used for the hreflang URLs
   * and the per-locale sitemaps. Set in CI; the fallback is derived
   * from PUBLIC_DOMAIN.
   */
  readonly PUBLIC_SITE_ORIGIN?: string;
  /**
   * The DEFAULT origin, used when PUBLIC_SITE_ORIGIN is unset.
   *
   * It is a separate build-time variable so that a build which DOES
   * configure an origin can drop the old-host literal from the client
   * bundle entirely: with both values build-time literals, the bundler
   * folds the expression down to the one string the build chose.
   */
  readonly PUBLIC_RECIPES_DEFAULT_ORIGIN?: string;
  /**
   * The origin of the RECIPES property, when this build CROSS-links to
   * it.
   *
   * It is separate from PUBLIC_SITE_ORIGIN because the two answer
   * different questions:
   *
   *   - PUBLIC_SITE_ORIGIN is "the host THIS build is served from" --
   *     the canonical, the sitemap, robots.txt;
   *   - PUBLIC_RECIPES_ORIGIN is "the host of the recipes property" --
   *     the cross-links: the property switcher, "Browse recipes".
   *
   * In the geo build the two differ: this build is served from
   * gustale.com but links to the recipes site. Using one variable for
   * both made the geo build's "Browse recipes" point at gustale.com,
   * which is the branding-leak class of bug the switcher checks exist
   * to catch.
   */
  readonly PUBLIC_RECIPES_ORIGIN?: string;
  /**
   * Vite's built-in flag for whether the code is running on the
   * server. Vite declares it in its own client types, but the web
   * app's tsconfig does not pull those in.
   */
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    runtime?: {
      env?: ImportMetaEnv;
    };
    user?: {
      id: string;
      email: string;
      name?: string;
      role?: "visitor" | "contributor" | "moderator" | "admin";
    } | null;
  }
}
