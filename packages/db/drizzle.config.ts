import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // The .env at apps/api/.env is the canonical place for DATABASE_URL.
  // drizzle-kit does not auto-load .env, so we read it here.
  // We expect to be run from the repo root with `pnpm --filter @gustale/db run generate`.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://app:jaX4hMv0IzWJWsLhyAFG4fnzY6CIwg7A@127.0.0.1:5433/gustale',
  },
  // Don't try to introspect — we're generating fresh from schema.
  verbose: true,
  strict: true,
});
