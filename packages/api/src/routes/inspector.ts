import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq, desc, and, sql, count, isNull, lt, inArray } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import {
  inspectorPartners,
  inspectionReports,
  inspectionReportItems,
  inspectionSupportingDocuments,
  inspectorEarnings,
  inspectorPayouts,
  inspectorInboundLeads,
} from '../db/schema/inspector';
import { providers } from '../db/schema/providers';
import { outreachAttempts } from '../db/schema/outreach-attempts';
import { providerResponses } from '../db/schema/provider-responses';
import { homeowners } from '../db/schema/homeowners';
import { requireInspectorAuth, signInspectorToken } from '../middleware/inspector-auth';
import { optionalAuth, signToken } from '../middleware/auth';
import jwt from 'jsonwebtoken';
import { sendEmail } from '../services/notifications';
import { buildStripeMetadata } from '../services/stripe';

/** Normalize a phone to digits-only with US country code stripped — for fuzzy matching. */
function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length >= 10) return digits;
  return null;
}

const router = Router();
const BCRYPT_ROUNDS = 12;

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Auth ──────────────────────────────────────────────────────────────────

// POST /api/v1/inspector/signup
router.post('/signup', async (req: Request, res: Response) => {
  const body = req.body as {
    company_name: string; email: string; phone: string; password: string;
    website?: string; license_number?: string; certifications?: string[];
    service_area_zips?: string[]; inspection_software?: string;
    avg_inspections_per_month?: number; referred_by_slug?: string;
  };

  if (!body.company_name || !body.email || !body.phone || !body.password) {
    res.status(400).json({ data: null, error: 'company_name, email, phone, and password are required', meta: {} });
    return;
  }

  try {
    // Check if email already exists
    const [existing] = await db.select({ id: inspectorPartners.id }).from(inspectorPartners)
      .where(eq(inspectorPartners.email, body.email.toLowerCase().trim())).limit(1);
    if (existing) {
      res.status(409).json({ data: null, error: 'An account with this email already exists', meta: {} });
      return;
    }

    // Generate unique slug
    let slug = slugify(body.company_name);
    const [slugExists] = await db.select({ id: inspectorPartners.id }).from(inspectorPartners)
      .where(eq(inspectorPartners.partnerSlug, slug)).limit(1);
    if (slugExists) slug = `${slug}-${crypto.randomBytes(3).toString('hex')}`;

    // Resolve referrer
    let referredBy: string | null = null;
    if (body.referred_by_slug) {
      const [referrer] = await db.select({ id: inspectorPartners.id }).from(inspectorPartners)
        .where(eq(inspectorPartners.partnerSlug, body.referred_by_slug)).limit(1);
      if (referrer) referredBy = referrer.id;
    }

    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    const [partner] = await db.insert(inspectorPartners).values({
      companyName: body.company_name.trim(),
      email: body.email.toLowerCase().trim(),
      phone: body.phone,
      passwordHash,
      website: body.website || null,
      licenseNumber: body.license_number || null,
      certifications: body.certifications || null,
      serviceAreaZips: body.service_area_zips || null,
      inspectionSoftware: body.inspection_software || null,
      avgInspectionsPerMonth: body.avg_inspections_per_month || null,
      partnerSlug: slug,
      referredByPartnerId: referredBy,
      status: 'active',
      joinedAt: new Date(),
    }).returning();

    const token = signInspectorToken(partner.id);

    res.status(201).json({
      data: { partnerId: partner.id, partnerSlug: slug, status: 'active', token },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/signup]');
    res.status(500).json({ data: null, error: 'Failed to create account', meta: {} });
  }
});

// POST /api/v1/inspector/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ data: null, error: 'email and password are required', meta: {} });
    return;
  }
  try {
    const [partner] = await db.select().from(inspectorPartners)
      .where(eq(inspectorPartners.email, email.toLowerCase().trim())).limit(1);
    if (!partner || !partner.passwordHash) {
      res.status(401).json({ data: null, error: 'Invalid email or password', meta: {} });
      return;
    }
    const valid = await bcrypt.compare(password, partner.passwordHash);
    if (!valid) {
      res.status(401).json({ data: null, error: 'Invalid email or password', meta: {} });
      return;
    }
    const token = signInspectorToken(partner.id);
    res.json({
      data: {
        token,
        partner: {
          id: partner.id, companyName: partner.companyName, email: partner.email,
          partnerSlug: partner.partnerSlug, status: partner.status, tier: partner.tier,
          companyLogoUrl: partner.companyLogoUrl,
        },
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/login]');
    res.status(500).json({ data: null, error: 'Login failed', meta: {} });
  }
});

// ── Profile ───────────────────────────────────────────────────────────────

// GET /api/v1/inspector/profile
router.get('/profile', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    const [p] = await db.select().from(inspectorPartners).where(eq(inspectorPartners.id, req.inspectorId)).limit(1);
    if (!p) { res.status(404).json({ data: null, error: 'Not found', meta: {} }); return; }
    const { passwordHash: _, ...safe } = p;
    res.json({ data: safe, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /inspector/profile]');
    res.status(500).json({ data: null, error: 'Failed to load profile', meta: {} });
  }
});

// PUT /api/v1/inspector/profile
router.put('/profile', requireInspectorAuth, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  const allowed = ['companyName', 'companyLogoUrl', 'website', 'phone', 'licenseNumber', 'certifications', 'serviceAreaZips', 'inspectionSoftware', 'acceptsInboundLeads', 'payoutMethod', 'partnerSlug'];
  for (const key of allowed) {
    const snakeKey = key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
    if (body[key] !== undefined) updates[key] = body[key];
    if (body[snakeKey] !== undefined) updates[key] = body[snakeKey];
  }
  try {
    const [updated] = await db.update(inspectorPartners).set(updates).where(eq(inspectorPartners.id, req.inspectorId)).returning();
    if (!updated) { res.status(404).json({ data: null, error: 'Not found', meta: {} }); return; }
    const { passwordHash: _, ...safe } = updated;
    res.json({ data: safe, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PUT /inspector/profile]');
    res.status(500).json({ data: null, error: 'Failed to update profile', meta: {} });
  }
});

// ── Reports ───────────────────────────────────────────────────────────────

// POST /api/v1/inspector/reports — upload a new report
//
// Wholesale-payment flow:
//   1. Validate inputs + upload PDF to Cloudinary
//   2. Create the inspectionReports row in payment_status='pending'
//      and parsing_status='awaiting_payment' — file is on disk but the
//      parser is gated until Stripe confirms payment
//   3. Create a Stripe Checkout Session for the inspector's wholesale
//      fee and return its URL. The frontend redirects there.
//   4. Stripe webhook (checkout.session.completed, product:'inspector_upload')
//      flips payment_status='paid' + parsing_status='processing' and
//      kicks off parseInspectionReportAsync. See stripe-webhook.ts.
//
// Returning the checkout URL means the response shape changes from
// {report, clientAccessUrl} to {reportId, checkoutUrl}. The frontend
// upload form follows the redirect; on Stripe success it lands back on
// /inspector/reports/<id>.
router.post('/reports', requireInspectorAuth, async (req: Request, res: Response) => {
  const body = req.body as {
    property_address: string; property_city: string; property_state: string; property_zip: string;
    client_name: string; client_email: string; client_phone?: string;
    inspection_date: string; inspection_type?: string;
    report_file_data_url?: string; // base64 data URL for the report file
    /** essential | professional | premium — gates which features the
     *  homeowner sees in their portal (dispatch / quotes / negotiation
     *  docs / maintenance timeline). Required. */
    pricing_tier?: string;
  };

  if (!body.property_address || !body.client_name || !body.client_email || !body.inspection_date) {
    res.status(400).json({ data: null, error: 'property_address, client_name, client_email, and inspection_date are required', meta: {} });
    return;
  }
  // PDF is required for the wholesale flow — without one there's nothing
  // to parse. (Pre-payment flows that wanted to "create the row first
  // and upload later" are not supported in this model.)
  if (!body.report_file_data_url) {
    res.status(400).json({ data: null, error: 'report_file_data_url is required — upload the PDF before checkout', meta: {} });
    return;
  }
  // Validate the tier against the allowlist. The schema column accepts
  // any text, but only these three values are honored by the homeowner-
  // portal feature gates.
  const tier = body.pricing_tier as 'essential' | 'professional' | 'premium' | undefined;
  if (!tier || (tier !== 'essential' && tier !== 'professional' && tier !== 'premium')) {
    res.status(400).json({ data: null, error: 'pricing_tier must be one of: essential, professional, premium', meta: {} });
    return;
  }

  try {
    const clientAccessToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    // Upload PDF to Cloudinary using `uploadFile` (resource_type: 'auto'),
    // not `uploadImage` (resource_type: 'image' — Cloudinary rejects PDFs
    // under that type unless the account has "PDF and ZIP delivery"
    // enabled, which is off by default). If Cloudinary is misconfigured
    // or the upload fails for any other reason, fall back to storing the
    // raw data URL directly — the parser handles both transparently
    // (see parseInspectionReportAsync) so the inspector still gets to
    // checkout and the homeowner still gets a parsed report.
    let reportFileUrl: string | null = null;
    try {
      const { uploadFile } = await import('../services/image-upload');
      const result = await uploadFile(body.report_file_data_url, 'homie/inspection-reports');
      if (result) reportFileUrl = result.url;
    } catch (err) {
      logger.warn({ err }, '[inspector/reports] Cloudinary upload failed, falling back to data URL');
    }
    if (!reportFileUrl) reportFileUrl = body.report_file_data_url;

    // Look up the inspector for Stripe receipt email + brand on the
    // checkout description.
    const [inspector] = await db
      .select({ email: inspectorPartners.email, companyName: inspectorPartners.companyName })
      .from(inspectorPartners)
      .where(eq(inspectorPartners.id, req.inspectorId))
      .limit(1);
    if (!inspector) {
      res.status(404).json({ data: null, error: 'Inspector not found', meta: {} });
      return;
    }

    // Resolve tier-specific wholesale price (config-driven so admin
    // can change rates without a deploy). Stamp the price onto the
    // row so history is immutable when the rate changes.
    const { getInspectorTierPricing } = await import('../services/pricing');
    const tierPricing = await getInspectorTierPricing(tier);
    const priceCents = tierPricing.wholesalePriceCents;

    const [report] = await db.insert(inspectionReports).values({
      inspectorPartnerId: req.inspectorId,
      propertyAddress: body.property_address,
      propertyCity: body.property_city || '',
      propertyState: body.property_state || '',
      propertyZip: body.property_zip || '',
      clientName: body.client_name,
      clientEmail: body.client_email,
      clientPhone: body.client_phone || null,
      inspectionDate: body.inspection_date,
      inspectionType: body.inspection_type || 'general',
      reportFileUrl,
      source: 'manual_upload',
      // Stamp the tier — the homeowner portal's tab-level gates read
      // this column directly to decide what to render (essential =
      // items + estimates only; professional adds dispatch + quotes;
      // premium adds negotiations + maintenance timeline).
      pricingTier: tier,
      // Hold parser off until Stripe webhook flips this to 'processing'.
      parsingStatus: 'awaiting_payment',
      paymentStatus: 'pending',
      priceCentsPaid: priceCents,
      clientAccessToken,
      expiresAt,
    }).returning();

    // Build the Stripe Checkout Session. Land on the reports list (not
    // the detail page) since the report is still parsing immediately
    // after payment — the list is where the realtime status badge lives,
    // and a "processing" modal fires keyed on the just_uploaded param.
    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const successUrl = `${APP_URL}/inspector/reports?just_uploaded=${report.id}`;
    const cancelUrl = `${APP_URL}/inspector/reports/upload?cancelled=${report.id}`;
    const { createInspectorReportUploadCheckoutSession } = await import('../services/stripe');
    const session = await createInspectorReportUploadCheckoutSession({
      reportId: report.id,
      inspectorPartnerId: req.inspectorId,
      inspectorEmail: inspector.email,
      inspectorCompanyName: inspector.companyName,
      tier,
      amountCents: priceCents,
      successUrl,
      cancelUrl,
    });

    // Stash the session id so the webhook can correlate.
    await db.update(inspectionReports)
      .set({ stripeSessionId: session.id, updatedAt: new Date() })
      .where(eq(inspectionReports.id, report.id));

    res.status(201).json({
      data: {
        reportId: report.id,
        checkoutUrl: session.url,
        priceCents,
        tier,
        retailPriceCents: tierPricing.retailPriceCents,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/reports]');
    res.status(500).json({ data: null, error: 'Failed to create report', meta: {} });
  }
});

// ── Projection helpers ────────────────────────────────────────────────
//
// The inspector frontend reads cleanly-named, dollar-denominated fields
// (costEstimateMin/Max, earnings, location, photoDescriptions, etc.).
// The DB rows expose Drizzle column names with the *Cents suffix and
// snake-ish naming (aiCostEstimateLowCents, inspectorPhotos,
// locationInProperty, aiConfidence-as-string). These helpers convert
// in one place so both the list and detail endpoints serve the
// contract the frontend type expects.

function projectInspectionItem(i: typeof inspectionReportItems.$inferSelect) {
  const lowDollars = (i.aiCostEstimateLowCents ?? 0) / 100;
  const highDollars = (i.aiCostEstimateHighCents ?? 0) / 100;
  const hasCost = (i.aiCostEstimateLowCents ?? 0) > 0 || (i.aiCostEstimateHighCents ?? 0) > 0;
  // aiConfidence is `numeric` in PG → arrives as a string from Drizzle.
  // The frontend type wants a number; coerce defensively.
  const confidence = typeof i.aiConfidence === 'number'
    ? i.aiConfidence
    : (() => { const n = parseFloat(String(i.aiConfidence ?? '1')); return Number.isFinite(n) ? n : 1; })();
  const sa = computeSellerAction(i.category, i.severity, i.aiCostEstimateLowCents ?? 0, i.aiCostEstimateHighCents ?? 0);
  return {
    id: i.id,
    reportId: i.reportId,
    title: i.title,
    description: i.description ?? '',
    severity: i.severity,
    category: i.category,
    location: i.locationInProperty,
    photoDescriptions: i.inspectorPhotos ?? [],
    costEstimateMin: hasCost ? lowDollars : null,
    costEstimateMax: hasCost ? highDollars : null,
    confidence,
    dispatchStatus: i.dispatchStatus,
    quoteDetails: i.quoteAmountCents != null ? {
      providerName: i.providerName ?? '',
      providerRating: i.providerRating != null ? parseFloat(String(i.providerRating)) : 0,
      price: i.quoteAmountCents / 100,
      availability: i.providerAvailability ?? '',
    } : null,
    valueImpact: computeValueImpact(i.category, i.severity, i.aiCostEstimateLowCents ?? 0, i.aiCostEstimateHighCents ?? 0),
    sourcePages: i.sourcePages,
    sellerAction: sa.action,
    sellerActionReason: sa.reason,
    sourceDocumentId: i.sourceDocumentId,
    crossReferencedItemIds: i.crossReferencedItemIds ?? [],
    inspectorAdjusted: i.inspectorAdjusted ?? false,
  };
}

function projectInspectionReport(
  r: typeof inspectionReports.$inferSelect,
  opts: { itemCount: number; dispatchedCount: number; earningsCents: number },
) {
  return {
    id: r.id,
    inspectorId: r.inspectorPartnerId ?? '',
    clientName: r.clientName,
    clientEmail: r.clientEmail,
    clientPhone: r.clientPhone,
    propertyAddress: r.propertyAddress,
    propertyCity: r.propertyCity,
    propertyState: r.propertyState,
    propertyZip: r.propertyZip,
    // Drizzle returns `date` columns as strings.
    inspectionDate: r.inspectionDate,
    inspectionType: r.inspectionType,
    // Legacy `status` retained for older code paths; the frontend should
    // prefer parsingStatus going forward.
    status: r.parsingStatus === 'sent_to_client' ? 'sent'
      : r.parsingStatus === 'parsed' || r.parsingStatus === 'review_pending' ? 'ready'
      : r.parsingStatus === 'failed' ? 'completed'
      : 'processing',
    parsingStatus: r.parsingStatus,
    parsingError: r.parsingError,
    pricingTier: r.pricingTier,
    ccEmails: r.ccEmails ?? [],
    clientNotifiedAt: r.clientNotifiedAt?.toISOString() ?? null,
    homeownerOpenedAt: r.homeownerOpenedAt?.toISOString() ?? null,
    homeownerReminderSentAt: r.homeownerReminderSentAt?.toISOString() ?? null,
    clientAccessToken: r.clientAccessToken,
    itemCount: opts.itemCount,
    dispatchedCount: opts.dispatchedCount,
    earnings: opts.earningsCents / 100,
    createdAt: r.createdAt.toISOString(),
  };
}

// GET /api/v1/inspector/reports — list reports
router.get('/reports', requireInspectorAuth, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;
  try {
    const reports = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.inspectorPartnerId, req.inspectorId))
      .orderBy(desc(inspectionReports.createdAt))
      .limit(limit).offset(offset);

    // One round-trip to grab per-report counts and earnings totals so
    // the list cards have item counts + dispatched counts + total
    // earnings (in dollars) without N+1ing.
    const ids = reports.map(r => r.id);
    const itemAgg = ids.length > 0
      ? await db.select({
          reportId: inspectionReportItems.reportId,
          itemCount: sql<number>`COUNT(*)`,
          dispatchedCount: sql<number>`SUM(CASE WHEN ${inspectionReportItems.dispatchStatus} <> 'not_dispatched' AND ${inspectionReportItems.dispatchStatus} IS NOT NULL THEN 1 ELSE 0 END)`,
        })
          .from(inspectionReportItems)
          .where(inArray(inspectionReportItems.reportId, ids))
          .groupBy(inspectionReportItems.reportId)
      : [];
    const earningsAgg = ids.length > 0
      ? await db.select({
          reportId: inspectorEarnings.reportId,
          totalCents: sql<number>`COALESCE(SUM(${inspectorEarnings.amountCents}), 0)`,
        })
          .from(inspectorEarnings)
          .where(inArray(inspectorEarnings.reportId, ids))
          .groupBy(inspectorEarnings.reportId)
      : [];
    const itemMap = new Map(itemAgg.map(r => [r.reportId, r]));
    const earnMap = new Map(earningsAgg.map(r => [r.reportId, r.totalCents]));

    const projected = reports.map(r => projectInspectionReport(r, {
      itemCount: Number(itemMap.get(r.id)?.itemCount ?? 0),
      dispatchedCount: Number(itemMap.get(r.id)?.dispatchedCount ?? 0),
      earningsCents: Number(earnMap.get(r.id) ?? 0),
    }));

    const [{ value: total }] = await db.select({ value: count() }).from(inspectionReports)
      .where(eq(inspectionReports.inspectorPartnerId, req.inspectorId));
    res.json({ data: projected, error: null, meta: { total, limit, offset } });
  } catch (err) {
    logger.error({ err }, '[GET /inspector/reports]');
    res.status(500).json({ data: null, error: 'Failed to load reports', meta: {} });
  }
});

