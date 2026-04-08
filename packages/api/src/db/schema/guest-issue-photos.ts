import { pgTable, uuid, varchar, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { guestIssues } from './guest-issues';

export const guestIssuePhotos = pgTable(
  'guest_issue_photos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => guestIssues.id, { onDelete: 'cascade' }),
    storageUrl: varchar('storage_url', { length: 500 }).notNull(),
    thumbnailUrl: varchar('thumbnail_url', { length: 500 }),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    fileSize: integer('file_size'),
    mimeType: varchar('mime_type', { length: 50 }),
  },
  (table) => [
    index('guest_issue_photos_issue_id_idx').on(table.issueId),
  ],
);

export type GuestIssuePhoto = typeof guestIssuePhotos.$inferSelect;
export type NewGuestIssuePhoto = typeof guestIssuePhotos.$inferInsert;
