import { Router, Request, Response } from 'express';
import { eq, and, gte } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { recurringVendors, vendorVisits, vendorPayments } from '../db/schema/recurring-vendors';
import { homeownerProperties } from '../db/schema/homeowner-properties';
import { homeowners } from '../db/schema/homeowners';
import * as recurringVendorsSvc from '../services/recurring-vendors';
import * as vendorVisitsSvc from '../services/vendor-visits';
import { listForHomeownerYear } from '../services/vendor-payments';
import { issueConfirmation } from '../services/vendor-confirmation';
import { completeVisit, approvePayment } from '../services/vendor-visit-orchestrator';

/**
 * Vendor + visit + payment API for Homie Membership homeowners.
 *
 * Mounted at `/api/v1/account/vendors` in app.ts under requireAuth so
 * `req.homeownerId` is available. All routes scope writes to vendors
 * owned by the current homeowner — cross-homeowner access is rejected
 * with 403 even if the URL guesses a valid vendor ID.
 *
 * Routes (`/api/v1/account/vendors` prefix):
 *   GET    /                        — list active vendors
 *   POST   /                        — create vendor + send SMS
 *   GET    /:id                     — single vendor detail
 *   PATCH  /:id                     — update (schedule, amount, etc.)
 *   DELETE /:id                     — soft-delete (status='cancelled')
 *   GET    /:id/visits              — visit history
 *   POST   /:id/skip-next           — skip next scheduled visit
 *   POST   /:id/travel-hold         — pause for date range
 *   POST   /:id/resume              — resume from pause / travel hold
 *   POST   /visits/:visitId/complete         — mark complete + auto-pay trigger
 *   POST   /visits/:visitId/approve-payment  — manual approval path
 *   GET    /tax-export              — CSV of succeeded payments for the given year
 *
 * The vendor-side endpoints (token-based, no auth) live in
 * routes/vendor-confirmation.ts; this file is homeowner-side only.
 */

const router = Router();

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Loads a vendor and asserts it belongs to req.homeownerId. */
async function loadOwned(req: Request, vendorId: string) {
  const vendor = await recurringVendorsSvc.findById(vendorId);
  if (!vendor) return { vendor: null, status: 404 as const, error: 'Vendor not found' };
  if (vendor.homeownerId !== req.homeownerId) {
    return { vendor: null, status: 403 as const, error: 'Vendor not accessible' };
  }
  return { vendor, status: 200 as const };
}

// ─── GET / — list ──────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const includeCancelled = req.query.includeCancelled === 'true';
    const vendors = includeCancelled
      ? await recurringVendorsSvc.findByHomeownerId(req.homeownerId)
      : (await recurringVendorsSvc.findByHomeownerId(req.homeownerId)).filter(
          (v) => v.status !== 'cancelled',
        );
    res.json({ data: { vendors }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /account/vendors]');
    res.status(500).json({ data: null, error: 'Failed to load vendors', meta: {} });
  }
});

