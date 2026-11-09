import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import * as authSchema from "./auth.js";
import { geometry } from "./custom-types.js";

// Re-export auth schema so callers can use `schema.user`, `schema.session`, etc.
export * from "./auth.js";
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

export const userRole = ["user", "admin", "system"] as const;
export type WikiUserRole = (typeof userRole)[number];

export const users = pgTable("users", {
  // `text` (not uuid) so that FK columns referencing users.id can hold
  // better-auth's opaque user IDs (e.g. 'LRcxv8AuHTcEsN5I4Jo4YWUsENxFIDZx').
  // Seed uses a UUID string which is losslessly cast on insert.
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  passwordHash: text("password_hash"),
  displayName: text("display_name").notNull(),
  bio: text("bio"),
  location: text("location"),
  role: text("role").$type<WikiUserRole>().notNull().default("user"),
  language: text("language").notNull().default("en"),
  timezone: text("timezone"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  isSuspended: boolean("is_suspended").notNull().default(false),
  preferences: jsonb("preferences").notNull().default(sql`'{}'::jsonb`),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdIdx: index("sessions_user_id_idx").on(t.userId),
    expiresAtIdx: index("sessions_expires_at_idx").on(t.expiresAt),
  }),
);

// =====================================================================
// GEOGRAPHY
// =====================================================================

export const entityType = [
  "planet",
  "continent",
  "country",
  "region",
  "city",
] as const;
export type EntityType = (typeof entityType)[number];

export const geoEntities = pgTable(
  "geo_entities",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    isoCode: text("iso_code"),
    name: text("name").notNull(),
    localName: text("local_name"),
    entityType: text("entity_type").$type<EntityType>().notNull(),
    parentId: uuid("parent_id").references((): any => geoEntities.id),
    centroid: geometry("centroid", { srid: 4326 }),
    population: integer("population"),
    areaKm2: text("area_km2"),
    wikidataId: text("wikidata_id"),
    // --- GUS-242 resync (migration 0014) -------------------------------
    // 'active' | 'archived'. Archiving keeps the row resolvable, which a
    // `same_as_entity_id` link may need (AC and TA are both extras and
    // country twins).
    status: text("status").notNull().default("active"),
    // Where `name` came from. Required for rows with no Wikidata Q-id.
    nameSource: text("name_source"),
    // The ISO 3166-2 subdivision level.
    subdivisionType: text("subdivision_type"),
    // The ISO 3166 edition the code and name came from.
    isoVersion: text("iso_version"),
    // Wikidata P576 — date of dissolution. NULL = in existence.
    dissolved: timestamp("dissolved", { mode: "date" }),
    // Dual place (Option B): the country row that is the SAME real place
    // as this region row.
    sameAsEntityId: uuid("same_as_entity_id").references(
      (): any => geoEntities.id,
      {
        onDelete: "set null",
      },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    parentIdx: index("geo_entities_parent_id_idx").on(t.parentId),
    entityTypeIdx: index("geo_entities_entity_type_idx").on(t.entityType),
    statusIdx: index("geo_entities_status_idx").on(t.status),
    sameAsIdx: index("geo_entities_same_as_entity_id_idx").on(t.sameAsEntityId),
    // DB invariant (0009): null ok; otherwise WGS84 lon/lat in range.
    centroidBoundsCheck: check(
      "geo_entities_centroid_bounds_check",
      sql`${t.centroid} IS NULL OR (
        ST_X(${t.centroid}::geometry) >= -180 AND ST_X(${t.centroid}::geometry) <= 180
        AND ST_Y(${t.centroid}::geometry) >= -90 AND ST_Y(${t.centroid}::geometry) <= 90
        AND ST_SRID(${t.centroid}::geometry) = 4326
      )`,
    ),
    // An entity cannot be the same_as entity as itself.
    sameAsNotSelfCheck: check(
      "geo_entities_same_as_not_self_check",
      sql`${t.sameAsEntityId} IS NULL OR ${t.sameAsEntityId} <> ${t.id}`,
    ),
  }),
);

// =====================================================================
// TAXONOMY
// =====================================================================

export const categorySource = ["foodon", "wikidata", "custom"] as const;
export type CategorySource = (typeof categorySource)[number];

// What kind of category a row is.
//
// Cuisines and course-groups are both top-level (parentId = null), so depth
// alone cannot tell them apart — the `kind` discriminator does.
//
//   dish-type     the legacy flat dish-type set (Noodle soup, Stew, Curry…),
//                 kept for back-compat
//   cuisine       a national cuisine (Indonesian cuisine, Italian cuisine…)
//   family        a food family (Noodle soups, Dumplings…)
//   course-group  a top-level course group (Appetizer, Main course…)
//
// This column has been in the LIVE `gustale` database since 2026-06-25, but
// the migration that added it (`0004_dark_rockslide.sql`) was authored on the
// archived branch `feat-taxonomy-foundation` and never merged to `main`.
// Migration 0035 restores it to the committed chain; see
// `db/migrations/0035_categories_kind.sql` and the PR that carries it.
//
// The live column is `text NOT NULL DEFAULT 'dish-type'` with NO check
// constraint and NO index — these four values are a convention, not an
// enforced enum. The type below records the convention; the database does
// not enforce it, and this migration does not change that.
export const categoryKind = [
  "dish-type",
  "cuisine",
  "family",
  "course-group",
] as const;
export type CategoryKind = (typeof categoryKind)[number];

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  parentId: uuid("parent_id").references((): any => categories.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  source: text("source").$type<CategorySource>().notNull().default("custom"),
  sourceId: text("source_id"),
  icon: text("icon"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  kind: text("kind").$type<CategoryKind>().notNull().default("dish-type"),
});

export const categoryTranslations = pgTable(
  "category_translations",
  {
    // Surrogate PK so Directus (and other admin tools) can manage this
    // collection. (category_id, language) remains unique.
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    name: text("name").notNull(),
    description: text("description"),
  },
  (t) => ({
    categoryLanguageUnique: unique(
      "category_translations_category_id_language_unique",
    ).on(t.categoryId, t.language),
  }),
);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// =====================================================================
// INGREDIENTS
// =====================================================================

export const ingredientCategory = [
  "grain",
  "vegetable",
  "fruit",
  "meat",
  "fish",
  "dairy",
  "spice",
  "herb",
  "oil",
  "sweetener",
  "beverage",
  "other",
] as const;
export type IngredientCategory = (typeof ingredientCategory)[number];

export const ingredients = pgTable("ingredients", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  canonicalName: text("canonical_name").notNull(),
  slug: text("slug").notNull().unique(),
  scientificName: text("scientific_name"),
  category: text("category").$type<IngredientCategory>(),
  shortDescription: text("short_description"),
  longDescription: text("long_description"),
  domesticationDateEarliest: integer("domestication_date_earliest"),
  domesticationDateLatest: integer("domestication_date_latest"),
  originGeoId: uuid("origin_geo_id").references(() => geoEntities.id),
  imageId: uuid("image_id"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // `text` (not `uuid`) so that better-auth user IDs (opaque strings) can be
  // stored without an explicit cast. Seed UUIDs are valid text strings so the
  // migration is lossless.
  createdBy: text("created_by"),
  lastEditedBy: text("last_edited_by"),
});