// GET /api/v1/inspector/reports/:id — report detail with items
router.get('/reports/:id', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.id), eq(inspectionReports.inspectorPartnerId, req.inspectorId)))
      .limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }
    const items = await db.select().from(inspectionReportItems)
      .where(eq(inspectionReportItems.reportId, report.id))
      .orderBy(inspectionReportItems.sortOrder);
    const earnings = await db.select().from(inspectorEarnings)
      .where(eq(inspectorEarnings.reportId, report.id));
    const earningsCents = earnings.reduce((sum, e) => sum + (e.amountCents ?? 0), 0);
    const projectedItems = items.map(projectInspectionItem);
    const projectedReport = projectInspectionReport(report, {
      itemCount: items.length,
      dispatchedCount: items.filter(i => i.dispatchStatus && i.dispatchStatus !== 'not_dispatched').length,
      earningsCents,
    });
    res.json({ data: { ...projectedReport, items: projectedItems }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /inspector/reports/:id]');
    res.status(500).json({ data: null, error: 'Failed to load report', meta: {} });
  }
});

// POST /api/v1/inspector/reports/:id/send-to-client
//
// Sends the report's clientAccessToken link to the primary client and
// any CC recipients (spouse, agent, co-buyer). The inspector can edit
// the primary client name/email and add up to 5 CCs in the confirmation
// modal before sending — this endpoint persists those edits on the row,
// then fires one email per recipient.
//
// CC semantics: any email in cc_emails will be auto-bound to the report
// (via cc_homeowner_ids) when that user creates a Homie account, giving
// them full read/edit access without paying.
//
// Body: { client_name?, client_email?, cc_emails?: string[] }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_CC_EMAILS = 5;

router.post('/reports/:id/send-to-client', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    const body = (req.body ?? {}) as { client_name?: string; client_email?: string; cc_emails?: string[] };

    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.id), eq(inspectionReports.inspectorPartnerId, req.inspectorId)))
      .limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }
    if (report.parsingStatus !== 'parsed' && report.parsingStatus !== 'review_pending') {
      res.status(400).json({ data: null, error: `Report must be parsed before sending (current: ${report.parsingStatus})`, meta: {} });
      return;
    }

    // Resolve final recipient values: prefer the body overrides (inspector
    // edited them in the modal), fall back to whatever's on the row.
    const finalClientName = (body.client_name?.trim() || report.clientName).trim();
    const finalClientEmail = (body.client_email?.trim() || report.clientEmail).toLowerCase().trim();
    if (!EMAIL_RE.test(finalClientEmail)) {
      res.status(400).json({ data: null, error: 'Primary client email is not a valid email address', meta: {} });
      return;
    }

    // Validate + dedupe CC emails: lowercase, trim, drop empties, drop
    // anything that matches the primary, dedupe within the list, cap at 5.
    const rawCcs = Array.isArray(body.cc_emails) ? body.cc_emails : [];
    const seen = new Set<string>([finalClientEmail]);
    const finalCcEmails: string[] = [];
    for (const raw of rawCcs) {
      if (typeof raw !== 'string') continue;
      const e = raw.toLowerCase().trim();
      if (!e || seen.has(e)) continue;
      if (!EMAIL_RE.test(e)) {
        res.status(400).json({ data: null, error: `"${raw}" is not a valid email address`, meta: {} });
        return;
      }
      seen.add(e);
      finalCcEmails.push(e);
      if (finalCcEmails.length > MAX_CC_EMAILS) {
        res.status(400).json({ data: null, error: `Maximum ${MAX_CC_EMAILS} CC recipients allowed`, meta: {} });
        return;
      }
    }

    const [inspector] = await db.select({ companyName: inspectorPartners.companyName, companyLogoUrl: inspectorPartners.companyLogoUrl })
      .from(inspectorPartners).where(eq(inspectorPartners.id, req.inspectorId)).limit(1);

    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const clientUrl = `${APP_URL}/inspect/${report.clientAccessToken}`;
    const inspectorName = inspector?.companyName ?? 'your inspector';

    const buildHtml = (recipientLabel: 'primary' | 'cc') => `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:0;background:#F9F5F2">
        <div style="background:#2D2926;padding:20px 32px;text-align:center">
          <span style="color:#E8632B;font-size:24px;font-weight:bold;font-family:Georgia,serif">homie</span>
          <span style="color:rgba(255,255,255,0.5);font-size:12px;margin-left:8px">inspect</span>
        </div>
        <div style="background:white;padding:32px">
          <p style="color:#2D2926;font-size:18px;font-weight:600;margin:0 0 4px">${recipientLabel === 'cc' ? `${finalClientName}'s inspection report is ready` : 'Your inspection report is ready'}</p>
          <p style="color:#9B9490;font-size:14px;margin:0 0 24px">from ${inspectorName}</p>
          <div style="background:#F9F5F2;border-radius:12px;padding:20px;margin-bottom:24px">
            <p style="color:#2D2926;font-size:15px;margin:0 0 8px"><strong>${report.propertyAddress}</strong></p>
            <p style="color:#6B6560;font-size:14px;margin:0">${report.itemsParsed} items found · Inspected ${new Date(report.inspectionDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <div style="text-align:center">
            <a href="${clientUrl}" style="display:inline-block;background:#E8632B;color:white;padding:14px 36px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">View Report & Get Quotes</a>
          </div>
          <p style="color:#9B9490;font-size:12px;text-align:center;margin-top:16px">${recipientLabel === 'cc' ? `You were added as a recipient by ${finalClientName}'s inspector. Sign in with this email to access the full report.` : 'Get real quotes from local pros for every item — not estimates, actuals.'}</p>
        </div>
      </div>`;

    // Fire emails — one for the primary, one for each CC. Each attempt is
    // wrapped so a single SendGrid hiccup doesn't block the others.
    const { sendEmail } = await import('../services/notifications');
    const subject = `Your inspection report from ${inspectorName} is ready`;
    const sendResults: Array<{ to: string; ok: boolean }> = [];
    for (const recipient of [{ email: finalClientEmail, label: 'primary' as const }, ...finalCcEmails.map(e => ({ email: e, label: 'cc' as const }))]) {
      try {
        await sendEmail(recipient.email, subject, buildHtml(recipient.label));
        sendResults.push({ to: recipient.email, ok: true });
      } catch (err) {
        logger.warn({ err, to: recipient.email }, '[inspector/send-to-client] Email send failed for one recipient');
        sendResults.push({ to: recipient.email, ok: false });
      }
    }

    // Persist edits + cc list + status. We always overwrite cc_emails to
    // the new list (no merge with previous) so the inspector has explicit
    // control via the modal. Existing cc_homeowner_ids stay — those are
    // already-claimed users who shouldn't lose access if removed from the
    // list later (revocation is a separate flow).
    await db.update(inspectionReports).set({
      clientName: finalClientName,
      clientEmail: finalClientEmail,
      ccEmails: finalCcEmails,
      parsingStatus: 'sent_to_client',
      clientNotifiedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, report.id));

    res.json({ data: { sent: true, clientAccessUrl: clientUrl, recipients: sendResults }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/reports/:id/send-to-client]');
    res.status(500).json({ data: null, error: 'Failed to send report', meta: {} });
  }
});

// POST /api/v1/inspector/reports/:id/retry-parse
//
// Re-runs the parser on a report that landed in `failed` status. The
// admin endpoint already exists at /admin/inspect/reports/:id/retry-parse;
// this is the inspector-scoped version (ownership-checked) so partners
// can self-service stuck reports without filing a support ticket.
router.post('/reports/:id/retry-parse', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.id), eq(inspectionReports.inspectorPartnerId, req.inspectorId)))
      .limit(1);
    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    if (report.parsingStatus !== 'failed') {
      res.status(400).json({ data: null, error: `Report is not in a failed state (current: ${report.parsingStatus})`, meta: {} });
      return;
    }

    // Reset retry count + clear error + mark processing so the inspector
    // UI flips back to its in-progress state immediately.
    await db.update(inspectionReports).set({
      parsingStatus: 'processing',
      parsingError: null,
      parseRetryCount: 0,
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, report.id));

    void parseInspectionReportAsync(report.id).catch(err =>
      logger.error({ err, reportId: report.id }, '[inspector/retry-parse] parser threw'),
    );

    res.json({ data: { retrying: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/reports/:id/retry-parse]');
    res.status(500).json({ data: null, error: 'Failed to start retry', meta: {} });
  }
});

// POST /api/v1/inspector/reports/:id/send-reminder
//
// Manual nudge for a sent report. Useful when the homeowner hasn't
// opened the email after a few days and the inspector wants to follow up
// without waiting for the 5-day auto-reminder sweep. Updates
// homeownerReminderSentAt to suppress the auto-sweep for the same window.
router.post('/reports/:id/send-reminder', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.id), eq(inspectionReports.inspectorPartnerId, req.inspectorId)))
      .limit(1);
    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    if (report.parsingStatus !== 'sent_to_client') {
      res.status(400).json({ data: null, error: 'Report must be sent to client before reminders can be issued', meta: {} });
      return;
    }
    if (report.homeownerOpenedAt) {
      res.status(400).json({ data: null, error: 'Client already opened the report — no reminder needed', meta: {} });
      return;
    }

    const [inspector] = await db.select({ companyName: inspectorPartners.companyName })
      .from(inspectorPartners).where(eq(inspectorPartners.id, req.inspectorId)).limit(1);
    const inspectorName = inspector?.companyName ?? 'your inspector';

    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const clientUrl = `${APP_URL}/inspect/${report.clientAccessToken}`;

    const html = `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:0;background:#F9F5F2">
        <div style="background:#2D2926;padding:20px 32px;text-align:center">
          <span style="color:#E8632B;font-size:24px;font-weight:bold;font-family:Georgia,serif">homie</span>
          <span style="color:rgba(255,255,255,0.5);font-size:12px;margin-left:8px">inspect</span>
        </div>
        <div style="background:white;padding:32px">
          <p style="color:#2D2926;font-size:18px;font-weight:600;margin:0 0 4px">A reminder about your inspection report</p>
          <p style="color:#9B9490;font-size:14px;margin:0 0 24px">from ${inspectorName}</p>
          <div style="background:#F9F5F2;border-radius:12px;padding:20px;margin-bottom:24px">
            <p style="color:#2D2926;font-size:15px;margin:0 0 8px"><strong>${report.propertyAddress}</strong></p>
            <p style="color:#6B6560;font-size:14px;margin:0">${report.itemsParsed} items waiting · Inspected ${new Date(report.inspectionDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <div style="text-align:center">
            <a href="${clientUrl}" style="display:inline-block;background:#E8632B;color:white;padding:14px 36px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">View Report &rarr;</a>
          </div>
          <p style="color:#9B9490;font-size:12px;text-align:center;margin-top:16px">Get real quotes from local pros for every item — not estimates, actuals.</p>
        </div>
      </div>`;

    try {
      const { sendEmail } = await import('../services/notifications');
      await sendEmail(report.clientEmail, `Reminder: your inspection report from ${inspectorName} is ready`, html);
    } catch (err) {
      logger.warn({ err }, '[inspector/send-reminder] Email send failed');
      res.status(500).json({ data: null, error: 'Failed to send reminder email', meta: {} });
      return;
    }

    await db.update(inspectionReports).set({
      homeownerReminderSentAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, report.id));

    res.json({ data: { sent: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/reports/:id/send-reminder]');
    res.status(500).json({ data: null, error: 'Failed to send reminder', meta: {} });
  }
});

// POST /api/v1/inspector/reports/:id/send-copy
//
// Sends a copy of an already-parsed report to an additional recipient
// (spouse, agent, attorney, listing partner). No charge — the wholesale
// fee covers the report itself; extra recipients are free. Doesn't
// affect the homeowner-tracking columns (homeownerEmailedAt /
// homeownerOpenedAt / homeownerReminderSentAt) — those track the
// primary client only.
//
// Body: { email: string, name?: string }
// Auth: requireInspectorAuth + ownership check on the report.
router.post('/reports/:id/send-copy', requireInspectorAuth, async (req: Request, res: Response) => {
  const body = req.body as { email?: string; name?: string };
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    res.status(400).json({ data: null, error: 'A valid email is required', meta: {} });
    return;
  }

  try {
    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.id), eq(inspectionReports.inspectorPartnerId, req.inspectorId)))
      .limit(1);
    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    if (report.parsingStatus !== 'parsed' && report.parsingStatus !== 'review_pending' && report.parsingStatus !== 'sent_to_client') {
      res.status(400).json({ data: null, error: `Report must be parsed before sending copies (current: ${report.parsingStatus})`, meta: {} });
      return;
    }

    const [inspector] = await db
      .select({ companyName: inspectorPartners.companyName })
      .from(inspectorPartners)
      .where(eq(inspectorPartners.id, req.inspectorId))
      .limit(1);
    const fromCompany = inspector?.companyName ?? 'your inspector';

    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const reportUrl = `${APP_URL}/inspect/${report.clientAccessToken}`;
    const greeting = body.name ? `Hi ${body.name.split(' ')[0]},` : 'Hi,';
    const subject = `${report.clientName} shared their Homie inspection report from ${fromCompany}`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2D2926;">
        <h2 style="font-family:Georgia,serif;font-size:22px;margin:0 0 12px;">An inspection report has been shared with you</h2>
        <p style="font-size:15px;line-height:1.5;color:#6B6560;">${greeting}</p>
        <p style="font-size:15px;line-height:1.5;color:#6B6560;">
          ${fromCompany} parsed the inspection report for ${report.propertyAddress}, ${report.propertyCity}, ${report.propertyState}
          and shared it with you. The report breaks every finding into a maintenance item with AI cost estimates,
          and lets you pull real quotes from local pros.
        </p>
        <p style="text-align:center;margin:28px 0;">
          <a href="${reportUrl}" style="display:inline-block;background:#E8632B;color:#fff;text-decoration:none;padding:14px 28px;border-radius:100px;font-weight:600;font-size:15px;">View the report &rarr;</a>
        </p>
        <p style="font-size:13px;color:#9B9490;line-height:1.5;">
          This link expires 90 days after the report was uploaded. If you have questions about the inspection
          itself, reach out to ${fromCompany} directly.
        </p>
      </div>
    `.trim();

    await sendEmail(body.email, subject, html);

    // Promote this email to a full CC recipient — when this person signs
    // up for Homie with this email, they'll auto-bind to the report
    // (same flow as the cc_emails set in send-to-client). Caps at 5.
    const incomingEmail = body.email.toLowerCase().trim();
    const existing = (report.ccEmails ?? []).map(e => e.toLowerCase().trim());
    const primaryEmail = report.clientEmail.toLowerCase().trim();
    if (incomingEmail !== primaryEmail && !existing.includes(incomingEmail)) {
      const next = [...existing, incomingEmail];
      if (next.length <= MAX_CC_EMAILS) {
        await db.update(inspectionReports).set({
          ccEmails: next,
          updatedAt: new Date(),
        }).where(eq(inspectionReports.id, report.id));
      } else {
        logger.warn({ reportId: report.id, ccCount: next.length }, '[inspector/send-copy] CC list at cap; not adding to cc_emails (email still sent)');
      }
    }

    logger.info({ reportId: report.id, copyEmail: body.email, requestedBy: req.inspectorId }, '[inspector] Report copy sent');

    res.json({ data: { sent: true, email: body.email }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/reports/:id/send-copy]');
    res.status(500).json({ data: null, error: 'Failed to send copy', meta: {} });
  }
});

// ── Item CRUD ─────────────────────────────────────────────────────────────

// PUT /api/v1/inspector/reports/:id/items/:itemId — edit a parsed item
//
// Accepts both the frontend-friendly shape (location, costEstimateMin/Max
// in dollars) AND the legacy DB-column shape (locationInProperty,
// aiCostEstimateLow/HighCents in cents). Dollar-style cost fields are
// converted to cents before persisting. Returns the projected item so the
// frontend can drop the row in directly without re-fetching the report.
router.put('/reports/:id/items/:itemId', requireInspectorAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    // Ownership check — the item must belong to a report owned by this
    // inspector. Single join keeps it cheap.
    const [row] = await db.select({
      itemId: inspectionReportItems.id,
      reportInspectorId: inspectionReports.inspectorPartnerId,
    })
      .from(inspectionReportItems)
      .leftJoin(inspectionReports, eq(inspectionReportItems.reportId, inspectionReports.id))
      .where(and(
        eq(inspectionReportItems.id, req.params.itemId),
        eq(inspectionReportItems.reportId, req.params.id),
      ))
      .limit(1);
    if (!row) { res.status(404).json({ data: null, error: 'Item not found', meta: {} }); return; }
    if (row.reportInspectorId !== req.inspectorId) {
      res.status(403).json({ data: null, error: 'Not authorized', meta: {} });
      return;
    }

    const updates: Record<string, unknown> = { inspectorAdjusted: true, updatedAt: new Date() };

    // Plain string fields — accept either the frontend's `location` or
    // the DB's `locationInProperty`.
    if (typeof body.title === 'string') updates.title = body.title;
    if (typeof body.description === 'string') updates.description = body.description;
    if (typeof body.category === 'string') updates.category = body.category;
    if (typeof body.severity === 'string') updates.severity = body.severity;
    if (body.location !== undefined) updates.locationInProperty = body.location === null ? null : String(body.location);
    if (body.locationInProperty !== undefined) updates.locationInProperty = body.locationInProperty === null ? null : String(body.locationInProperty);
    if (body.location_in_property !== undefined) updates.locationInProperty = body.location_in_property === null ? null : String(body.location_in_property);

    // Cost: accept dollar-style names (costEstimateMin/Max — what the
    // frontend sends after PR 3's projection refactor) AND the raw
    // *Cents shapes (legacy callers / curl). Dollars convert to cents
    // by ×100 and rounding.
    const toCents = (v: unknown): number | undefined => {
      if (v === null) return 0;
      if (v === undefined) return undefined;
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (!Number.isFinite(n)) return undefined;
      return Math.round(n * 100);
    };
    const lowCentsFromDollars = toCents(body.costEstimateMin);
    if (lowCentsFromDollars !== undefined) updates.aiCostEstimateLowCents = lowCentsFromDollars;
    if (typeof body.aiCostEstimateLowCents === 'number') updates.aiCostEstimateLowCents = body.aiCostEstimateLowCents;
    if (typeof body.ai_cost_estimate_low_cents === 'number') updates.aiCostEstimateLowCents = body.ai_cost_estimate_low_cents;
    const highCentsFromDollars = toCents(body.costEstimateMax);
    if (highCentsFromDollars !== undefined) updates.aiCostEstimateHighCents = highCentsFromDollars;
    if (typeof body.aiCostEstimateHighCents === 'number') updates.aiCostEstimateHighCents = body.aiCostEstimateHighCents;
    if (typeof body.ai_cost_estimate_high_cents === 'number') updates.aiCostEstimateHighCents = body.ai_cost_estimate_high_cents;

    const [updated] = await db.update(inspectionReportItems)
      .set(updates)
      .where(eq(inspectionReportItems.id, req.params.itemId))
      .returning();
    if (!updated) {
      res.status(404).json({ data: null, error: 'Item not found after update', meta: {} });
      return;
    }
    // Return the projected shape the frontend's InspectionItem type
    // expects (cents → dollars, computed valueImpact, etc.) so the
    // caller can splice the row into local state without a re-fetch.
    res.json({ data: projectInspectionItem(updated), error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PUT /inspector/reports/:id/items/:itemId]');
    res.status(500).json({ data: null, error: 'Failed to update item', meta: {} });
  }
});

// PATCH /api/v1/inspector/reports/:id/items
//
// Bulk-update items for a single report. Used by the items page bulk-edit
// toolbar to fix common parsing mistakes (wrong category, wrong severity)
// across many items at once. Only allowed before the report is sent —
// once items are dispatched/quoted, downstream flows depend on the
// severity + category values, so we lock them.
//
// Body: { ids: string[]; updates: { severity?, category? } }
// Sets inspector_adjusted = true on every touched row (used by the UI to
// dismiss the "Review before sending" badge).
router.patch('/reports/:id/items', requireInspectorAuth, async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { ids?: string[]; updates?: { severity?: string; category?: string } };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    res.status(400).json({ data: null, error: 'ids must be a non-empty array', meta: {} });
    return;
  }
  if (!body.updates || typeof body.updates !== 'object') {
    res.status(400).json({ data: null, error: 'updates is required', meta: {} });
    return;
  }
  const updates: Record<string, unknown> = { inspectorAdjusted: true, updatedAt: new Date() };
  if (typeof body.updates.severity === 'string') updates.severity = body.updates.severity;
  if (typeof body.updates.category === 'string') updates.category = body.updates.category;
  if (Object.keys(updates).length <= 2) {
    res.status(400).json({ data: null, error: 'updates must include at least one of severity or category', meta: {} });
    return;
  }

  try {
    const [report] = await db.select({ id: inspectionReports.id, parsingStatus: inspectionReports.parsingStatus })
      .from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.id), eq(inspectionReports.inspectorPartnerId, req.inspectorId)))
      .limit(1);
    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    if (report.parsingStatus !== 'parsed' && report.parsingStatus !== 'review_pending') {
      res.status(400).json({
        data: null,
        error: `Bulk edits are only allowed before sending the report (current: ${report.parsingStatus})`,
        meta: {},
      });
      return;
    }

    // Scope the update to items that belong to this report so a misuse of
    // the endpoint can't touch items in another report.
    const updatedItems = await db.update(inspectionReportItems)
      .set(updates)
      .where(and(
        inArray(inspectionReportItems.id, body.ids),
        eq(inspectionReportItems.reportId, report.id),
      ))
      .returning();

    logger.info({ reportId: report.id, count: updatedItems.length, fields: Object.keys(updates) }, '[inspector/items] bulk update');
    res.json({ data: { updated: updatedItems.length, items: updatedItems }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PATCH /inspector/reports/:id/items]');
    res.status(500).json({ data: null, error: 'Failed to bulk update items', meta: {} });
  }
});

