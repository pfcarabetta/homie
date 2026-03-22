import { pgTable, uuid, text, timestamp, integer, boolean, numeric, jsonb } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export interface BedConfig {
  type: string; // 'king' | 'queen' | 'full' | 'twin' | 'sofa_bed' | 'bunk' | 'crib'
  count: number;
}

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  zipCode: text('zip_code'),
  propertyType: text('property_type').notNull().default('residential'),
  unitCount: integer('unit_count').notNull().default(1),
  bedrooms: integer('bedrooms'),
  bathrooms: numeric('bathrooms', { precision: 3, scale: 1 }),
  sqft: integer('sqft'),
  beds: jsonb('beds').$type<BedConfig[]>(),
  pmsSource: text('pms_source'),
  pmsExternalId: text('pms_external_id'),
  notes: text('notes'),
  photoUrls: text('photo_urls').array(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
