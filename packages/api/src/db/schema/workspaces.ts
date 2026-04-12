import { pgTable, uuid, text, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';
import { homeowners } from './homeowners';

/**
 * Per-workspace pricing overrides. Any field set here takes precedence
 * over the global PricingConfig for this workspace's plan. Null/missing
 * fields fall through to the global default.
 */
export interface CustomPricing {
  /** Custom plan label shown in the UI (e.g. "Enterprise — Acme Corp") */
  planLabel?: string;
  /** Monthly base fee in dollars */
  base?: number;
  /** Per-property monthly fee in dollars */
  perProperty?: number;
  /** Max properties allowed */
  maxProperties?: number;
  /** Max team members allowed */
  maxTeamMembers?: number;
  /** Fair-use searches per property per month */
  searchesPerProperty?: number;
  /** Promo base price (null = no promo) */
  promoBase?: number | null;
  /** Promo label (e.g. "Launch Special") */
  promoLabel?: string | null;
}

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
  /** Contact title used in provider-facing emails (e.g. "Property Manager") */
  contactTitle: text('contact_title').notNull().default('Property Manager'),
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
  /** Per-workspace pricing overrides — null means use global defaults */
  customPricing: jsonb('custom_pricing').$type<CustomPricing>(),
  /** Stripe Subscription ID for recurring billing */
  stripeSubscriptionId: text('stripe_subscription_id'),
  /** active | past_due | canceled | trialing | incomplete | unpaid */
  subscriptionStatus: text('subscription_status'),
  /** End of the current billing period (next invoice date) */
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