// POST /api/v1/inspector/reports/:id/add-item — manually add an item
router.post('/reports/:id/add-item', requireInspectorAuth, async (req: Request, res: Response) => {
  const body = req.body as {
    title: string; description?: string; category: string; severity: string;
    location_in_property?: string; ai_cost_estimate_low_cents?: number; ai_cost_estimate_high_cents?: number;
  };
  if (!body.title || !body.category || !body.severity) {
    res.status(400).json({ data: null, error: 'title, category, and severity are required', meta: {} });
    return;
  }
  try {
    const [{ value: maxOrder }] = await db.select({ value: sql<number>`COALESCE(MAX(${inspectionReportItems.sortOrder}), 0)` })
      .from(inspectionReportItems).where(eq(inspectionReportItems.reportId, req.params.id));
    const [item] = await db.insert(inspectionReportItems).values({
      reportId: req.params.id,
      title: body.title,
      description: body.description || null,
      category: body.category,
      severity: body.severity,
      locationInProperty: body.location_in_property || null,
      aiCostEstimateLowCents: body.ai_cost_estimate_low_cents ?? 0,
      aiCostEstimateHighCents: body.ai_cost_estimate_high_cents ?? 0,
      aiConfidence: '1.00',
      inspectorAdjusted: true,
      sortOrder: (maxOrder ?? 0) + 1,
    }).returning();
    // Update items_parsed count
    await db.update(inspectionReports).set({
      itemsParsed: sql`${inspectionReports.itemsParsed} + 1`,
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, req.params.id));
    res.status(201).json({ data: item, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/reports/:id/add-item]');
    res.status(500).json({ data: null, error: 'Failed to add item', meta: {} });
  }
});

// DELETE /api/v1/inspector/reports/:id/items/:itemId
router.delete('/reports/:id/items/:itemId', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    await db.delete(inspectionReportItems).where(eq(inspectionReportItems.id, req.params.itemId));
    await db.update(inspectionReports).set({
      itemsParsed: sql`GREATEST(${inspectionReports.itemsParsed} - 1, 0)`,
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, req.params.id));
    res.json({ data: { deleted: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /inspector/reports/:id/items/:itemId]');
    res.status(500).json({ data: null, error: 'Failed to delete item', meta: {} });
  }
});

// ── Earnings ──────────────────────────────────────────────────────────────

// GET /api/v1/inspector/earnings/summary
router.get('/earnings/summary', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;

    const [currentEarnings] = await db.select({ total: sql<number>`COALESCE(SUM(${inspectorEarnings.amountCents}), 0)` })
      .from(inspectorEarnings)
      .where(and(eq(inspectorEarnings.inspectorPartnerId, req.inspectorId), eq(inspectorEarnings.periodMonth, currentMonth)));
    const [lastEarnings] = await db.select({ total: sql<number>`COALESCE(SUM(${inspectorEarnings.amountCents}), 0)` })
      .from(inspectorEarnings)
      .where(and(eq(inspectorEarnings.inspectorPartnerId, req.inspectorId), eq(inspectorEarnings.periodMonth, lastMonthStr)));
    const [lifetime] = await db.select({ total: sql<number>`COALESCE(SUM(${inspectorEarnings.amountCents}), 0)` })
      .from(inspectorEarnings)
      .where(eq(inspectorEarnings.inspectorPartnerId, req.inspectorId));
    const [reportCount] = await db.select({ value: count() }).from(inspectionReports)
      .where(and(eq(inspectionReports.inspectorPartnerId, req.inspectorId), sql`DATE_TRUNC('month', ${inspectionReports.createdAt}) = DATE_TRUNC('month', NOW())`));

    res.json({
      data: {
        currentMonthCents: currentEarnings.total,
        lastMonthCents: lastEarnings.total,
        lifetimeCents: lifetime.total,
        reportsThisMonth: reportCount.value,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /inspector/earnings/summary]');
    res.status(500).json({ data: null, error: 'Failed to load earnings', meta: {} });
  }
});

// GET /api/v1/inspector/earnings
router.get('/earnings', requireInspectorAuth, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;
  try {
    const earnings = await db.select().from(inspectorEarnings)
      .where(eq(inspectorEarnings.inspectorPartnerId, req.inspectorId))
      .orderBy(desc(inspectorEarnings.createdAt))
      .limit(limit).offset(offset);
    res.json({ data: earnings, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /inspector/earnings]');
    res.status(500).json({ data: null, error: 'Failed to load earnings', meta: {} });
  }
});

// ── Leads ─────────────────────────────────────────────────────────────────

// GET /api/v1/inspector/leads
router.get('/leads', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    const leads = await db.select().from(inspectorInboundLeads)
      .where(eq(inspectorInboundLeads.inspectorPartnerId, req.inspectorId))
      .orderBy(desc(inspectorInboundLeads.createdAt)).limit(50);
    res.json({ data: leads, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /inspector/leads]');
    res.status(500).json({ data: null, error: 'Failed to load leads', meta: {} });
  }
});

// POST /api/v1/inspector/leads/:id/accept
router.post('/leads/:id/accept', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    const [lead] = await db.select().from(inspectorInboundLeads)
      .where(and(eq(inspectorInboundLeads.id, req.params.id), eq(inspectorInboundLeads.inspectorPartnerId, req.inspectorId)))
      .limit(1);
    if (!lead) { res.status(404).json({ data: null, error: 'Lead not found', meta: {} }); return; }
    const [updated] = await db.update(inspectorInboundLeads).set({ status: 'accepted', acceptedAt: new Date() }).where(eq(inspectorInboundLeads.id, lead.id)).returning();
    res.json({ data: updated, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/leads/:id/accept]');
    res.status(500).json({ data: null, error: 'Failed to accept lead', meta: {} });
  }
});

// POST /api/v1/inspector/leads/:id/pass
router.post('/leads/:id/pass', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    await db.update(inspectorInboundLeads).set({ status: 'passed' }).where(and(eq(inspectorInboundLeads.id, req.params.id), eq(inspectorInboundLeads.inspectorPartnerId, req.inspectorId)));
    res.json({ data: { status: 'passed' }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/leads/:id/pass]');
    res.status(500).json({ data: null, error: 'Failed to pass lead', meta: {} });
  }
});

// POST /api/v1/inspector/leads/:id/converted
router.post('/leads/:id/converted', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    const [lead] = await db.select().from(inspectorInboundLeads)
      .where(and(eq(inspectorInboundLeads.id, req.params.id), eq(inspectorInboundLeads.inspectorPartnerId, req.inspectorId)))
      .limit(1);
    if (!lead || lead.status !== 'accepted') { res.status(400).json({ data: null, error: 'Lead must be accepted first', meta: {} }); return; }
    await db.update(inspectorInboundLeads).set({ status: 'converted', convertedAt: new Date() }).where(eq(inspectorInboundLeads.id, lead.id));
    // Create earnings for the lead bonus
    const now = new Date();
    await db.insert(inspectorEarnings).values({
      inspectorPartnerId: req.inspectorId,
      leadId: lead.id,
      earningType: 'inbound_lead_bonus',
      amountCents: 2500,
      description: `Inbound lead conversion: ${lead.homeownerName} in ${lead.propertyCity}`,
      periodMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    });
    res.json({ data: { status: 'converted' }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/leads/:id/converted]');
    res.status(500).json({ data: null, error: 'Failed to convert lead', meta: {} });
  }
});

