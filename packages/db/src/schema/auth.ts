/**
 * Better-auth schema for Gustale.
 *
 * These tables are required by better-auth (https://better-auth.com/docs/concepts/database).
 * Field names MUST match better-auth's expected schema; only add custom fields by extending
 * the `user` table (e.g. `role`, `display_name`).
 *
 * Coexists with the existing domain schema (dishes, ingredients, etc.) in the same database.
 * All timestamps are stored as `timestamp` (without timezone) and treated as UTC at the
 * application layer, per better-auth's expectations.
 */
import { pgTable, text, timestamp, boolean, integer, bigint, pgEnum } from 'drizzle-orm/pg-core';

// Roles for the Gustale wiki (Wikipedia-style permission tiers).
// Replaces the planned separate roles table for the MVP — better-auth stores this
// on the user, not a separate table, to keep the auth flow simple.
export const userRoleEnum = pgEnum('user_role', ['visitor', 'contributor', 'moderator', 'admin']);
export type UserRole = (typeof userRoleEnum.enumValues)[number];

/**
 * Users — better-auth core table, extended with Gustale-specific fields.
 *
 * better-auth reads/writes: id, name, email, emailVerified, image, createdAt, updatedAt.
 * We add: role, displayName, bio, locale, contributorSince.
 */
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),

  // Gustale extensions
  role: userRoleEnum('role').notNull().default('contributor'),
  displayName: text('display_name'),
  bio: text('bio'),
  locale: text('locale').notNull().default('en'),
  contributorSince: timestamp('contributor_since'),
});

/**
 * Sessions — better-auth manages these for cookie-based auth.
 *
 * Tokens are opaque random strings (better-auth uses secure base64url). We never store
 * anything that would be useful to an attacker who reads the database.
 */
export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
});

/**
 * Accounts — better-auth's table for OAuth/email+password credentials.
 * One user can have many accounts (link multiple OAuth providers, etc.).
 */
export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'), // Argon2id hash for email+password accounts
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Verification tokens — used by better-auth for:
 *  - Email verification (when email+password signup)
 *  - Password reset
 *  - Magic link login (when enabled)
 *
 * These are short-lived (default 1h for verification, 10min for password reset).
 * The `value` is the random token sent to the user — store as-is, compare on use.
 */
export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/**
 * Passkeys — WebAuthn credentials registered to a user.
 * Used for passwordless sign-in via device biometrics / security keys.
 */
export const passkey = pgTable('passkey', {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  credentialID: text('credential_i_d').notNull(),
  counter: integer('counter').notNull(),
  deviceType: text('device_type').notNull(),
  backedUp: boolean('backed_up').notNull(),
  transports: text('transports'),
  createdAt: timestamp('created_at'),
});

/**
 * Rate limit storage — required when `better-auth rateLimit.storage === "database"`.
 *
 * Better-auth writes the current request timestamp as `Date.now()` (Unix ms),
 * so the column must be a bigint, not a postgres timestamp.
 */
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
