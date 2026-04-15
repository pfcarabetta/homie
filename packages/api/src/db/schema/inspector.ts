import { pgTable, uuid, text, timestamp, integer, numeric, date, boolean, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';

// ── Inspector Partners ────────────────────────────────────────────────────
export const inspectorPartners = pgTable('inspector_partners', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** The inspector's user account — uses homeowners table for auth */
  userId: uuid('user_id'),
  companyName: text('company_name').notNull(),
  companyLogoUrl: text('company_logo_url'),
  website: text('website'),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash'),
  licenseNumber: text('license_number'),
  certifications: text('certifications').array(),
  serviceAreaZips: text('service_area_zips').array(),
  /** spectora | homegauge | palmtech | inspectit | other */
  inspectionSoftware: text('inspection_software'),
  spectoraConnected: boolean('spectora_connected').notNull().default(false),
  homegaugeConnected: boolean('homegauge_connected').notNull().default(false),
  /** @deprecated No longer used — add-on fee model removed. Column kept for migration compatibility. */
  addonPriceCents: integer('addon_price_cents').notNull().default(9900),
  /** URL slug: /partner/[slug] */
  partnerSlug: text('partner_slug').unique().notNull(),
  acceptsInboundLeads: boolean('accepts_inbound_leads').notNull().default(true),
  avgInspectionsPerMonth: integer('avg_inspections_per_month'),
  stripeConnectAccountId: text('stripe_connect_account_id'),
  /** stripe | paypal | check */
  payoutMethod: text('payout_method').notNull().default('stripe'),
  /** active | paused | deactivated | pending_verification */
  status: text('status').notNull().default('pending_verification'),
  /** standard | preferred | elite */
  tier: text('tier').notNull().default('standard'),
  referredByPartnerId: uuid('referred_by_partner_id'),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex('inspector_partner_slug_idx').on(t.partnerSlug),
  index('inspector_partner_status_idx').on(t.status),
  index('inspector_partner_email_idx').on(t.email),
]);

export type InspectorPartner = typeof inspectorPartners.$inferSelect;
export type NewInspectorPartner = typeof inspectorPartners.$inferInsert;

// ── Inspection Reports ────────────────────────────────────────────────────
export const inspectionReports = pgTable('inspection_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  inspectorPartnerId: uuid('inspector_partner_id').references(() => inspectorPartners.id, { onDelete: 'cascade' }),
  /** Linked homeowner account (nullable — set when user creates account before checkout) */
  homeownerId: uuid('homeowner_id'),
  propertyAddress: text('property_address').notNull(),
  propertyCity: text('property_city').notNull(),
  propertyState: text('property_state').notNull(),
  propertyZip: text('property_zip').notNull(),
  clientName: text('client_name').notNull(),
  clientEmail: text('client_email').notNull(),
  clientPhone: text('client_phone'),
  inspectionDate: date('inspection_date').notNull(),
  /** general | pre_listing | new_construction | warranty_11mo | commercial | radon | mold | sewer_scope | pool_spa */
  inspectionType: text('inspection_type').notNull().default('general'),
  reportFileUrl: text('report_file_url'),
  /** manual_upload | spectora_sync | homegauge_sync */
  source: text('source').notNull().default('manual_upload'),
  addonSold: boolean('addon_sold').notNull().default(false),
  addonPriceCents: integer('addon_price_cents'),
  /** essential | professional | premium — null means unpaid */
  pricingTier: text('pricing_tier'),
  /** uploading | processing | parsed | review_pending | sent_to_client | failed */
  parsingStatus: text('parsing_status').notNull().default('uploading'),
  parsingError: text('parsing_error'),
  itemsParsed: integer('items_parsed').notNull().default(0),
  itemsDispatched: integer('items_dispatched').notNull().default(0),
  itemsQuoted: integer('items_quoted').notNull().default(0),
  totalQuoteValueCents: integer('total_quote_value_cents').notNull().default(0),
  inspectorEarningsCents: integer('inspector_earnings_cents').notNull().default(0),
  clientNotifiedAt: timestamp('client_notified_at', { withTimezone: true }),
  clientFirstActionAt: timestamp('client_first_action_at', { withTimezone: true }),
  /** Token for the client's access URL (no login required) */
  clientAccessToken: text('client_access_token').unique().notNull(),
  /** 90 days after upload, client link expires */
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('inspection_report_inspector_idx').on(t.inspectorPartnerId),
  uniqueIndex('inspection_report_token_idx').on(t.clientAccessToken),
  index('inspection_report_status_idx').on(t.parsingStatus),
]);

export type InspectionReport = typeof inspectionReports.$inferSelect;
export type NewInspectionReport = typeof inspectionReports.$inferInsert;