export const ingredientVariants = pgTable("ingredient_variants", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  ingredientId: uuid("ingredient_id")
    .notNull()
    .references(() => ingredients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  primaryGeoId: uuid("primary_geo_id").references(() => geoEntities.id),
  characteristics: jsonb("characteristics"),
  imageId: uuid("image_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const ingredientTranslations = pgTable(
  "ingredient_translations",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    name: text("name").notNull(),
    shortDescription: text("short_description"),
    longDescription: text("long_description"),
  },
  (t) => ({
    ingredientLanguageUnique: unique(
      "ingredient_translations_ingredient_id_language_unique",
    ).on(t.ingredientId, t.language),
  }),
);

// =====================================================================
// PREPARATION
// =====================================================================

export const preparationMethods = pgTable("preparation_methods", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category"),
  description: text("description"),
  equipment: text("equipment").array(),
  temperatureMinC: text("temperature_min_c"),
  temperatureMaxC: text("temperature_max_c"),
  energyFootprint: text("energy_footprint"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const preparationMethodTranslations = pgTable(
  "preparation_method_translations",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    methodId: uuid("method_id")
      .notNull()
      .references(() => preparationMethods.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    name: text("name").notNull(),
    description: text("description"),
  },
  (t) => ({
    methodLanguageUnique: unique(
      "preparation_method_translations_method_id_language_unique",
    ).on(t.methodId, t.language),
  }),
);

// =====================================================================
// DISHES
// =====================================================================

export const dishStatus = ["draft", "published", "archived"] as const;
export type DishStatus = (typeof dishStatus)[number];

export const dishes = pgTable(
  "dishes",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    canonicalName: text("canonical_name").notNull(),
    slug: text("slug").notNull().unique(),
    shortDescription: text("short_description"),
    longDescription: text("long_description"),
    originGeoId: uuid("origin_geo_id").references(() => geoEntities.id),
    originLocation: geometry("origin_location", { srid: 4326 }),
    originDateEarliest: integer("origin_date_earliest"),
    originDateLatest: integer("origin_date_latest"),
    status: text("status").$type<DishStatus>().notNull().default("draft"),
    // `content_type` is an EXPLICIT EDITORIAL field: a human decided,
    // per dish, whether this record is a dish or a drink.
    //
    // It is deliberately NOT derived from the 'drink' family tag, and
    // there is no sync trigger. The two answer different questions,
    // and a derived field cannot be corrected: Pelamushi carries the
    // 'drink' family tag but is a Georgian dessert porridge, while
    // koldskal is tagged 'drink' and genuinely is a drink.
    //
    // See db/migrations/0049_content_type.sql.
    contentType: text("content_type")
      .$type<"dish" | "drink">()
      .notNull()
      .default("dish"),
    // The frozen Pool A publication batch this dish belongs to (1-14),
    // or NULL for a dish that is not part of Pool A. Assigned once by
    // slug order and never changed, so a batch's membership cannot
    // shift when another batch is published or when a new dish is
    // imported. See packages/db/drizzle/0015_pool_a_batch.sql.
    poolABatch: integer("pool_a_batch"),
    viewCount: integer("view_count").notNull().default(0),
    editCount: integer("edit_count").notNull().default(0),
    contributorCount: integer("contributor_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `text` (not `uuid`) so that better-auth user IDs (opaque strings) can be
    // stored without an explicit cast. Seed UUIDs are valid text strings so the
    // migration is lossless.
    createdBy: text("created_by"),
    lastEditedBy: text("last_edited_by"),
  },
  (t) => ({
    statusCheck: check(
      "dishes_status_check",
      sql`${t.status} IN ('draft', 'published', 'archived')`,
    ),
    originLocationBoundsCheck: check(
      "dishes_origin_location_bounds_check",
      sql`${t.originLocation} IS NULL OR (
        ST_X(${t.originLocation}::geometry) >= -180 AND ST_X(${t.originLocation}::geometry) <= 180
        AND ST_Y(${t.originLocation}::geometry) >= -90 AND ST_Y(${t.originLocation}::geometry) <= 90
        AND ST_SRID(${t.originLocation}::geometry) = 4326
      )`,
    ),
  }),
);

// GUS-239 (2026-10-29): the legacy `dish_translations` table is
// ARCHIVED — renamed to `dish_translations_archived`, with every row
// preserved. It is not in the schema because nothing reads it any
// more: the API serves the names from `dish_names` and the prose from
// `description_sentences`.
//
// The table still EXISTS in the database. The rename is what takes it
// out of the live schema; dropping it was explicitly not approved.
export const dishTranslationsArchived = pgTable(
  "dish_translations_archived",
  {
    // Surrogate PK for Directus (ADR-002 Phase 2b). Natural key retained.
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    name: text("name").notNull(),
    description: text("description"),
  },
  (t) => ({
    naturalKey: unique("dish_translations_natural_key").on(
      t.dishId,
      t.language,
    ),
  }),
);

// ADR-003 layer 2 — the dish names.
//
// A dish can have several names in one language (an endonym, an
// exonym, a romanization) and one canonical name per language. The
// dishes table's canonical_name cannot express that, so this table
// holds the rest.
//
// The English name stays in dishes.canonical_name, so this table holds
// only the other languages.
//
// `script` is the ISO 15924 code (Latn, Cyrl, Arab, Hans, Hant, Jpan,
// Deva). It is stored explicitly because it drives font selection and
// romanization detection, and because a dish may be spelled in
// several scripts across languages. It is nullable because a name's
// script may genuinely be unknown.
//
// `kind` is constrained: 'endonym' | 'exonym' | 'romanization'.
// ADR-003 layer 3b — the description sentences, and their
// translations.
//
// The English description is stored as a LIST of sentences, and each
// sentence is translated individually. The translation REFERENCES the
// English sentence, so it inherits the source's claim anchors instead
// of copying them — the anchor text stays English, because it is a
// verbatim excerpt of the source.
//
// `sourceHash` is the hash of the ENGLISH SOURCE SENTENCE, so a
// change to that sentence invalidates exactly that translation and
// leaves the others alone.
//
// `status` is the machine: draft -> machine -> reviewed. `isStale` is
// an OVERLAY, not a status: a stale reviewed translation is still
// reviewed, it is just flagged as needing re-translation.
export const descriptionSentences = pgTable(
  "description_sentences",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    locale: text("locale").notNull().default("en"),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    sourceSentenceId: uuid("source_sentence_id"),
    anchorStatus: text("anchor_status").notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    naturalKey: unique("description_sentences_unique").on(
      t.dishId,
      t.field,
      t.locale,
      t.position,
    ),
    dishIdx: index("description_sentences_dish_idx").on(
      t.dishId,
      t.field,
      t.locale,
      t.position,
    ),
  }),
);

// ─────────────────────────────────────────────────────────────────────
// ADR-002 — the claims model.
//
// The STRUCTURE is the claim (ADR-002 Q1): there is no authoritative
// text column on a statement. A reading is a separate, optional and
// explicitly NON-AUTHORITATIVE annotation.
//
// A statement is an INDEPENDENT entity (Q10): no owner, no dish_id.
// The subject reference is the only link from a statement to the
// world, so the same fact asserted by several dishes is ONE statement
// with several evidence chains.
//
// The status column is the Q12 lifecycle. It may only be changed
// through statement_set_status(), which checks the gates — the
// database refuses a direct UPDATE.
export const predicates = pgTable("predicates", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  valueKind: text("value_kind").notNull(),
  valueType: text("value_type"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const statements = pgTable("statements", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  predicateId: uuid("predicate_id")
    .notNull()
    .references(() => predicates.id),
  valueType: text("value_type").notNull(),
  valueRef: uuid("value_ref"),
  valueLiteral: text("value_literal"),
  valueLiteralType: text("value_literal_type"),
  qualifiers: jsonb("qualifiers").notNull().default(sql`'{}'::jsonb`),
  claimClass: text("claim_class").notNull(),
  // The Q12 lifecycle: draft → research_pending → under_review →
  // verified → published, with disputed and needs_revision branches.
  // A direct UPDATE is refused by the database.
  status: text("status").notNull().default("draft"),
  // Q8: independence is STORED, tri-state, and never defaulted.
  // NULL means "not assessed", which is NOT the same as "single".
  independence: text("independence"),
  // ADR-004 D4: the three evidence axes, as SEPARATE columns.
  //
  // `status` above is the PUBLICATION/MODERATION state and `claimClass` is
  // the EPISTEMIC KIND of the claim; both keep their ADR-002 meanings and
  // the database still refuses a direct UPDATE of `status`. These three
  // are the axes ADR-004 adds, and they are deliberately not one field:
  //
  //   evidenceStatus   how well evidenced the claim is
  //   disputeState     whether competing accounts exist
  //   researchOutcome  what the research found
  //
  // `evidenced` is a PROJECT STATE — qualifying non-Wikipedia sources are
  // attached. It does NOT mean the claim is uncontested; that is
  // `disputeState`'s business.
  evidenceStatus: text("evidence_status")
    .$type<EvidenceStatus>()
    .notNull()
    .default("unevidenced"),
  disputeState: text("dispute_state").$type<DisputeState>(),
  researchOutcome: text("research_outcome").$type<ResearchOutcome>(),
  independenceCheckedAt: timestamp("independence_checked_at", {
    withTimezone: true,
  }),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  publishedBy: text("published_by"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const statementReadings = pgTable("statement_readings", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  statementId: uuid("statement_id")
    .notNull()
    .references(() => statements.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  locale: text("locale").notNull().default("en"),
  // 'plain' = generated from the structure; 'editorial' = hand-written.
  kind: text("kind").notNull().default("plain"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const claimCitations = pgTable("claim_citations", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  statementId: uuid("statement_id")
    .notNull()
    .references(() => statements.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => sources.id),
  // 'supports' | 'refutes' | 'context'. 'context' counts as NEITHER
  // support nor refutation.
  stance: text("stance").notNull(),
  locator: text("locator"),
  excerpt: text("excerpt"),
  revisionId: text("revision_id"),
  retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
  excerptValidated: boolean("excerpt_validated").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sentenceClaims = pgTable("sentence_claims", {
  sentenceId: uuid("sentence_id")
    .notNull()
    .references(() => descriptionSentences.id, { onDelete: "cascade" }),
  statementId: uuid("statement_id")
    .notNull()
    .references(() => statements.id, { onDelete: "cascade" }),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const statementStatusLog = pgTable("statement_status_log", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  statementId: uuid("statement_id")
    .notNull()
    .references(() => statements.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actor: text("actor").notNull(),
  gateOk: boolean("gate_ok").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const descriptionSentenceTranslations = pgTable(
  "description_sentence_translations",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    sourceSentenceId: uuid("source_sentence_id")
      .notNull()
      .references(() => descriptionSentences.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    text: text("text").notNull(),
    sourceHash: text("source_hash").notNull(),
    status: text("status").notNull().default("draft"),
    isStale: boolean("is_stale").notNull().default(false),
    translator: text("translator"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    proposedText: text("proposed_text"),
    proposedBy: text("proposed_by"),
    proposedAt: timestamp("proposed_at", { withTimezone: true }),
    proposalStatus: text("proposal_status"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    naturalKey: unique("description_sentence_translations_unique").on(
      t.sourceSentenceId,
      t.locale,
    ),
    sourceIdx: index("description_sentence_translations_source_idx").on(
      t.sourceSentenceId,
    ),
    localeIdx: index("description_sentence_translations_locale_idx").on(
      t.locale,
    ),
    staleIdx: index("description_sentence_translations_stale_idx").on(
      t.isStale,
      t.locale,
    ),
  }),
);

export const dishNames = pgTable(
  "dish_names",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    language: text("language").notNull(),
    script: text("script"),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("endonym"),
    isPrimary: boolean("is_primary").notNull().default(false),
    source: text("source"),
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    naturalKey: unique("dish_names_unique").on(
      t.dishId,
      t.language,
      t.script,
      t.name,
    ),
    dishLangIdx: index("dish_names_dish_lang_idx").on(t.dishId, t.language),
    langIdx: index("dish_names_lang_idx").on(t.language),
  }),
);

// ADR-003 layer 1 — the vocabulary labels.
//
// Every controlled-vocabulary label (families, cuisines, techniques,
// ingredients, traditions, contexts, predicates, places) is translated
// ONCE per locale, not per use. That makes every dish page
// multilingual in structure without touching dish content.
//
// The English label stays in each vocabulary's own base table, so this
// table holds only non-English locales. `language` rather than
// `locale` to match dishTranslations and the other translation tables;
// locale variants are valid BCP-47 ('es-MX', 'zh-Hans').
//
// `vocabulary` names the controlled vocabulary the label belongs to:
// family | technique | tradition | cuisine | context |
// ingredient_category | place | predicate | ingredient | category |
// preparation_method
//
// `is_primary` marks the one label to show when a value has several in
// one language (an endonym and a romanization, say).
export const vocabularyLabels = pgTable(
  "vocabulary_labels",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    vocabulary: text("vocabulary").notNull(),
    valueId: uuid("value_id").notNull(),
    language: text("language").notNull(),
    name: text("name").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    // 'wikidata' | 'project' | 'machine'
    source: text("source"),
    // the Wikidata QID the label came from, so it can be re-checked
    sourceRef: text("source_ref"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    naturalKey: unique("vocabulary_labels_unique").on(
      t.vocabulary,
      t.valueId,
      t.language,
    ),
    vocabLangIdx: index("vocabulary_labels_vocab_lang_idx").on(
      t.vocabulary,
      t.language,
    ),
    valueIdx: index("vocabulary_labels_value_idx").on(t.valueId),
  }),
);

// DEPRECATED — do not insert new rows. Regional variants are full `dishes`
// rows linked by `dish_relations` with relationType "regional-cousin"
// (see DISH_RELATIONS in seed-data.ts). Table retained until a dedicated
// drop migration; API read/write for legacy clients still exists.
export const dishVariants = pgTable(
  "dish_variants",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    parentDishId: uuid("parent_dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    regionGeoId: uuid("region_geo_id").references(() => geoEntities.id),
    regionLocation: geometry("region_location", { srid: 4326 }),
    creatorName: text("creator_name"),
    creatorDate: integer("creator_date"),
    status: text("status").$type<DishStatus>().notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqueSlugPerParent: unique("dish_variants_parent_slug_unique").on(
      t.parentDishId,
      t.slug,
    ),
    statusCheck: check(
      "dish_variants_status_check",
      sql`${t.status} IN ('draft', 'published', 'archived')`,
    ),
    regionLocationBoundsCheck: check(
      "dish_variants_region_location_bounds_check",
      sql`${t.regionLocation} IS NULL OR (
        ST_X(${t.regionLocation}::geometry) >= -180 AND ST_X(${t.regionLocation}::geometry) <= 180
        AND ST_Y(${t.regionLocation}::geometry) >= -90 AND ST_Y(${t.regionLocation}::geometry) <= 90
        AND ST_SRID(${t.regionLocation}::geometry) = 4326
      )`,
    ),
  }),
);

export const dishIngredients = pgTable(
  "dish_ingredients",
  {
    // Surrogate PK for Directus (ADR-002 Amendment 2). Natural key retains
    // variant_id so a dish may list the same ingredient in multiple variant forms.
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    variantId: uuid("variant_id").references(() => ingredientVariants.id),
    position: integer("position").notNull().default(0),
    quantity: text("quantity"),
    unit: text("unit"),
    isOptional: boolean("is_optional").notNull().default(false),
    preparationNote: text("preparation_note"),
  },
  (t) => ({
    // DB constraint is UNIQUE NULLS NOT DISTINCT (see 0011). Drizzle's unique()
    // does not express NULLS NOT DISTINCT; migration is authoritative.
    naturalKey: unique("dish_ingredients_natural_key").on(
      t.dishId,
      t.ingredientId,
      t.variantId,
    ),
  }),
);

export const dishPreparations = pgTable("dish_preparations", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  dishId: uuid("dish_id")
    .notNull()
    .references(() => dishes.id, { onDelete: "cascade" }),
  methodId: uuid("method_id")
    .notNull()
    .references(() => preparationMethods.id),
  steps: text("steps"),
  durationMinutes: integer("duration_minutes"),
  difficulty: integer("difficulty"),
  sequenceOrder: integer("sequence_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const dishCategories = pgTable(
  "dish_categories",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => ({
    naturalKey: unique("dish_categories_natural_key").on(
      t.dishId,
      t.categoryId,
    ),
  }),
);

export const dishTags = pgTable(
  "dish_tags",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    naturalKey: unique("dish_tags_natural_key").on(t.dishId, t.tagId),
  }),
);

// =====================================================================
// DISH RELATIONS — the food-genealogy network.
// =====================================================================
//
// A single dish belongs to many implicit clusters (same region, same
// ingredient base, same cooking method, same historical lineage). The
// `dishRelations` table makes the most-curated of those clusters
// queryable, so a dish page can show "regional cousins", "shared-
// technique cousins", and so on without re-computing joins every render.
//
// Relation types (kept open-ended via the `text` column; we provide a
// typed enum in TypeScript and validate at the API boundary):
//   - family            → same food family (dumpling, noodle soup, etc.)
//   - regional-cousin   → neighboring-region variation
//   - diaspora          → diaspora adaptation
//   - shared-ingredient → shares a key ingredient base
//   - shared-method     → uses the same core cooking technique
//   - similar-serving   → served in similar contexts (street snack, etc.)
//   - ancestor          → historical ancestor or clear influence
//   - descendant        → historical descendant (the reverse direction)
//
// `strength` is a 1-5 editor-graded weight (5 = very strong, 1 = weak).
// It lets the UI sort relations within a type and lets curators push
// canonical anchors to the top.
export const dishRelationType = [
  "family",
  "regional-cousin",
  "diaspora",
  "shared-ingredient",
  "shared-method",
  "similar-serving",
  "ancestor",
  "descendant",
] as const;
export type DishRelationType = (typeof dishRelationType)[number];

// GUS-224 Option B: the relation_type vocabulary. A TABLE, not a CHECK enum,
// because `is_symmetric` is metadata and a vocabulary table can be extended
// without a schema migration.
export const relationTypes = pgTable("relation_types", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  isSymmetric: boolean("is_symmetric").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// The inverse rows dropped by GUS-224 Option B. Nothing is hard-deleted:
// the original row (same id) is kept here for provenance.
export const dishRelationsArchive = pgTable("dish_relations_archive", {
  id: uuid("id").primaryKey(),
  fromDishId: uuid("from_dish_id").notNull(),
  toDishId: uuid("to_dish_id").notNull(),
  relationType: text("relation_type").notNull(),
  reason: text("reason"),
  strength: integer("strength").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  archivedReason: text("archived_reason").notNull(),
});

export const dishRelations = pgTable(
  "dish_relations",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    fromDishId: uuid("from_dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    toDishId: uuid("to_dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    relationType: text("relation_type").$type<DishRelationType>().notNull(),
    // GUS-224 Option B: the relation_type vocabulary table is authoritative;
    // `relation_type` above is a denormalized mirror kept in sync by a DB
    // trigger, so existing readers and the UNIQUE(from,to,relation_type)
    // constraint keep working.
    relationTypeId: uuid("relation_type_id").references(() => relationTypes.id),
    // symmetric = the relation holds equally in both directions.
    // FALSE for directional types (ancestor, diaspora) — storing both
    // directions there would assert a contradiction.
    isSymmetric: boolean("is_symmetric").notNull().default(true),
    // ADR-004 D5: for `connection_proposed`, whether the DIRECTION of the
    // connection is known. When it is false, NO arrow is rendered — in the
    // page, in the graph, or in the API. An arrow asserts a direction the
    // data does not have.
    directionKnown: boolean("direction_known").notNull().default(true),
    // 'active' | 'quarantined'. Quarantined rows are excluded from the
    // public view; admins still see them with `quarantineNote`.
    status: text("status")
      .$type<"active" | "unverified" | "quarantined">()
      .notNull()
      .default("unverified"),
    quarantineNote: text("quarantine_note"),
    // Free-text reason shown to the user ("both share a fermented-cabbage base"
    // / "traded along the Silk Road" / "regional variation of the same dish").
    // Optional — some relations are obvious from the relation_type alone.
    reason: text("reason"),
    // 1-5 editor-graded strength. Higher = stronger / more canonical relation.
    strength: integer("strength").notNull().default(3),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // Prevent exact duplicates (same direction + type). Reverse-direction
    // relations (A→B as family, B→A as family) are deliberately allowed —
    // they're symmetric by nature and the UI de-duplicates.
    fromTypeUnique: unique("dish_relations_from_to_type_unique").on(
      t.fromDishId,
      t.toDishId,
      t.relationType,
    ),
    fromIdx: index("dish_relations_from_idx").on(t.fromDishId),
    toIdx: index("dish_relations_to_idx").on(t.toDishId),
    typeIdx: index("dish_relations_type_idx").on(t.relationType),
    noSelfCheck: check(
      "dish_relations_no_self_check",
      sql`${t.fromDishId} <> ${t.toDishId}`,
    ),
  }),
);

// =====================================================================
// LINEAGES — dish ancestry, migration, transformation, and influence
// =====================================================================
//
// A lineage is the *story* of how a dish idea travels across regions,
// generations, and cultures. It is distinct from a family (which
// classifies by form: dumpling, flatbread, stew) and from a cuisine
// (which classifies by origin region). Lineages are *graph-shaped*:
//   - chains   (A → B → C, clear historical transmission)
//   - clusters (shared-technique cousins)
//   - cousins  (parallel evolution, no provable ancestor)
//   - fusions  (contact-zone hybrids: ports, diasporas, colonies)
//
// Fields kept as jsonb arrays so we can evolve the shape without
// migrations — historical_forces, techniques, base_ingredients,
// course_groups, related_families, representative_dishes, regions.
//
// `confidence_level` is a deliberate uncertainty knob. We do NOT
// pretend to know what we don't. Many relationships are "likely
// related" or "possible influence" rather than "descendant of".

export const confidenceLevel = [
  "documented",
  "likely",
  "probable",
  "possible",
  "uncertain",
  "parallel_evolution",
] as const;
export type ConfidenceLevel = (typeof confidenceLevel)[number];

export const historicalForce = [
  "migration",
  "trade_route",
  "empire",
  "colonization",
  "diaspora",
  "religious_exchange",
  "port_city_exchange",
  "agricultural_spread",
  "technological_change",
  "local_adaptation",
  "parallel_evolution",
  "cultural_exchange",
  "nomadic_pastoral",
  "war_and_displacement",
] as const;
export type HistoricalForce = (typeof historicalForce)[number];

export const lineages = pgTable(
  "lineages",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    shortDescription: text("short_description").notNull(),
    longDescription: text("long_description"),
    conceptSummary: text("concept_summary"),
    originSummary: text("origin_summary"),
    // jsonb arrays so the taxonomy can evolve without schema migrations
    originRegions: jsonb("origin_regions").notNull().default(sql`'[]'::jsonb`),
    relatedRegions: jsonb("related_regions")
      .notNull()
      .default(sql`'[]'::jsonb`),
    historicalForces: jsonb("historical_forces")
      .notNull()
      .default(sql`'[]'::jsonb`),
    primaryTechnique: text("primary_technique"),
    techniques: jsonb("techniques").notNull().default(sql`'[]'::jsonb`),
    baseIngredients: jsonb("base_ingredients")
      .notNull()
      .default(sql`'[]'::jsonb`),
    courseGroups: jsonb("course_groups").notNull().default(sql`'[]'::jsonb`),
    relatedFamilies: jsonb("related_families")
      .notNull()
      .default(sql`'[]'::jsonb`),
    representativeDishes: jsonb("representative_dishes")
      .notNull()
      .default(sql`'[]'::jsonb`),
    confidenceLevel: text("confidence_level")
      .$type<ConfidenceLevel>()
      .notNull()
      .default("likely"),
    uncertaintyNote: text("uncertainty_note"),
    culturalPracticeNote: text("cultural_practice_note"),
    // for future map work: lat/lng centroid of the origin region(s)
    routeHints: jsonb("route_hints").notNull().default(sql`'[]'::jsonb`),
    sourceNotes: text("source_notes"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    slugIdx: index("lineages_slug_idx").on(t.slug),
    displayIdx: index("lineages_display_order_idx").on(t.displayOrder),
  }),
);

// ─── Dish ↔ Lineage relationship ─────────────────────────────────────────
//
// Many-to-many with rich metadata. The `role` enum is the editorial
// claim: is this dish an ancestor of the lineage, a descendant, a
// regional variant, a diaspora adaptation, a parallel invention?
//
// We deliberately allow the SAME dish to map to multiple lineages
// (momo lives in the filled-dough lineage AND the noodle-soup-sibling
// cluster). The (dishId, lineageId) pair is unique; same dish can map
// twice with different roles via... no, actually we keep it strict:
// one row per (dish, lineage). If two roles apply, curators pick the
// most informative one and explain in `explanation`.

export const dishLineageRole = [
  "ancestor",
  "descendant",
  "cousin",
  "regional_variant",
  "adaptation",
  "fusion",
  "diaspora_adaptation",
  "trade_route_spread",
  "colonial_spread",
  "technique_relative",
  "ingredient_relative",
  "possible_influence",
  "parallel_evolution",
  "uncertain",
] as const;
export type DishLineageRole = (typeof dishLineageRole)[number];

export const changedElement = [
  "ingredient",
  "spice_profile",
  "cooking_method",
  "shape",
  "filling",
  "dough",
  "grain",
  "preservation_method",
  "serving_context",
  "religious_rule",
  "local_availability",
  "cooking_fat",
  "wrapper",
  "fermentation_time",
] as const;
export type ChangedElement = (typeof changedElement)[number];

export const dishLineages = pgTable(
  "dish_lineages",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    lineageId: uuid("lineage_id")
      .notNull()
      .references(() => lineages.id, { onDelete: "cascade" }),
    role: text("role").$type<DishLineageRole>().notNull(),
    explanation: text("explanation"),
    // array of what changed between an ancestor/relative and this dish
    changedElements: jsonb("changed_elements")
      .notNull()
      .default(sql`'[]'::jsonb`),
    confidenceLevel: text("confidence_level")
      .$type<ConfidenceLevel>()
      .notNull()
      .default("likely"),
    // 1-10 editorial sort weight: anchors first (10), then strong members (5-7),
    // then tentative ones (1-3). Lets the UI push canonical dishes to the top.
    sortOrder: integer("sort_order").notNull().default(5),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    naturalKey: unique("dish_lineages_natural_key").on(t.dishId, t.lineageId),
    lineageIdx: index("dish_lineages_lineage_idx").on(t.lineageId),
    roleIdx: index("dish_lineages_role_idx").on(t.role),
  }),
);

// =====================================================================
// SOURCES & CITATIONS
// =====================================================================

export const sourceType = [
  "book",
  "article",
  "web",
  "video",
  "audio",
  "archive",
  "personal_communication",
] as const;
export type SourceType = (typeof sourceType)[number];

export const sourceReliability = [
  "primary",
  "secondary",
  "tertiary",
  "speculative",
] as const;
export type SourceReliability = (typeof sourceReliability)[number];

export const sources = pgTable("sources", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  sourceType: text("source_type").$type<SourceType>().notNull(),
  title: text("title").notNull(),
  authors: text("authors").array(),
  year: integer("year"),
  publisher: text("publisher"),
  isbn: text("isbn"),
  doi: text("doi"),
  url: text("url"),
  archiveName: text("archive_name"),
  archiveCatalogId: text("archive_catalog_id"),
  citationText: text("citation_text"),
  language: text("language").notNull().default("en"),
  reliability: text("reliability").$type<SourceReliability>(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // `text` for the same reason as dishes.created_by — see comment there.
  createdBy: text("created_by"),
});

export const citations = pgTable("citations", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => sources.id),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  claimText: text("claim_text"),
  location: text("location"),
  addedBy: text("added_by"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

// =====================================================================
// DISH JOURNEY BEATS — per-dish origin → adaptation timeline (P1-1)
// =====================================================================
//
// A short ordered path of places/moments for the dish detail Journey UI.
// Confidence is narrower than lineage `confidence_level`: documented /
// likely / possible / parallel. Hide the section when a dish has no rows.

export const journeyConfidence = [
  "documented",
  "likely",
  "possible",
  "parallel",
] as const;
export type JourneyConfidence = (typeof journeyConfidence)[number];

export const dishJourneyBeats = pgTable(
  "dish_journey_beats",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    placeName: text("place_name").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    yearApprox: integer("year_approx"),
    label: text("label").notNull(),
    confidence: text("confidence").$type<JourneyConfidence>().notNull(),
    sourceId: uuid("source_id").references(() => sources.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dishSeqUnique: unique("dish_journey_beats_dish_id_sequence_unique").on(
      t.dishId,
      t.sequence,
    ),
    // Already present since 0008 — kept authoritative in Drizzle.
    confidenceCheck: check(
      "dish_journey_beats_confidence_check",
      sql`${t.confidence} IN ('documented', 'likely', 'possible', 'parallel')`,
    ),
    sequencePositiveCheck: check(
      "dish_journey_beats_sequence_positive_check",
      sql`${t.sequence} >= 1`,
    ),
  }),
);

// =====================================================================
// EDIT HISTORY
// =====================================================================

export const editAction = [
  "create",
  "update",
  "archive",
  "restore",
  "flag",
  "review",
] as const;
export type EditAction = (typeof editAction)[number];

export const editHistory = pgTable(
  "edit_history",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: text("user_id"),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    action: text("action").$type<EditAction>().notNull(),
    diff: jsonb("diff"),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    targetIdx: index("edit_history_target_idx").on(t.targetType, t.targetId),
    userIdx: index("edit_history_user_idx").on(t.userId),
    createdIdx: index("edit_history_created_at_idx").on(t.createdAt),
  }),
);

// =====================================================================
// COMMUNITY
// =====================================================================

export const watchList = pgTable(
  "watch_list",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: text("user_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    notifyOnEdit: boolean("notify_on_edit").notNull().default(true),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    naturalKey: unique("watch_list_natural_key").on(
      t.userId,
      t.targetType,
      t.targetId,
    ),
  }),
);

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    userId: text("user_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    parentCommentId: uuid("parent_comment_id"),
    body: text("body").notNull(),
    isHidden: boolean("is_hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    targetIdx: index("comments_target_idx").on(t.targetType, t.targetId),
  }),
);

export const contentPermissions = pgTable("content_permissions", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: text("user_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  canEdit: boolean("can_edit").notNull().default(false),
  canDelete: boolean("can_delete").notNull().default(false),
  canModerate: boolean("can_moderate").notNull().default(false),
  grantedBy: text("granted_by"),
  grantedAt: timestamp("granted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const expertCredentials = pgTable("expert_credentials", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  userId: text("user_id").notNull(),
  field: text("field").notNull(),
  description: text("description").notNull(),
  evidenceUrl: text("evidence_url"),
  verifiedBy: text("verified_by"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// =====================================================================
// MEDIA
// =====================================================================

export const media = pgTable("media", {
  id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  durationSeconds: integer("duration_seconds"),
  altText: text("alt_text"),
  credit: text("credit"),
  license: text("license"),
  /**
   * Pre-rendered derivative variants for fast delivery.
   *
   * JSONB shape: `{"<width>": "<storageKey>"}`, e.g.
   *   `{"800": "dishes/foo/cover-800w.webp", "1536": "dishes/foo/cover-1536w.webp"}`
   *
   * The width string keys are nominal ("800", "1536") and used directly as
   * `<img srcset>` width descriptors by the front-end. Values are storage
   * keys in the `gustale-public` bucket (or `gustale-media` for pre-migration
   * rows — the route that resolves them does the bucket lookup).
   *
   * Rows without variants fall back to the `storageKey` field, which
   * represents the original (typically the master JPG).
   */
  variants: jsonb("variants")
    .$type<Record<string, string>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  uploadedBy: text("uploaded_by"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mediaAttachments = pgTable(
  "media_attachments",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    role: text("role").notNull().default("gallery"),
    position: integer("position").notNull().default(0),
    attachedAt: timestamp("attached_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    targetIdx: index("media_attachments_target_idx").on(
      t.targetType,
      t.targetId,
    ),
  }),
);

// =====================================================================
// FOOD GEOGRAPHY (Phase 2A)
// =====================================================================
//
// A flexible, multi-faceted geography layer for dishes. Phase 2A is
// metadata-first: geometry is NOT stored in the database. Region polygons
// live in versioned GeoJSON files (e.g.
// apps/web/public/data/regions/the-levant.geojson) authored via the QGIS
// workflow documented at docs/gis-workflow.md.
//
// food_regions     → culinary / cultural / historical regions (polygons
//                    referenced by file path, not stored as PostGIS).
// dish_regions     → join table describing a dish's relationship to a
//                    region (origin, variation, diaspora, ...).
// dish_locations   → multiple, typed point locations per dish (origin,
//                    popularity, variation, ...).
// *_sources        → join tables to the existing `sources` table so
//                    citations remain first-class and reusable.
//
// Phase 2A deliberately does NOT enforce a partial unique index on
// `is_primary` per (dish, relationship_type) — that rule will live in
// service/admin logic in Phase 2D.

export const foodRegionType = [
  "culinary",
  "cultural",
  "geographic",
  "historical",
  "diaspora",
  "trade_route",
  "ingredient_zone",
] as const;
export type FoodRegionType = (typeof foodRegionType)[number];

export const foodRegionStatus = [
  "draft",
  "reviewed",
  "published",
  "deprecated",
] as const;
export type FoodRegionStatus = (typeof foodRegionStatus)[number];

export const foodRegions = pgTable(
  "food_regions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    type: text("type").$type<FoodRegionType>().notNull(),
    status: text("status").$type<FoodRegionStatus>().notNull().default("draft"),
    description: text("description"),
    countryCodes: text("country_codes").array(),
    geojsonPath: text("geojson_path").notNull(),
    bbox: jsonb("bbox"),
    centroidLatitude: numeric("centroid_latitude"),
    centroidLongitude: numeric("centroid_longitude"),
    parentRegionId: uuid("parent_region_id").references(
      (): any => foodRegions.id,
      { onDelete: "set null" },
    ),
    confidence: integer("confidence"),
    sourceNotes: text("source_notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    typeIdx: index("food_regions_type_idx").on(t.type),
    statusIdx: index("food_regions_status_idx").on(t.status),
  }),
);

export const dishRegionRelationshipType = [
  "origin",
  "core_region",
  "variation_region",
  "popularity_region",
  "diaspora_region",
  "disputed_origin",
  "ingredient_origin",
  "historical_spread",
] as const;
export type DishRegionRelationshipType =
  (typeof dishRegionRelationshipType)[number];

export const dishRegions = pgTable(
  "dish_regions",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    regionId: uuid("region_id")
      .notNull()
      .references(() => foodRegions.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type")
      .$type<DishRegionRelationshipType>()
      .notNull(),
    confidence: integer("confidence"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    compositeUnique: unique("dish_regions_dish_region_type_unique").on(
      t.dishId,
      t.regionId,
      t.relationshipType,
    ),
    dishIdx: index("dish_regions_dish_id_idx").on(t.dishId),
    regionIdx: index("dish_regions_region_id_idx").on(t.regionId),
    typeIdx: index("dish_regions_relationship_type_idx").on(t.relationshipType),
  }),
);

export const dishLocationType = [
  "origin_point",
  "representative_point",
  "popularity_point",
  "variation_point",
  "diaspora_point",
  "market_point",
] as const;
export type DishLocationType = (typeof dishLocationType)[number];

export const dishLocations = pgTable(
  "dish_locations",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    locationType: text("location_type").$type<DishLocationType>().notNull(),
    latitude: numeric("latitude").notNull(),
    longitude: numeric("longitude").notNull(),
    label: text("label"),
    countryCode: text("country_code"),
    adminRegion: text("admin_region"),
    confidence: integer("confidence"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    dishIdx: index("dish_locations_dish_id_idx").on(t.dishId),
    typeIdx: index("dish_locations_location_type_idx").on(t.locationType),
    countryIdx: index("dish_locations_country_code_idx").on(t.countryCode),
  }),
);

// -- Source junction tables -------------------------------------------------
// Each links a record to the canonical `sources` table via composite primary
// keys. Cascade on delete matches the rest of the project (e.g.
// ingredientTranslations, mediaAttachments).

export const foodRegionSources = pgTable(
  "food_region_sources",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    regionId: uuid("region_id")
      .notNull()
      .references(() => foodRegions.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
  },
  (t) => ({
    naturalKey: unique("food_region_sources_natural_key").on(
      t.regionId,
      t.sourceId,
    ),
  }),
);

export const dishRegionSources = pgTable(
  "dish_region_sources",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    regionId: uuid("region_id")
      .notNull()
      .references(() => foodRegions.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type")
      .$type<DishRegionRelationshipType>()
      .notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
  },
  (t) => ({
    naturalKey: unique("dish_region_sources_natural_key").on(
      t.dishId,
      t.regionId,
      t.relationshipType,
      t.sourceId,
    ),
    sourceIdx: index("dish_region_sources_source_id_idx").on(t.sourceId),
  }),
);

export const dishLocationSources = pgTable(
  "dish_location_sources",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    locationId: uuid("location_id")
      .notNull()
      .references(() => dishLocations.id, { onDelete: "cascade" }),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
  },
  (t) => ({
    naturalKey: unique("dish_location_sources_natural_key").on(
      t.locationId,
      t.sourceId,
    ),
  }),
);

// GUS-224 Option B — the derived relation views.
//
// dish_relations_symmetric emits each ACTIVE relation, plus its INVERSE for
// SYMMETRIC types only. For a directional type (ancestor, diaspora) the
// inverse is NOT a valid assertion — emitting it would recreate exactly the
// contradiction the Option B migration removed.
//
// dish_relations_public is the public read path: active rows only, with
// quarantined rows excluded.

const relationViewColumns = {
  sourceRowId: uuid("source_row_id").notNull(),
  fromDishId: uuid("from_dish_id").notNull(),
  toDishId: uuid("to_dish_id").notNull(),
  relationTypeId: uuid("relation_type_id").notNull(),
  relationType: text("relation_type").notNull(),
  isSymmetric: boolean("is_symmetric").notNull(),
  reason: text("reason"),
  strength: integer("strength").notNull(),
  status: text("status").notNull(),
  quarantineNote: text("quarantine_note"),
};

export const dishRelationsSymmetric = pgView(
  "dish_relations_symmetric",
  relationViewColumns,
).existing();

export const dishRelationsPublic = pgView(
  "dish_relations_public",
  relationViewColumns,
).existing();

// Admin view: active + quarantined rows, with the quarantine note.
// Quarantined rows are excluded from the PUBLIC view only.
export const dishRelationsAdmin = pgView(
  "dish_relations_admin",
  relationViewColumns,
).existing();

// =====================================================================
// ADR-004 — THE SHARED CULINARY ATLAS
// =====================================================================
//
// Three concepts, kept separate in storage, in the API, in the editor, in
// search, on the maps and in what the public is shown:
//
//   PLACES & TRADITIONS   dish_place_associations
//   FOOD FAMILIES         dish_families / dish_techniques / dish_courses /
//                         ingredient_categories / dish_contexts
//   HISTORY & CONNECTIONS statements / dish_relations / claim_dates
//
// The rule that decides every ambiguous case: association is not ownership,
// shared heritage is not shared invention, similarity is not descent, and
// earliest documentation is not a birthplace.

// ── The three evidence axes ───────────────────────────────────────────
//
// Deliberately THREE columns and not one overloaded field.
//
//   evidence_status   how well evidenced the claim is
//   dispute_state     whether competing accounts exist
//   research_outcome  what the research found
//
// `statements.status` (publication/moderation) and `statements.claim_class`
// (epistemic kind) keep their existing ADR-002 meanings, and the database
// still refuses a direct UPDATE of `status`.

export const evidenceStatus = [
  "unevidenced",
  "research_pending",
  "provisional",
  "evidenced",
] as const;
export type EvidenceStatus = (typeof evidenceStatus)[number];

export const disputeState = ["disputed", "unresolved"] as const;
export type DisputeState = (typeof disputeState)[number];

export const researchOutcome = ["completed", "inconclusive"] as const;
export type ResearchOutcome = (typeof researchOutcome)[number];

// ── D6: claim_dates ───────────────────────────────────────────────────
//
// A date qualifies a SPECIFIC claim, never a dish as a whole. The
// machine-readable value and the human-readable expression are both
// stored, because neither is derivable from the other: "before the
// thirteenth century" has no year, and "c. 1800" is not "1800".

export const claimDateKind = [
  "surviving_record",
  "proposed_emergence",
  "introduction",
  "adaptation",
] as const;
export type ClaimDateKind = (typeof claimDateKind)[number];

export const datePrecision = [
  "exact",
  "approximate",
  "bounded",
  "open",
] as const;
export type DatePrecision = (typeof datePrecision)[number];

export const claimDates = pgTable(
  "claim_dates",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    statementId: uuid("statement_id").references(() => statements.id, {
      onDelete: "cascade",
    }),
    dishId: uuid("dish_id").references(() => dishes.id, {
      onDelete: "cascade",
    }),
    dateKind: text("date_kind").$type<ClaimDateKind>().notNull(),
    yearStart: integer("year_start"),
    yearEnd: integer("year_end"),
    precision: text("precision").$type<DatePrecision>(),
    dateText: text("date_text").notNull(),
    placeId: uuid("place_id").references(() => geoEntities.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statementIdx: index("claim_dates_statement_idx").on(t.statementId),
    dishIdx: index("claim_dates_dish_idx").on(t.dishId),
    placeIdx: index("claim_dates_place_idx").on(t.placeId),
    kindIdx: index("claim_dates_kind_idx").on(t.dateKind),
  }),
);

// ── D1/D3: dish_place_associations ────────────────────────────────────
//
// The six relationship types, and no others. `legacy_unreviewed` is
// MIGRATION ONLY — it exists so that a backfill never has to guess, and
// the editor never creates it.

export const placeAssociationType = [
  "historical_emergence",
  "established_tradition",
  "regional_adaptation",
  "later_introduction",
  "earliest_documentation",
  "legacy_unreviewed",
] as const;
export type PlaceAssociationType = (typeof placeAssociationType)[number];

export const placeEntityKind = ["place", "community"] as const;
export type PlaceEntityKind = (typeof placeEntityKind)[number];

export const associationReviewState = [
  "unreviewed",
  "in_review",
  "accepted",
  "rejected",
] as const;
export type AssociationReviewState = (typeof associationReviewState)[number];

export const associationPublicationState = [
  "draft",
  "published",
  "withdrawn",
] as const;
export type AssociationPublicationState =
  (typeof associationPublicationState)[number];

export const dishPlaceAssociations = pgTable(
  "dish_place_associations",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    relationshipType: text("relationship_type")
      .$type<PlaceAssociationType>()
      .notNull(),
    // A 'place' entity is a geo_entities row (a modern place, a historical
    // region, a cross-border area). A 'community' entity is a
    // dish_traditions row (a people, a culinary tradition). A community is
    // a group of people, NOT a place: it has no geometry and no ISO code.
    entityKind: text("entity_kind").$type<PlaceEntityKind>().notNull(),
    entityId: uuid("entity_id").notNull(),
    explanation: text("explanation"),
    qualifiers: jsonb("qualifiers").notNull().default(sql`'{}'::jsonb`),
    provenance: text("provenance").notNull().default("editorial"),
    // The original legacy value this row was derived from, preserved
    // verbatim — nothing is lost by the migration and everything is
    // reversible.
    legacyValue: text("legacy_value"),
    evidenceStatus: text("evidence_status")
      .$type<EvidenceStatus>()
      .notNull()
      .default("unevidenced"),
    disputeState: text("dispute_state").$type<DisputeState>(),
    researchOutcome: text("research_outcome").$type<ResearchOutcome>(),
    reviewState: text("review_state")
      .$type<AssociationReviewState>()
      .notNull()
      .default("unreviewed"),
    publicationState: text("publication_state")
      .$type<AssociationPublicationState>()
      .notNull()
      .default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // The identity of an association: the dish, the relationship and the
    // entity. A second claim about the SAME association is a competing
    // statement, not a second row.
    identityUniq: unique("dpa_identity_uniq").on(
      t.dishId,
      t.relationshipType,
      t.entityKind,
      t.entityId,
    ),
    dishIdx: index("dpa_dish_idx").on(t.dishId),
    entityIdx: index("dpa_entity_idx").on(t.entityKind, t.entityId),
    typeIdx: index("dpa_type_idx").on(t.relationshipType),
    publicationIdx: index("dpa_publication_idx").on(t.publicationState),
    reviewIdx: index("dpa_review_idx").on(t.reviewState),
  }),
);