// ── Pricing constants ─────────────────────────────────────────────────────

const PER_ITEM_PRICE_CENTS = 999;        // $9.99
const BUNDLE_SMALL_PRICE_CENTS = 9900;   // $99 for up to 15 items
const BUNDLE_LARGE_PRICE_CENTS = 14900;  // $149 for 16+ items
const BUNDLE_THRESHOLD = 15;

function getBundlePrice(itemCount: number): number {
  return itemCount <= BUNDLE_THRESHOLD ? BUNDLE_SMALL_PRICE_CENTS : BUNDLE_LARGE_PRICE_CENTS;
}

// ── Home Value Impact ────────────────────────────────────────────────────

// ROI multipliers by category — how much home value increases per dollar spent
const ROI_MULTIPLIERS: Record<string, { low: number; high: number }> = {
  roofing:       { low: 1.2, high: 1.6 },   // Roof repairs have strong ROI
  structural:    { low: 1.3, high: 1.8 },   // Structural = high buyer concern
  foundation:    { low: 1.2, high: 1.7 },
  electrical:    { low: 1.1, high: 1.5 },   // Safety items appraise well
  plumbing:      { low: 1.0, high: 1.4 },
  hvac:          { low: 1.1, high: 1.5 },   // HVAC is a top buyer priority
  windows_doors: { low: 0.9, high: 1.3 },
  insulation:    { low: 0.8, high: 1.2 },
  safety:        { low: 1.0, high: 1.3 },
  fireplace:     { low: 0.7, high: 1.1 },
  appliance:     { low: 0.5, high: 0.8 },   // Appliances depreciate
  pest_control:  { low: 1.0, high: 1.4 },   // Pest = deal breaker for lenders
  general_repair:{ low: 0.6, high: 1.0 },
  cosmetic:      { low: 0.3, high: 0.6 },   // Cosmetic has lowest ROI
  landscaping:   { low: 0.4, high: 0.8 },
};

// FHA/VA minimum property requirements — items that can kill a deal
const FHA_VA_CATEGORIES = new Set(['roofing', 'structural', 'foundation', 'electrical', 'plumbing', 'safety', 'pest_control']);
const FHA_VA_SEVERITIES = new Set(['safety_hazard', 'urgent']);

interface ValueImpact {
  /** Estimated value increase from fixing (low end) */
  roiLow: number;
  /** Estimated value increase from fixing (high end) */
  roiHigh: number;
  /** ROI multiplier midpoint */
  roiMultiplier: number;
  /** Could block FHA/VA loan approval */
  lenderFlag: boolean;
  /** Display label */
  lenderFlagType: 'fha_va_required' | 'lender_concern' | null;
}

function computeValueImpact(category: string, severity: string, costLowCents: number, costHighCents: number): ValueImpact | null {
  // Skip informational and monitor items — no meaningful ROI
  if (severity === 'informational' || severity === 'monitor') return null;
  // Skip items with no cost estimate
  if (costLowCents <= 0 && costHighCents <= 0) return null;

  const avgCost = (costLowCents + costHighCents) / 2;
  const mult = ROI_MULTIPLIERS[category] ?? { low: 0.5, high: 0.9 };
  const roiMultiplier = (mult.low + mult.high) / 2;

  // Only show ROI badge if it's actually a positive return
  if (roiMultiplier < 0.7) return null;

  const roiLow = Math.round((avgCost * mult.low) / 100);
  const roiHigh = Math.round((avgCost * mult.high) / 100);

  // FHA/VA flag: safety/urgent items in structural/mechanical categories
  const isFhaVaCategory = FHA_VA_CATEGORIES.has(category);
  const isFhaVaSeverity = FHA_VA_SEVERITIES.has(severity);
  const lenderFlag = isFhaVaCategory && isFhaVaSeverity;
  const lenderConcern = isFhaVaCategory && severity === 'recommended';

  return {
    roiLow,
    roiHigh,
    roiMultiplier,
    lenderFlag: lenderFlag || lenderConcern,
    lenderFlagType: lenderFlag ? 'fha_va_required' : lenderConcern ? 'lender_concern' : null,
  };
}

// ── Seller Action Classification ───────────────────────────────────────────
// Deterministic rules that classify each item into one of three pre-listing actions.

export type SellerAction = 'fix_before_listing' | 'disclose' | 'ignore';

export interface SellerActionResult {
  action: SellerAction;
  reason: string;
}

export function computeSellerAction(category: string, severity: string, costLowCents: number, costHighCents: number): SellerActionResult {
  // Informational items — never worth bringing up
  if (severity === 'informational') {
    return { action: 'ignore', reason: 'Informational only' };
  }
  // No cost data — no way to decide, mark ignore
  if (costLowCents <= 0 && costHighCents <= 0 && severity !== 'safety_hazard' && severity !== 'urgent') {
    return { action: 'ignore', reason: 'No cost estimate available' };
  }

  const avgCost = (costLowCents + costHighCents) / 2;
  const isFhaVaCategory = FHA_VA_CATEGORIES.has(category);
  const isFhaVaSeverity = FHA_VA_SEVERITIES.has(severity);
  const fhaVaFlag = isFhaVaCategory && isFhaVaSeverity;

  // Safety hazards and urgent items are deal-killers — always fix
  if (severity === 'safety_hazard' || severity === 'urgent') {
    return { action: 'fix_before_listing', reason: fhaVaFlag ? 'Safety/urgent — FHA/VA deal-killer' : 'Safety/urgent — buyers will demand credit' };
  }

  // FHA/VA lender concern — strongly recommend fixing to widen buyer pool
  if (fhaVaFlag) {
    return { action: 'fix_before_listing', reason: 'FHA/VA concern — widens buyer pool' };
  }

  // Low-cost easy wins — worth just fixing
  if (avgCost > 0 && avgCost < 20000) {
    return { action: 'fix_before_listing', reason: 'Low cost — easy win before listing' };
  }

  // Strong ROI — fixing adds more value than cost
  const mult = ROI_MULTIPLIERS[category] ?? { low: 0.5, high: 0.9 };
  const roiMultiplier = (mult.low + mult.high) / 2;
  if (roiMultiplier >= 1.2) {
    return { action: 'fix_before_listing', reason: 'Strong ROI — adds more value than the cost' };
  }

  // Monitor severity — leave alone
  if (severity === 'monitor') {
    return { action: 'ignore', reason: 'Minor — not worth acting on' };
  }

  // Everything else — disclose and let buyer factor into their offer
  return { action: 'disclose', reason: 'Low ROI — disclose and let buyer price it in' };
}

// ── Client-facing (token-based, no auth) ──────────────────────────────────

// GET /api/v1/inspect/track-open/:reportId/pixel.png
//
// 1×1 transparent PNG embedded at the bottom of the auto-email sent
// to the homeowner after parsing completes. When their email client
// loads the image, this endpoint fires and stamps homeownerOpenedAt
// — which suppresses the 5-day reminder sweep for that report.
//
// Public route (no auth) since email recipients aren't logged in.
// Only the report id is leaked to anyone who has the email or sees
// the pixel URL — and the URL itself doesn't expose the report data.
//
// Always returns the pixel even if the report id doesn't match, so
// failed lookups don't render as broken images in clients that show
// alt text or 404 placeholders.
router.get('/track-open/:reportId/pixel.png', async (req: Request, res: Response) => {
  // 43-byte transparent PNG (smallest possible).
  const PIXEL = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  try {
    const { reportId } = req.params;
    if (reportId && /^[0-9a-f-]{36}$/i.test(reportId)) {
      // Idempotent — only stamps the first time so reload-driven re-pings
      // don't keep nudging timestamps forward (would inadvertently delay
      // any future "you haven't opened in N days" sweeps if we add one).
      await db.update(inspectionReports).set({
        homeownerOpenedAt: new Date(),
        updatedAt: new Date(),
      }).where(
        and(
          eq(inspectionReports.id, reportId),
          isNull(inspectionReports.homeownerOpenedAt),
        ),
      );
    }
  } catch (err) {
    // Pixel always responds 200 — never let a logging error break image rendering.
    logger.warn({ err, reportId: req.params.reportId }, '[inspect/track-open] pixel handler logged but ignored');
  }
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Length', String(PIXEL.length));
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.status(200).send(PIXEL);
});

// GET /api/v1/inspect/:token — client views their report
router.get('/:token', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token)).limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }
    if (new Date() > report.expiresAt) {
      res.status(410).json({ data: null, error: 'This report link has expired. Contact your inspector for a new link.', meta: {} });
      return;
    }
    const items = await db.select().from(inspectionReportItems)
      .where(eq(inspectionReportItems.reportId, report.id))
      .orderBy(inspectionReportItems.sortOrder);
    const [inspector] = report.inspectorPartnerId
      ? await db.select({
          companyName: inspectorPartners.companyName,
          companyLogoUrl: inspectorPartners.companyLogoUrl,
          certifications: inspectorPartners.certifications,
        }).from(inspectorPartners).where(eq(inspectorPartners.id, report.inspectorPartnerId)).limit(1)
      : [null];

    const itemCount = items.length;
    const perItemPriceCents = PER_ITEM_PRICE_CENTS;
    const bundlePriceCents = getBundlePrice(itemCount);

    res.json({
      data: {
        id: report.id,
        inspectorCompanyName: inspector?.companyName ?? null,
        inspectorLogoUrl: inspector?.companyLogoUrl ?? null,
        propertyAddress: report.propertyAddress,
        propertyCity: report.propertyCity,
        propertyState: report.propertyState,
        propertyZip: report.propertyZip,
        inspectionDate: report.inspectionDate,
        inspectionType: report.inspectionType,
        perItemPrice: perItemPriceCents / 100,
        bundlePrice: bundlePriceCents / 100,
        // Use proxy endpoint so browsers don't block data: URLs in new tabs
        reportFileUrl: report.reportFileUrl
          ? `${(process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '')}/api/v1/inspect/${req.params.token}/source-pdf`
          : null,
        reportMode: report.reportMode ?? 'buyer',
        items: items.map(i => ({
          id: i.id,
          reportId: i.reportId,
          title: i.title,
          description: i.description,
          severity: i.severity,
          category: i.category,
          location: i.locationInProperty,
          photoDescriptions: i.inspectorPhotos ?? [],
          costEstimateMin: i.aiCostEstimateLowCents > 0 ? i.aiCostEstimateLowCents / 100 : null,
          costEstimateMax: i.aiCostEstimateHighCents > 0 ? i.aiCostEstimateHighCents / 100 : null,
          confidence: parseFloat(i.aiConfidence),
          dispatchStatus: (i.dispatchStatus === 'not_dispatched' || i.dispatchStatus === 'pending_dispatch') ? null : i.dispatchStatus,
          quoteDetails: i.quoteAmountCents ? (() => {
            // Find the matching quote in the quotes[] array to surface its bundleSize.
            // The "best" quote is denormalized into quoteAmountCents/providerName, so match
            // back by provider+amount.
            const allQuotes = (i.quotes ?? []) as Array<{ providerId: string; amountCents: number; bundleSize?: number }>;
            const match = allQuotes.find(q => q.amountCents === i.quoteAmountCents);
            return {
              providerName: i.providerName ?? 'Provider',
              providerRating: parseFloat(i.providerRating ?? '0'),
              price: i.quoteAmountCents / 100,
              availability: i.providerAvailability ?? '',
              ...(match?.bundleSize && match.bundleSize > 1 ? { bundleSize: match.bundleSize } : {}),
            };
          })() : null,
          valueImpact: computeValueImpact(i.category, i.severity, i.aiCostEstimateLowCents, i.aiCostEstimateHighCents),
          sourcePages: i.sourcePages ?? null,
          sourceDocumentId: i.sourceDocumentId ?? null,
          crossReferencedItemIds: i.crossReferencedItemIds ?? [],
          diyAnalysis: i.diyAnalysis ?? null,
          ...(function(){ const s = computeSellerAction(i.category, i.severity, i.aiCostEstimateLowCents ?? 0, i.aiCostEstimateHighCents ?? 0); return { sellerAction: s.action, sellerActionReason: s.reason }; })(),
        })),
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /inspect/:token]');
    res.status(500).json({ data: null, error: 'Failed to load report', meta: {} });
  }
});

// ── Homeowner self-upload (Path A — no inspector, no auth) ────────────────

// POST /api/v1/inspect/upload — homeowner uploads their own report
// optionalAuth: if a valid homeowner JWT is present, auto-links the report to their account
router.post('/upload', optionalAuth, async (req: Request, res: Response) => {
  const body = req.body as {
    report_file_data_url?: string;
    property_address: string;
    property_city?: string;
    property_state?: string;
    property_zip?: string;
    client_name?: string;
    client_email?: string;
    inspection_date?: string;
  };

  if (!body.report_file_data_url) {
    res.status(400).json({ data: null, error: 'report_file_data_url is required', meta: {} });
    return;
  }

  try {
    // Try Cloudinary first; fall back to storing the data URL directly
    let reportFileUrl: string | null = null;
    try {
      const { uploadFile } = await import('../services/image-upload');
      const result = await uploadFile(body.report_file_data_url, 'homie/inspection-reports');
      if (result) reportFileUrl = result.url;
    } catch (err) {
      logger.warn({ err }, '[inspect/upload] Cloudinary upload failed, using data URL directly');
    }
    // Fall back to the raw data URL — the parser can handle it
    if (!reportFileUrl) reportFileUrl = body.report_file_data_url;

    const clientAccessToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const [report] = await db.insert(inspectionReports).values({
      inspectorPartnerId: null,
      propertyAddress: body.property_address || 'Address pending',
      propertyCity: body.property_city || '',
      propertyState: body.property_state || '',
      propertyZip: body.property_zip || '',
      clientName: body.client_name || 'Homeowner',
      clientEmail: body.client_email || '',
      inspectionDate: body.inspection_date || new Date().toISOString().slice(0, 10),
      inspectionType: 'general',
      reportFileUrl,
      source: 'homeowner_upload',
      parsingStatus: 'processing',
      clientAccessToken,
      expiresAt,
    }).returning();

    // Auto-link to homeowner account if authenticated
    if (req.homeownerId) {
      await db.update(inspectionReports)
        .set({ homeownerId: req.homeownerId })
        .where(eq(inspectionReports.id, report.id));
    }

    // Kick off async parsing
    void parseInspectionReportAsync(report.id).catch(err =>
      logger.error({ err, reportId: report.id }, '[inspect/upload] Async parsing failed'),
    );

    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

    res.status(201).json({
      data: {
        reportId: report.id,
        token: clientAccessToken,
        reportUrl: `${APP_URL}/inspect/${clientAccessToken}`,
        parsingStatus: 'processing',
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /inspect/upload]');
    res.status(500).json({ data: null, error: 'Failed to process upload', meta: {} });
  }
});

// GET /api/v1/inspect/upload/:reportId/status — poll parsing progress for self-uploads
router.get('/upload/:reportId/status', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select({
      parsingStatus: inspectionReports.parsingStatus,
      parsingError: inspectionReports.parsingError,
      itemsParsed: inspectionReports.itemsParsed,
      clientAccessToken: inspectionReports.clientAccessToken,
    }).from(inspectionReports).where(eq(inspectionReports.id, req.params.reportId)).limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }
    res.json({ data: report, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /inspect/upload/:reportId/status]');
    res.status(500).json({ data: null, error: 'Failed to load status', meta: {} });
  }
});

