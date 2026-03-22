import { pgTable, uuid, text, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';
import { homeowners } from './homeowners';
import { workspaces } from './workspaces';
import { properties } from './properties';

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
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    zipCode: text('zip_code').notNull(),
    workspaceId: uuid('workspace_id').references(() => workspaces.id),
    propertyId: uuid('property_id').references(() => properties.id),
    consentGiven: boolean('consent_given').notNull().default(false),
    consentText: text('consent_text'),
    consentIp: text('consent_ip'),
    consentAt: timestamp('consent_at', { withTimezone: true }),
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
