import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq, desc, and, sql, count } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import {
  inspectorPartners,
  inspectionReports,
  inspectionReportItems,
  inspectorEarnings,
  inspectorPayouts,
  inspectorInboundLeads,
} from '../db/schema/inspector';
import { requireInspectorAuth, signInspectorToken } from '../middleware/inspector-auth';
import { optionalAuth } from '../middleware/auth';

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
router.post('/reports', requireInspectorAuth, async (req: Request, res: Response) => {
  const body = req.body as {
    property_address: string; property_city: string; property_state: string; property_zip: string;
    client_name: string; client_email: string; client_phone?: string;
    inspection_date: string; inspection_type?: string;
    report_file_data_url?: string; // base64 data URL for the report file
  };

  if (!body.property_address || !body.client_name || !body.client_email || !body.inspection_date) {
    res.status(400).json({ data: null, error: 'property_address, client_name, client_email, and inspection_date are required', meta: {} });
    return;
  }

  try {
    const clientAccessToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

    // Upload report file to Cloudinary if provided
    let reportFileUrl: string | null = null;
    if (body.report_file_data_url) {
      try {
        const { uploadImage } = await import('../services/image-upload');
        const result = await uploadImage(body.report_file_data_url, 'homie/inspection-reports');
        if (result) reportFileUrl = result.url;
      } catch (err) {
        logger.warn({ err }, '[inspector/reports] Report file upload failed');
      }
    }

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
      parsingStatus: reportFileUrl ? 'processing' : 'uploading',
      clientAccessToken,
      expiresAt,
    }).returning();

    // Kick off async parsing if file was uploaded
    if (reportFileUrl) {
      void parseInspectionReportAsync(report.id).catch(err =>
        logger.error({ err, reportId: report.id }, '[inspector/reports] Async parsing failed'),
      );
    }

    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const clientAccessUrl = `${APP_URL}/inspect/${clientAccessToken}`;

    res.status(201).json({
      data: { ...report, clientAccessUrl },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/reports]');
    res.status(500).json({ data: null, error: 'Failed to create report', meta: {} });
  }
});

// GET /api/v1/inspector/reports — list reports
router.get('/reports', requireInspectorAuth, async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;
  try {
    const reports = await db.select().from(inspectionReports)
      .where(eq(inspectionReports.inspectorPartnerId, req.inspectorId))
      .orderBy(desc(inspectionReports.createdAt))
      .limit(limit).offset(offset);
    const [{ value: total }] = await db.select({ value: count() }).from(inspectionReports)
      .where(eq(inspectionReports.inspectorPartnerId, req.inspectorId));
    res.json({ data: reports, error: null, meta: { total, limit, offset } });
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
    res.json({ data: { ...report, items, earnings }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /inspector/reports/:id]');
    res.status(500).json({ data: null, error: 'Failed to load report', meta: {} });
  }
});

// POST /api/v1/inspector/reports/:id/send-to-client
router.post('/reports/:id/send-to-client', requireInspectorAuth, async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.id), eq(inspectionReports.inspectorPartnerId, req.inspectorId)))
      .limit(1);
    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }
    if (report.parsingStatus !== 'parsed' && report.parsingStatus !== 'review_pending') {
      res.status(400).json({ data: null, error: `Report must be parsed before sending (current: ${report.parsingStatus})`, meta: {} });
      return;
    }

    const [inspector] = await db.select({ companyName: inspectorPartners.companyName, companyLogoUrl: inspectorPartners.companyLogoUrl })
      .from(inspectorPartners).where(eq(inspectorPartners.id, req.inspectorId)).limit(1);

    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const clientUrl = `${APP_URL}/inspect/${report.clientAccessToken}`;

    // Send email to client
    try {
      const { sendEmail } = await import('../services/notifications');
      const html = `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:0;background:#F9F5F2">
        <div style="background:#2D2926;padding:20px 32px;text-align:center">
          <span style="color:#E8632B;font-size:24px;font-weight:bold;font-family:Georgia,serif">homie</span>
          <span style="color:rgba(255,255,255,0.5);font-size:12px;margin-left:8px">inspect</span>
        </div>
        <div style="background:white;padding:32px">
          <p style="color:#2D2926;font-size:18px;font-weight:600;margin:0 0 4px">Your inspection report is ready</p>
          <p style="color:#9B9490;font-size:14px;margin:0 0 24px">from ${inspector?.companyName ?? 'your inspector'}</p>
          <div style="background:#F9F5F2;border-radius:12px;padding:20px;margin-bottom:24px">
            <p style="color:#2D2926;font-size:15px;margin:0 0 8px"><strong>${report.propertyAddress}</strong></p>
            <p style="color:#6B6560;font-size:14px;margin:0">${report.itemsParsed} items found · Inspected ${new Date(report.inspectionDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
          </div>
          <div style="text-align:center">
            <a href="${clientUrl}" style="display:inline-block;background:#E8632B;color:white;padding:14px 36px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">View Report & Get Quotes</a>
          </div>
          <p style="color:#9B9490;font-size:12px;text-align:center;margin-top:16px">Get real quotes from local pros for every item — not estimates, actuals.</p>
        </div>
      </div>`;
      await sendEmail(report.clientEmail, `Your inspection report from ${inspector?.companyName ?? 'your inspector'} is ready`, html);
    } catch (err) {
      logger.warn({ err }, '[inspector/send-to-client] Email send failed');
    }

    await db.update(inspectionReports).set({
      parsingStatus: 'sent_to_client',
      clientNotifiedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, report.id));

    res.json({ data: { sent: true, clientAccessUrl: clientUrl }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /inspector/reports/:id/send-to-client]');
    res.status(500).json({ data: null, error: 'Failed to send report', meta: {} });
  }
});

