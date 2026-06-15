import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as allSchema from './schema/index.js';
import * as authSchema from './schema/auth.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Singleton postgres client + drizzle wrapper.
// One process, one pool, one schema reference.
const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 30,
  connect_timeout: 10,
});

/**
 * Drizzle's `drizzle({ schema })` option expects ONLY pgTable objects. It chokes on
 * enum value arrays (userRole, categorySource, etc.) and type-only exports because
 * it calls `Object.getPrototypeOf(value).constructor` on every value during
 * relation extraction, which throws on plain objects.
 *
 * We filter the namespace down to actual pgTable instances by checking for the
 * `drizzle:BaseName` symbol that pgTable stamps on every table.
 */
const DRIZZLE_BASE_NAME = Symbol.for('drizzle:BaseName');
const isDrizzleTable = (v: unknown): v is { readonly [DRIZZLE_BASE_NAME]: string } =>
  !!v && typeof v === 'object' && DRIZZLE_BASE_NAME in v;

const schema = Object.fromEntries(
  [...Object.entries(allSchema), ...Object.entries(authSchema)]
    .filter(([, v]) => isDrizzleTable(v))
);

export const db = drizzle(client, { schema });
export type DB = typeof db;

export async function closeDb(): Promise<void> {
  await client.end();
}

export { schema };
export * from './schema/index.js';
export * from './schema/auth.js';
