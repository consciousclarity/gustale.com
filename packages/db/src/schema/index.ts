import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, customType, index, unique, primaryKey } from 'drizzle-orm/pg-core';
import { geometry } from './custom-types.js';
import * as authSchema from './auth.js';

// Re-export auth schema so callers can use `schema.user`, `schema.session`, etc.
export * from './auth.js';
export { authSchema };

/**
 * Gustale — Drizzle schema
 * Mirrors the PostgreSQL schema loaded at db/schema.sql on the VPS.
 * Edit db/schema.sql first, then regenerate this file to match.
 */

// =====================================================================
// IDENTITY
// =====================================================================

// =====================================================================
// Note on user FKs: better-auth is the source of truth for users
// (table: authSchema.user, singular). The legacy 'users' table (plural)
// is only used by seed data. We therefore do NOT add FK constraints
// from domain tables to users.id — the values are still stored as
// text for audit-trail purposes, but referential integrity is the
// responsibility of better-auth + the application layer.
// =====================================================================

export const userRole = ['user', 'admin', 'system'] as const;
export type WikiUserRole = typeof userRole[number];

export const users = pgTable('users', {
  // `text` (not uuid) so that FK columns referencing users.id can hold
  // better-auth's opaque user IDs (e.g. 'LRcxv8AuHTcEsN5I4Jo4YWUsENxFIDZx').
  // Seed uses a UUID string which is losslessly cast on insert.
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  passwordHash: text('password_hash'),
  displayName: text('display_name').notNull(),
  bio: text('bio'),
  location: text('location'),
  role: text('role').$type<WikiUserRole>().notNull().default('user'),
  language: text('language').notNull().default('en'),
  timezone: text('timezone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  isSuspended: boolean('is_suspended').notNull().default(false),
  preferences: jsonb('preferences').notNull().default(sql`'{}'::jsonb`),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  userId: text('user_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  userAgent: text('user_agent'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdIdx: index('sessions_user_id_idx').on(t.userId),
  expiresAtIdx: index('sessions_expires_at_idx').on(t.expiresAt),
}));

// =====================================================================
// GEOGRAPHY
// =====================================================================

export const entityType = ['planet', 'continent', 'country', 'region', 'city'] as const;
export type EntityType = typeof entityType[number];

export const geoEntities = pgTable('geo_entities', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  isoCode: text('iso_code'),
  name: text('name').notNull(),
  localName: text('local_name'),
  entityType: text('entity_type').$type<EntityType>().notNull(),
  parentId: uuid('parent_id').references((): any => geoEntities.id),
  centroid: geometry('centroid', { srid: 4326 }),
  population: integer('population'),
  areaKm2: text('area_km2'),
  wikidataId: text('wikidata_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  parentIdx: index('geo_entities_parent_id_idx').on(t.parentId),
  entityTypeIdx: index('geo_entities_entity_type_idx').on(t.entityType),
}));

// =====================================================================
// TAXONOMY
// =====================================================================