// ── Item CRUD ─────────────────────────────────────────────────────────────

// PUT /api/v1/inspector/reports/:id/items/:itemId — edit a parsed item
router.put('/reports/:id/items/:itemId', requireInspectorAuth, async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  try {
    const [item] = await db.select().from(inspectionReportItems).where(eq(inspectionReportItems.id, req.params.itemId)).limit(1);
    if (!item) { res.status(404).json({ data: null, error: 'Item not found', meta: {} }); return; }
    const updates: Record<string, unknown> = { inspectorAdjusted: true, updatedAt: new Date() };
    for (const key of ['title', 'description', 'category', 'severity', 'locationInProperty', 'aiCostEstimateLowCents', 'aiCostEstimateHighCents']) {
      const snakeKey = key.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`);
      if (body[key] !== undefined) updates[key] = body[key];
      if (body[snakeKey] !== undefined) updates[key] = body[snakeKey];
    }
    const [updated] = await db.update(inspectionReportItems).set(updates).where(eq(inspectionReportItems.id, req.params.itemId)).returning();
    res.json({ data: updated, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PUT /inspector/reports/:id/items/:itemId]');
    res.status(500).json({ data: null, error: 'Failed to update item', meta: {} });
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

// ── Client-facing (token-based, no auth) ──────────────────────────────────

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
          quoteDetails: i.quoteAmountCents ? {
            providerName: i.providerName ?? 'Provider',
            providerRating: parseFloat(i.providerRating ?? '0'),
            price: i.quoteAmountCents / 100,
            availability: i.providerAvailability ?? '',
          } : null,
          valueImpact: computeValueImpact(i.category, i.severity, i.aiCostEstimateLowCents, i.aiCostEstimateHighCents),
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
      metadata: {
        report_id: report.id,
        token: req.params.token,
        mode,
        item_count: String(itemsToDispatch.length),
        inspector_partner_id: report.inspectorPartnerId ?? '',
      },
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
          summary: `Inspection report — ${items.length} ${category.replace(/_/g, ' ')} item${items.length !== 1 ? 's' : ''} at ${report.propertyAddress}, ${report.propertyCity} ${report.propertyState}:\n${itemSummaries.join('\n')}\n\nView full details & photos: ${providerReportUrl}`,
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

export default router;

// ── Async parsing helper ──────────────────────────────────────────────────

async function parseInspectionReportAsync(reportId: string): Promise<void> {
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
- "property": an object with { "address", "city", "state", "zip", "inspection_date" } extracted from the report header/cover page. Use null for any field you cannot find.
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
    };
    let parsedItems: ParsedItem[];
    let extractedProperty: { address?: string; city?: string; state?: string; zip?: string; inspection_date?: string } | null = null;

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
        sortOrder: i,
      });
    }

    // Clear data URL from DB after successful parse to avoid bloat
    const isDataUrl = report.reportFileUrl?.startsWith('data:');
    await db.update(inspectionReports).set({
      itemsParsed: parsedItems.length,
      parsingStatus: hasLowConfidence ? 'review_pending' : 'parsed',
      ...(isDataUrl ? { reportFileUrl: null } : {}),
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, reportId));

    logger.info({ reportId, itemCount: parsedItems.length, hasLowConfidence }, '[inspector] Report parsed successfully');
  } catch (err) {
    logger.error({ err, reportId }, '[inspector] Report parsing failed');
    await db.update(inspectionReports).set({
      parsingStatus: 'failed',
      parsingError: (err as Error).message,
    }).where(eq(inspectionReports.id, reportId));
  }
}
