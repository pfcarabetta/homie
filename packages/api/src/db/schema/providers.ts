import { pgTable, uuid, text, timestamp, integer, numeric, customType, index } from 'drizzle-orm/pg-core';

const geography = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

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
    location: geography('location'),
    discoveredAt: timestamp('discovered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('providers_location_gist_idx').using('gist', table.location),
    index('providers_categories_gin_idx').using('gin', table.categories),
  ],
);

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
