/// <reference path="../../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_API_BASE?: string;
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
