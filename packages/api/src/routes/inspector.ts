import { Router, Request, Response } from 'express';
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
  const allowed = ['companyName', 'companyLogoUrl', 'website', 'phone', 'licenseNumber', 'certifications', 'serviceAreaZips', 'inspectionSoftware', 'addonPriceCents', 'acceptsInboundLeads', 'payoutMethod', 'partnerSlug'];
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
    addon_sold?: boolean; addon_price_cents?: number;
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
      addonSold: body.addon_sold || false,
      addonPriceCents: body.addon_price_cents || null,
      parsingStatus: reportFileUrl ? 'processing' : 'uploading',
      clientAccessToken,
      expiresAt,
    }).returning();

    // If addon was sold, create the earnings record (60% of addon price)
    if (body.addon_sold && body.addon_price_cents) {
      const earningAmount = Math.round(body.addon_price_cents * 0.6);
      const now = new Date();
      const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      await db.insert(inspectorEarnings).values({
        inspectorPartnerId: req.inspectorId,
        reportId: report.id,
        earningType: 'addon_fee',
        amountCents: earningAmount,
        description: `Add-on fee: ${body.property_address}`,
        periodMonth,
      });
    }

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
    const [inspector] = await db.select({
      companyName: inspectorPartners.companyName,
      companyLogoUrl: inspectorPartners.companyLogoUrl,
      certifications: inspectorPartners.certifications,
    }).from(inspectorPartners).where(eq(inspectorPartners.id, report.inspectorPartnerId)).limit(1);

    res.json({
      data: {
        report: {
          propertyAddress: report.propertyAddress,
          propertyCity: report.propertyCity,
          propertyState: report.propertyState,
          inspectionDate: report.inspectionDate,
          clientName: report.clientName,
          itemsParsed: report.itemsParsed,
          itemsDispatched: report.itemsDispatched,
          itemsQuoted: report.itemsQuoted,
          totalQuoteValueCents: report.totalQuoteValueCents,
        },
        inspector: inspector ?? null,
        items,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /inspect/:token]');
    res.status(500).json({ data: null, error: 'Failed to load report', meta: {} });
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

    // For now, use the report URL as context. In production, would download and extract text/images from PDF.
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: `You are analyzing a home inspection report. Extract every deficiency, concern, or recommended repair item. For each item, provide:
- title: a concise description (under 80 characters)
- description: the full inspector's notes for this item
- category: one of [plumbing, electrical, hvac, roofing, structural, general_repair, pest_control, safety, cosmetic, landscaping, appliance, insulation, foundation, windows_doors, fireplace]
- severity: one of [safety_hazard, urgent, recommended, monitor, informational]
- location_in_property: where in the property this issue exists
- cost_estimate_low: low end cost estimate in dollars based on typical repair costs in ${report.propertyCity}, ${report.propertyState}
- cost_estimate_high: high end cost estimate in dollars
- confidence: your confidence (0.0-1.0) that you've correctly identified and categorized this item

Only extract items that require action. Do NOT include items noted as functional or satisfactory.
Return ONLY a JSON array of items. No preamble, no markdown.`,
      messages: [{
        role: 'user',
        content: `Analyze this inspection report for the property at ${report.propertyAddress}, ${report.propertyCity}, ${report.propertyState} ${report.propertyZip}. Inspection type: ${report.inspectionType}. Inspection date: ${report.inspectionDate}.\n\nReport URL: ${report.reportFileUrl}\n\nExtract all actionable items as a JSON array.`,
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      await db.update(inspectionReports).set({ parsingStatus: 'failed', parsingError: 'AI returned no text' }).where(eq(inspectionReports.id, reportId));
      return;
    }

    let raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    let parsedItems: Array<{
      title: string; description?: string; category: string; severity: string;
      location_in_property?: string; cost_estimate_low?: number; cost_estimate_high?: number; confidence?: number;
    }>;

    try {
      parsedItems = JSON.parse(raw);
    } catch {
      await db.update(inspectionReports).set({ parsingStatus: 'failed', parsingError: 'Failed to parse AI response' }).where(eq(inspectionReports.id, reportId));
      return;
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
        aiCostEstimateLowCents: Math.round((item.cost_estimate_low ?? 0) * 100),
        aiCostEstimateHighCents: Math.round((item.cost_estimate_high ?? 0) * 100),
        aiConfidence: confidence.toFixed(2),
        sortOrder: i,
      });
    }

    await db.update(inspectionReports).set({
      itemsParsed: parsedItems.length,
      parsingStatus: hasLowConfidence ? 'review_pending' : 'parsed',
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