// ── D7: dish identity ─────────────────────────────────────────────────
//
// shared_dish          one preparation, two rows
// regional_variant     a named local form
// historically_related related by documented history, not identity
//
// Identifiers are preserved until editorial review resolves identity:
// nothing is merged by name, and nothing is split by national association.

export const dishIdentityKind = [
  "shared_dish",
  "regional_variant",
  "historically_related",
] as const;
export type DishIdentityKind = (typeof dishIdentityKind)[number];

export const dishIdentities = pgTable(
  "dish_identities",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    fromDishId: uuid("from_dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    toDishId: uuid("to_dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    identityKind: text("identity_kind").$type<DishIdentityKind>().notNull(),
    explanation: text("explanation"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pairUniq: unique("dish_identities_pair_uniq").on(
      t.fromDishId,
      t.toDishId,
      t.identityKind,
    ),
    fromIdx: index("dish_identities_from_idx").on(t.fromDishId),
    toIdx: index("dish_identities_to_idx").on(t.toDishId),
  }),
);

// How two dish rows relate by NAME. `dish_names` carries the names
// themselves; this carries the link between two dishes when the same name
// denotes two of them (the US biscuit and the British biscuit).
export const dishNameRelationKind = [
  "alias",
  "translation",
  "transliteration",
] as const;
export type DishNameRelationKind = (typeof dishNameRelationKind)[number];