// GET /api/v1/inspect/:token/debug — show item statuses (temporary debug endpoint)
router.get('/:token/debug', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token)).limit(1);
    if (!report) { res.status(404).json({ error: 'not found' }); return; }
    const items = await db.select({
      id: inspectionReportItems.id,
      title: inspectionReportItems.title,
      category: inspectionReportItems.category,
      dispatchStatus: inspectionReportItems.dispatchStatus,
      dispatchId: inspectionReportItems.dispatchId,
    }).from(inspectionReportItems).where(eq(inspectionReportItems.reportId, report.id));
    res.json({ reportId: report.id, homeownerId: report.homeownerId, itemCount: items.length, items });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/v1/inspect/:token/reset — reset all items to not_dispatched (debug/admin only)
router.post('/:token/reset', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token)).limit(1);
    if (!report) { res.status(404).json({ error: 'not found' }); return; }
    await db.update(inspectionReportItems).set({
      dispatchStatus: 'not_dispatched', dispatchId: null, updatedAt: new Date(),
    }).where(eq(inspectionReportItems.reportId, report.id));
    res.json({ data: { ok: true, reset: true }, error: null, meta: {} });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/v1/inspect/provider/:providerToken — provider views inspection items for quoting
router.get('/provider/:providerToken', async (req: Request, res: Response) => {
  try {
    // Find the job with this provider view token in its diagnosis
    const [job] = await db.execute(sql`
      SELECT id, diagnosis, zip_code, budget, created_at
      FROM jobs
      WHERE diagnosis->>'providerViewToken' = ${req.params.providerToken}
        AND diagnosis->>'source' = 'inspection_report'
      LIMIT 1
    `) as unknown as Array<{ id: string; diagnosis: Record<string, unknown>; zip_code: string; budget: string; created_at: Date }>;

    if (!job) {
      res.status(404).json({ data: null, error: 'Report not found or link expired', meta: {} });
      return;
    }

    const diag = job.diagnosis;
    const reportId = diag.inspectionReportId as string;
    const itemIds = (diag.inspectionItemIds ?? (diag.inspectionItemId ? [diag.inspectionItemId] : [])) as string[];

    if (!reportId || itemIds.length === 0) {
      res.status(404).json({ data: null, error: 'No items found', meta: {} });
      return;
    }

    // Get report info
    const [report] = await db.select({
      propertyAddress: inspectionReports.propertyAddress,
      propertyCity: inspectionReports.propertyCity,
      propertyState: inspectionReports.propertyState,
      propertyZip: inspectionReports.propertyZip,
      inspectionDate: inspectionReports.inspectionDate,
      inspectionType: inspectionReports.inspectionType,
    }).from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    // Get the items for this category group
    const items = await db.select().from(inspectionReportItems)
      .where(sql`${inspectionReportItems.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(inspectionReportItems.sortOrder);

    res.json({
      data: {
        jobId: job.id,
        category: (diag.category as string).replace(/_/g, ' '),
        budget: job.budget,
        property: {
          address: report.propertyAddress,
          city: report.propertyCity,
          state: report.propertyState,
          zip: report.propertyZip,
          inspectionDate: report.inspectionDate,
          inspectionType: report.inspectionType,
        },
        items: items.map(i => ({
          id: i.id,
          title: i.title,
          description: i.description,
          severity: i.severity,
          category: i.category,
          location: i.locationInProperty,
          photoDescriptions: (i.inspectorPhotos as string[] | null) ?? [],
          costEstimateMin: i.aiCostEstimateLowCents > 0 ? i.aiCostEstimateLowCents / 100 : null,
          costEstimateMax: i.aiCostEstimateHighCents > 0 ? i.aiCostEstimateHighCents / 100 : null,
        })),
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /inspect/provider/:providerToken]');
    res.status(500).json({ data: null, error: 'Failed to load report', meta: {} });
  }
});

// POST /api/v1/inspect/provider/:providerToken/quote — provider submits per-item or bundle quote
// No login required. Provider confirms their phone (matched against outreach_attempts) to identify
// which dispatch they're responding to. Accepts itemPrices (per-item, in dollars) or bundlePrice
// (single bundle, in dollars). Provide one or the other, not both.
router.post('/provider/:providerToken/quote', async (req: Request, res: Response) => {
  const body = req.body as {
    phone?: string;
    itemPrices?: Record<string, number>;
    bundlePrice?: number;
    availability?: string;
    message?: string;
  };

  const phoneInput = phoneKey(body.phone ?? null);
  if (!phoneInput) {
    res.status(400).json({ data: null, error: 'Please enter the business phone number you were contacted at.', meta: {} });
    return;
  }

  const hasPerItem = body.itemPrices && Object.keys(body.itemPrices).length > 0;
  const hasBundle = typeof body.bundlePrice === 'number' && body.bundlePrice > 0;
  if (!hasPerItem && !hasBundle) {
    res.status(400).json({ data: null, error: 'Enter a price for at least one item, or a bundle total.', meta: {} });
    return;
  }

  try {
    // Find the job by providerToken
    const [job] = await db.execute(sql`
      SELECT id, diagnosis FROM jobs
      WHERE diagnosis->>'providerViewToken' = ${req.params.providerToken}
        AND diagnosis->>'source' = 'inspection_report'
      LIMIT 1
    `) as unknown as Array<{ id: string; diagnosis: Record<string, unknown> }>;

    if (!job) {
      res.status(404).json({ data: null, error: 'Quote link expired or invalid.', meta: {} });
      return;
    }

    const diag = job.diagnosis;
    const itemIds = (diag.inspectionItemIds ?? (diag.inspectionItemId ? [diag.inspectionItemId] : [])) as string[];

    // Find the matching outreach attempt — by phone match against the providers contacted for this job
    const attempts = await db.select({
      attemptId: outreachAttempts.id,
      providerId: outreachAttempts.providerId,
      providerPhone: providers.phone,
      channel: outreachAttempts.channel,
      attemptedAt: outreachAttempts.attemptedAt,
    })
      .from(outreachAttempts)
      .innerJoin(providers, eq(outreachAttempts.providerId, providers.id))
      .where(eq(outreachAttempts.jobId, job.id));

    let match = attempts.find(a => phoneKey(a.providerPhone) === phoneInput);

    // Test-mode bypass: when outreach is routed to TEST_PHONE, the provider's real
    // phone in the DB won't match the phone that actually received the SMS. If the
    // caller's phone matches TEST_PHONE and we're in TEST_MODE, accept the first
    // attempt for this job. Only active when TEST_MODE=true in env.
    if (!match && process.env.TEST_MODE === 'true') {
      const testPhoneKey = phoneKey(process.env.TEST_PHONE ?? null);
      if (testPhoneKey && phoneInput === testPhoneKey && attempts.length > 0) {
        match = attempts[0];
        logger.info({ jobId: job.id, providerId: match.providerId }, '[POST /inspect/provider/:providerToken/quote] TEST_MODE phone bypass');
      }
    }

    if (!match) {
      res.status(403).json({
        data: null,
        error: 'We couldn\'t match this phone to a contact for this job. Double-check the number you were texted/called at.',
        meta: {},
      });
      return;
    }

    // Validate per-item prices: each key must be in this job's itemIds, each value > 0
    let normalizedItemPrices: Record<string, number> | null = null;
    let totalCents: number | null = null;
    if (hasPerItem) {
      normalizedItemPrices = {};
      let total = 0;
      for (const [itemId, dollars] of Object.entries(body.itemPrices!)) {
        if (!itemIds.includes(itemId)) continue;
        if (typeof dollars !== 'number' || dollars <= 0) continue;
        const cents = Math.round(dollars * 100);
        normalizedItemPrices[itemId] = cents;
        total += cents;
      }
      if (Object.keys(normalizedItemPrices).length === 0) {
        res.status(400).json({ data: null, error: 'No valid item prices were provided.', meta: {} });
        return;
      }
      totalCents = total;
    } else if (hasBundle) {
      totalCents = Math.round(body.bundlePrice! * 100);
    }

    // Update outreach attempt status -> accepted
    await db.update(outreachAttempts).set({
      status: 'accepted',
      respondedAt: new Date(),
    }).where(eq(outreachAttempts.id, match.attemptId));

    // Get provider rating for response record
    const [prov] = await db.select({ rating: providers.rating, name: providers.name })
      .from(providers).where(eq(providers.id, match.providerId)).limit(1);

    // Insert provider response — quotedPrice carries the total (display string), itemPrices carries the breakdown
    await db.insert(providerResponses).values({
      jobId: job.id,
      providerId: match.providerId,
      outreachAttemptId: match.attemptId,
      channel: match.channel,
      quotedPrice: totalCents != null ? `$${(totalCents / 100).toFixed(0)}` : null,
      itemPrices: normalizedItemPrices ?? undefined,
      availability: body.availability ?? null,
      message: body.message ?? null,
      ratingAtTime: prov?.rating ?? null,
    });

    // Sync to inspection items + send notifications
    try {
      const { syncInspectionQuote } = await import('../services/inspection-quote-sync');
      await syncInspectionQuote(job.id, match.providerId, totalCents != null ? `$${(totalCents / 100).toFixed(0)}` : null, normalizedItemPrices ?? undefined);
    } catch (err) {
      logger.warn({ err }, '[POST /inspect/provider/:providerToken/quote] sync failed');
    }

    res.json({
      data: {
        ok: true,
        providerName: prov?.name ?? 'Provider',
        itemCount: itemIds.length,
        totalDollars: totalCents != null ? totalCents / 100 : null,
        itemized: hasPerItem,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /inspect/provider/:providerToken/quote]');
    res.status(500).json({ data: null, error: 'Failed to submit quote', meta: {} });
  }
});

// GET /api/v1/inspect/:token/pdf — generate summary PDF for the report
router.get('/:token/pdf', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token)).limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }

    const items = await db.select().from(inspectionReportItems)
      .where(eq(inspectionReportItems.reportId, report.id))
      .orderBy(inspectionReportItems.sortOrder);

    const [inspector] = report.inspectorPartnerId
      ? await db.select({ companyName: inspectorPartners.companyName })
          .from(inspectorPartners).where(eq(inspectorPartners.id, report.inspectorPartnerId)).limit(1)
      : [null];

    // Dynamic import pdfkit
    const PDFDocument = (await import('pdfkit')).default;

    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const pdfDone = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // ── Header ──
    doc.fontSize(24).fillColor('#E8632B').font('Helvetica-Bold').text('homie', 50, 50, { continued: true });
    doc.fontSize(14).fillColor('#9B9490').font('Helvetica').text(' inspect', { baseline: 'alphabetic' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#E8E4E0').stroke();
    doc.moveDown(0.6);

    // ── Property info ──
    doc.fontSize(18).fillColor('#2D2926').font('Helvetica-Bold')
      .text(`${report.propertyAddress}`);
    doc.fontSize(12).fillColor('#6B6560').font('Helvetica')
      .text(`${report.propertyCity}, ${report.propertyState} ${report.propertyZip}`);
    doc.moveDown(0.3);
    const metaParts: string[] = [];
    if (report.inspectionDate) metaParts.push(`Inspection: ${new Date(report.inspectionDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
    if (inspector?.companyName) metaParts.push(`Inspector: ${inspector.companyName}`);
    if (report.clientName) metaParts.push(`Client: ${report.clientName}`);
    if (metaParts.length) doc.fontSize(10).fillColor('#9B9490').text(metaParts.join('  |  '));
    doc.moveDown(1);

    // ── Summary bar ──
    const totalItems = items.length;
    const quotedItems = items.filter(i => i.quoteAmountCents && i.quoteAmountCents > 0);
    const totalQuoteCents = quotedItems.reduce((s, i) => s + (i.quoteAmountCents ?? 0), 0);
    const totalEstLowCents = items.reduce((s, i) => s + i.aiCostEstimateLowCents, 0);
    const totalEstHighCents = items.reduce((s, i) => s + i.aiCostEstimateHighCents, 0);
    const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    const summaryY = doc.y;
    doc.roundedRect(50, summaryY, 512, 52, 6).fillAndStroke('#F9F5F2', '#E8E4E0');
    doc.fontSize(10).fillColor('#9B9490').font('Helvetica')
      .text('Items', 70, summaryY + 10)
      .font('Helvetica-Bold').fillColor('#2D2926').fontSize(16)
      .text(`${totalItems}`, 70, summaryY + 24);
    doc.fontSize(10).fillColor('#9B9490').font('Helvetica')
      .text('Estimated range', 200, summaryY + 10)
      .font('Helvetica-Bold').fillColor('#2D2926').fontSize(16)
      .text(`${fmt(totalEstLowCents)} – ${fmt(totalEstHighCents)}`, 200, summaryY + 24);
    if (quotedItems.length > 0) {
      doc.fontSize(10).fillColor('#9B9490').font('Helvetica')
        .text('Quoted total', 410, summaryY + 10)
        .font('Helvetica-Bold').fillColor('#1B9E77').fontSize(16)
        .text(fmt(totalQuoteCents), 410, summaryY + 24);
    }
    doc.y = summaryY + 64;

    // ── Severity helpers ──
    const sevColors: Record<string, string> = { safety_hazard: '#E24B4A', urgent: '#E24B4A', recommended: '#EF9F27', monitor: '#9B9490', informational: '#D3CEC9' };
    const sevLabels: Record<string, string> = { safety_hazard: 'Safety Hazard', urgent: 'Urgent', recommended: 'Recommended', monitor: 'Monitor', informational: 'Info' };

    // ── Item rows ──
    for (const item of items) {
      if (doc.y > 660) doc.addPage();

      const rowY = doc.y;
      const sevColor = sevColors[item.severity] ?? '#9B9490';

      // Severity badge
      doc.roundedRect(50, rowY, 4, 44, 2).fill(sevColor);

      // Title + category
      doc.fontSize(12).fillColor('#2D2926').font('Helvetica-Bold')
        .text(item.title, 62, rowY + 2, { width: 340 });
      const titleBottom = doc.y;
      doc.fontSize(9).fillColor('#9B9490').font('Helvetica')
        .text(`${sevLabels[item.severity] ?? item.severity}  •  ${item.category}${item.locationInProperty ? `  •  ${item.locationInProperty}` : ''}`, 62, titleBottom + 1, { width: 340 });

      // Cost column (right side)
      if (item.quoteAmountCents && item.quoteAmountCents > 0) {
        doc.fontSize(14).fillColor('#1B9E77').font('Helvetica-Bold')
          .text(fmt(item.quoteAmountCents), 420, rowY + 2, { width: 130, align: 'right' });
        if (item.providerName) {
          doc.fontSize(9).fillColor('#9B9490').font('Helvetica')
            .text(item.providerName, 420, rowY + 20, { width: 130, align: 'right' });
        }
      } else if (item.aiCostEstimateLowCents > 0) {
        doc.fontSize(11).fillColor('#6B6560').font('Helvetica')
          .text(`${fmt(item.aiCostEstimateLowCents)} – ${fmt(item.aiCostEstimateHighCents)}`, 420, rowY + 6, { width: 130, align: 'right' });
      }

      doc.y = Math.max(doc.y, rowY + 48);
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#F0ECE8').stroke();
      doc.y += 8;
    }

    // ── Footer ──
    if (doc.y > 680) doc.addPage();
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#E8E4E0').stroke();
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#9B9490').font('Helvetica')
      .text(`Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} by Homie Inspect  •  homiepro.ai/inspect`, 50, doc.y, { align: 'center', width: 512 });

    doc.end();
    const pdfBuffer = await pdfDone;

    const addrSlug = slugify(report.propertyAddress).slice(0, 40);
    const filename = `homie-inspect-${addrSlug}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    logger.error({ err }, '[GET /inspect/:token/pdf]');
    res.status(500).json({ data: null, error: 'Failed to generate PDF', meta: {} });
  }
});

// POST /api/v1/inspect/:token/checkout — create Stripe checkout for dispatches
router.post('/:token/checkout', async (req: Request, res: Response) => {
  const { mode, item_ids, client_email } = req.body as {
    mode: 'bundle' | 'per_item';
    item_ids?: string[];     // required for per_item
    client_email?: string;   // for Stripe receipt
  };

  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token)).limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }
    if (new Date() > report.expiresAt) { res.status(410).json({ data: null, error: 'Report expired', meta: {} }); return; }

    // Get items to dispatch (include pending_dispatch from previous incomplete checkouts)
    const allItems = await db.select().from(inspectionReportItems)
      .where(and(
        eq(inspectionReportItems.reportId, report.id),
        sql`${inspectionReportItems.dispatchStatus} IN ('not_dispatched', 'pending_dispatch')`,
      ))
      .orderBy(inspectionReportItems.sortOrder);

    let itemsToDispatch = allItems;
    let amountCents: number;
    let description: string;

    if (mode === 'per_item') {
      if (!item_ids || item_ids.length === 0) {
        res.status(400).json({ data: null, error: 'item_ids required for per_item mode', meta: {} });
        return;
      }
      itemsToDispatch = allItems.filter(i => item_ids.includes(i.id));
      amountCents = itemsToDispatch.length * PER_ITEM_PRICE_CENTS;
      description = `Homie Inspect: ${itemsToDispatch.length} item${itemsToDispatch.length === 1 ? '' : 's'} — ${report.propertyAddress}`;
    } else {
      // Bundle: all undispatched non-informational items
      itemsToDispatch = allItems.filter(i => i.severity !== 'informational');
      amountCents = getBundlePrice(itemsToDispatch.length);
      description = `Homie Inspect Bundle: ${itemsToDispatch.length} items — ${report.propertyAddress}`;
    }

    if (itemsToDispatch.length === 0) {
      res.status(400).json({ data: null, error: 'No items to dispatch', meta: {} });
      return;
    }

    // Create Stripe Checkout Session
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
    });

    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

    // Mark selected items as pending_dispatch so the dispatch endpoint knows which ones to send
    for (const item of itemsToDispatch) {
      await db.update(inspectionReportItems).set({
        dispatchStatus: 'pending_dispatch',
        updatedAt: new Date(),
      }).where(eq(inspectionReportItems.id, item.id));
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: description },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      metadata: buildStripeMetadata({
        product: 'inspect_report',
        homeowner_id: report.homeownerId ?? undefined,
        tier: mode,
        report_id: report.id,
        token: req.params.token,
        mode,
        item_count: String(itemsToDispatch.length),
        inspector_partner_id: report.inspectorPartnerId ?? undefined,
        type: 'inspect_client_dispatch',
      }),
      customer_email: client_email || report.clientEmail || undefined,
      success_url: `${APP_URL}/inspect/${req.params.token}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/inspect/${req.params.token}?payment=canceled`,
    });

    res.json({ data: { checkoutUrl: session.url, amountCents, itemCount: itemsToDispatch.length }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspect/:token/checkout]');
    res.status(500).json({ data: null, error: `Checkout failed: ${(err as Error).message}`, meta: {} });
  }
});

// POST /api/v1/inspect/:token/claim — link report to a homeowner account
router.post('/:token/claim', async (req: Request, res: Response) => {
  const { homeowner_id } = req.body as { homeowner_id: string };
  if (!homeowner_id) { res.status(400).json({ data: null, error: 'homeowner_id required', meta: {} }); return; }

  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token)).limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }

    // Only claim if not already claimed by someone else
    if (report.homeownerId && report.homeownerId !== homeowner_id) {
      res.status(409).json({ data: null, error: 'Report already linked to another account', meta: {} });
      return;
    }

    await db.update(inspectionReports).set({
      homeownerId: homeowner_id,
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, report.id));

    res.json({ data: { claimed: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspect/:token/claim]');
    res.status(500).json({ data: null, error: 'Failed to link account', meta: {} });
  }
});

// POST /api/v1/inspect/:token/cancel-pending — revert pending_dispatch items if checkout canceled
router.post('/:token/cancel-pending', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token)).limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }

    await db.update(inspectionReportItems).set({
      dispatchStatus: 'not_dispatched',
      updatedAt: new Date(),
    }).where(and(eq(inspectionReportItems.reportId, report.id), eq(inspectionReportItems.dispatchStatus, 'pending_dispatch')));

    res.json({ data: { ok: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspect/:token/cancel-pending]');
    res.status(500).json({ data: null, error: 'Failed', meta: {} });
  }
});

// POST /api/v1/inspect/:token/dispatch — called after successful payment to dispatch items
// This can also be called by the Stripe webhook after payment confirmation.
router.post('/:token/dispatch', async (req: Request, res: Response) => {
  const { item_ids, session_id } = req.body as { item_ids?: string[]; session_id?: string };

  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token)).limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }

    // Verify Stripe payment if session_id provided
    if (session_id) {
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
          apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
        });
        const session = await stripe.checkout.sessions.retrieve(session_id);
        logger.info({ sessionId: session_id, paymentStatus: session.payment_status }, '[inspect/dispatch] Stripe session check');
        if (session.payment_status !== 'paid') {
          // Payment may still be processing — allow dispatch anyway since
          // Stripe already redirected with success. Webhook will also trigger.
          logger.warn({ sessionId: session_id, paymentStatus: session.payment_status }, '[inspect/dispatch] Payment not yet confirmed, proceeding anyway');
        }
      } catch (stripeErr) {
        logger.warn({ err: stripeErr, sessionId: session_id }, '[inspect/dispatch] Stripe session check failed, proceeding');
      }
    }

    // Get items to dispatch — look for pending_dispatch (set during checkout) or not_dispatched
    let itemsToDispatch;
    if (item_ids && item_ids.length > 0) {
      itemsToDispatch = await db.select().from(inspectionReportItems)
        .where(and(eq(inspectionReportItems.reportId, report.id), sql`${inspectionReportItems.id} IN (${sql.join(item_ids.map(id => sql`${id}`), sql`, `)})`));
      itemsToDispatch = itemsToDispatch.filter(i => i.dispatchStatus === 'not_dispatched' || i.dispatchStatus === 'pending_dispatch');
    } else {
      // No item_ids: dispatch all items marked pending_dispatch (from checkout), or fall back to all undispatched
      itemsToDispatch = await db.select().from(inspectionReportItems)
        .where(and(eq(inspectionReportItems.reportId, report.id), eq(inspectionReportItems.dispatchStatus, 'pending_dispatch')));
      if (itemsToDispatch.length === 0) {
        itemsToDispatch = await db.select().from(inspectionReportItems)
          .where(and(eq(inspectionReportItems.reportId, report.id), eq(inspectionReportItems.dispatchStatus, 'not_dispatched')));
        itemsToDispatch = itemsToDispatch.filter(i => i.severity !== 'informational');
      }
    }

    logger.info({ reportId: report.id, itemCount: itemsToDispatch.length, statuses: itemsToDispatch.map(i => i.dispatchStatus) }, '[inspect/dispatch] Items found to dispatch');

    if (itemsToDispatch.length === 0) {
      logger.warn({ reportId: report.id }, '[inspect/dispatch] No items to dispatch');
      res.json({ data: { dispatched: [], totalDispatched: 0 }, error: null, meta: {} });
      return;
    }

    // Record first action timestamp
    if (!report.clientFirstActionAt) {
      await db.update(inspectionReports).set({ clientFirstActionAt: new Date(), updatedAt: new Date() })
        .where(eq(inspectionReports.id, report.id));
    }

    const dispatched: Array<{ itemId: string; jobId: string }> = [];

    // Group items by category so each category becomes one job
    const actionableItems = itemsToDispatch.filter(i => i.dispatchStatus === 'not_dispatched' || i.dispatchStatus === 'pending_dispatch');
    const categoryGroups = new Map<string, typeof actionableItems>();
    for (const item of actionableItems) {
      const cat = item.category || 'general_repair';
      if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
      categoryGroups.get(cat)!.push(item);
    }

    for (const [category, items] of categoryGroups) {
      try {
        // Build a combined diagnosis for all items in this category
        const highestSeverity = items.some(i => i.severity === 'safety_hazard' || i.severity === 'urgent') ? 'high'
          : items.some(i => i.severity === 'recommended') ? 'medium' : 'low';

        const itemSummaries = items.map((item, idx) => {
          const photoDescs = (item.inspectorPhotos as string[] | null) ?? [];
          const photoStr = photoDescs.length ? ` [Photos: ${photoDescs.join('; ')}]` : '';
          return `${idx + 1}. ${item.title}${item.description ? ' — ' + item.description : ''}${photoStr}`;
        });

        const allPhotoDescs = items.flatMap(item => (item.inspectorPhotos as string[] | null) ?? []);

        // Generate a provider view token for the magic link
        const providerViewToken = crypto.randomBytes(24).toString('hex');
        const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
        const providerReportUrl = `${APP_URL}/inspect/provider/${providerViewToken}`;

        const diagnosis = {
          category,
          severity: highestSeverity,
          summary: `Inspection report: ${items.length} ${category.replace(/_/g, ' ')} item${items.length !== 1 ? 's' : ''} at ${report.propertyAddress}, ${report.propertyCity} ${report.propertyState}:\n${itemSummaries.join('\n')}\n\nSubmit your quote (per item or bundle): ${providerReportUrl}`,
          recommendedActions: items.map(i => `Address: ${i.title}`),
          source: 'inspection_report',
          inspectionReportId: report.id,
          inspectionItemIds: items.map(i => i.id),
          photoDescriptions: allPhotoDescs,
          providerViewToken,
        };

        // Budget range: sum of all items' estimates
        const totalLow = items.reduce((sum, i) => sum + (i.aiCostEstimateLowCents ?? 0), 0);
        const totalHigh = items.reduce((sum, i) => sum + (i.aiCostEstimateHighCents ?? 0), 0);
        const budgetStr = totalLow > 0 && totalHigh > 0
          ? `$${Math.round(totalLow / 100)}-$${Math.round(totalHigh / 100)}`
          : 'flexible';

        // homeowner_id is NOT NULL in jobs table — use report's homeowner or create a placeholder
        const homeownerId = report.homeownerId;
        if (!homeownerId) {
          logger.error({ reportId: report.id, category }, '[inspect/dispatch] No homeowner linked to report — cannot create job');
          continue;
        }

        const { jobs: jobsTable } = await import('../db/schema/jobs');
        const [job] = await db.insert(jobsTable).values({
          homeownerId,
          diagnosis: diagnosis as never,
          zipCode: report.propertyZip,
          preferredTiming: 'this_week',
          budget: budgetStr,
          tier: 'standard',
          status: 'dispatching',
          paymentStatus: 'paid',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }).returning({ id: jobsTable.id });

        // Update all items in this category group with the shared job ID
        for (const item of items) {
          await db.update(inspectionReportItems).set({
            dispatchStatus: 'dispatched',
            dispatchId: job.id,
            updatedAt: new Date(),
          }).where(eq(inspectionReportItems.id, item.id));
          dispatched.push({ itemId: item.id, jobId: job.id });
        }

        // Fire outreach asynchronously — one dispatch per category
        try {
          const { dispatchJob } = await import('../services/orchestration');
          void dispatchJob(job.id);
        } catch (dispatchErr) {
          logger.warn({ err: dispatchErr, jobId: job.id }, '[inspect/dispatch] Outreach dispatch failed');
        }

        logger.info({ jobId: job.id, category, itemCount: items.length }, '[inspect/dispatch] Category group dispatched');
      } catch (groupErr) {
        logger.error({ err: groupErr, category, itemCount: items.length }, '[inspect/dispatch] Failed to dispatch category group');
      }
    }

    // Update report stats
    const [{ value: totalDispatched }] = await db.select({ value: count() })
      .from(inspectionReportItems)
      .where(and(eq(inspectionReportItems.reportId, report.id), sql`${inspectionReportItems.dispatchStatus} != 'not_dispatched'`));

    await db.update(inspectionReports).set({
      itemsDispatched: totalDispatched,
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, report.id));

    // Create referral commission for the inspector
    if (report.inspectorPartnerId && dispatched.length > 0) {
      const commissionPerItem = Math.round(PER_ITEM_PRICE_CENTS * 0.175); // 17.5% average
      const totalCommission = commissionPerItem * dispatched.length;
      const now = new Date();
      const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      await db.insert(inspectorEarnings).values({
        inspectorPartnerId: report.inspectorPartnerId,
        reportId: report.id,
        earningType: 'referral_commission',
        amountCents: totalCommission,
        description: `Referral: ${dispatched.length} item${dispatched.length === 1 ? '' : 's'} dispatched from ${report.propertyAddress}`,
        periodMonth,
      });

      // Update report earnings total
      await db.update(inspectionReports).set({
        inspectorEarningsCents: sql`${inspectionReports.inspectorEarningsCents} + ${totalCommission}`,
      }).where(eq(inspectionReports.id, report.id));
    }

    res.json({
      data: { dispatched, totalDispatched: dispatched.length },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /inspect/:token/dispatch]');
    res.status(500).json({ data: null, error: 'Dispatch failed', meta: {} });
  }
});

// GET /api/v1/inspect/:token/documents/:docId/source-pdf — serves a supporting-document PDF
// (pest report / seller disclosure) using the report's clientAccessToken as auth, so it works
// when opened directly in a new tab (browser navigation doesn't send Authorization headers).
router.get('/:token/documents/:docId/source-pdf', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select({ id: inspectionReports.id })
      .from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token))
      .limit(1);
    if (!report) { res.status(404).send('Not found'); return; }

    const [doc] = await db.select({ documentFileUrl: inspectionSupportingDocuments.documentFileUrl })
      .from(inspectionSupportingDocuments)
      .where(and(
        eq(inspectionSupportingDocuments.id, req.params.docId),
        eq(inspectionSupportingDocuments.reportId, report.id),
      ))
      .limit(1);
    if (!doc || !doc.documentFileUrl) { res.status(404).send('Document not found'); return; }

    if (doc.documentFileUrl.startsWith('data:')) {
      const match = doc.documentFileUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) { res.status(500).send('Stored document is malformed'); return; }
      const mimeType = match[1] || 'application/pdf';
      const buffer = Buffer.from(match[2], 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(buffer);
      return;
    }
    res.redirect(doc.documentFileUrl);
  } catch (err) {
    logger.error({ err }, '[GET /inspect/:token/documents/:docId/source-pdf]');
    res.status(500).send('Failed to load document');
  }
});

// GET /api/v1/inspect/:token/source-pdf — serves the original source PDF for page citations.
// Uses the report's clientAccessToken as auth (no Authorization header needed, so it works
// when opened directly in a new tab). Handles both Cloudinary URLs and base64 data URLs.
router.get('/:token/source-pdf', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select({ reportFileUrl: inspectionReports.reportFileUrl })
      .from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token))
      .limit(1);

    if (!report || !report.reportFileUrl) {
      res.status(404).send('Source PDF not available');
      return;
    }

    // Data URL — decode and stream inline
    if (report.reportFileUrl.startsWith('data:')) {
      const match = report.reportFileUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) {
        res.status(500).send('Stored PDF is malformed');
        return;
      }
      const mimeType = match[1] || 'application/pdf';
      const buffer = Buffer.from(match[2], 'base64');
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(buffer);
      return;
    }

    // External URL (e.g. Cloudinary) — redirect. Browsers preserve the #page=N fragment.
    res.redirect(report.reportFileUrl);
  } catch (err) {
    logger.error({ err }, '[GET /inspect/:token/source-pdf]');
    res.status(500).send('Failed to load PDF');
  }
});

// GET /api/v1/inspect/:token/status — poll for quote updates
router.get('/:token/status', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token)).limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }

    const items = await db.select().from(inspectionReportItems)
      .where(eq(inspectionReportItems.reportId, report.id))
      .orderBy(inspectionReportItems.sortOrder);

    res.json({
      data: {
        itemsDispatched: report.itemsDispatched,
        itemsQuoted: report.itemsQuoted,
        totalQuoteValueCents: report.totalQuoteValueCents,
        items: items.map(i => ({
          id: i.id,
          dispatchStatus: i.dispatchStatus,
          quoteAmountCents: i.quoteAmountCents,
          providerName: i.providerName,
          providerRating: i.providerRating,
          providerAvailability: i.providerAvailability,
          quoteCount: Array.isArray(i.quotes) ? (i.quotes as unknown[]).length : 0,
          quotes: i.quotes ?? [],
        })),
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /inspect/:token/status]');
    res.status(500).json({ data: null, error: 'Failed to load status', meta: {} });
  }
});

// GET /api/v1/inspect/:token/pricing — returns pricing options for this report
router.get('/:token/pricing', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, req.params.token)).limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }

    const undispatchedItems = await db.select({ id: inspectionReportItems.id, severity: inspectionReportItems.severity })
      .from(inspectionReportItems)
      .where(and(eq(inspectionReportItems.reportId, report.id), eq(inspectionReportItems.dispatchStatus, 'not_dispatched')));

    const actionableItems = undispatchedItems.filter(i => i.severity !== 'informational');
    const bundlePrice = getBundlePrice(actionableItems.length);

    res.json({
      data: {
        perItemCents: PER_ITEM_PRICE_CENTS,
        bundlePriceCents: bundlePrice,
        bundleItemCount: actionableItems.length,
        perItemTotal: actionableItems.length * PER_ITEM_PRICE_CENTS,
        savings: (actionableItems.length * PER_ITEM_PRICE_CENTS) - bundlePrice,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /inspect/:token/pricing]');
    res.status(500).json({ data: null, error: 'Failed to load pricing', meta: {} });
  }
});

// ── Magic-link claim flow ──────────────────────────────────────────────────
// Used by the public token-based inspect view to convert anonymous viewers
// into homeowner accounts that own the report. Stateless JWT — no new tables.

interface ClaimTokenPayload { email: string; clientAccessToken: string; iat: number; exp: number }

const EMAIL_RE_CLAIM = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CLAIM_TOKEN_TTL = '15m';

// POST /api/v1/inspect/claim/request — emails a magic link that, when clicked,
// creates (or finds) a homeowner account and links the inspection report to it.
router.post('/claim/request', async (req: Request, res: Response) => {
  const body = req.body as { email?: string; clientAccessToken?: string };
  if (!body.email || !EMAIL_RE_CLAIM.test(body.email)) {
    res.status(400).json({ data: null, error: 'Valid email required', meta: {} });
    return;
  }
  if (!body.clientAccessToken) {
    res.status(400).json({ data: null, error: 'clientAccessToken required', meta: {} });
    return;
  }

  // Validate that the report exists (don't 404 — that leaks token validity)
  const [report] = await db.select({ id: inspectionReports.id, propertyAddress: inspectionReports.propertyAddress })
    .from(inspectionReports)
    .where(eq(inspectionReports.clientAccessToken, body.clientAccessToken))
    .limit(1);

  if (!report) {
    // Always return 200 so this endpoint can't be used to enumerate tokens
    res.json({ data: { sent: true }, error: null, meta: {} });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ data: null, error: 'Server misconfiguration', meta: {} });
    return;
  }

  const claimToken = jwt.sign(
    { email: body.email.toLowerCase().trim(), clientAccessToken: body.clientAccessToken },
    secret,
    { expiresIn: CLAIM_TOKEN_TTL, algorithm: 'HS256' },
  );

  const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
  const claimUrl = `${APP_URL}/inspect/claim?t=${claimToken}`;

  try {
    await sendEmail(
      body.email,
      `Unlock your Homie inspect report — ${report.propertyAddress}`,
      `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#F9F5F2">
        <div style="background:#2D2926;padding:20px 32px;text-align:center">
          <span style="color:#E8632B;font-size:24px;font-weight:bold;font-family:Georgia,serif">homie</span>
          <span style="color:rgba(255,255,255,0.5);font-size:12px;margin-left:8px">inspect</span>
        </div>
        <div style="background:white;padding:32px">
          <p style="color:#2D2926;font-size:18px;font-weight:600;margin:0 0 4px">Your report is ready</p>
          <p style="color:#9B9490;font-size:14px;margin:0 0 24px">${report.propertyAddress}</p>
          <p style="color:#6B6560;font-size:14px;line-height:1.6;margin:0 0 24px">
            Click below to view your full parsed inspection. The link expires in 15 minutes.
          </p>
          <div style="text-align:center;margin:24px 0">
            <a href="${claimUrl}" style="display:inline-block;background:#E8632B;color:white;padding:14px 36px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">View my report</a>
          </div>
          <p style="color:#9B9490;font-size:12px;margin:0;text-align:center">
            Didn't request this? You can safely ignore this email.
          </p>
        </div>
      </div>`,
    );
  } catch (err) {
    logger.error({ err }, '[POST /inspect/claim/request] Email send failed');
  }

  res.json({ data: { sent: true }, error: null, meta: {} });
});

// POST /api/v1/inspect/claim/now — link a token-accessed report to the
// already-authenticated homeowner. Used when a logged-in user lands on a token
// URL — skips the email round-trip since we already have their identity.
import { requireAuth } from '../middleware/auth';
router.post('/claim/now', requireAuth, async (req: Request, res: Response) => {
  const body = req.body as { clientAccessToken?: string };
  if (!body.clientAccessToken) {
    res.status(400).json({ data: null, error: 'clientAccessToken required', meta: {} });
    return;
  }
  try {
    const [report] = await db.select({ id: inspectionReports.id, homeownerId: inspectionReports.homeownerId })
      .from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, body.clientAccessToken))
      .limit(1);
    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    // First-claim-wins: don't overwrite an existing claim by another account.
    if (!report.homeownerId) {
      await db.update(inspectionReports)
        .set({ homeownerId: req.homeownerId })
        .where(eq(inspectionReports.id, report.id));
    }
    res.json({
      data: {
        reportId: report.id,
        alreadyClaimed: !!report.homeownerId && report.homeownerId !== req.homeownerId,
        ownedByYou: !report.homeownerId || report.homeownerId === req.homeownerId,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /inspect/claim/now]');
    res.status(500).json({ data: null, error: 'Failed to claim report', meta: {} });
  }
});

// POST /api/v1/inspect/claim/verify — exchanges a claim token for an auth JWT.
// Creates the homeowner account if needed, links the inspection report to them.
router.post('/claim/verify', async (req: Request, res: Response) => {
  const body = req.body as { claimToken?: string };
  if (!body.claimToken) {
    res.status(400).json({ data: null, error: 'claimToken required', meta: {} });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ data: null, error: 'Server misconfiguration', meta: {} });
    return;
  }

  let payload: ClaimTokenPayload;
  try {
    payload = jwt.verify(body.claimToken, secret, { algorithms: ['HS256'] }) as ClaimTokenPayload;
  } catch {
    res.status(401).json({ data: null, error: 'This link has expired or is invalid. Request a new one.', meta: {} });
    return;
  }

  try {
    // Find or create the homeowner. New homeowners get a random password hash
    // (they always log in via magic link until they choose to set a password).
    let [homeowner] = await db.select()
      .from(homeowners)
      .where(eq(homeowners.email, payload.email))
      .limit(1);

    if (!homeowner) {
      const randomPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);
      [homeowner] = await db.insert(homeowners).values({
        email: payload.email,
        passwordHash: randomPasswordHash,
        firstName: null,
        lastName: null,
        zipCode: '',
        emailVerified: true,
      }).returning();
    }

    // Link the inspection report to this homeowner if it isn't already
    const [report] = await db.select({ id: inspectionReports.id, homeownerId: inspectionReports.homeownerId })
      .from(inspectionReports)
      .where(eq(inspectionReports.clientAccessToken, payload.clientAccessToken))
      .limit(1);

    let reportId: string | null = null;
    if (report) {
      reportId = report.id;
      // Don't overwrite an existing claim by another account; first-claim-wins.
      if (!report.homeownerId) {
        await db.update(inspectionReports)
          .set({ homeownerId: homeowner.id })
          .where(eq(inspectionReports.id, report.id));
      }
    }

    // Auto-bind any OTHER reports this homeowner should see based on
    // email — primary client on a different report, OR a CC recipient
    // somewhere. Fire-and-forget; never blocks the claim flow.
    void (async () => {
      try {
        const { autoBindReportsToHomeowner } = await import('../services/inspection-report-claim');
        await autoBindReportsToHomeowner(homeowner.id, homeowner.email);
      } catch (err) { logger.warn({ err }, '[inspect/claim/verify] report auto-bind hook failed (non-fatal)'); }
    })();

    const authToken = signToken(homeowner.id);

    res.json({
      data: {
        token: authToken,
        homeowner: {
          id: homeowner.id,
          first_name: homeowner.firstName,
          last_name: homeowner.lastName,
          email: homeowner.email,
          zip_code: homeowner.zipCode,
          membership_tier: 'free',
        },
        reportId,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /inspect/claim/verify]');
    res.status(500).json({ data: null, error: 'Failed to verify claim', meta: {} });
  }
});

export default router;

// ── Async parsing helper ──────────────────────────────────────────────────

export async function parseInspectionReportAsync(reportId: string): Promise<void> {
  try {
    const [report] = await db.select().from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1);
    if (!report || !report.reportFileUrl) return;

    await db.update(inspectionReports).set({ parsingStatus: 'processing' }).where(eq(inspectionReports.id, reportId));

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await db.update(inspectionReports).set({ parsingStatus: 'failed', parsingError: 'AI service not configured' }).where(eq(inspectionReports.id, reportId));
      return;
    }

    const client = new Anthropic({ apiKey });

    // Get the file as a buffer + content type
    let buffer: Buffer;
    let contentType = '';

    try {
      if (report.reportFileUrl.startsWith('data:')) {
        const commaIdx = report.reportFileUrl.indexOf(',');
        if (commaIdx === -1) throw new Error('Invalid data URL format');
        const meta = report.reportFileUrl.slice(0, commaIdx);
        const base64Data = report.reportFileUrl.slice(commaIdx + 1);
        contentType = meta.replace(/^data:/, '').replace(/;base64$/, '');
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        const fileRes = await fetch(report.reportFileUrl);
        if (!fileRes.ok) throw new Error(`Failed to download report: ${fileRes.status}`);
        contentType = fileRes.headers.get('content-type') || '';
        buffer = Buffer.from(await fileRes.arrayBuffer());
      }
    } catch (dlErr) {
      const errMsg = (dlErr as Error).message ?? String(dlErr);
      logger.error({ err: errMsg, reportId }, '[inspector] Failed to get report file');
      await db.update(inspectionReports).set({ parsingStatus: 'failed', parsingError: `File download failed: ${errMsg}` }).where(eq(inspectionReports.id, reportId));
      return;
    }

    logger.info({ reportId, contentType, bufferLength: buffer.length }, '[inspector] Got report file');

    // Build the message content — use Claude's native document support for PDFs
    const isPdf = contentType.includes('pdf');
    const base64File = buffer.toString('base64');

    type ContentBlock = { type: 'document'; source: { type: 'base64'; media_type: string; data: string } }
      | { type: 'text'; text: string };
    const userContent: ContentBlock[] = [];

    if (isPdf) {
      // Send the PDF directly to Claude Vision — it sees layout, photos, tables, everything
      userContent.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64File },
      });
    } else {
      // HTML or other: extract text as fallback
      let reportText = buffer.toString('utf-8');
      if (contentType.includes('html')) {
        reportText = reportText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
      if (reportText.length > 100000) {
        reportText = reportText.slice(0, 100000) + '\n[truncated]';
      }
      userContent.push({ type: 'text', text: `--- BEGIN REPORT ---\n${reportText}\n--- END REPORT ---` });
    }

    userContent.push({
      type: 'text',
      text: `Analyze this inspection report for the property at ${report.propertyAddress}, ${report.propertyCity}, ${report.propertyState} ${report.propertyZip}.\nInspection type: ${report.inspectionType}. Date: ${report.inspectionDate}.\n\nExtract all actionable items as a JSON array.`,
    });

    const systemPrompt = `You are analyzing a home inspection report. Extract every deficiency, concern, or recommended repair item. For each item, provide:
- title: a concise description (under 80 characters)
- description: the full inspector's notes for this item, including what is visible in any associated photos
- photo_descriptions: an array of strings describing each photo associated with this item (e.g. "Close-up of corroded copper pipe joint under kitchen sink showing green patina and active drip"). If no photos are associated, return an empty array []. Be specific about what the photo shows — a contractor will use this description to understand the issue without seeing the photo.
- category: one of [plumbing, electrical, hvac, roofing, structural, general_repair, pest_control, safety, cosmetic, landscaping, appliance, insulation, foundation, windows_doors, fireplace]
- severity: one of [safety_hazard, urgent, recommended, monitor, informational]
- location_in_property: where in the property this issue exists
- cost_estimate_low: low end cost estimate in dollars based on typical repair costs in ${report.propertyCity || 'the area'}, ${report.propertyState || 'US'}
- cost_estimate_high: high end cost estimate in dollars
- confidence: your confidence (0.0-1.0) that you've correctly identified and categorized this item
- source_pages: array of 1-indexed page numbers in this PDF where this item appears (e.g. [5] or [5, 6] if the item spans pages). Use the PDF's own page numbering — the first page is 1. Return an empty array [] if you cannot determine the page.

Rules:
- Only extract items that require action (repair, replacement, further evaluation, or monitoring)
- Do NOT extract items noted as functional, satisfactory, or within normal parameters
- Separate compound items: if the inspector found issues in multiple locations, note the primary location
- Cost estimates should reflect the local market
- Safety hazards: electrical hazards, gas leaks, structural failures, fire risks, CO risks, fall hazards
- Urgent: active leaks, non-functioning critical systems, significant roof/structural damage
- Recommended: items to address within 6-12 months
- Monitor: items to watch that may need future attention
- Informational: included sparingly for awareness only
- For photo_descriptions: describe what is physically visible in each photo related to this item. Include details about condition, damage, location, and any visible brand/model info. If a photo shows multiple issues, include the description under each relevant item.

Return a JSON object with two keys:
- "property": an object with { "address", "city", "state", "zip", "inspection_date", "year_built" } extracted from the report header/cover page. The year_built is a 4-digit integer (e.g. 1987) — inspection reports almost always state this on page 1 or 2, often labeled "Year Built", "Year of Construction", or "Built". Use null for any field you cannot find.
- "items": the array of deficiency items described above.

No preamble, no markdown code fences. Return ONLY the JSON object.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent as never }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      await db.update(inspectionReports).set({ parsingStatus: 'failed', parsingError: 'AI returned no text' }).where(eq(inspectionReports.id, reportId));
      return;
    }

    let raw = textBlock.text.trim();
    logger.info({ reportId, rawResponseLength: raw.length, rawPreview: raw.slice(0, 500) }, '[inspector] AI response received');

    // Extract JSON from response — handle markdown fences, preamble text, etc.
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

    // Find the outermost JSON structure (object or array)
    const objStart = raw.indexOf('{');
    const arrStart = raw.indexOf('[');
    let jsonStr: string;
    if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
      // Object format: { property: ..., items: [...] }
      const objEnd = raw.lastIndexOf('}');
      jsonStr = objEnd > objStart ? raw.slice(objStart, objEnd + 1) : raw;
    } else if (arrStart !== -1) {
      // Legacy array format: [...]
      const arrEnd = raw.lastIndexOf(']');
      jsonStr = arrEnd > arrStart ? raw.slice(arrStart, arrEnd + 1) : raw;
    } else {
      jsonStr = raw;
    }

    type ParsedItem = {
      title: string; description?: string; photo_descriptions?: string[]; category: string; severity: string;
      location_in_property?: string; cost_estimate_low?: number; cost_estimate_high?: number; confidence?: number;
      source_pages?: number[];
    };
    let parsedItems: ParsedItem[];
    let extractedProperty: { address?: string; city?: string; state?: string; zip?: string; inspection_date?: string; year_built?: number | string } | null = null;

    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        parsedItems = parsed;
      } else if (parsed.items && Array.isArray(parsed.items)) {
        parsedItems = parsed.items;
        extractedProperty = parsed.property ?? null;
      } else {
        parsedItems = [];
      }
    } catch {
      // Try to repair truncated JSON
      const lastComplete = jsonStr.lastIndexOf('},');
      if (lastComplete > 0) {
        // Find the items array start
        const itemsStart = jsonStr.indexOf('"items"');
        const arrOpen = itemsStart !== -1 ? jsonStr.indexOf('[', itemsStart) : jsonStr.indexOf('[');
        if (arrOpen !== -1 && lastComplete > arrOpen) {
          const repaired = jsonStr.slice(arrOpen, lastComplete + 1) + ']';
          try {
            parsedItems = JSON.parse(repaired);
            logger.info({ reportId, repairedCount: parsedItems.length }, '[inspector] Repaired truncated JSON');
          } catch {
            await db.update(inspectionReports).set({ parsingStatus: 'failed', parsingError: 'AI response was truncated and could not be repaired' }).where(eq(inspectionReports.id, reportId));
            return;
          }
        } else {
          await db.update(inspectionReports).set({ parsingStatus: 'failed', parsingError: 'Failed to parse AI response' }).where(eq(inspectionReports.id, reportId));
          return;
        }
      } else {
        logger.warn({ reportId, rawTail: jsonStr.slice(-200) }, '[inspector] JSON parse failed');
        await db.update(inspectionReports).set({ parsingStatus: 'failed', parsingError: 'Failed to parse AI response' }).where(eq(inspectionReports.id, reportId));
        return;
      }
    }

    // Update report with extracted property info if the report has placeholder data
    if (extractedProperty) {
      const updates: Record<string, unknown> = {};
      if (extractedProperty.address && (!report.propertyAddress || report.propertyAddress === 'Address pending')) {
        updates.propertyAddress = extractedProperty.address;
      }
      if (extractedProperty.city && !report.propertyCity) updates.propertyCity = extractedProperty.city;
      if (extractedProperty.state && !report.propertyState) updates.propertyState = extractedProperty.state;
      if (extractedProperty.zip && !report.propertyZip) updates.propertyZip = extractedProperty.zip;
      if (extractedProperty.inspection_date && report.inspectionDate === new Date().toISOString().slice(0, 10)) {
        updates.inspectionDate = extractedProperty.inspection_date;
      }
      // Year built — accept either an int or a numeric string. Bound to a
      // sane range so a hallucinated 19 or 20000 doesn't poison cohort math.
      if (extractedProperty.year_built != null) {
        const yb = typeof extractedProperty.year_built === 'number'
          ? extractedProperty.year_built
          : parseInt(String(extractedProperty.year_built), 10);
        if (Number.isFinite(yb) && yb >= 1700 && yb <= new Date().getFullYear() + 1) {
          updates.yearBuilt = yb;
        }
      }
      if (Object.keys(updates).length > 0) {
        updates.updatedAt = new Date();
        await db.update(inspectionReports).set(updates).where(eq(inspectionReports.id, reportId));
        logger.info({ reportId, updates: Object.keys(updates) }, '[inspector] Updated report with extracted property info');
      }
    }

    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      await db.update(inspectionReports).set({ parsingStatus: 'failed', parsingError: 'No actionable items found in this report' }).where(eq(inspectionReports.id, reportId));
      return;
    }

    // Insert items
    let hasLowConfidence = false;
    for (let i = 0; i < parsedItems.length; i++) {
      const item = parsedItems[i];
      const confidence = Math.min(1, Math.max(0, item.confidence ?? 0.8));
      if (confidence < 0.7) hasLowConfidence = true;
      await db.insert(inspectionReportItems).values({
        reportId,
        title: item.title,
        description: item.description || null,
        category: item.category || 'general_repair',
        severity: item.severity || 'recommended',
        locationInProperty: item.location_in_property || null,
        inspectorPhotos: item.photo_descriptions?.length ? item.photo_descriptions : null,
        aiCostEstimateLowCents: Math.round((item.cost_estimate_low ?? 0) * 100),
        aiCostEstimateHighCents: Math.round((item.cost_estimate_high ?? 0) * 100),
        aiConfidence: confidence.toFixed(2),
        sourcePages: item.source_pages?.length ? item.source_pages.filter(p => Number.isInteger(p) && p > 0) : null,
        sortOrder: i,
      });
    }

    // Keep reportFileUrl (both Cloudinary URLs and data URL fallback) so page citations
    // and PDF re-access work later. Data URLs can be large but they're a fallback when
    // Cloudinary uploads fail — losing them breaks features that reference the source PDF.
    await db.update(inspectionReports).set({
      itemsParsed: parsedItems.length,
      parsingStatus: hasLowConfidence ? 'review_pending' : 'parsed',
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, reportId));

    logger.info({ reportId, itemCount: parsedItems.length, hasLowConfidence }, '[inspector] Report parsed successfully');

    // ── Geocode the address (best-effort) ──
    // Populates county_fips + census_tract + lat/lon so Home IQ panels
    // can look up FEMA flood zones, EPA radon zones, and AHS regional
    // cohorts. Failures are non-fatal — the report is already saved as
    // parsed, and Home IQ will just skip geo-dependent panels if these
    // columns stay null.
    void (async () => {
      try {
        const [fresh] = await db.select({
          address: inspectionReports.propertyAddress,
          city: inspectionReports.propertyCity,
          state: inspectionReports.propertyState,
          zip: inspectionReports.propertyZip,
        }).from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1);
        if (!fresh) return;
        const { geocodeAddress } = await import('../services/geocoding');
        const geo = await geocodeAddress(fresh.address, fresh.city, fresh.state, fresh.zip);
        if (geo) {
          await db.update(inspectionReports).set({
            countyFips: geo.countyFips,
            censusTract: geo.censusTract,
            latitude: String(geo.latitude),
            longitude: String(geo.longitude),
            updatedAt: new Date(),
          }).where(eq(inspectionReports.id, reportId));
          logger.info({ reportId, countyFips: geo.countyFips }, '[inspector] Geocoded address');
        }
      } catch (geoErr) {
        logger.warn({ err: geoErr, reportId }, '[inspector] Geocoding failed (non-fatal)');
      }
    })();

    // ── No auto-email to the homeowner ──
    // The inspector controls when (and to whom) the homeowner email
    // goes via the Send-to-Client modal — they may want to bulk-edit
    // parsing mistakes, add CC recipients (spouse, agent), or fix the
    // primary client name/email before the report leaves their portal.
    // The historic auto-send was removed once that modal landed.
    // sendParsedReportToHomeowner() is left in place as orphan
    // infrastructure in case we need a one-off send path later, but
    // nothing calls it from the parse pipeline anymore.

    // ── Notify the inspector that their report is ready ──
    // After the inspector pays at upload time we now route them to the
    // reports list (showing a "processing" status badge). They walk away;
    // this email is the prompt to come back, review items, and hit "Send
    // to Client". Best-effort — failure here is logged but doesn't unwind
    // the parser.
    void (async () => {
      try {
        const [row] = await db.select({
          itemCount: inspectionReports.itemsParsed,
          propertyAddress: inspectionReports.propertyAddress,
          propertyCity: inspectionReports.propertyCity,
          propertyState: inspectionReports.propertyState,
          inspectorEmail: inspectorPartners.email,
          inspectorCompanyName: inspectorPartners.companyName,
        })
          .from(inspectionReports)
          .leftJoin(inspectorPartners, eq(inspectionReports.inspectorPartnerId, inspectorPartners.id))
          .where(eq(inspectionReports.id, reportId))
          .limit(1);
        if (!row || !row.inspectorEmail) return;

        const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
        const detailUrl = `${APP_URL}/inspector/reports/${reportId}`;
        const status = hasLowConfidence ? 'ready (with items flagged for review)' : 'ready to send';
        const subject = `Your inspection report is ${hasLowConfidence ? 'ready for review' : 'ready to send'}`;
        const html = `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:0;background:#F9F5F2">
            <div style="background:#2D2926;padding:20px 32px;text-align:center">
              <span style="color:#E8632B;font-size:24px;font-weight:bold;font-family:Georgia,serif">homie</span>
              <span style="color:rgba(255,255,255,0.5);font-size:12px;margin-left:8px">inspect</span>
            </div>
            <div style="background:white;padding:32px">
              <p style="color:#2D2926;font-size:18px;font-weight:600;margin:0 0 4px">Your report is ${status}</p>
              <p style="color:#9B9490;font-size:14px;margin:0 0 24px">${row.itemCount ?? parsedItems.length} items parsed</p>
              <div style="background:#F9F5F2;border-radius:12px;padding:20px;margin-bottom:24px">
                <p style="color:#2D2926;font-size:15px;margin:0 0 8px"><strong>${row.propertyAddress}</strong></p>
                <p style="color:#6B6560;font-size:14px;margin:0">${row.propertyCity}, ${row.propertyState}</p>
              </div>
              ${hasLowConfidence ? `<p style="color:#8B6F00;background:#FFF8E6;border:1px solid #F4D87A;border-radius:8px;padding:10px 12px;font-size:13px;margin:0 0 18px">Some items came back with low AI confidence and are pinned for review at the top of the items list.</p>` : ''}
              <div style="text-align:center">
                <a href="${detailUrl}" style="display:inline-block;background:#E8632B;color:white;padding:14px 36px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">Review &amp; send to client &rarr;</a>
              </div>
              <p style="color:#9B9490;font-size:12px;text-align:center;margin-top:16px">Bulk-edit severity or category if anything looks off, then hit Send to Client.</p>
            </div>
          </div>`;
        const { sendEmail } = await import('../services/notifications');
        await sendEmail(row.inspectorEmail, subject, html);
        logger.info({ reportId, inspectorEmail: row.inspectorEmail }, '[inspector] Parse-complete notification sent');
      } catch (notifyErr) {
        logger.warn({ err: notifyErr, reportId }, '[inspector] Parse-complete notification failed (non-fatal)');
      }
    })();
  } catch (err) {
    logger.error({ err, reportId }, '[inspector] Report parsing failed');
    // ── Retry once, then auto-refund ──
    // Read the current retry count + payment intent so we can decide:
    // first failure → bump retry_count, kick the parser again with a
    // small delay; second failure → mark failed and refund the
    // wholesale fee. Inspector isn't paying for compute that didn't
    // deliver, no manual ops involvement needed.
    try {
      const [row] = await db.select({
        parseRetryCount: inspectionReports.parseRetryCount,
        stripePaymentIntentId: inspectionReports.stripePaymentIntentId,
        paymentStatus: inspectionReports.paymentStatus,
      }).from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1);

      const nextCount = (row?.parseRetryCount ?? 0) + 1;
      await db.update(inspectionReports).set({
        parseRetryCount: nextCount,
        updatedAt: new Date(),
      }).where(eq(inspectionReports.id, reportId));

      if (nextCount === 1) {
        // First failure — flip back to processing + retry after a
        // 30-second wait so transient Claude errors / rate-limits
        // settle. Status stays 'processing' so the inspector UI keeps
        // showing the spinner instead of a scary "failed".
        await db.update(inspectionReports).set({
          parsingStatus: 'processing',
          parsingError: `Retrying after error: ${(err as Error).message}`,
          updatedAt: new Date(),
        }).where(eq(inspectionReports.id, reportId));
        setTimeout(() => {
          void parseInspectionReportAsync(reportId).catch(retryErr =>
            logger.error({ err: retryErr, reportId }, '[inspector] Retry parse failed'),
          );
        }, 30_000);
        logger.warn({ reportId }, '[inspector] Parse failed once — retrying in 30s');
      } else {
        // Second failure — mark failed and auto-refund.
        await db.update(inspectionReports).set({
          parsingStatus: 'failed',
          parsingError: (err as Error).message,
          updatedAt: new Date(),
        }).where(eq(inspectionReports.id, reportId));
        if (row?.paymentStatus === 'paid' && row.stripePaymentIntentId) {
          try {
            const { refundPaymentInFull } = await import('../services/stripe');
            await refundPaymentInFull(row.stripePaymentIntentId, `Auto-refund: parsing failed twice for report ${reportId}`);
            await db.update(inspectionReports).set({
              paymentStatus: 'refunded',
              updatedAt: new Date(),
            }).where(eq(inspectionReports.id, reportId));
            logger.info({ reportId }, '[inspector] Parse failed twice — auto-refunded');
          } catch (refundErr) {
            logger.error({ err: refundErr, reportId }, '[inspector] Auto-refund failed (manual ops needed)');
          }
        }
      }
    } catch (handlerErr) {
      logger.error({ err: handlerErr, reportId }, '[inspector] Failure-handler crashed');
      // Best-effort fallback to the legacy behavior so the row doesn't
      // get stuck in 'processing'.
      await db.update(inspectionReports).set({
        parsingStatus: 'failed',
        parsingError: (err as Error).message,
      }).where(eq(inspectionReports.id, reportId));
    }
  }
}

