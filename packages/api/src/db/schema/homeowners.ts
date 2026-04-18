import { pgTable, uuid, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';
import { PropertyDetails } from './properties';

export type HomeDetails = PropertyDetails;

export const homeowners = pgTable('homeowners', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  phone: text('phone'),
  zipCode: text('zip_code').notNull(),
  membershipTier: text('membership_tier').notNull().default('free'),
  stripeCustomerId: text('stripe_customer_id'),
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerifyToken: text('email_verify_token'),
  smsOptIn: boolean('sms_opt_in').notNull().default(false),
  smsOptInAt: timestamp('sms_opt_in_at', { withTimezone: true }),
  passwordResetToken: text('password_reset_token'),
  passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),
  homeAddress: text('home_address'),
  homeCity: text('home_city'),
  homeState: text('home_state'),
  homeBedrooms: integer('home_bedrooms'),
  homeBathrooms: text('home_bathrooms'),
  homeSqft: integer('home_sqft'),
  homeDetails: jsonb('home_details').$type<PropertyDetails>(),
  title: text('title'),
  notifyEmailQuotes: boolean('notify_email_quotes').notNull().default(true),
  notifySmsQuotes: boolean('notify_sms_quotes').notNull().default(true),
  notifyEmailBookings: boolean('notify_email_bookings').notNull().default(true),
  notifySmsBookings: boolean('notify_sms_bookings').notNull().default(true),
  /** Cached AI-generated maintenance suggestions for the dashboard. Refreshed
   *  on a 7-day TTL or via manual refresh — not regenerated on every page load. */
  smartSuggestionsCache: jsonb('smart_suggestions_cache'),
  smartSuggestionsGeneratedAt: timestamp('smart_suggestions_generated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Homeowner = typeof homeowners.$inferSelect;
export type NewHomeowner = typeof homeowners.$inferInsert;