export const dishNameRelations = pgTable(
  "dish_name_relations",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    fromDishId: uuid("from_dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    toDishId: uuid("to_dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    relationKind: text("relation_kind").$type<DishNameRelationKind>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    pairUniq: unique("dish_name_relations_pair_uniq").on(
      t.fromDishId,
      t.toDishId,
      t.relationKind,
    ),
    fromIdx: index("dish_name_relations_from_idx").on(t.fromDishId),
    toIdx: index("dish_name_relations_to_idx").on(t.toDishId),
  }),
);

// ─────────────────────────────────────────────────────────────────────
// THE PUBLISH CREDENTIAL (migration 0038)
//
// The `verified` and `published` transitions on a statement require an
// actor that HOLDS one of these rows. The rule is POSITIVE and the
// default is DENY: an actor that is not in this table is refused,
// whatever it is called.
//
// Before 0038 the guard was a NAME check — an actor matching `%agent%`
// or `%hermes%` was refused — which passes every other name, and a
// published claim is visible to the public.
//
// `actor` is a `users.id`, so the credential is tied to an ACCOUNT and
// not to a free-text name anybody can type. There is deliberately no
// automated role: an automated process cannot be a human editor.
//
// The table starts EMPTY, so the gate is closed until a credential is
// issued deliberately.
// ─────────────────────────────────────────────────────────────────────

