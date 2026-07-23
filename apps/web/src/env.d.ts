/// <reference path="../../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_API_BASE?: string;
  /** Build-time domain: `geo` (gustale.com Atlas) or `recipes` (gustale.recipes). */
  readonly PUBLIC_DOMAIN?: 'geo' | 'recipes' | string;
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
      role?: 'visitor' | 'contributor' | 'moderator' | 'admin';
    } | null;
  }
}
