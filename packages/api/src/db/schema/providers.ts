import { pgTable, uuid, text, timestamp, integer, numeric, boolean, jsonb, index } from 'drizzle-orm/pg-core';

export const providers = pgTable(
  'providers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    website: text('website'),
    googlePlaceId: text('google_place_id').unique(),
    googleRating: numeric('google_rating', { precision: 3, scale: 2 }),
    reviewCount: integer('review_count').notNull().default(0),
    categories: text('categories').array(),
    lat: numeric('lat', { precision: 10, scale: 7 }),
    lng: numeric('lng', { precision: 10, scale: 7 }),
    notificationPref: text('notification_pref').notNull().default('both'),
    vacationMode: boolean('vacation_mode').notNull().default(false),
    businessHours: jsonb('business_hours'),
    licenseInfo: jsonb('license_info'),
    serviceZips: text('service_zips').array(),
    passwordHash: text('password_hash'),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('providers_categories_gin_idx').using('gin', table.categories),
  ],
);

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