export const categorySource = ['foodon', 'wikidata', 'custom'] as const;
export type CategorySource = typeof categorySource[number];

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  parentId: uuid('parent_id').references((): any => categories.id),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  source: text('source').$type<CategorySource>().notNull().default('custom'),
  sourceId: text('source_id'),
  icon: text('icon'),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const categoryTranslations = pgTable('category_translations', {
  categoryId: uuid('category_id').notNull().references(() => categories.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  name: text('name').notNull(),
  description: text('description'),
}, (t) => ({
  pk: primaryKey({ columns: [t.categoryId, t.language] }),
}));

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// =====================================================================
// INGREDIENTS
// =====================================================================

export const ingredientCategory = [
  'grain', 'vegetable', 'fruit', 'meat', 'fish', 'dairy',
  'spice', 'herb', 'oil', 'sweetener', 'beverage', 'other'
] as const;
export type IngredientCategory = typeof ingredientCategory[number];

export const ingredients = pgTable('ingredients', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  canonicalName: text('canonical_name').notNull(),
  slug: text('slug').notNull().unique(),
  scientificName: text('scientific_name'),
  category: text('category').$type<IngredientCategory>(),
  shortDescription: text('short_description'),
  longDescription: text('long_description'),
  domesticationDateEarliest: integer('domestication_date_earliest'),
  domesticationDateLatest: integer('domestication_date_latest'),
  originGeoId: uuid('origin_geo_id').references(() => geoEntities.id),
  imageId: uuid('image_id'),
  status: text('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // `text` (not `uuid`) so that better-auth user IDs (opaque strings) can be
  // stored without an explicit cast. Seed UUIDs are valid text strings so the
  // migration is lossless.
  createdBy: text('created_by'),
  lastEditedBy: text('last_edited_by'),
});

export const ingredientVariants = pgTable('ingredient_variants', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  primaryGeoId: uuid('primary_geo_id').references(() => geoEntities.id),
  characteristics: jsonb('characteristics'),
  imageId: uuid('image_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ingredientTranslations = pgTable('ingredient_translations', {
  ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  name: text('name').notNull(),
  shortDescription: text('short_description'),
  longDescription: text('long_description'),
}, (t) => ({
  pk: primaryKey({ columns: [t.ingredientId, t.language] }),
}));

// =====================================================================
// PREPARATION
// =====================================================================

export const preparationMethods = pgTable('preparation_methods', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  category: text('category'),
  description: text('description'),
  equipment: text('equipment').array(),
  temperatureMinC: text('temperature_min_c'),
  temperatureMaxC: text('temperature_max_c'),
  energyFootprint: text('energy_footprint'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const preparationMethodTranslations = pgTable('preparation_method_translations', {
  methodId: uuid('method_id').notNull().references(() => preparationMethods.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  name: text('name').notNull(),
  description: text('description'),
}, (t) => ({
  pk: primaryKey({ columns: [t.methodId, t.language] }),
}));

// =====================================================================
// DISHES
// =====================================================================

export const dishStatus = ['draft', 'published', 'archived'] as const;
export type DishStatus = typeof dishStatus[number];

export const dishes = pgTable('dishes', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  canonicalName: text('canonical_name').notNull(),
  slug: text('slug').notNull().unique(),
  shortDescription: text('short_description'),
  longDescription: text('long_description'),
  originGeoId: uuid('origin_geo_id').references(() => geoEntities.id),
  originLocation: geometry('origin_location', { srid: 4326 }),
  originDateEarliest: integer('origin_date_earliest'),
  originDateLatest: integer('origin_date_latest'),
  status: text('status').$type<DishStatus>().notNull().default('draft'),
  viewCount: integer('view_count').notNull().default(0),
  editCount: integer('edit_count').notNull().default(0),
  contributorCount: integer('contributor_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // `text` (not `uuid`) so that better-auth user IDs (opaque strings) can be
  // stored without an explicit cast. Seed UUIDs are valid text strings so the
  // migration is lossless.
  createdBy: text('created_by'),
  lastEditedBy: text('last_edited_by'),
});

export const dishTranslations = pgTable('dish_translations', {
  dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  name: text('name').notNull(),
  description: text('description'),
}, (t) => ({
  pk: primaryKey({ columns: [t.dishId, t.language] }),
}));

export const dishVariants = pgTable('dish_variants', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  parentDishId: uuid('parent_dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  description: text('description'),
  regionGeoId: uuid('region_geo_id').references(() => geoEntities.id),
  regionLocation: geometry('region_location', { srid: 4326 }),
  creatorName: text('creator_name'),
  creatorDate: integer('creator_date'),
  status: text('status').$type<DishStatus>().notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqueSlugPerParent: unique('dish_variants_parent_slug_unique').on(t.parentDishId, t.slug),
}));

export const dishIngredients = pgTable('dish_ingredients', {
  dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  ingredientId: uuid('ingredient_id').notNull().references(() => ingredients.id),
  variantId: uuid('variant_id').references(() => ingredientVariants.id),
  position: integer('position').notNull().default(0),
  quantity: text('quantity'),
  unit: text('unit'),
  isOptional: boolean('is_optional').notNull().default(false),
  preparationNote: text('preparation_note'),
});

export const dishPreparations = pgTable('dish_preparations', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  methodId: uuid('method_id').notNull().references(() => preparationMethods.id),
  steps: text('steps'),
  durationMinutes: integer('duration_minutes'),
  difficulty: integer('difficulty'),
  sequenceOrder: integer('sequence_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const dishCategories = pgTable('dish_categories', {
  dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  categoryId: uuid('category_id').notNull().references(() => categories.id),
  isPrimary: boolean('is_primary').notNull().default(false),
}, (t) => ({
  pk: primaryKey({ columns: [t.dishId, t.categoryId] }),
}));

export const dishTags = pgTable('dish_tags', {
  dishId: uuid('dish_id').notNull().references(() => dishes.id, { onDelete: 'cascade' }),
  tagId: uuid('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => ({
  pk: primaryKey({ columns: [t.dishId, t.tagId] }),
}));

// =====================================================================
// SOURCES & CITATIONS
// =====================================================================

export const sourceType = ['book', 'article', 'web', 'video', 'audio', 'archive', 'personal_communication'] as const;
export type SourceType = typeof sourceType[number];

export const sourceReliability = ['primary', 'secondary', 'tertiary', 'speculative'] as const;
export type SourceReliability = typeof sourceReliability[number];

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  sourceType: text('source_type').$type<SourceType>().notNull(),
  title: text('title').notNull(),
  authors: text('authors').array(),
  year: integer('year'),
  publisher: text('publisher'),
  isbn: text('isbn'),
  doi: text('doi'),
  url: text('url'),
  archiveName: text('archive_name'),
  archiveCatalogId: text('archive_catalog_id'),
  citationText: text('citation_text'),
  language: text('language').notNull().default('en'),
  reliability: text('reliability').$type<SourceReliability>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // `text` for the same reason as dishes.created_by — see comment there.
  createdBy: text('created_by'),
});

export const citations = pgTable('citations', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  sourceId: uuid('source_id').notNull().references(() => sources.id),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  claimText: text('claim_text'),
  location: text('location'),
  addedBy: text('added_by'),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});

