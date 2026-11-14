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
   * GUS-238: the dish-journey presentation pilot.
   *
   * OFF unless this is exactly "1". When it is on, the two-dish
   * pilot (Bibimbap, moussaka) uses the new presentation — separate
   * OSM map cards, a visible lineage section, a sticky section nav —
   * and every other dish keeps the current one.
   */
  readonly PUBLIC_DISH_JOURNEY_PILOT?: string;
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