export const publishCredentialRole = ["editor", "publisher"] as const;
export type PublishCredentialRole = (typeof publishCredentialRole)[number];

export const publishCredential = pgTable(
  "publish_credential",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    // The `users.id` of the account that holds the credential. This is
    // the value `statement_set_status()` receives as `p_actor`.
    actor: text("actor").notNull(),
    // 'editor' may verify; 'publisher' may verify and publish.
    credentialRole: text("credential_role")
      .$type<PublishCredentialRole>()
      .notNull(),
    // A credential is not usable until it is verified. A row with a
    // NULL `verified_at` is an unverified claim to be an editor, and the
    // guard refuses to honour it.
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    actorUniq: unique("publish_credential_actor_uniq").on(t.actor),
    roleIdx: index("publish_credential_role_idx").on(t.credentialRole),
  }),
);

// =====================================================================
// THE RECIPES (migration 0052, and 0053 for the published view)
// =====================================================================
//
// The recipes property's data model, per ADR-007 and ADR-007-A1 §8.
//
// WHAT IS HERE, AND WHERE IT CAME FROM
// -------------------------------------
// The TABLES are migration 0052's (PR #202, fixed by PR #203). This
// section is the TypeScript half of them — the Drizzle model that
// CLAUDE.md requires in BOTH places. 0052 wrote the SQL; this file
// mirrors it, column for column.
//
// THE RULES THIS SECTION ENCODES ARE NOT OPTIONAL, and they are the
// reason the schema is written the way it is:
//
//   * The CONFIDENCE is NOT a column on `recipes`. It is a COMPUTED
//     value with its own evidence, and it lives in `recipe_confidence`
//     (ADR-007-A1 §8.1). A column would invite it to be set by hand.
//
//   * `recipe_sentences` is LANGUAGE-FIRST: the original locale's
//     sentence has `source_sentence_id IS NULL` and `is_original = true`,
//     and every other locale points at it. This is the MIRROR IMAGE of
//     `description_sentences`, whose CHECK makes English the source
//     language — and that table is UNTOUCHED (ADR-007-A1 §4.3).
//
//   * `recipe_claims` is a SEPARATE table from `sentence_claims`, on
//     purpose: `sentence_claims.sentence_id` is FK-bound to
//     `description_sentences(id)`, and a recipe sentence is not a
//     description sentence (ADR-007, Option A).
//
//   * `statements` is SHARED between the Atlas and the recipes. The
//     scope rule that keeps a recipe claim from naming an Atlas
//     statement is enforced IN THE DATABASE (a trigger on
//     `recipe_claims`, a trigger on `statements`, and the
//     system-actor branch of `statement_set_status()`) — see
//     db/migrations/0052_recipes_schema.sql. Nothing in the TypeScript
//     layer enforces it, and nothing in the TypeScript layer may be
//     relied on to enforce it.
//
//   * The KILL SWITCH is a row in `recipe_settings`, read by
//     `recipe_auto_publish()` on EVERY invocation. It is not an
//     environment variable and not a code path, so flipping it takes
//     effect on the next call with no deploy.
//
// WHAT THE API MAY NOT DO (and this is why these tables are read-
// mostly from the API's point of view):
//
//   * It may not write `statements.status`. The ONLY way a statement's
//     status changes is `statement_set_status()`, which runs the
//     evidence gates and the publish-credential check.
//
//   * It may not write `recipes.status` to 'published' as a way of
//     publishing a recipe. The recipe becomes published because its
//     STATEMENTS are published — the direction of dependency ADR-007
//     already has, and the reason `statements_status_gate_trg` exists.
//
//   * It may not read the kill switch to decide whether to publish.
//     Only `recipe_auto_publish()` does that, and it checks the switch
//     FIRST, before the recipe is touched (ADR-007-A1 §7.1).