// ─── POST / — create + SMS ─────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  try {
    // Verify the homeowner_property_id belongs to this homeowner
    const propertyId = String(body.homeowner_property_id ?? '');
    if (!propertyId) {
      res.status(400).json({ data: null, error: 'homeowner_property_id is required', meta: {} });
      return;
    }
    const [prop] = await db
      .select({ id: homeownerProperties.id, address: homeownerProperties.address })
      .from(homeownerProperties)
      .where(
        and(
          eq(homeownerProperties.id, propertyId),
          eq(homeownerProperties.homeownerId, req.homeownerId),
        ),
      )
      .limit(1);
    if (!prop) {
      res.status(404).json({ data: null, error: 'Property not found or not yours', meta: {} });
      return;
    }

    const vendor = await recurringVendorsSvc.create({
      homeownerPropertyId: prop.id,
      homeownerId: req.homeownerId,
      vendorName: String(body.vendor_name ?? '').slice(0, 255),
      vendorPhone: typeof body.vendor_phone === 'string' ? body.vendor_phone : null,
      vendorEmail: typeof body.vendor_email === 'string' ? body.vendor_email : null,
      serviceCategory: String(body.service_category ?? ''),
      vendorType: String(body.vendor_type ?? 'byo'),
      networkProviderId:
        typeof body.network_provider_id === 'string' ? body.network_provider_id : null,
      schedulePattern: String(body.schedule_pattern ?? ''),
      scheduleDayOfWeek:
        typeof body.schedule_day_of_week === 'number' ? body.schedule_day_of_week : null,
      scheduleDayOfMonth:
        typeof body.schedule_day_of_month === 'number' ? body.schedule_day_of_month : null,
      scheduleNthWeekday:
        typeof body.schedule_nth_weekday === 'string' ? body.schedule_nth_weekday : null,
      scheduleTime: typeof body.schedule_time === 'string' ? body.schedule_time : null,
      scheduleCustomDates: Array.isArray(body.schedule_custom_dates)
        ? (body.schedule_custom_dates as string[])
        : null,
      amountCents: Number(body.amount_cents ?? 0),
      paymentMethod: String(body.payment_method ?? 'card'),
      paymentMethodId:
        typeof body.payment_method_id === 'string' ? body.payment_method_id : null,
      autoPayRule: String(body.auto_pay_rule ?? 'always'),
      autoPayThresholdCents:
        typeof body.auto_pay_threshold_cents === 'number'
          ? body.auto_pay_threshold_cents
          : null,
    });

    // Look up homeowner name for the SMS body
    const [homeowner] = await db
      .select({ firstName: homeowners.firstName, lastName: homeowners.lastName })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);
    const homeownerName =
      [homeowner?.firstName, homeowner?.lastName].filter(Boolean).join(' ') || 'A homeowner';

    // Fire the SMS for BYO vendors. Network vendors already have Connect
    // accounts via the inspector-partner-style onboarding — they skip
    // the SMS step. Failures here don't block the create — homeowner
    // can re-issue from the vendor detail page.
    if (vendor.vendorType === 'byo') {
      try {
        await issueConfirmation({
          vendorId: vendor.id,
          homeownerName,
          propertyAddress: prop.address ?? 'their home',
        });
      } catch (err) {
        logger.warn({ err, vendorId: vendor.id }, '[POST /vendors] confirmation SMS failed; vendor still created');
      }
    }

    res.status(201).json({ data: { vendor }, error: null, meta: {} });
  } catch (err) {
    if (err instanceof recurringVendorsSvc.RecurringVendorValidationError) {
      res.status(400).json({ data: null, error: err.message, meta: {} });
      return;
    }
    logger.error({ err }, '[POST /account/vendors]');
    res.status(500).json({ data: null, error: 'Failed to create vendor', meta: {} });
  }
});

// ─── GET /:id ──────────────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const { vendor, status, error } = await loadOwned(req, req.params.id);
  if (!vendor) {
    res.status(status).json({ data: null, error: error ?? 'Not found', meta: {} });
    return;
  }
  res.json({ data: { vendor }, error: null, meta: {} });
});

// ─── PATCH /:id ────────────────────────────────────────────────────────────

router.patch('/:id', async (req: Request, res: Response) => {
  const { vendor, status, error } = await loadOwned(req, req.params.id);
  if (!vendor) {
    res.status(status).json({ data: null, error: error ?? 'Not found', meta: {} });
    return;
  }
  try {
    const body = req.body as Record<string, unknown>;
    const updated = await recurringVendorsSvc.update(vendor.id, {
      vendorName:
        typeof body.vendor_name === 'string' ? body.vendor_name.slice(0, 255) : undefined,
      vendorPhone: typeof body.vendor_phone === 'string' ? body.vendor_phone : undefined,
      vendorEmail: typeof body.vendor_email === 'string' ? body.vendor_email : undefined,
      schedulePattern:
        typeof body.schedule_pattern === 'string' ? body.schedule_pattern : undefined,
      scheduleDayOfWeek:
        typeof body.schedule_day_of_week === 'number' ? body.schedule_day_of_week : undefined,
      scheduleDayOfMonth:
        typeof body.schedule_day_of_month === 'number' ? body.schedule_day_of_month : undefined,
      scheduleNthWeekday:
        typeof body.schedule_nth_weekday === 'string' ? body.schedule_nth_weekday : undefined,
      scheduleTime: typeof body.schedule_time === 'string' ? body.schedule_time : undefined,
      scheduleCustomDates: Array.isArray(body.schedule_custom_dates)
        ? (body.schedule_custom_dates as string[])
        : undefined,
      amountCents: typeof body.amount_cents === 'number' ? body.amount_cents : undefined,
      paymentMethod:
        typeof body.payment_method === 'string' ? body.payment_method : undefined,
      paymentMethodId:
        typeof body.payment_method_id === 'string' ? body.payment_method_id : undefined,
      autoPayRule: typeof body.auto_pay_rule === 'string' ? body.auto_pay_rule : undefined,
      autoPayThresholdCents:
        typeof body.auto_pay_threshold_cents === 'number'
          ? body.auto_pay_threshold_cents
          : undefined,
    });
    res.json({ data: { vendor: updated }, error: null, meta: {} });
  } catch (err) {
    if (err instanceof recurringVendorsSvc.RecurringVendorValidationError) {
      res.status(400).json({ data: null, error: err.message, meta: {} });
      return;
    }
    logger.error({ err }, '[PATCH /account/vendors/:id]');
    res.status(500).json({ data: null, error: 'Failed to update vendor', meta: {} });
  }
});

