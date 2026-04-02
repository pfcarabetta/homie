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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Homeowner = typeof homeowners.$inferSelect;
export type NewHomeowner = typeof homeowners.$inferInsert;