// ── The recipe ────────────────────────────────────────────────────────

export const recipeContentType = [
  "recipe",
  "variation",
  "technique",
  "base",
  "template",
] as const;
export type RecipeContentType = (typeof recipeContentType)[number];

export const recipeStatus = ["draft", "published", "archived"] as const;
export type RecipeStatus = (typeof recipeStatus)[number];

export const recipeReviewState = [
  "unreviewed",
  "in_review",
  "approved",
  "rejected",
] as const;
export type RecipeReviewState = (typeof recipeReviewState)[number];

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    // An EXPLICIT EDITORIAL field, with no sync trigger — the same
    // decision as `dishes.content_type` (ADR-007 Decision 6).
    contentType: text("content_type")
      .$type<RecipeContentType>()
      .notNull()
      .default("recipe"),
    servings: integer("servings"),
    prepMinutes: integer("prep_minutes"),
    cookMinutes: integer("cook_minutes"),
    difficulty: integer("difficulty"),
    // The EDITORIAL state. A recipe is 'published' when a human
    // published it through the review queue — NOT when the auto-publish
    // function ran. The auto-publish function publishes the recipe's
    // STATEMENTS; the recipe's own page is served when those
    // statements are published (see the `recipe_published` view below).
    status: text("status").$type<RecipeStatus>().notNull().default("draft"),
    // The pair `status`/`review_state` overlaps — a recipe can be
    // 'published' and 'rejected' — and ADR-007 keeps the split
    // because the dish tables already use this shape.
    reviewState: text("review_state")
      .$type<RecipeReviewState>()
      .notNull()
      .default("unreviewed"),
    // `text` (not `uuid`), for the same reason as `dishes.created_by`:
    // better-auth user ids are opaque strings.
    createdBy: text("created_by"),
    lastEditedBy: text("last_edited_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => ({
    // The hub's list is "the dish's recipes", and the view filters on
    // `dish_id` and the editorial state, so the index carries both.
    dishStatusIdx: index("recipes_dish_status_idx").on(t.dishId, t.status),
    // The detail read: one recipe by slug. The UNIQUE constraint on
    // `slug` is the database's own index; this one is the migration's
    // (0053), for the view's lookup.
    slugIdx: index("recipes_slug_idx").on(t.slug),
  }),
);

