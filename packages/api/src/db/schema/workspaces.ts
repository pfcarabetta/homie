import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { homeowners } from './homeowners';

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').unique().notNull(),
  plan: text('plan').notNull().default('starter'),
  stripeCustomerId: text('stripe_customer_id'),
  searchesUsed: integer('searches_used').notNull().default(0),
  searchesLimit: integer('searches_limit').notNull().default(10),
  billingCycleStart: timestamp('billing_cycle_start', { withTimezone: true }).notNull().defaultNow(),
  logoUrl: text('logo_url'),
  companyAddress: text('company_address'),
  companyPhone: text('company_phone'),
  companyEmail: text('company_email'),
  ownerId: uuid('owner_id').notNull().references(() => homeowners.id),
  slackTeamId: text('slack_team_id'),
  slackAccessToken: text('slack_access_token'),
  slackChannelId: text('slack_channel_id'),
  slackConnectedAt: timestamp('slack_connected_at', { withTimezone: true }),
  slackConnectedBy: uuid('slack_connected_by'),
  trackDomain: text('track_domain'),
  trackApiKey: text('track_api_key'),
  trackApiSecret: text('track_api_secret'),
  trackSyncEnabled: integer('track_sync_enabled').notNull().default(0),
  trackLastSyncAt: timestamp('track_last_sync_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
