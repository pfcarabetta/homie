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
  /** 'buyer' (negotiate with seller) | 'seller' (prep for listing). Reframes the portal for this report. */
  reportMode: text('report_mode').notNull().default('buyer'),
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
  // ── Wholesale-payment / homeowner-email pipeline ───────────────────────
  /** pending | paid | refunded | failed.  Set 'pending' when the report
   *  row is first created at upload (file already on disk but parser
   *  hasn't fired); flips to 'paid' from the Stripe webhook, which is
   *  what unblocks the parser. 'refunded' when we auto-refund after two
   *  parse failures. 'failed' = checkout abandoned / Stripe declined. */
  paymentStatus: text('payment_status').notNull().default('pending'),
  /** Stripe Checkout Session id — used to look up the report when the
   *  webhook fires (we stash report_id in metadata too, but session id
   *  is the canonical handle). */
  stripeSessionId: text('stripe_session_id'),
  /** Stripe PaymentIntent id from the captured session — required for
   *  the auto-refund path on second parse failure. */
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  /** Locked-in price in cents at the moment of upload. We could read
   *  from pricing-config but stamping it on the row keeps history
   *  immutable when the wholesale rate changes mid-flight. */
  priceCentsPaid: integer('price_cents_paid'),
  /** How many times the parser has tried this report. 0 on first
   *  attempt; on failure we increment + retry once; on second failure
   *  we mark parsingStatus='failed' + auto-refund. */
  parseRetryCount: integer('parse_retry_count').notNull().default(0),
  /** When we auto-emailed the parsed report to clientEmail. Drives
   *  the 5-day-reminder sweep — null = no email sent yet (parser
   *  hasn't finished or no email captured), set = waiting on open. */
  homeownerEmailedAt: timestamp('homeowner_emailed_at', { withTimezone: true }),
  /** First time the homeowner's email tracking pixel fired. Used to
   *  suppress the reminder — if they've opened, they don't need a
   *  nudge. Null = never opened. */
  homeownerOpenedAt: timestamp('homeowner_opened_at', { withTimezone: true }),
  /** When the 5-day reminder went out. Prevents the sweep from
   *  re-sending on every tick. */
  homeownerReminderSentAt: timestamp('homeowner_reminder_sent_at', { withTimezone: true }),
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
  /** All quotes received as JSONB array. bundleSize > 1 indicates this price covers multiple items (provider quoted a single bundle, not per item). */
  quotes: jsonb('quotes').$type<Array<{ providerId: string; providerName: string; providerRating: string | null; amountCents: number; availability: string | null; receivedAt: string; bundleSize?: number }>>(),
  sortOrder: integer('sort_order').notNull().default(0),
  inspectorAdjusted: boolean('inspector_adjusted').notNull().default(false),
  /** 1-indexed page numbers in the source PDF where this item was found */
  sourcePages: integer('source_pages').array(),
  /** Timestamp when the homeowner marked this maintenance item complete */
  maintenanceCompletedAt: timestamp('maintenance_completed_at', { withTimezone: true }),
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
  /** Which source to use for the repair request ask. null = default (best quote if exists, else estimate). Special values: 'estimate' = AI estimate, 'custom' = use repairRequestCustomAmountCents. Otherwise = provider UUID */
  repairRequestSource: text('repair_request_source'),
  /** Custom homeowner-entered ask amount, used when repairRequestSource = 'custom' */
  repairRequestCustomAmountCents: integer('repair_request_custom_amount_cents'),
  /** If this item was extracted from a supporting document (pest report, seller disclosure), reference it here */
  sourceDocumentId: uuid('source_document_id'),
  /** Cross-references: other inspection item IDs this item correlates with (bidirectional) */
  crossReferencedItemIds: jsonb('cross_referenced_item_ids').$type<string[]>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('inspection_item_report_idx').on(t.reportId, t.sortOrder),
  index('inspection_item_dispatch_idx').on(t.dispatchStatus),
  index('inspection_item_category_idx').on(t.category),
  index('inspection_item_source_doc_idx').on(t.sourceDocumentId),
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

// ── Supporting Documents (pest reports, seller disclosures, etc.) ─────────
export const inspectionSupportingDocuments = pgTable('inspection_supporting_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportId: uuid('report_id').notNull().references(() => inspectionReports.id, { onDelete: 'cascade' }),
  /** pest_report | seller_disclosure (more types later) */
  documentType: text('document_type').notNull(),
  fileName: text('file_name').notNull(),
  documentFileUrl: text('document_file_url'),
  /** uploading | processing | parsed | failed */
  parsingStatus: text('parsing_status').notNull().default('uploading'),
  parsingError: text('parsing_error'),
  /** Type-specific extracted summary (shape varies by documentType) */
  parsedSummary: jsonb('parsed_summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('supporting_doc_report_idx').on(t.reportId),
]);

export type InspectionSupportingDocument = typeof inspectionSupportingDocuments.$inferSelect;

// ── Cross-Reference Insights (AI correlations between docs + items) ───────
export const inspectionCrossReferenceInsights = pgTable('inspection_cross_reference_insights', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportId: uuid('report_id').notNull().unique().references(() => inspectionReports.id, { onDelete: 'cascade' }),
  /** Array of { id, title, description, severity, relatedDocIds[], relatedItemIds[] } */
  insights: jsonb('insights').notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type InspectionCrossReferenceInsights = typeof inspectionCrossReferenceInsights.$inferSelect;
