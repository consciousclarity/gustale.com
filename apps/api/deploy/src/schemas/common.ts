/**
 * Shared request-validation schemas.
 *
 * These were previously inlined (and duplicated) across the dish/ingredient
 * routes. Centralising them keeps the bounds and defaults consistent and gives
 * one place to change them.
 *
 * Two distinct slug concepts live here on purpose:
 *  - `slugParamSchema` — read-side path param. Only length-bounded, because we
 *    look up by exact slug and a bad slug just 404s.
 *  - `slugBodyField` / `SLUG_RE` — create-side body field. Enforces the strict
 *    URL-safe format because we are minting a *new* slug.
 */

import { z } from 'zod';

/** Read-side `:slug` path param — length-bounded only. */
export const slugParamSchema = z.object({
  slug: z.string().min(1).max(200),
});

/** Strict slug format for newly-created resources: lowercase, digits, hyphens. */
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Create-side slug body field — enforces {@link SLUG_RE}. */
export const slugBodyField = z
  .string()
  .regex(SLUG_RE, 'Slug must be lowercase letters, digits, and hyphens')
  .min(2)
  .max(200);

/** Coercing, bounded `limit` query field. Bounds vary per route, so it's a factory. */
export const limitField = (maxLimit: number, defaultLimit: number) =>
  z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit);

/** Coercing `offset` query field — identical everywhere it's used. */
export const offsetField = z.coerce.number().int().min(0).max(10000).default(0);

/** `{ limit, offset }` pagination object with per-route limit bounds. */
export const pagination = (opts: { maxLimit: number; defaultLimit: number }) =>
  z.object({
    limit: limitField(opts.maxLimit, opts.defaultLimit),
    offset: offsetField,
  });