// ── One row per ingredient line ───────────────────────────────────────

export const recipeIngredients = pgTable(
  "recipe_ingredients",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    // The ingredient is a SHARED Atlas row. There is deliberately no
    // per-recipe ingredients table (ADR-007, Decision 5).
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    // Quantity and unit are TEXT, not numeric columns: "2½", "a
    // handful" and "to taste" are real quantities, and a numeric
    // column would throw the meaning away (ADR-007, Decision 5).
    quantity: text("quantity"),
    unit: text("unit"),
    isOptional: boolean("is_optional").notNull().default(false),
    preparationNote: text("preparation_note"),
    position: integer("position").notNull(),
  },
  (t) => ({
    recipeIdx: index("recipe_ingredients_recipe_idx").on(t.recipeId),
  }),
);

// ── The recipe's own sentences, LANGUAGE-FIRST ────────────────────────

export const recipeSentenceField = ["step", "note", "intro"] as const;
export type RecipeSentenceField = (typeof recipeSentenceField)[number];

export const recipeSentenceAnchorStatus = ["full", "partial", "none"] as const;
export type RecipeSentenceAnchorStatus =
  (typeof recipeSentenceAnchorStatus)[number];

export const recipeSentences = pgTable(
  "recipe_sentences",
  {
    id: uuid("id").primaryKey().default(sql`uuid_generate_v4()`),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    field: text("field").$type<RecipeSentenceField>().notNull().default("step"),
    locale: text("locale").notNull().default("en"),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    // ON DELETE RESTRICT, not SET NULL: a translation's source must
    // not be deleted out from under it, and SET NULL would fail the
    // language-first CHECK with a confusing constraint error instead
    // of a clear foreign-key one.
    sourceSentenceId: uuid("source_sentence_id").references(
      (): any => recipeSentences.id,
      { onDelete: "restrict" },
    ),
    anchorStatus: text("anchor_status")
      .$type<RecipeSentenceAnchorStatus>()
      .notNull()
      .default("none"),
    // Exactly ONE row per recipe is the original (ADR-007-A1 §4.3).
    isOriginal: boolean("is_original").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // The migration's index (0053): the view walks a recipe's sentences
    // twice -- once for the EXISTS, once for `published_at`.
    recipeIdx: index("recipe_sentences_recipe_idx").on(t.recipeId),
    // The locale-ordered read the API does when it serves one recipe's
    // text in one language.
    recipeLocaleIdx: index("recipe_sentences_recipe_locale_idx").on(
      t.recipeId,
      t.locale,
      t.position,
    ),
  }),
);

