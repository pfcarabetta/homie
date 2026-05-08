import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  numeric,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { homeowners } from './homeowners';
import type { PropertyDetails } from './properties';

/**
 * Consumer-side property records for Homie Membership (Phase 1).
 *
 * Today consumer property data lives directly on the `homeowners` row
 * (`home_address`, `home_city`, `home_bedrooms`, `home_details` jsonb,
 * etc.). The Premier tier's "second home at 50% off" perk requires a
 * 1:N relationship between homeowner and property, so this table holds
 * the going-forward source of truth.
 *
 * Migration strategy is expand-contract: this table is created and
 * backfilled from existing `homeowners.home_*` columns, but those
 * columns stay in place so legacy read paths (auth/account routes,
 * Home IQ dashboard) keep working until a follow-up contract migration
 * cuts them over to read from here.
 *
 * Note: this is consumer-only. The B2B `properties` table is workspace-
 * scoped and serves a different product line. They intentionally do
 * not share a row type.
 */
export const homeownerProperties = pgTable(
  'homeowner_properties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    homeownerId: uuid('homeowner_id')
      .notNull()
      .references(() => homeowners.id, { onDelete: 'cascade' }),
    /** Exactly one row per homeowner has is_primary=true (enforced by
     *  partial unique index). Used by routes that just need "the
     *  homeowner's main residence" without listing all of them. */
    isPrimary: boolean('is_primary').notNull().default(true),
    /** Optional homeowner-chosen label, e.g. "Main house" or "Phoenix
     *  vacation rental". Null means render the address. */
    nickname: text('nickname'),
    address: text('address'),
    city: text('city'),
    state: text('state'),
    zipCode: text('zip_code'),
    /** 'single_family' | 'condo' | 'townhouse' | 'multi_family' | 'other'.
     *  Validated in app code; codebase convention is text+constants over
     *  PG-native enums (easier to evolve). */
    propertyType: text('property_type').notNull().default('single_family'),
    bedrooms: integer('bedrooms'),
    bathrooms: numeric('bathrooms', { precision: 3, scale: 1 }),
    sqft: integer('sqft'),
    /** Same shape as `homeowners.home_details` and `properties.details` —
     *  the shared `PropertyDetails` type from `properties.ts`. */
    details: jsonb('details').$type<PropertyDetails>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('homeowner_properties_homeowner_idx').on(table.homeownerId),
    // Partial unique: at most one primary row per homeowner. The WHERE
    // clause is honored by Postgres; Drizzle-Kit emits this as
    // CREATE UNIQUE INDEX ... WHERE is_primary = true.
    uniqueIndex('homeowner_properties_homeowner_primary_uniq')
      .on(table.homeownerId)
      .where(sql`${table.isPrimary} = true`),
  ],
);

export type HomeownerProperty = typeof homeownerProperties.$inferSelect;
export type NewHomeownerProperty = typeof homeownerProperties.$inferInsert;

/** Allowed values for the `property_type` text column. */
export const HOMEOWNER_PROPERTY_TYPES = [
  'single_family',
  'condo',
  'townhouse',
  'multi_family',
  'other',
] as const;
export type HomeownerPropertyType = (typeof HOMEOWNER_PROPERTY_TYPES)[number];