// ── Inspection Report Items ───────────────────────────────────────────────
export const inspectionReportItems = pgTable('inspection_report_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportId: uuid('report_id').notNull().references(() => inspectionReports.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  /** plumbing | electrical | hvac | roofing | structural | general_repair | pest_control | safety | cosmetic | landscaping | appliance | insulation | foundation | windows_doors | fireplace */
  category: text('category').notNull(),
  /** safety_hazard | urgent | recommended | monitor | informational */
  severity: text('severity').notNull(),
  locationInProperty: text('location_in_property'),
  inspectorPhotos: text('inspector_photos').array(),
  aiCostEstimateLowCents: integer('ai_cost_estimate_low_cents').notNull().default(0),
  aiCostEstimateHighCents: integer('ai_cost_estimate_high_cents').notNull().default(0),
  aiConfidence: numeric('ai_confidence', { precision: 3, scale: 2 }).notNull().default('0.80'),
  /** not_dispatched | dispatched | quotes_received | booked | completed */
  dispatchStatus: text('dispatch_status').notNull().default('not_dispatched'),
  dispatchId: uuid('dispatch_id'),
  /** Best quote (lowest price) — for quick display */
  quoteAmountCents: integer('quote_amount_cents'),
  providerName: text('provider_name'),
  providerRating: numeric('provider_rating', { precision: 2, scale: 1 }),
  providerAvailability: text('provider_availability'),
  /** All quotes received as JSONB array */
  quotes: jsonb('quotes').$type<Array<{ providerId: string; providerName: string; providerRating: string | null; amountCents: number; availability: string | null; receivedAt: string }>>(),
  sortOrder: integer('sort_order').notNull().default(0),
  inspectorAdjusted: boolean('inspector_adjusted').notNull().default(false),
  /** Negotiation — is this item included in the repair request to the seller? */
  isIncludedInRequest: boolean('is_included_in_request').notNull().default(false),
  /** Homeowner's private notes for this item (shown in PDF) */
  homeownerNotes: text('homeowner_notes'),
  /** Amount the seller agreed to contribute for this item, in cents */
  sellerAgreedAmountCents: integer('seller_agreed_amount_cents'),
  /** Actual credit received (may differ from agreed amount — e.g. escrow holdback) */
  creditIssuedCents: integer('credit_issued_cents'),
  /** pending | agreed | credited | escrow_holdback | dropped */
  concessionStatus: text('concession_status'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('inspection_item_report_idx').on(t.reportId, t.sortOrder),
  index('inspection_item_dispatch_idx').on(t.dispatchStatus),
  index('inspection_item_category_idx').on(t.category),
]);

export type InspectionReportItem = typeof inspectionReportItems.$inferSelect;
export type NewInspectionReportItem = typeof inspectionReportItems.$inferInsert;

// ── Inspector Earnings ────────────────────────────────────────────────────
export const inspectorEarnings = pgTable('inspector_earnings', {
  id: uuid('id').defaultRandom().primaryKey(),
  inspectorPartnerId: uuid('inspector_partner_id').notNull().references(() => inspectorPartners.id, { onDelete: 'cascade' }),
  reportId: uuid('report_id').references(() => inspectionReports.id, { onDelete: 'set null' }),
  leadId: uuid('lead_id'),
  /** referral_commission | inbound_lead_bonus | partner_referral_bonus */
  earningType: text('earning_type').notNull(),
  amountCents: integer('amount_cents').notNull(),
  description: text('description'),
  /** First day of the earning month */
  periodMonth: date('period_month').notNull(),
  payoutId: uuid('payout_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('inspector_earning_partner_month_idx').on(t.inspectorPartnerId, t.periodMonth),
  index('inspector_earning_payout_idx').on(t.payoutId),
]);

export type InspectorEarning = typeof inspectorEarnings.$inferSelect;

// ── Inspector Payouts ─────────────────────────────────────────────────────
export const inspectorPayouts = pgTable('inspector_payouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  inspectorPartnerId: uuid('inspector_partner_id').notNull().references(() => inspectorPartners.id, { onDelete: 'cascade' }),
  periodMonth: date('period_month').notNull(),
  totalAmountCents: integer('total_amount_cents').notNull(),
  earningsCount: integer('earnings_count').notNull(),
  /** stripe | paypal | check */
  payoutMethod: text('payout_method').notNull(),
  stripeTransferId: text('stripe_transfer_id'),
  /** pending | processing | paid | failed */
  status: text('status').notNull().default('pending'),
  failureReason: text('failure_reason'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type InspectorPayout = typeof inspectorPayouts.$inferSelect;

// ── Inspector Inbound Leads ───────────────────────────────────────────────
export const inspectorInboundLeads = pgTable('inspector_inbound_leads', {
  id: uuid('id').defaultRandom().primaryKey(),
  inspectorPartnerId: uuid('inspector_partner_id').notNull().references(() => inspectorPartners.id, { onDelete: 'cascade' }),
  homeownerName: text('homeowner_name').notNull(),
  homeownerEmail: text('homeowner_email').notNull(),
  homeownerPhone: text('homeowner_phone'),
  propertyCity: text('property_city').notNull(),
  propertyState: text('property_state').notNull(),
  propertyZip: text('property_zip').notNull(),
  inspectionTypeNeeded: text('inspection_type_needed').notNull().default('general'),
  preferredDateRange: text('preferred_date_range'),
  notes: text('notes'),
  /** new | accepted | passed | converted | expired */
  status: text('status').notNull().default('new'),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
  leadSource: text('lead_source'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => [
  index('inspector_lead_partner_idx').on(t.inspectorPartnerId),
  index('inspector_lead_status_idx').on(t.status),
]);

export type InspectorInboundLead = typeof inspectorInboundLeads.$inferSelect;