// ── The recipe-scoped claim link ──────────────────────────────────────
//
// NOT `sentence_claims`: that table's `sentence_id` is FK-bound to
// `description_sentences(id)`, and a recipe sentence is not a
// description sentence (ADR-007, Option A).
//
// The scope rule — a claim may only name a statement that is ABOUT
// this recipe — is enforced in the DATABASE by a trigger on
// `recipe_claims`, a trigger on `statements`, and the system-actor
// branch of `statement_set_status()`. This model does not enforce it
// and must not be relied on to.

export const recipeClaims = pgTable(
  "recipe_claims",
  {
    recipeSentenceId: uuid("recipe_sentence_id")
      .notNull()
      .references(() => recipeSentences.id, { onDelete: "cascade" }),
    statementId: uuid("statement_id")
      .notNull()
      .references(() => statements.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // The table's PRIMARY KEY is the composite (recipe_sentence_id,
    // statement_id) in the database. The `sentenceClaims` table above
    // models the same shape the same way — a table-level unique on the
    // pair, and no `primaryKey()` call — because Drizzle's composite
    // primary key helper is not used anywhere in this file. The
    // migration is authoritative for the constraint itself.
    naturalKey: unique("recipe_claims_natural_key").on(
      t.recipeSentenceId,
      t.statementId,
    ),
    // The migration's index (0053): the view joins a sentence to its
    // claims.
    sentenceIdx: index("recipe_claims_sentence_idx").on(t.recipeSentenceId),
    statementIdx: index("recipe_claims_statement_idx").on(t.statementId),
  }),
);

// ── The recipe's title and description, per locale ─────────────────────

export const recipeTranslations = pgTable(
  "recipe_translations",
  {
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    // The recipe's own language is marked, per ADR-007-A1 §4.3.
    isOriginal: boolean("is_original").notNull().default(false),
  },
  (t) => ({
    pk: unique("recipe_translations_recipe_locale_uniq").on(
      t.recipeId,
      t.locale,
    ),
  }),
);

// ── The system actors ─────────────────────────────────────────────────
//
// A row here means: this identity is a SYSTEM ACTOR, not a person.
// It has NO login in "user", NO email, NO password, NO session and NO
// publish credential, and it may act ONLY inside the function that
// owns it (`recipe_auto_publish()`, SECURITY DEFINER).
//
// The `kind` CHECK admits only 'system', so this table can never hold
// a person (ADR-007-A1 §2.4).

export const serviceAccounts = pgTable(
  "service_accounts",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // The actor string used as `statements.published_by` / `verified_by`,
    // e.g. 'system:auto-publish'.
    actor: text("actor").notNull().unique(),
    kind: text("kind").notNull().default("system"),
    purpose: text("purpose").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    actorIdx: unique("service_accounts_actor_uniq").on(t.actor),
  }),
);

// ── The recipes settings: the kill switch and the daily cap ───────────
//
// A SINGLE-ROW table, read by the auto-publish function on EVERY
// invocation, so flipping the switch takes effect on the next call —
// no restart, no deploy (ADR-007-A1 §7.1).
//
// The switch has THREE positions: 'enabled' / 'disabled' /
// 'enabled_with_cap'. `auto_publish_mode` is the AUTHORITATIVE switch
// and `auto_publishEnabled` is its boolean projection; a trigger in
// the database keeps the two in step so they cannot disagree.
//
// The initial value is 'disabled' — the switch ships OFF at launch,
// and the auto-publish path is dormant on arrival (ADR-007-A1 §7.1,
// §10 decision 4).

export const autoPublishMode = [
  "enabled",
  "disabled",
  "enabled_with_cap",
] as const;
export type AutoPublishMode = (typeof autoPublishMode)[number];

export const recipeSettings = pgTable("recipe_settings", {
  // `boolean PRIMARY KEY DEFAULT true CHECK (id)` — the single row.
  id: boolean("id").primaryKey().default(true),
  autoPublishEnabled: boolean("auto_publish_enabled").notNull().default(false),
  autoPublishMode: text("auto_publish_mode")
    .$type<AutoPublishMode>()
    .notNull()
    .default("disabled"),
  // 20 is the owner's number (ADR-007-A1 §7.2, §10 decision 5).
  autoPublishDailyCap: integer("auto_publish_daily_cap").notNull().default(20),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by"),
});

// ── The COMPUTED confidence ───────────────────────────────────────────
//
// A table and not a column on `recipes`, because the confidence is
// computed from the rows and a column would invite it to be set by
// hand (ADR-007-A1 §8.1).
//
// `conditionsMet` holds EVERY failing condition, so a MEDIUM recipe
// says WHICH condition it failed — which is what the owner reviews
// (§8.3).

export const recipeConfidenceLevel = ["high", "medium", "low"] as const;
export type RecipeConfidenceLevel = (typeof recipeConfidenceLevel)[number];

export const recipeConfidence = pgTable("recipe_confidence", {
  recipeId: uuid("recipe_id")
    .primaryKey()
    .references(() => recipes.id, { onDelete: "cascade" }),
  level: text("level").$type<RecipeConfidenceLevel>().notNull().default("low"),
  conditionsMet: jsonb("conditions_met").notNull().default(sql`'{}'::jsonb`),
  independentSources: jsonb("independent_sources")
    .notNull()
    .default(sql`'[]'::jsonb`),
  sourceCount: integer("source_count").notNull().default(0),
  ingredientCount: integer("ingredient_count").notNull().default(0),
  sentenceCount: integer("sentence_count").notNull().default(0),
  computedAt: timestamp("computed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  // A human may LOWER the level; nobody may raise it above the
  // computed one (§1.6).
  overrideLevel: text("override_level").$type<RecipeConfidenceLevel>(),
});

// ── The audit trail ───────────────────────────────────────────────────
//
// There is NO path by which a recipe becomes published without a row
// here (ADR-007-A1 §2.5). The actor is recorded as a
// `service_account_id` — a fact in the database — rather than an email
// a reader has to interpret.

export const recipePublishMode = ["auto", "manual"] as const;
export type RecipePublishMode = (typeof recipePublishMode)[number];

export const recipePublishLog = pgTable(
  "recipe_publish_log",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    confidence: text("confidence").notNull(),
    publishMode: text("publish_mode").$type<RecipePublishMode>().notNull(),
    conditionsMet: jsonb("conditions_met").notNull(),
    sources: jsonb("sources").notNull(),
    actor: text("actor").notNull(),
    serviceAccountId: uuid("service_account_id").references(
      () => serviceAccounts.id,
    ),
    killSwitchOn: boolean("kill_switch_on").notNull(),
    dailyCountAtPublish: integer("daily_count_at_publish").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    recipeIdx: index("recipe_publish_log_recipe_idx").on(t.recipeId),
    // The digest (§7.3) reads "everything that went live today", so the
    // day is the first sort key of the index that serves it.
    publishedIdx: index("recipe_publish_log_published_idx").on(t.publishedAt),
  }),
);

// ── The PUBLISHED view (migration 0053) ───────────────────────────────
//
// WHY A VIEW AND NOT A COLUMN
// --------------------------
// ADR-007-A1 §8.4 says the auto-publish function "does not update
// `recipes.status` directly. The recipe becomes published because its
// STATEMENTS are published". But the `recipe_publishable` view that
// 0052 created requires `r.status = 'published'` — and nothing sets
// it. So the recipe's PUBLISHED-ness and the recipe's EDITORIAL state
// are two different facts, and the first one was never stored.
//
// So the published-ness is DERIVED, here, and the API reads this view.
// `recipes.status` stays what it has always been: the editorial state
// a human sets through the review queue.
//
// The predicate is the same shape as 0052's `recipe_publishable`,
// with the editorial `status`/`review_state` pair REPLACED by the
// thing that actually means "this recipe is live": every one of its
// sentences carries a statement that is verified or published, and
// every statement is about THIS recipe.
//
// The scope clause is the important one. `statements` is SHARED, so a
// recipe's sentence could name an Atlas statement; the view requires
// `st.subject_type = 'recipe' AND st.subject_id = r.id`, so an Atlas
// statement can never make a recipe look published.

export const recipePublished = pgView("recipe_published", {
  id: uuid("id").notNull(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  dishId: uuid("dish_id").notNull(),
  contentType: text("content_type").notNull(),
  servings: integer("servings"),
  prepMinutes: integer("prep_minutes"),
  cookMinutes: integer("cook_minutes"),
  // The EDITORIAL state. 'rejected' and 'archived' are excluded by
  // the view; the rest is reported.
  reviewState: text("review_state").notNull(),
  // The COMPUTED confidence, and NULL when the recipe has never been
  // through the publish path. NULL means "not computed", not "low".
  confidence: text("confidence"),
  // When the recipe went live: the moment its last statement reached
  // 'published'.
  publishedAt: timestamp("published_at", { withTimezone: true }),
}).existing();
