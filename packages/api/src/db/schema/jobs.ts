import { pgTable, uuid, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { homeowners } from './homeowners';

export interface DiagnosisPayload {
  category: string;
  severity: 'low' | 'medium' | 'high' | 'emergency';
  summary: string;
  recommendedActions: string[];
  estimatedCost?: { min: number; max: number };
}

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    homeownerId: uuid('homeowner_id')
      .notNull()
      .references(() => homeowners.id, { onDelete: 'cascade' }),
    diagnosis: jsonb('diagnosis').$type<DiagnosisPayload>(),
    photoUrls: text('photo_urls').array(),
    preferredTiming: text('preferred_timing'),
    budget: text('budget'),
    tier: text('tier').notNull().default('standard'),
    status: text('status').notNull().default('open'),
    paymentStatus: text('payment_status').notNull().default('unpaid'),
    stripeSessionId: text('stripe_session_id'),
    zipCode: text('zip_code').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('jobs_homeowner_id_idx').on(table.homeownerId),
    index('jobs_status_idx').on(table.status),
  ],
);

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
