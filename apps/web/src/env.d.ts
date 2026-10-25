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
