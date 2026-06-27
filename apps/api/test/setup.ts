/**
 * Vitest setup — loaded before any test runs.
 *
 * Loads apps/api/.env into process.env so the env-validator in src/env.ts
 * finds DATABASE_URL, SESSION_SECRET, BETTER_AUTH_SECRET, and the MinIO
 * credentials. Without this, env.ts calls process.exit(1) and vitest
 * reports "process.exit unexpectedly called".
 *
 * Only loaded during tests; production code paths are unchanged.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '..', '.env') });