/** Send the parsed report to the homeowner whose contact info the
 *  inspector entered at upload. Idempotent on the homeownerEmailedAt
 *  column so a double-fire (e.g. retry path that succeeds the second
 *  time) only emails once. The email body includes a 1×1 tracking
 *  pixel that pings /api/v1/inspect/track-open/:reportId.png to flip
 *  homeownerOpenedAt — drives the 5-day reminder sweep. */
export async function sendParsedReportToHomeowner(reportId: string): Promise<void> {
  const [report] = await db.select().from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1);
  if (!report) return;
  if (!report.clientEmail) return;
  if (report.homeownerEmailedAt) return; // already emailed
  if (report.parsingStatus !== 'parsed' && report.parsingStatus !== 'review_pending') return;

  const [inspector] = await db.select({
    companyName: inspectorPartners.companyName,
  }).from(inspectorPartners).where(eq(inspectorPartners.id, report.inspectorPartnerId!)).limit(1);
  const fromCompany = inspector?.companyName ?? 'your inspector';

  const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
  const reportUrl = `${APP_URL}/inspect/${report.clientAccessToken}`;
  const trackingPixel = `${APP_URL.replace(/^http/, process.env.NODE_ENV === 'production' ? 'https' : 'http')}/api/v1/inspect/track-open/${report.id}.png`;

  const subject = `Your Homie inspection report from ${fromCompany} is ready`;
  const greeting = report.clientName ? `Hi ${report.clientName.split(' ')[0]},` : 'Hi,';
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2D2926;">
      <h2 style="font-family:Georgia,serif;font-size:22px;margin:0 0 12px;">Your Homie report is ready</h2>
      <p style="font-size:15px;line-height:1.5;color:#6B6560;">${greeting}</p>
      <p style="font-size:15px;line-height:1.5;color:#6B6560;">
        ${fromCompany} just sent you a parsed copy of your inspection report through Homie. We've
        broken it down into individual maintenance items, added AI cost estimates for each, and made
        it shareable with contractors so you can get real quotes in minutes — not days.
      </p>
      <p style="text-align:center;margin:28px 0;">
        <a href="${reportUrl}" style="display:inline-block;background:#E8632B;color:#fff;text-decoration:none;padding:14px 28px;border-radius:100px;font-weight:600;font-size:15px;">View your report &rarr;</a>
      </p>
      <p style="font-size:13px;color:#9B9490;line-height:1.5;">
        This link is private to you and stays active for 90 days. If you have questions about
        the inspection itself, reach out to ${fromCompany} directly.
      </p>
      <img src="${trackingPixel}" width="1" height="1" alt="" style="display:block;border:0;" />
    </div>
  `.trim();

  await sendEmail(report.clientEmail, subject, html);
  await db.update(inspectionReports).set({
    homeownerEmailedAt: new Date(),
    clientNotifiedAt: new Date(), // legacy column kept in sync for back-compat
    updatedAt: new Date(),
  }).where(eq(inspectionReports.id, report.id));
  logger.info({ reportId, email: report.clientEmail }, '[inspector] Parsed report emailed to homeowner');
}
