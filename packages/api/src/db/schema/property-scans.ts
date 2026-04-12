import { pgTable, uuid, text, timestamp, integer, numeric, date, index } from 'drizzle-orm/pg-core';
import { properties } from './properties';

// ── Scans ──────────────────────────────────────────────────────────────────
export const propertyScans = pgTable('property_scans', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Business scans link to a property; consumer scans use homeownerId instead */
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
  workspaceId: uuid('workspace_id'),
  /** Consumer home scans link to the homeowner directly */
  homeownerId: uuid('homeowner_id'),
  /** 'full' or 'quick' */
  scanType: text('scan_type').notNull().default('full'),
  scannedBy: uuid('scanned_by'),
  /** in_progress, processing, review_pending, completed, failed */
  status: text('status').notNull().default('in_progress'),
  durationSeconds: integer('duration_seconds'),
  roomsScanned: integer('rooms_scanned').notNull().default(0),
  itemsCataloged: integer('items_cataloged').notNull().default(0),
  itemsConfirmed: integer('items_confirmed').notNull().default(0),
  itemsFlaggedForReview: integer('items_flagged_for_review').notNull().default(0),
  changesDetected: integer('changes_detected').notNull().default(0),
  scanNotes: text('scan_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (t) => [
  index('property_scans_property_idx').on(t.propertyId),
  index('property_scans_workspace_idx').on(t.workspaceId),
  index('property_scans_homeowner_idx').on(t.homeownerId),
  index('property_scans_status_idx').on(t.status),
]);

export type PropertyScan = typeof propertyScans.$inferSelect;
export type NewPropertyScan = typeof propertyScans.$inferInsert;

// ── Rooms ──────────────────────────────────────────────────────────────────
export const propertyRooms = pgTable('property_rooms', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
  homeownerId: uuid('homeowner_id'),
  scanId: uuid('scan_id'),
  roomType: text('room_type').notNull(),
  roomLabel: text('room_label').notNull(),
  floorLevel: integer('floor_level').notNull().default(1),
  flooringType: text('flooring_type'),
  generalCondition: text('general_condition'),
  photoUrl: text('photo_url'),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('property_rooms_property_idx').on(t.propertyId),
  index('property_rooms_scan_idx').on(t.scanId),
]);

export type PropertyRoom = typeof propertyRooms.$inferSelect;
export type NewPropertyRoom = typeof propertyRooms.$inferInsert;

// ── Inventory items ────────────────────────────────────────────────────────
export const propertyInventoryItems = pgTable('property_inventory_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
  homeownerId: uuid('homeowner_id'),
  roomId: uuid('room_id'),
  scanId: uuid('scan_id'),
  /** appliance, fixture, system, safety, amenity, infrastructure */
  category: text('category').notNull(),
  itemType: text('item_type').notNull(),
  brand: text('brand'),
  modelNumber: text('model_number'),
  serialNumber: text('serial_number'),
  manufactureDate: date('manufacture_date'),
  estimatedAgeYears: numeric('estimated_age_years', { precision: 4, scale: 1 }),
  fuelType: text('fuel_type'),
  capacity: text('capacity'),
  /** new, good, fair, aging, needs_attention, end_of_life */
  condition: text('condition'),
  /** label_ocr, visual_classification, pm_manual */
  identificationMethod: text('identification_method').notNull().default('visual_classification'),
  confidenceScore: numeric('confidence_score', { precision: 3, scale: 2 }).notNull().default('0.50'),
  photoFrameUrl: text('photo_frame_url'),
  labelPhotoUrl: text('label_photo_url'),
  maintenanceFlags: text('maintenance_flags').array(),
  notes: text('notes'),
  /** ai_identified, pm_confirmed, pm_corrected, pm_dismissed */
  status: text('status').notNull().default('ai_identified'),
  confirmedBy: uuid('confirmed_by'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('inventory_property_category_idx').on(t.propertyId, t.category),
  index('inventory_property_type_idx').on(t.propertyId, t.itemType),
  index('inventory_brand_model_idx').on(t.brand, t.modelNumber),
  index('inventory_age_idx').on(t.estimatedAgeYears),
  index('inventory_room_idx').on(t.roomId),
  index('inventory_homeowner_idx').on(t.homeownerId),
]);

export type PropertyInventoryItem = typeof propertyInventoryItems.$inferSelect;
export type NewPropertyInventoryItem = typeof propertyInventoryItems.$inferInsert;

// ── Scan changes (for quick scans) ─────────────────────────────────────────
export const propertyScanChanges = pgTable('property_scan_changes', {
  id: uuid('id').defaultRandom().primaryKey(),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
  scanId: uuid('scan_id').notNull(),
  existingItemId: uuid('existing_item_id'),
  /** item_added, item_removed, item_modified, condition_changed, damage_detected */
  changeType: text('change_type').notNull(),
  description: text('description').notNull(),
  photoFrameUrl: text('photo_frame_url'),
  /** info, attention, urgent */
  severity: text('severity').notNull().default('info'),
  reviewed: text('reviewed').notNull().default('false'),
  reviewedBy: uuid('reviewed_by'),
  actionTaken: text('action_taken'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('scan_changes_scan_idx').on(t.scanId),
  index('scan_changes_property_idx').on(t.propertyId),
]);

export type PropertyScanChange = typeof propertyScanChanges.$inferSelect;
export type NewPropertyScanChange = typeof propertyScanChanges.$inferInsert;