// ─── DELETE /:id — soft delete ─────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
  const { vendor, status, error } = await loadOwned(req, req.params.id);
  if (!vendor) {
    res.status(status).json({ data: null, error: error ?? 'Not found', meta: {} });
    return;
  }
  try {
    const updated = await recurringVendorsSvc.softDelete(vendor.id);
    res.json({ data: { vendor: updated }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /account/vendors/:id]');
    res.status(500).json({ data: null, error: 'Failed to cancel vendor', meta: {} });
  }
});

// ─── GET /:id/visits ───────────────────────────────────────────────────────

router.get('/:id/visits', async (req: Request, res: Response) => {
  const { vendor, status, error } = await loadOwned(req, req.params.id);
  if (!vendor) {
    res.status(status).json({ data: null, error: error ?? 'Not found', meta: {} });
    return;
  }
  try {
    const visits = await vendorVisitsSvc.findByVendorId(vendor.id);
    res.json({ data: { visits }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /account/vendors/:id/visits]');
    res.status(500).json({ data: null, error: 'Failed to load visits', meta: {} });
  }
});

// ─── POST /:id/skip-next ───────────────────────────────────────────────────

router.post('/:id/skip-next', async (req: Request, res: Response) => {
  const { vendor, status, error } = await loadOwned(req, req.params.id);
  if (!vendor) {
    res.status(status).json({ data: null, error: error ?? 'Not found', meta: {} });
    return;
  }
  try {
    const reason = typeof (req.body as { reason?: unknown }).reason === 'string'
      ? (req.body as { reason: string }).reason
      : null;
    const upcoming = await vendorVisitsSvc.findUpcomingForVendor(vendor.id);
    const next = upcoming.find((v) => v.status === 'scheduled' || v.status === 'confirmation_sent');
    if (!next) {
      res.status(404).json({ data: null, error: 'No upcoming visit to skip', meta: {} });
      return;
    }
    const updated = await vendorVisitsSvc.updateStatus(next.id, 'skipped', { skipReason: reason });
    res.json({ data: { visit: updated }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/vendors/:id/skip-next]');
    res.status(500).json({ data: null, error: 'Failed to skip visit', meta: {} });
  }
});

// ─── POST /:id/travel-hold ─────────────────────────────────────────────────

router.post('/:id/travel-hold', async (req: Request, res: Response) => {
  const { vendor, status, error } = await loadOwned(req, req.params.id);
  if (!vendor) {
    res.status(status).json({ data: null, error: error ?? 'Not found', meta: {} });
    return;
  }
  try {
    const body = req.body as { starts_at?: unknown; ends_at?: unknown };
    const starts = typeof body.starts_at === 'string' ? body.starts_at : null;
    const ends = typeof body.ends_at === 'string' ? body.ends_at : null;
    if (!starts || !ends) {
      res.status(400).json({ data: null, error: 'starts_at and ends_at required (YYYY-MM-DD)', meta: {} });
      return;
    }
    const updated = await recurringVendorsSvc.update(vendor.id, {
      status: 'travel_hold',
      travelHoldStartsAt: starts,
      travelHoldEndsAt: ends,
    });
    // Skip any already-scheduled visits that fall in the hold window
    const allVisits = await vendorVisitsSvc.findByVendorId(vendor.id);
    const startD = new Date(starts);
    const endD = new Date(ends);
    for (const v of allVisits) {
      if (v.status !== 'scheduled' && v.status !== 'confirmation_sent') continue;
      if (v.scheduledAt >= startD && v.scheduledAt <= endD) {
        await vendorVisitsSvc.updateStatus(v.id, 'skipped', { skipReason: 'travel_hold' });
      }
    }
    res.json({ data: { vendor: updated }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/vendors/:id/travel-hold]');
    res.status(500).json({ data: null, error: 'Failed to set travel hold', meta: {} });
  }
});

// ─── POST /:id/resume ──────────────────────────────────────────────────────

router.post('/:id/resume', async (req: Request, res: Response) => {
  const { vendor, status, error } = await loadOwned(req, req.params.id);
  if (!vendor) {
    res.status(status).json({ data: null, error: error ?? 'Not found', meta: {} });
    return;
  }
  try {
    const updated = await recurringVendorsSvc.update(vendor.id, {
      status: 'active',
      travelHoldStartsAt: null,
      travelHoldEndsAt: null,
    });
    res.json({ data: { vendor: updated }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/vendors/:id/resume]');
    res.status(500).json({ data: null, error: 'Failed to resume vendor', meta: {} });
  }
});

// ─── POST /visits/:visitId/complete ────────────────────────────────────────

router.post('/visits/:visitId/complete', async (req: Request, res: Response) => {
  const { visitId } = req.params;
  try {
    // Ownership check: visit → vendor → homeowner
    const [visit] = await db
      .select({ id: vendorVisits.id, vendorId: vendorVisits.recurringVendorId })
      .from(vendorVisits)
      .where(eq(vendorVisits.id, visitId))
      .limit(1);
    if (!visit) {
      res.status(404).json({ data: null, error: 'Visit not found', meta: {} });
      return;
    }
    const owned = await loadOwned(req, visit.vendorId);
    if (!owned.vendor) {
      res.status(owned.status).json({ data: null, error: owned.error ?? 'Not yours', meta: {} });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const result = await completeVisit({
      visitId,
      amountChargedCents: Number(body.amount_charged_cents ?? owned.vendor.amountCents),
      completionPhotoUrl:
        typeof body.completion_photo_url === 'string' ? body.completion_photo_url : null,
      completionNotes:
        typeof body.completion_notes === 'string' ? body.completion_notes : null,
      tipCents: typeof body.tip_cents === 'number' ? body.tip_cents : 0,
    });
    res.json({ data: result, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/vendors/visits/:visitId/complete]');
    res.status(500).json({ data: null, error: 'Failed to complete visit', meta: {} });
  }
});

// ─── POST /visits/:visitId/approve-payment ─────────────────────────────────

router.post('/visits/:visitId/approve-payment', async (req: Request, res: Response) => {
  const { visitId } = req.params;
  try {
    const [visit] = await db
      .select({ id: vendorVisits.id, vendorId: vendorVisits.recurringVendorId })
      .from(vendorVisits)
      .where(eq(vendorVisits.id, visitId))
      .limit(1);
    if (!visit) {
      res.status(404).json({ data: null, error: 'Visit not found', meta: {} });
      return;
    }
    const owned = await loadOwned(req, visit.vendorId);
    if (!owned.vendor) {
      res.status(owned.status).json({ data: null, error: owned.error ?? 'Not yours', meta: {} });
      return;
    }
    const result = await approvePayment(visitId);
    if (!result.ok) {
      res.status(400).json({ data: null, error: result.error ?? 'Payment failed', meta: {} });
      return;
    }
    res.json({ data: { ok: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/vendors/visits/:visitId/approve-payment]');
    res.status(500).json({ data: null, error: 'Failed to approve payment', meta: {} });
  }
});

// ─── GET /tax-export — CSV ─────────────────────────────────────────────────

router.get('/tax-export', async (req: Request, res: Response) => {
  try {
    const yearParam = req.query.year;
    const year = typeof yearParam === 'string' ? parseInt(yearParam, 10) : new Date().getFullYear();
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      res.status(400).json({ data: null, error: 'year must be a valid integer', meta: {} });
      return;
    }
    const payments = await listForHomeownerYear(req.homeownerId, year);

    // For richer CSV columns we want vendor names and categories — load them.
    const vendorIds = Array.from(new Set(payments.map((p) => p.recurringVendorId)));
    const vendorMap = new Map<string, { vendorName: string; serviceCategory: string }>();
    if (vendorIds.length) {
      const rows = await db
        .select({
          id: recurringVendors.id,
          name: recurringVendors.vendorName,
          category: recurringVendors.serviceCategory,
        })
        .from(recurringVendors)
        .where(eq(recurringVendors.homeownerId, req.homeownerId));
      for (const r of rows) {
        vendorMap.set(r.id, { vendorName: r.name, serviceCategory: r.category });
      }
    }

    const header = ['date', 'vendor_name', 'service_category', 'amount_dollars', 'method', 'stripe_payment_intent'];
    const lines = [header.join(',')];
    for (const p of payments) {
      const meta = vendorMap.get(p.recurringVendorId);
      const date = p.processedAt ? p.processedAt.toISOString().slice(0, 10) : p.createdAt.toISOString().slice(0, 10);
      const amount = (p.netToVendorCents / 100).toFixed(2);
      const cells = [
        date,
        meta?.vendorName?.replace(/"/g, '""') ?? '',
        meta?.serviceCategory ?? '',
        amount,
        p.paymentMethod,
        p.stripePaymentIntentId ?? '',
      ];
      lines.push(cells.map((c) => (c.includes(',') ? `"${c}"` : c)).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="homie-vendor-payments-${year}.csv"`);
    res.send(lines.join('\n'));
  } catch (err) {
    logger.error({ err }, '[GET /account/vendors/tax-export]');
    res.status(500).json({ data: null, error: 'Failed to export', meta: {} });
  }
});

// Keep the unused-import linter quiet — gte/vendorPayments are referenced in
// the function-scoped imports of called services, this file just doesn't use
// them directly.
void gte;
void vendorPayments;

export default router;