// =====================================================================
// EDIT HISTORY
// =====================================================================

export const editAction = ['create', 'update', 'archive', 'restore', 'flag', 'review'] as const;
export type EditAction = typeof editAction[number];

export const editHistory = pgTable('edit_history', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  userId: text('user_id'),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  action: text('action').$type<EditAction>().notNull(),
  diff: jsonb('diff'),
  comment: text('comment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  targetIdx: index('edit_history_target_idx').on(t.targetType, t.targetId),
  userIdx: index('edit_history_user_idx').on(t.userId),
  createdIdx: index('edit_history_created_at_idx').on(t.createdAt),
}));

// =====================================================================
// COMMUNITY
// =====================================================================

export const watchList = pgTable('watch_list', {
  userId: text('user_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  notifyOnEdit: boolean('notify_on_edit').notNull().default(true),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.targetType, t.targetId] }),
}));

export const comments = pgTable('comments', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  userId: text('user_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  parentCommentId: uuid('parent_comment_id'),
  body: text('body').notNull(),
  isHidden: boolean('is_hidden').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  targetIdx: index('comments_target_idx').on(t.targetType, t.targetId),
}));

export const contentPermissions = pgTable('content_permissions', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  userId: text('user_id').notNull(),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  canEdit: boolean('can_edit').notNull().default(false),
  canDelete: boolean('can_delete').notNull().default(false),
  canModerate: boolean('can_moderate').notNull().default(false),
  grantedBy: text('granted_by'),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
});

export const expertCredentials = pgTable('expert_credentials', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  userId: text('user_id').notNull(),
  field: text('field').notNull(),
  description: text('description').notNull(),
  evidenceUrl: text('evidence_url'),
  verifiedBy: text('verified_by'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// =====================================================================
// MEDIA
// =====================================================================

export const media = pgTable('media', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  durationSeconds: integer('duration_seconds'),
  altText: text('alt_text'),
  credit: text('credit'),
  license: text('license'),
  uploadedBy: text('uploaded_by'),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mediaAttachments = pgTable('media_attachments', {
  id: uuid('id').primaryKey().default(sql`uuid_generate_v4()`),
  mediaId: uuid('media_id').notNull().references(() => media.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(),
  targetId: uuid('target_id').notNull(),
  role: text('role').notNull().default('gallery'),
  position: integer('position').notNull().default(0),
  attachedAt: timestamp('attached_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  targetIdx: index('media_attachments_target_idx').on(t.targetType, t.targetId),
}));
