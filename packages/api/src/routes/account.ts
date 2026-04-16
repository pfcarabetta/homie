import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq, desc, and, ne, isNull, inArray, sql, count } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { jobs } from '../db/schema/jobs';
import { bookings } from '../db/schema/bookings';
import { providers } from '../db/schema/providers';
import { providerResponses } from '../db/schema/provider-responses';
import { propertyScans, propertyRooms, propertyInventoryItems } from '../db/schema/property-scans';
import { inspectionReports, inspectionReportItems, inspectionSupportingDocuments, inspectionCrossReferenceInsights } from '../db/schema/inspector';
import { computeSellerAction } from './inspector';
import { parseSupportingDoc } from '../services/document-parsers';
import { extractItemsFromDoc } from '../services/doc-item-extractor';
import { generateCrossReferenceInsights } from '../services/cross-reference';
import { ApiResponse } from '../types/api';

const router = Router();
const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/v1/account
router.get('/', async (req: Request, res: Response) => {
  try {
    const [homeowner] = await db
      .select({
        id: homeowners.id,
        firstName: homeowners.firstName,
        lastName: homeowners.lastName,
        email: homeowners.email,
        phone: homeowners.phone,
        zipCode: homeowners.zipCode,
        membershipTier: homeowners.membershipTier,
        title: homeowners.title,
        notifyEmailQuotes: homeowners.notifyEmailQuotes,
        notifySmsQuotes: homeowners.notifySmsQuotes,
        notifyEmailBookings: homeowners.notifyEmailBookings,
        notifySmsBookings: homeowners.notifySmsBookings,
        createdAt: homeowners.createdAt,
      })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);

    if (!homeowner) {
      res.status(404).json({ data: null, error: 'Account not found', meta: {} });
      return;
    }

    res.json({
      data: {
        id: homeowner.id,
        first_name: homeowner.firstName,
        last_name: homeowner.lastName,
        email: homeowner.email,
        phone: homeowner.phone,
        zip_code: homeowner.zipCode,
        membership_tier: homeowner.membershipTier,
        title: homeowner.title,
        notify_email_quotes: homeowner.notifyEmailQuotes,
        notify_sms_quotes: homeowner.notifySmsQuotes,
        notify_email_bookings: homeowner.notifyEmailBookings,
        notify_sms_bookings: homeowner.notifySmsBookings,
        created_at: homeowner.createdAt.toISOString(),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account]');
    res.status(500).json({ data: null, error: 'Failed to fetch account', meta: {} });
  }
});

// PATCH /api/v1/account
router.patch('/', async (req: Request, res: Response) => {
  const body = req.body as {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    zip_code?: string;
    current_password?: string;
    new_password?: string;
    title?: string;
    notify_email_quotes?: boolean;
    notify_sms_quotes?: boolean;
    notify_email_bookings?: boolean;
    notify_sms_bookings?: boolean;
  };

  const updates: Record<string, unknown> = {};

  if (body.first_name !== undefined) {
    updates.firstName = body.first_name.trim() || null;
  }

  if (body.last_name !== undefined) {
    updates.lastName = body.last_name.trim() || null;
  }

  if (body.email !== undefined) {
    if (!EMAIL_RE.test(body.email)) {
      res.status(400).json({ data: null, error: 'Invalid email address', meta: {} });
      return;
    }
    updates.email = body.email.toLowerCase().trim();
  }

  if (body.phone !== undefined) {
    updates.phone = body.phone || null;
  }

  if (body.title !== undefined) {
    updates.title = body.title.trim() || null;
  }

  if (body.notify_email_quotes !== undefined) {
    updates.notifyEmailQuotes = body.notify_email_quotes;
  }

  if (body.notify_sms_quotes !== undefined) {
    updates.notifySmsQuotes = body.notify_sms_quotes;
  }

  if (body.notify_email_bookings !== undefined) {
    updates.notifyEmailBookings = body.notify_email_bookings;
  }

  if (body.notify_sms_bookings !== undefined) {
    updates.notifySmsBookings = body.notify_sms_bookings;
  }

  if (body.zip_code !== undefined) {
    if (!/^\d{5}$/.test(body.zip_code)) {
      res.status(400).json({ data: null, error: 'Zip code must be 5 digits', meta: {} });
      return;
    }
    updates.zipCode = body.zip_code;
  }

  if (body.new_password) {
    if (!body.current_password) {
      res.status(400).json({ data: null, error: 'Current password is required to change password', meta: {} });
      return;
    }
    if (body.new_password.length < 8) {
      res.status(400).json({ data: null, error: 'New password must be at least 8 characters', meta: {} });
      return;
    }

    const [existing] = await db
      .select({ passwordHash: homeowners.passwordHash })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);

    if (!existing || !(await bcrypt.compare(body.current_password, existing.passwordHash))) {
      res.status(401).json({ data: null, error: 'Current password is incorrect', meta: {} });
      return;
    }

    updates.passwordHash = await bcrypt.hash(body.new_password, BCRYPT_ROUNDS);
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ data: null, error: 'No fields to update', meta: {} });
    return;
  }

  try {
    const [updated] = await db
      .update(homeowners)
      .set(updates)
      .where(eq(homeowners.id, req.homeownerId))
      .returning();

    res.json({
      data: {
        id: updated.id,
        first_name: updated.firstName,
        last_name: updated.lastName,
        email: updated.email,
        phone: updated.phone,
        zip_code: updated.zipCode,
        membership_tier: updated.membershipTier,
        title: updated.title,
        notify_email_quotes: updated.notifyEmailQuotes,
        notify_sms_quotes: updated.notifySmsQuotes,
        notify_email_bookings: updated.notifyEmailBookings,
        notify_sms_bookings: updated.notifySmsBookings,
        created_at: updated.createdAt.toISOString(),
      },
      error: null,
      meta: {},
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('unique')) {
      res.status(409).json({ data: null, error: 'An account with that email already exists', meta: {} });
      return;
    }
    logger.error({ err }, '[PATCH /account]');
    res.status(500).json({ data: null, error: 'Failed to update account', meta: {} });
  }
});

// GET /api/v1/account/home
router.get('/home', async (req: Request, res: Response) => {
  try {
    const [homeowner] = await db
      .select({
        homeAddress: homeowners.homeAddress,
        homeCity: homeowners.homeCity,
        homeState: homeowners.homeState,
        homeBedrooms: homeowners.homeBedrooms,
        homeBathrooms: homeowners.homeBathrooms,
        homeSqft: homeowners.homeSqft,
        homeDetails: homeowners.homeDetails,
      })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);

    if (!homeowner) {
      res.status(404).json({ data: null, error: 'Account not found', meta: {} });
      return;
    }

    res.json({
      data: {
        address: homeowner.homeAddress,
        city: homeowner.homeCity,
        state: homeowner.homeState,
        bedrooms: homeowner.homeBedrooms,
        bathrooms: homeowner.homeBathrooms,
        sqft: homeowner.homeSqft,
        details: homeowner.homeDetails,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account/home]');
    res.status(500).json({ data: null, error: 'Failed to fetch home data', meta: {} });
  }
});

// PATCH /api/v1/account/home
router.patch('/home', async (req: Request, res: Response) => {
  const body = req.body as {
    address?: string;
    city?: string;
    state?: string;
    bedrooms?: number;
    bathrooms?: string;
    sqft?: number;
    details?: Record<string, unknown>;
  };

  const updates: Record<string, unknown> = {};

  if (body.address !== undefined) updates.homeAddress = body.address || null;
  if (body.city !== undefined) updates.homeCity = body.city || null;
  if (body.state !== undefined) updates.homeState = body.state || null;
  if (body.bedrooms !== undefined) updates.homeBedrooms = body.bedrooms || null;
  if (body.bathrooms !== undefined) updates.homeBathrooms = body.bathrooms || null;
  if (body.sqft !== undefined) updates.homeSqft = body.sqft || null;
  if (body.details !== undefined) updates.homeDetails = body.details || null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ data: null, error: 'No fields to update', meta: {} });
    return;
  }

  try {
    const [updated] = await db
      .update(homeowners)
      .set(updates)
      .where(eq(homeowners.id, req.homeownerId))
      .returning();

    res.json({
      data: {
        address: updated.homeAddress,
        city: updated.homeCity,
        state: updated.homeState,
        bedrooms: updated.homeBedrooms,
        bathrooms: updated.homeBathrooms,
        sqft: updated.homeSqft,
        details: updated.homeDetails,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[PATCH /account/home]');
    res.status(500).json({ data: null, error: 'Failed to update home data', meta: {} });
  }
});

// GET /api/v1/account/jobs
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(jobs)
      .where(and(
        eq(jobs.homeownerId, req.homeownerId),
        isNull(jobs.workspaceId),
        isNull(jobs.propertyId),
        // Exclude non-consumer sources
        sql`(${jobs.diagnosis}->>'source' IS DISTINCT FROM 'inspection_report')`,
        sql`(${jobs.diagnosis}->>'source' IS DISTINCT FROM 'guest_issue')`,
      ))
      .orderBy(desc(jobs.createdAt));

    // Find which jobs already have a booking
    const jobIds = rows.map(j => j.id);
    const bookedJobIds = new Set<string>();
    if (jobIds.length > 0) {
      const bookedRows = await db
        .select({ jobId: bookings.jobId })
        .from(bookings)
        .where(inArray(bookings.jobId, jobIds));
      for (const r of bookedRows) bookedJobIds.add(r.jobId);
    }

    res.json({
      data: {
        jobs: rows.map((j) => ({
          id: j.id,
          status: j.status,
          payment_status: j.paymentStatus,
          tier: j.tier,
          zip_code: j.zipCode,
          budget: j.budget,
          preferred_timing: j.preferredTiming,
          diagnosis: j.diagnosis,
          created_at: j.createdAt.toISOString(),
          expires_at: j.expiresAt?.toISOString() ?? null,
          has_booking: bookedJobIds.has(j.id),
        })),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account/jobs]');
    res.status(500).json({ data: null, error: 'Failed to fetch jobs', meta: {} });
  }
});

// GET /api/v1/account/bookings
router.get('/bookings', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ booking: bookings, provider: providers, response: providerResponses })
      .from(bookings)
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .leftJoin(providerResponses, eq(bookings.responseId, providerResponses.id))
      .where(eq(bookings.homeownerId, req.homeownerId))
      .orderBy(desc(bookings.confirmedAt));

    res.json({
      data: {
        bookings: rows.map(({ booking: b, provider: p, response: r }) => ({
          id: b.id,
          job_id: b.jobId,
          provider: { id: p.id, name: p.name, phone: p.phone },
          status: b.status,
          confirmed_at: b.confirmedAt.toISOString(),
          quoted_price: r?.quotedPrice ?? null,
          scheduled: r?.availability ?? null,
        })),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account/bookings]');
    res.status(500).json({ data: null, error: 'Failed to fetch bookings', meta: {} });
  }
});

// ── Consumer Home Scan ─────────────────────────────────────────────────────

// POST /api/v1/account/home/scan — start a home scan
router.post('/home/scan', async (req: Request, res: Response) => {
  const { scan_type } = req.body as { scan_type?: 'full' | 'quick' };
  try {
    const [scan] = await db.insert(propertyScans).values({
      homeownerId: req.homeownerId,
      scanType: scan_type || 'full',
      scannedBy: req.homeownerId,
      status: 'in_progress',
    }).returning();
    res.json({ data: scan, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/home/scan]');
    res.status(500).json({ data: null, error: 'Failed to start scan', meta: {} });
  }
});

// POST /api/v1/account/home/scan/:scanId/photos — upload a photo for processing
router.post('/home/scan/:scanId/photos', async (req: Request, res: Response) => {
  const { scanId } = req.params;
  const { image_data_url, room_hint, notes } = req.body as {
    image_data_url?: string;
    room_hint?: string;
    notes?: string;
  };
  if (!image_data_url || typeof image_data_url !== 'string') {
    res.status(400).json({ data: null, error: 'image_data_url is required', meta: {} });
    return;
  }
  try {
    const [scan] = await db.select().from(propertyScans).where(eq(propertyScans.id, scanId)).limit(1);
    if (!scan || scan.homeownerId !== req.homeownerId) {
      res.status(404).json({ data: null, error: 'Scan not found', meta: {} });
      return;
    }
    const match = image_data_url.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ data: null, error: 'Invalid image data URL', meta: {} });
      return;
    }
    const { processScanPhoto } = await import('../services/property-scan-processor');
    const result = await processScanPhoto({
      scanId,
      imageBase64: match[2],
      imageMediaType: match[1] as 'image/jpeg' | 'image/png' | 'image/webp',
      roomHint: room_hint,
      notes,
    });
    res.json({ data: result, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/home/scan/:scanId/photos]');
    res.status(500).json({ data: null, error: 'Failed to process photo', meta: {} });
  }
});

// POST /api/v1/account/home/scan/:scanId/complete — finalize the scan
router.post('/home/scan/:scanId/complete', async (req: Request, res: Response) => {
  const { scanId } = req.params;
  try {
    const [scan] = await db.select().from(propertyScans).where(eq(propertyScans.id, scanId)).limit(1);
    if (!scan || scan.homeownerId !== req.homeownerId) {
      res.status(404).json({ data: null, error: 'Scan not found', meta: {} });
      return;
    }

    // Count rooms + mark complete
    const rooms = await db.select({ id: propertyRooms.id }).from(propertyRooms).where(eq(propertyRooms.scanId, scanId));
    await db.update(propertyScans).set({
      roomsScanned: rooms.length,
      status: 'completed',
      completedAt: new Date(),
      durationSeconds: scan.createdAt ? Math.round((Date.now() - scan.createdAt.getTime()) / 1000) : null,
    }).where(eq(propertyScans.id, scanId));

    // Auto-fill homeowner's homeDetails from scan inventory (same mapper logic as business)
    let settingsUpdatedPaths: string[] = [];
    try {
      const { buildSettingsPatchFromInventory, mergeSettingsPatch } = await import('../services/scan-to-settings-mapper');
      const items = await db.select().from(propertyInventoryItems)
        .where(eq(propertyInventoryItems.homeownerId, req.homeownerId));
      const allRooms = await db.select().from(propertyRooms)
        .where(eq(propertyRooms.homeownerId, req.homeownerId));
      const patch = buildSettingsPatchFromInventory(items, allRooms);
      if (Object.keys(patch).length > 0) {
        const [ho] = await db.select({ homeDetails: homeowners.homeDetails }).from(homeowners).where(eq(homeowners.id, req.homeownerId)).limit(1);
        const { merged, updatedPaths } = mergeSettingsPatch(ho?.homeDetails ?? null, patch);
        if (updatedPaths.length > 0) {
          await db.update(homeowners).set({ homeDetails: merged }).where(eq(homeowners.id, req.homeownerId));
          settingsUpdatedPaths = updatedPaths;
        }
      }
    } catch (err) {
      logger.warn({ err }, '[account/home/scan/complete] failed to apply scan to homeDetails');
    }

    const [updated] = await db.select().from(propertyScans).where(eq(propertyScans.id, scanId)).limit(1);
    res.json({ data: updated, error: null, meta: { settingsUpdatedPaths } });
  } catch (err) {
    logger.error({ err }, '[POST /account/home/scan/:scanId/complete]');
    res.status(500).json({ data: null, error: 'Failed to complete scan', meta: {} });
  }
});

// POST /api/v1/account/home/scan/:scanId/coaching — coaching message
router.post('/home/scan/:scanId/coaching', async (req: Request, res: Response) => {
  const { scanId } = req.params;
  const { current_room, last_detected_items } = req.body as {
    current_room?: string;
    last_detected_items?: Array<{ itemType: string; brand: string | null; confidence: number }>;
  };
  try {
    const [scan] = await db.select().from(propertyScans).where(eq(propertyScans.id, scanId)).limit(1);
    if (!scan || scan.homeownerId !== req.homeownerId) {
      res.status(404).json({ data: null, error: 'Scan not found', meta: {} });
      return;
    }
    const rooms = await db.select({ roomType: propertyRooms.roomType }).from(propertyRooms).where(eq(propertyRooms.scanId, scanId));
    const { generateCoachingMessage } = await import('../services/property-scan-processor');
    const result = await generateCoachingMessage({
      scanId,
      currentRoom: current_room || 'kitchen',
      lastDetectedItems: last_detected_items || [],
      totalItemsSoFar: scan.itemsCataloged,
      roomsScanned: rooms.map(r => r.roomType.replace(/_/g, ' ')),
    });
    res.json({ data: { message: result.message, roomProgress: result.roomProgress }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/home/scan/:scanId/coaching]');
    res.status(500).json({ data: null, error: 'Failed to generate coaching', meta: {} });
  }
});

// GET /api/v1/account/home/inventory — consumer home inventory
router.get('/home/inventory', async (req: Request, res: Response) => {
  try {
    const rooms = await db.select().from(propertyRooms)
      .where(eq(propertyRooms.homeownerId, req.homeownerId))
      .orderBy(propertyRooms.sortOrder, propertyRooms.createdAt);
    const items = await db.select().from(propertyInventoryItems)
      .where(and(
        eq(propertyInventoryItems.homeownerId, req.homeownerId),
        ne(propertyInventoryItems.status, 'pm_dismissed'),
      ))
      .orderBy(desc(propertyInventoryItems.confidenceScore));

    const { mergeDuplicateInventoryItems } = await import('../services/property-scan-processor');

    // Merge rooms by type + dedupe items (same logic as business inventory endpoint)
    const itemsByRoomId = new Map<string | null, typeof items>();
    for (const it of items) {
      const list = itemsByRoomId.get(it.roomId) || [];
      list.push(it);
      itemsByRoomId.set(it.roomId, list);
    }

    type MergedRoom = (typeof rooms)[number] & { items: typeof items; roomCount: number };
    const mergedByType = new Map<string, MergedRoom>();
    for (const room of rooms) {
      const roomItems = itemsByRoomId.get(room.id) ?? [];
      const existing = mergedByType.get(room.roomType);
      if (existing) {
        existing.items.push(...roomItems);
        existing.roomCount += 1;
      } else {
        mergedByType.set(room.roomType, { ...room, items: [...roomItems], roomCount: 1 });
      }
    }
    const mergedRooms: MergedRoom[] = [];
    for (const merged of mergedByType.values()) {
      merged.items = mergeDuplicateInventoryItems(merged.items);
      mergedRooms.push(merged);
    }
    const unassignedItems = mergeDuplicateInventoryItems(itemsByRoomId.get(null) ?? []);
    const allDeduped = [...mergedRooms.flatMap(r => r.items), ...unassignedItems];

    let totalAge = 0; let agedCount = 0; let agingItems = 0; let safetyFlags = 0;
    for (const it of allDeduped) {
      const age = it.estimatedAgeYears ? parseFloat(it.estimatedAgeYears) : null;
      if (age !== null) { totalAge += age; agedCount++; }
      if (it.maintenanceFlags?.length) {
        if (it.maintenanceFlags.some(f => /safety|electrical/i.test(f))) safetyFlags++;
        if (it.maintenanceFlags.some(f => /end_of_life|aging/i.test(f))) agingItems++;
      }
    }

    res.json({
      data: {
        rooms: mergedRooms,
        unassignedItems,
        summary: {
          totalItems: allDeduped.length,
          averageAge: agedCount > 0 ? Math.round((totalAge / agedCount) * 10) / 10 : null,
          agingItems, safetyFlags,
        },
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account/home/inventory]');
    res.status(500).json({ data: null, error: 'Failed to load inventory', meta: {} });
  }
});

// DELETE /api/v1/account/home/inventory/:itemId — delete an item
router.delete('/home/inventory/:itemId', async (req: Request, res: Response) => {
  const { itemId } = req.params;
  try {
    const [item] = await db.select().from(propertyInventoryItems).where(eq(propertyInventoryItems.id, itemId)).limit(1);
    if (!item || item.homeownerId !== req.homeownerId) {
      res.status(404).json({ data: null, error: 'Item not found', meta: {} });
      return;
    }
    await db.delete(propertyInventoryItems).where(eq(propertyInventoryItems.id, itemId));
    res.json({ data: { deleted: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /account/home/inventory/:itemId]');
    res.status(500).json({ data: null, error: 'Failed to delete item', meta: {} });
  }
});

// PUT /api/v1/account/home/inventory/:itemId — confirm / dismiss
router.put('/home/inventory/:itemId', async (req: Request, res: Response) => {
  const { itemId } = req.params;
  const body = req.body as { status?: 'pm_confirmed' | 'pm_corrected' | 'pm_dismissed' };
  try {
    const [item] = await db.select().from(propertyInventoryItems).where(eq(propertyInventoryItems.id, itemId)).limit(1);
    if (!item || item.homeownerId !== req.homeownerId) {
      res.status(404).json({ data: null, error: 'Item not found', meta: {} });
      return;
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status) {
      updates.status = body.status;
      if (body.status === 'pm_confirmed' || body.status === 'pm_corrected') {
        updates.confirmedBy = req.homeownerId;
        updates.confirmedAt = new Date();
      }
    }
    const [updated] = await db.update(propertyInventoryItems).set(updates).where(eq(propertyInventoryItems.id, itemId)).returning();
    res.json({ data: updated, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PUT /account/home/inventory/:itemId]');
    res.status(500).json({ data: null, error: 'Failed to update item', meta: {} });
  }
});

// GET /api/v1/account/home/scan-history
router.get('/home/scan-history', async (req: Request, res: Response) => {
  try {
    const scans = await db.select().from(propertyScans)
      .where(eq(propertyScans.homeownerId, req.homeownerId))
      .orderBy(desc(propertyScans.createdAt)).limit(20);
    res.json({ data: scans, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /account/home/scan-history]');
    res.status(500).json({ data: null, error: 'Failed to load scan history', meta: {} });
  }
});

// GET /api/v1/account/home/scan/room-targets — static per-room target lists
router.get('/home/scan/room-targets', async (_req: Request, res: Response) => {
  try {
    const { ROOM_TARGETS } = await import('../services/property-scan-processor');
    res.json({ data: { targets: ROOM_TARGETS }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /account/home/scan/room-targets]');
    res.status(500).json({ data: null, error: 'Failed to load room targets', meta: {} });
  }
});

// ── Inspection Reports ──────────────────────────────────────────────────────

// GET /api/v1/account/reports — list homeowner's inspection reports with item summaries
router.get('/reports', async (req: Request, res: Response) => {
  try {
    const reports = await db.select({
      id: inspectionReports.id,
      propertyAddress: inspectionReports.propertyAddress,
      propertyCity: inspectionReports.propertyCity,
      propertyState: inspectionReports.propertyState,
      propertyZip: inspectionReports.propertyZip,
      inspectionDate: inspectionReports.inspectionDate,
      inspectionType: inspectionReports.inspectionType,
      parsingStatus: inspectionReports.parsingStatus,
      clientAccessToken: inspectionReports.clientAccessToken,
      pricingTier: inspectionReports.pricingTier,
      reportMode: inspectionReports.reportMode,
      itemsParsed: inspectionReports.itemsParsed,
      itemsDispatched: inspectionReports.itemsDispatched,
      itemsQuoted: inspectionReports.itemsQuoted,
      totalQuoteValueCents: inspectionReports.totalQuoteValueCents,
      reportFileUrl: inspectionReports.reportFileUrl,
      createdAt: inspectionReports.createdAt,
    }).from(inspectionReports)
      .where(eq(inspectionReports.homeownerId, req.homeownerId))
      .orderBy(desc(inspectionReports.createdAt));

    // Fetch items for each report
    const reportIds = reports.map(r => r.id);
    const items = reportIds.length > 0
      ? await db.select({
          id: inspectionReportItems.id,
          reportId: inspectionReportItems.reportId,
          title: inspectionReportItems.title,
          severity: inspectionReportItems.severity,
          category: inspectionReportItems.category,
          locationInProperty: inspectionReportItems.locationInProperty,
          aiCostEstimateLowCents: inspectionReportItems.aiCostEstimateLowCents,
          aiCostEstimateHighCents: inspectionReportItems.aiCostEstimateHighCents,
          dispatchStatus: inspectionReportItems.dispatchStatus,
          quoteAmountCents: inspectionReportItems.quoteAmountCents,
          providerName: inspectionReportItems.providerName,
          quotes: inspectionReportItems.quotes,
          isIncludedInRequest: inspectionReportItems.isIncludedInRequest,
          homeownerNotes: inspectionReportItems.homeownerNotes,
          sellerAgreedAmountCents: inspectionReportItems.sellerAgreedAmountCents,
          creditIssuedCents: inspectionReportItems.creditIssuedCents,
          concessionStatus: inspectionReportItems.concessionStatus,
          repairRequestSource: inspectionReportItems.repairRequestSource,
          repairRequestCustomAmountCents: inspectionReportItems.repairRequestCustomAmountCents,
          sourcePages: inspectionReportItems.sourcePages,
          maintenanceCompletedAt: inspectionReportItems.maintenanceCompletedAt,
          sourceDocumentId: inspectionReportItems.sourceDocumentId,
          crossReferencedItemIds: inspectionReportItems.crossReferencedItemIds,
        }).from(inspectionReportItems)
          .where(inArray(inspectionReportItems.reportId, reportIds))
      : [];

    // Group items by report and build response
    const itemsByReport = new Map<string, typeof items>();
    for (const item of items) {
      const list = itemsByReport.get(item.reportId) ?? [];
      list.push(item);
      itemsByReport.set(item.reportId, list);
    }

    const data = reports.map(r => {
      const reportItems = itemsByReport.get(r.id) ?? [];
      let totalEstimateLow = 0;
      let totalEstimateHigh = 0;
      let totalQuoteValue = 0;
      let dispatchedCount = 0;
      let quotedCount = 0;

      for (const item of reportItems) {
        totalEstimateLow += item.aiCostEstimateLowCents ?? 0;
        totalEstimateHigh += item.aiCostEstimateHighCents ?? 0;
        totalQuoteValue += item.quoteAmountCents ?? 0;
        if (item.dispatchStatus === 'dispatched' || item.dispatchStatus === 'quotes_received' || item.dispatchStatus === 'booked' || item.dispatchStatus === 'completed') dispatchedCount++;
        if (item.quoteAmountCents) quotedCount++;
      }

      return {
        id: r.id,
        propertyAddress: r.propertyAddress,
        propertyCity: r.propertyCity,
        propertyState: r.propertyState,
        propertyZip: r.propertyZip,
        inspectionDate: r.inspectionDate,
        inspectionType: r.inspectionType,
        parsingStatus: r.parsingStatus,
        clientAccessToken: r.clientAccessToken,
        pricingTier: r.pricingTier,
        reportMode: r.reportMode ?? 'buyer',
        // Use proxy endpoint so browsers don't block data: URLs in new tabs
        reportFileUrl: r.reportFileUrl
          ? `${(process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '')}/api/v1/inspect/${r.clientAccessToken}/source-pdf`
          : null,
        itemCount: reportItems.length,
        dispatchedCount,
        quotedCount,
        totalEstimateLow,
        totalEstimateHigh,
        totalQuoteValue,
        createdAt: r.createdAt,
        items: reportItems.map(i => {
          const sa = computeSellerAction(i.category, i.severity, i.aiCostEstimateLowCents ?? 0, i.aiCostEstimateHighCents ?? 0);
          return {
            id: i.id,
            title: i.title,
            severity: i.severity,
            category: i.category,
            location: i.locationInProperty,
            costEstimateMin: i.aiCostEstimateLowCents,
            costEstimateMax: i.aiCostEstimateHighCents,
            dispatchStatus: i.dispatchStatus,
            quoteAmount: i.quoteAmountCents,
            providerName: i.providerName,
            quotes: i.quotes ?? [],
            isIncludedInRequest: i.isIncludedInRequest,
            homeownerNotes: i.homeownerNotes,
            sellerAgreedAmountCents: i.sellerAgreedAmountCents,
            creditIssuedCents: i.creditIssuedCents,
            concessionStatus: i.concessionStatus,
            repairRequestSource: i.repairRequestSource,
            repairRequestCustomAmountCents: i.repairRequestCustomAmountCents,
            sourcePages: i.sourcePages,
            maintenanceCompletedAt: i.maintenanceCompletedAt?.toISOString() ?? null,
            sellerAction: sa.action,
            sellerActionReason: sa.reason,
            sourceDocumentId: i.sourceDocumentId,
            crossReferencedItemIds: i.crossReferencedItemIds ?? [],
          };
        }),
      };
    });

    res.json({ data: { reports: data }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /account/reports]');
    res.status(500).json({ data: null, error: 'Failed to load reports', meta: {} });
  }
});

// DELETE /api/v1/account/reports/:reportId — delete a report and its items
router.delete('/reports/:reportId', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select({ id: inspectionReports.id })
      .from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    // Items cascade-delete via FK constraint
    await db.delete(inspectionReports).where(eq(inspectionReports.id, report.id));

    res.json({ data: { deleted: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /account/reports/:reportId]');
    res.status(500).json({ data: null, error: 'Failed to delete report', meta: {} });
  }
});

// Per-report pricing tiers
const REPORT_TIER_PRICES: Record<string, { cents: number; label: string }> = {
  essential: { cents: 9900, label: 'Essential' },
  professional: { cents: 19900, label: 'Professional' },
  premium: { cents: 29900, label: 'Premium' },
};

// PATCH /api/v1/account/reports/:reportId/mode — switch buyer/seller mode for this report
router.patch('/reports/:reportId/mode', async (req: Request, res: Response) => {
  const { mode } = req.body as { mode?: string };
  if (mode !== 'buyer' && mode !== 'seller') {
    res.status(400).json({ data: null, error: 'mode must be "buyer" or "seller"', meta: {} });
    return;
  }
  try {
    const [updated] = await db.update(inspectionReports)
      .set({ reportMode: mode, updatedAt: new Date() })
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .returning({ id: inspectionReports.id, reportMode: inspectionReports.reportMode });
    if (!updated) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    res.json({ data: { id: updated.id, reportMode: updated.reportMode }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[PATCH /account/reports/:reportId/mode]');
    res.status(500).json({ data: null, error: 'Failed to update mode', meta: {} });
  }
});

// POST /api/v1/account/reports/:reportId/checkout — create Stripe checkout for a report tier
router.post('/reports/:reportId/checkout', async (req: Request, res: Response) => {
  const { tier } = req.body as { tier: string };

  if (!tier || !REPORT_TIER_PRICES[tier]) {
    res.status(400).json({ data: null, error: 'Invalid tier. Must be essential, professional, or premium', meta: {} });
    return;
  }

  try {
    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    if (report.pricingTier) {
      res.status(400).json({ data: null, error: 'Report already has a pricing tier', meta: {} });
      return;
    }

    const tierConfig = REPORT_TIER_PRICES[tier];
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
    });

    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

    // Look up homeowner email for Stripe receipt
    const [homeowner] = await db.select({ email: homeowners.email }).from(homeowners)
      .where(eq(homeowners.id, req.homeownerId)).limit(1);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Homie Inspect ${tierConfig.label} — ${report.propertyAddress}` },
          unit_amount: tierConfig.cents,
        },
        quantity: 1,
      }],
      metadata: {
        report_id: report.id,
        tier,
        homeowner_id: req.homeownerId,
        type: 'inspect_report_tier',
      },
      customer_email: homeowner?.email ?? undefined,
      success_url: `${APP_URL}/inspect-portal?tab=reports&report=${report.id}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/inspect-portal?tab=reports&report=${report.id}&payment=canceled`,
    });

    res.json({ data: { checkoutUrl: session.url, amountCents: tierConfig.cents, tier }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/reports/:reportId/checkout]');
    res.status(500).json({ data: null, error: `Checkout failed: ${(err as Error).message}`, meta: {} });
  }
});

// POST /api/v1/account/reports/:reportId/confirm-payment — confirm Stripe payment and set tier
router.post('/reports/:reportId/confirm-payment', async (req: Request, res: Response) => {
  const { session_id } = req.body as { session_id: string };
  if (!session_id) {
    res.status(400).json({ data: null, error: 'session_id is required', meta: {} });
    return;
  }

  try {
    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    // Verify Stripe session
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
    });
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.metadata?.report_id !== report.id) {
      res.status(400).json({ data: null, error: 'Session does not match report', meta: {} });
      return;
    }

    const tier = session.metadata?.tier;
    if (!tier || !REPORT_TIER_PRICES[tier]) {
      res.status(400).json({ data: null, error: 'Invalid tier in session', meta: {} });
      return;
    }

    // Set the pricing tier
    await db.update(inspectionReports).set({
      pricingTier: tier,
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, report.id));

    // If professional or premium, mark all non-informational items as pending_dispatch
    if (tier === 'professional' || tier === 'premium') {
      await db.update(inspectionReportItems).set({
        dispatchStatus: 'pending_dispatch',
        updatedAt: new Date(),
      }).where(and(
        eq(inspectionReportItems.reportId, report.id),
        eq(inspectionReportItems.dispatchStatus, 'not_dispatched'),
        sql`${inspectionReportItems.severity} != 'informational'`,
      ));
    }

    res.json({ data: { tier, confirmed: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/reports/:reportId/confirm-payment]');
    res.status(500).json({ data: null, error: 'Payment confirmation failed', meta: {} });
  }
});

// POST /api/v1/account/reports/:reportId/dispatch — dispatch items after payment
router.post('/reports/:reportId/dispatch', async (req: Request, res: Response) => {
  const { item_ids } = req.body as { item_ids?: string[] };

  try {
    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    if (report.pricingTier !== 'professional' && report.pricingTier !== 'premium') {
      res.status(400).json({ data: null, error: 'Dispatch requires Professional or Premium tier', meta: {} });
      return;
    }

    // Get items to dispatch — filter by item_ids if provided
    let itemsToDispatch = await db.select().from(inspectionReportItems)
      .where(and(
        eq(inspectionReportItems.reportId, report.id),
        sql`${inspectionReportItems.dispatchStatus} IN ('not_dispatched', 'pending_dispatch')`,
        sql`${inspectionReportItems.severity} != 'informational'`,
      ));

    if (item_ids && item_ids.length > 0) {
      const idSet = new Set(item_ids);
      itemsToDispatch = itemsToDispatch.filter(i => idSet.has(i.id));
    }

    if (itemsToDispatch.length === 0) {
      res.json({ data: { dispatched: [], totalDispatched: 0 }, error: null, meta: {} });
      return;
    }

    // Record first action
    if (!report.clientFirstActionAt) {
      await db.update(inspectionReports).set({ clientFirstActionAt: new Date(), updatedAt: new Date() })
        .where(eq(inspectionReports.id, report.id));
    }

    const dispatched: Array<{ itemId: string; jobId: string }> = [];

    // Group by category — one job per category
    const categoryGroups = new Map<string, typeof itemsToDispatch>();
    for (const item of itemsToDispatch) {
      const cat = item.category || 'general_repair';
      if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
      categoryGroups.get(cat)!.push(item);
    }

    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

    for (const [category, items] of categoryGroups) {
      try {
        const highestSeverity = items.some(i => i.severity === 'safety_hazard' || i.severity === 'urgent') ? 'high'
          : items.some(i => i.severity === 'recommended') ? 'medium' : 'low';

        const itemSummaries = items.map((item, idx) => {
          const photoDescs = (item.inspectorPhotos as string[] | null) ?? [];
          const photoStr = photoDescs.length ? ` [Photos: ${photoDescs.join('; ')}]` : '';
          return `${idx + 1}. ${item.title}${item.description ? ' — ' + item.description : ''}${photoStr}`;
        });

        const allPhotoDescs = items.flatMap(item => (item.inspectorPhotos as string[] | null) ?? []);
        const providerViewToken = crypto.randomBytes(24).toString('hex');
        const providerReportUrl = `${APP_URL}/inspect/provider/${providerViewToken}`;

        const diagnosis = {
          category,
          severity: highestSeverity,
          summary: `Inspection report — ${items.length} ${category.replace(/_/g, ' ')} item${items.length !== 1 ? 's' : ''} at ${report.propertyAddress}, ${report.propertyCity} ${report.propertyState}:\n${itemSummaries.join('\n')}\n\nSubmit your quote (per item or bundle): ${providerReportUrl}`,
          recommendedActions: items.map(i => `Address: ${i.title}`),
          source: 'inspection_report',
          inspectionReportId: report.id,
          inspectionItemIds: items.map(i => i.id),
          photoDescriptions: allPhotoDescs,
          providerViewToken,
        };

        const totalLow = items.reduce((sum, i) => sum + (i.aiCostEstimateLowCents ?? 0), 0);
        const totalHigh = items.reduce((sum, i) => sum + (i.aiCostEstimateHighCents ?? 0), 0);
        const budgetStr = totalLow > 0 && totalHigh > 0
          ? `$${Math.round(totalLow / 100)}-$${Math.round(totalHigh / 100)}`
          : 'flexible';

        const { jobs: jobsTable } = await import('../db/schema/jobs');
        const [job] = await db.insert(jobsTable).values({
          homeownerId: req.homeownerId,
          diagnosis: diagnosis as never,
          zipCode: report.propertyZip,
          preferredTiming: 'this_week',
          budget: budgetStr,
          tier: report.pricingTier === 'premium' ? 'priority' : 'standard',
          status: 'dispatching',
          paymentStatus: 'paid',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }).returning({ id: jobsTable.id });

        for (const item of items) {
          await db.update(inspectionReportItems).set({
            dispatchStatus: 'dispatched',
            dispatchId: job.id,
            updatedAt: new Date(),
          }).where(eq(inspectionReportItems.id, item.id));
          dispatched.push({ itemId: item.id, jobId: job.id });
        }

        try {
          const { dispatchJob } = await import('../services/orchestration');
          void dispatchJob(job.id);
        } catch (dispatchErr) {
          logger.warn({ err: dispatchErr, jobId: job.id }, '[account/reports/dispatch] Outreach failed');
        }

        logger.info({ jobId: job.id, category, itemCount: items.length }, '[account/reports/dispatch] Category dispatched');
      } catch (groupErr) {
        logger.error({ err: groupErr, category }, '[account/reports/dispatch] Failed to dispatch category');
      }
    }

    // Update report stats
    const [{ value: totalDispatchedCount }] = await db.select({ value: count() })
      .from(inspectionReportItems)
      .where(and(eq(inspectionReportItems.reportId, report.id), sql`${inspectionReportItems.dispatchStatus} != 'not_dispatched'`));

    await db.update(inspectionReports).set({
      itemsDispatched: totalDispatchedCount,
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, report.id));

    res.json({ data: { dispatched, totalDispatched: dispatched.length }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/reports/:reportId/dispatch]');
    res.status(500).json({ data: null, error: 'Dispatch failed', meta: {} });
  }
});

// ── AI Deep Dive ────────────────────────────────────────────────────────────

const ITEM_ANALYSIS_SYSTEM = `You are a friendly home inspection expert giving a concise summary to a homeowner.

Use these **bold** section headers, keeping each section to 1-2 sentences max:

**What is this?** — Plain-English explanation.
**Why it matters** — Risk level: safety, structural, comfort, or cosmetic.
**If ignored** — What could realistically happen over time.
**DIY or pro?** — Can a homeowner handle this, or is a licensed pro needed?
**Cost context** — Is the estimate typical? Any budget-friendly alternatives?

Keep the entire response under 150 words. Warm and conversational tone, no jargon.`;

const ITEM_CHAT_SYSTEM = `You are a friendly home inspection expert having a conversation with a homeowner about a specific inspection finding. You've already provided an initial analysis — now answer their follow-up questions.

Be concise, helpful, and honest. If you don't know something specific to their home, say so and suggest who they could ask (inspector, contractor, etc). Keep responses focused and under 200 words unless the question warrants more detail.`;

function buildItemContext(item: { title: string; description: string | null; severity: string; category: string; locationInProperty: string | null; inspectorPhotos: string[] | null; aiCostEstimateLowCents: number; aiCostEstimateHighCents: number; aiConfidence: string | number }, reportAddress: string): string {
  const photos = (item.inspectorPhotos as string[] | null) ?? [];
  return `Inspection Item: ${item.title}
Category: ${item.category.replace(/_/g, ' ')}
Severity: ${item.severity.replace(/_/g, ' ')}
Location: ${item.locationInProperty || 'Not specified'}
Property: ${reportAddress}

Inspector Notes: ${item.description || 'None provided'}

${photos.length > 0 ? `Photo Descriptions:\n${photos.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : ''}

Estimated Repair Cost: $${Math.round(item.aiCostEstimateLowCents / 100)} – $${Math.round(item.aiCostEstimateHighCents / 100)}
AI Confidence: ${Math.round(Number(item.aiConfidence) * 100)}%`;
}

// POST /api/v1/account/reports/:reportId/items/:itemId/analyze — SSE stream AI analysis
router.post('/reports/:reportId/items/:itemId/analyze', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select({
      id: inspectionReports.id,
      propertyAddress: inspectionReports.propertyAddress,
      propertyCity: inspectionReports.propertyCity,
      propertyState: inspectionReports.propertyState,
    }).from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }

    const [item] = await db.select().from(inspectionReportItems)
      .where(and(eq(inspectionReportItems.id, req.params.itemId), eq(inspectionReportItems.reportId, report.id)))
      .limit(1);

    if (!item) { res.status(404).json({ data: null, error: 'Item not found', meta: {} }); return; }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(500).json({ data: null, error: 'AI service not configured', meta: {} }); return; }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });
    const address = `${report.propertyAddress}, ${report.propertyCity} ${report.propertyState}`;
    const context = buildItemContext(item, address);

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: ITEM_ANALYSIS_SYSTEM,
      messages: [{ role: 'user', content: `Please analyze this inspection finding for me:\n\n${context}` }],
    });

    for await (const event of stream) {
      if (req.socket.destroyed) break;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ token: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    logger.error({ err }, '[POST /account/reports/:reportId/items/:itemId/analyze]');
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'Analysis interrupted' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ data: null, error: 'Analysis failed', meta: {} });
    }
  }
});

// POST /api/v1/account/reports/:reportId/items/:itemId/chat — SSE stream follow-up chat
router.post('/reports/:reportId/items/:itemId/chat', async (req: Request, res: Response) => {
  const { messages: chatMessages } = req.body as { messages: Array<{ role: 'user' | 'assistant'; content: string }> };

  if (!chatMessages || chatMessages.length === 0) {
    res.status(400).json({ data: null, error: 'messages required', meta: {} });
    return;
  }

  try {
    const [report] = await db.select({
      id: inspectionReports.id,
      propertyAddress: inspectionReports.propertyAddress,
      propertyCity: inspectionReports.propertyCity,
      propertyState: inspectionReports.propertyState,
    }).from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) { res.status(404).json({ data: null, error: 'Report not found', meta: {} }); return; }

    const [item] = await db.select().from(inspectionReportItems)
      .where(and(eq(inspectionReportItems.id, req.params.itemId), eq(inspectionReportItems.reportId, report.id)))
      .limit(1);

    if (!item) { res.status(404).json({ data: null, error: 'Item not found', meta: {} }); return; }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { res.status(500).json({ data: null, error: 'AI service not configured', meta: {} }); return; }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });
    const address = `${report.propertyAddress}, ${report.propertyCity} ${report.propertyState}`;
    const context = buildItemContext(item, address);

    const systemPrompt = `${ITEM_CHAT_SYSTEM}\n\nItem Context:\n${context}`;

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: chatMessages,
    });

    for await (const event of stream) {
      if (req.socket.destroyed) break;
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ token: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    logger.error({ err }, '[POST /account/reports/:reportId/items/:itemId/chat]');
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'Chat interrupted' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ data: null, error: 'Chat failed', meta: {} });
    }
  }
});

// ── Mock Quotes (testing only) ──────────────────────────────────────────────

const MOCK_PROVIDERS = [
  { name: 'Acme Pro Services', rating: '4.8', phone: '+15551234567', availability: 'Tomorrow afternoon' },
  { name: 'Reliable Home Experts', rating: '4.6', phone: '+15552345678', availability: 'This week' },
  { name: 'QuickFix Contractors', rating: '4.3', phone: '+15553456789', availability: 'Within 3 days' },
  { name: 'Premier Handymen', rating: '4.9', phone: '+15554567890', availability: 'Next week' },
  { name: 'BlueStar Services', rating: '4.1', phone: '+15555678901', availability: 'Monday morning' },
];

// POST /api/v1/account/reports/:reportId/seed-mock-quotes — generate fake quotes for testing
router.post('/reports/:reportId/seed-mock-quotes', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select({ id: inspectionReports.id })
      .from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    // Get all dispatched items for this report that don't have booked status
    const dispatchedItems = await db.select().from(inspectionReportItems)
      .where(and(
        eq(inspectionReportItems.reportId, report.id),
        sql`${inspectionReportItems.dispatchStatus} IN ('dispatched', 'quotes_received', 'quoted', 'pending_dispatch')`,
      ));

    if (dispatchedItems.length === 0) {
      res.status(400).json({ data: null, error: 'No dispatched items to seed quotes for. Dispatch items first.', meta: {} });
      return;
    }

    // Ensure mock provider records exist
    const mockProviderIds: string[] = [];
    for (const mock of MOCK_PROVIDERS) {
      const [existing] = await db.select({ id: providers.id }).from(providers)
        .where(eq(providers.name, mock.name)).limit(1);
      if (existing) {
        mockProviderIds.push(existing.id);
      } else {
        const [created] = await db.insert(providers).values({
          name: mock.name,
          phone: mock.phone,
          rating: mock.rating,
          reviewCount: Math.floor(Math.random() * 200) + 50,
          categories: ['general'],
        }).returning({ id: providers.id });
        mockProviderIds.push(created.id);
      }
    }

    let totalQuotesGenerated = 0;

    // For each dispatched item, generate 2-3 mock quotes
    for (const item of dispatchedItems) {
      if (!item.dispatchId) continue;

      // Skip if this item already has real quotes
      const existingQuotes = (item.quotes as Array<{ providerId: string }> | null) ?? [];
      if (existingQuotes.length >= 2) continue;

      const quoteCount = Math.floor(Math.random() * 2) + 2; // 2-3 quotes
      const shuffled = [...MOCK_PROVIDERS].map((p, i) => ({ ...p, providerId: mockProviderIds[i] })).sort(() => Math.random() - 0.5).slice(0, quoteCount);

      const avgCost = ((item.aiCostEstimateLowCents ?? 0) + (item.aiCostEstimateHighCents ?? 0)) / 2;
      const baseCost = avgCost > 0 ? avgCost : 50000; // $500 default

      const newQuotes: Array<{ providerId: string; providerName: string; providerRating: string; amountCents: number; availability: string; receivedAt: string }> = [];

      for (const mock of shuffled) {
        // Price varies -20% to +30% from base
        const variance = 0.8 + Math.random() * 0.5;
        const amountCents = Math.round(baseCost * variance);

        // Insert provider response
        await db.insert(providerResponses).values({
          jobId: item.dispatchId,
          providerId: mock.providerId,
          channel: Math.random() > 0.5 ? 'sms' : 'voice',
          quotedPrice: `$${Math.round(amountCents / 100)}`,
          availability: mock.availability,
          message: `We can help with ${item.title.toLowerCase()}. ${mock.availability}.`,
          ratingAtTime: mock.rating,
        });

        newQuotes.push({
          providerId: mock.providerId,
          providerName: mock.name,
          providerRating: mock.rating,
          amountCents,
          availability: mock.availability,
          receivedAt: new Date().toISOString(),
        });

        totalQuotesGenerated++;
      }

      // Find lowest (best) quote
      const best = newQuotes.reduce((lo, q) => q.amountCents < lo.amountCents ? q : lo, newQuotes[0]);

      // Update item with all quotes and best quote details
      const allQuotes = [...existingQuotes, ...newQuotes] as unknown as typeof inspectionReportItems.$inferInsert.quotes;
      await db.update(inspectionReportItems).set({
        quotes: allQuotes,
        quoteAmountCents: best.amountCents,
        providerName: best.providerName,
        providerRating: best.providerRating,
        providerAvailability: best.availability,
        dispatchStatus: 'quotes_received',
        updatedAt: new Date(),
      }).where(eq(inspectionReportItems.id, item.id));
    }

    // Update report totals
    const itemsQuoted = await db.select({ c: count() }).from(inspectionReportItems)
      .where(and(
        eq(inspectionReportItems.reportId, report.id),
        sql`${inspectionReportItems.quoteAmountCents} IS NOT NULL`,
      ));

    const totalValueResult = await db.select({
      total: sql<number>`COALESCE(SUM(${inspectionReportItems.quoteAmountCents}), 0)::int`,
    }).from(inspectionReportItems)
      .where(and(
        eq(inspectionReportItems.reportId, report.id),
        sql`${inspectionReportItems.quoteAmountCents} IS NOT NULL`,
      ));

    await db.update(inspectionReports).set({
      itemsQuoted: itemsQuoted[0].c,
      totalQuoteValueCents: totalValueResult[0]?.total ?? 0,
      updatedAt: new Date(),
    }).where(eq(inspectionReports.id, report.id));

    res.json({
      data: {
        quotesGenerated: totalQuotesGenerated,
        itemsQuoted: itemsQuoted[0].c,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /account/reports/:reportId/seed-mock-quotes]');
    res.status(500).json({ data: null, error: 'Failed to seed mock quotes', meta: {} });
  }
});

// ── Quote Booking ──────────────────────────────────────────────────────────

// POST /api/v1/account/reports/:reportId/items/:itemId/book — accept a quote for an item
router.post('/reports/:reportId/items/:itemId/book', async (req: Request, res: Response) => {
  const { provider_id } = req.body as { provider_id: string };

  if (!provider_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(provider_id)) {
    res.status(400).json({ data: null, error: 'provider_id must be a valid UUID', meta: {} });
    return;
  }

  try {
    // Validate report ownership
    const [report] = await db.select({ id: inspectionReports.id })
      .from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    // Load item
    const [item] = await db.select().from(inspectionReportItems)
      .where(and(eq(inspectionReportItems.id, req.params.itemId), eq(inspectionReportItems.reportId, report.id)))
      .limit(1);

    if (!item) {
      res.status(404).json({ data: null, error: 'Item not found', meta: {} });
      return;
    }

    if (!item.dispatchId) {
      res.status(400).json({ data: null, error: 'Item has not been dispatched', meta: {} });
      return;
    }

    if (item.dispatchStatus === 'booked' || item.dispatchStatus === 'completed') {
      res.status(409).json({ data: null, error: 'Item is already booked', meta: {} });
      return;
    }

    // Find the matching provider response
    const rows = await db
      .select({ response: providerResponses, provider: providers })
      .from(providerResponses)
      .innerJoin(providers, eq(providerResponses.providerId, providers.id))
      .where(and(
        eq(providerResponses.jobId, item.dispatchId),
        eq(providerResponses.providerId, provider_id),
      ))
      .orderBy(desc(providerResponses.createdAt))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ data: null, error: 'No quote found from this provider for this item', meta: {} });
      return;
    }

    const { response: r, provider: p } = rows[0];

    // Update job status
    await db.update(jobs).set({ status: 'completed' }).where(eq(jobs.id, item.dispatchId));

    // Create booking
    const [booking] = await db.insert(bookings).values({
      jobId: item.dispatchId,
      homeownerId: req.homeownerId,
      providerId: p.id,
      responseId: r.id,
    }).returning();

    // Update inspection item status
    await db.update(inspectionReportItems).set({
      dispatchStatus: 'booked',
      updatedAt: new Date(),
    }).where(eq(inspectionReportItems.id, item.id));

    // Fire off notifications (best-effort)
    try {
      const { sendBookingNotifications } = await import('../services/orchestration');
      void sendBookingNotifications(item.dispatchId, p.id, booking.id, booking.serviceAddress);
    } catch (notifErr) {
      logger.warn({ err: notifErr }, '[account/book] Booking notifications failed');
    }

    res.json({
      data: {
        bookingId: booking.id,
        status: 'confirmed',
        providerName: p.name,
        providerPhone: p.phone,
        quotedPrice: r.quotedPrice,
        scheduled: r.availability,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /account/reports/:reportId/items/:itemId/book]');
    res.status(500).json({ data: null, error: 'Booking failed', meta: {} });
  }
});

// ── Negotiations ────────────────────────────────────────────────────────────

// PATCH /api/v1/account/reports/:reportId/items/:itemId/negotiation — update negotiation state
router.patch('/reports/:reportId/items/:itemId/negotiation', async (req: Request, res: Response) => {
  const body = req.body as {
    isIncludedInRequest?: boolean;
    homeownerNotes?: string | null;
    sellerAgreedAmountCents?: number | null;
    creditIssuedCents?: number | null;
    concessionStatus?: string | null;
    repairRequestSource?: string | null;
    repairRequestCustomAmountCents?: number | null;
  };

  try {
    // Validate report ownership
    const [report] = await db.select({ id: inspectionReports.id })
      .from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    // Build updates object only with provided fields
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.isIncludedInRequest !== undefined) updates.isIncludedInRequest = body.isIncludedInRequest;
    if (body.homeownerNotes !== undefined) updates.homeownerNotes = body.homeownerNotes;
    if (body.sellerAgreedAmountCents !== undefined) updates.sellerAgreedAmountCents = body.sellerAgreedAmountCents;
    if (body.creditIssuedCents !== undefined) updates.creditIssuedCents = body.creditIssuedCents;
    if (body.concessionStatus !== undefined) updates.concessionStatus = body.concessionStatus;
    if (body.repairRequestSource !== undefined) updates.repairRequestSource = body.repairRequestSource;
    if (body.repairRequestCustomAmountCents !== undefined) updates.repairRequestCustomAmountCents = body.repairRequestCustomAmountCents;

    const [updated] = await db.update(inspectionReportItems)
      .set(updates)
      .where(and(eq(inspectionReportItems.id, req.params.itemId), eq(inspectionReportItems.reportId, report.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ data: null, error: 'Item not found', meta: {} });
      return;
    }

    res.json({
      data: {
        id: updated.id,
        isIncludedInRequest: updated.isIncludedInRequest,
        homeownerNotes: updated.homeownerNotes,
        sellerAgreedAmountCents: updated.sellerAgreedAmountCents,
        creditIssuedCents: updated.creditIssuedCents,
        concessionStatus: updated.concessionStatus,
        repairRequestSource: updated.repairRequestSource,
        repairRequestCustomAmountCents: updated.repairRequestCustomAmountCents,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[PATCH /account/reports/:reportId/items/:itemId/negotiation]');
    res.status(500).json({ data: null, error: 'Failed to update negotiation', meta: {} });
  }
});

// PATCH /api/v1/account/reports/:reportId/items/:itemId/maintenance — toggle maintenance completion
router.patch('/reports/:reportId/items/:itemId/maintenance', async (req: Request, res: Response) => {
  const body = req.body as { maintenanceCompletedAt?: string | null };

  try {
    const [report] = await db.select({ id: inspectionReports.id })
      .from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.maintenanceCompletedAt !== undefined) {
      updates.maintenanceCompletedAt = body.maintenanceCompletedAt ? new Date(body.maintenanceCompletedAt) : null;
    }

    const [updated] = await db.update(inspectionReportItems)
      .set(updates)
      .where(and(eq(inspectionReportItems.id, req.params.itemId), eq(inspectionReportItems.reportId, report.id)))
      .returning();

    if (!updated) {
      res.status(404).json({ data: null, error: 'Item not found', meta: {} });
      return;
    }

    res.json({
      data: {
        id: updated.id,
        maintenanceCompletedAt: updated.maintenanceCompletedAt?.toISOString() ?? null,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[PATCH /account/reports/:reportId/items/:itemId/maintenance]');
    res.status(500).json({ data: null, error: 'Failed to update maintenance', meta: {} });
  }
});

// GET /api/v1/account/reports/:reportId/repair-request.pdf — generate repair request PDF
router.get('/reports/:reportId/repair-request.pdf', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    const items = await db.select().from(inspectionReportItems)
      .where(and(
        eq(inspectionReportItems.reportId, report.id),
        eq(inspectionReportItems.isIncludedInRequest, true),
      ))
      .orderBy(inspectionReportItems.sortOrder);

    if (items.length === 0) {
      res.status(400).json({ data: null, error: 'No items selected for repair request. Select items in the Negotiations tab first.', meta: {} });
      return;
    }

    const [homeowner] = await db.select({
      firstName: homeowners.firstName,
      lastName: homeowners.lastName,
      email: homeowners.email,
    }).from(homeowners).where(eq(homeowners.id, req.homeownerId)).limit(1);

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const pdfDone = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    // Resolve the "ask" for each item based on selected source
    type QuoteEntry = { providerId: string; providerName: string; providerRating: string | null; amountCents: number; availability: string | null; receivedAt: string };
    function resolveAsk(item: typeof items[number]): { cents: number; sourceLabel: string; providerName?: string; providerRating?: string | null } {
      const quotes = (item.quotes as QuoteEntry[] | null) ?? [];
      const high = item.aiCostEstimateHighCents ?? 0;
      const low = item.aiCostEstimateLowCents ?? 0;
      const estimateLabel = low > 0 && low !== high ? `Estimated (${fmt(low)}-${fmt(high)})` : 'Estimated cost';

      // User entered a custom amount
      if (item.repairRequestSource === 'custom' && item.repairRequestCustomAmountCents != null) {
        return { cents: item.repairRequestCustomAmountCents, sourceLabel: 'Custom amount' };
      }
      // User explicitly chose AI estimate
      if (item.repairRequestSource === 'estimate') {
        return { cents: high, sourceLabel: estimateLabel };
      }
      // User selected a specific provider — find that quote
      if (item.repairRequestSource) {
        const selected = quotes.find(q => q.providerId === item.repairRequestSource);
        if (selected) {
          return {
            cents: selected.amountCents,
            sourceLabel: `Quote from ${selected.providerName}`,
            providerName: selected.providerName,
            providerRating: selected.providerRating,
          };
        }
      }
      // Default: best quote if available
      if (item.quoteAmountCents && item.quoteAmountCents > 0) {
        return {
          cents: item.quoteAmountCents,
          sourceLabel: item.providerName ? `Quote from ${item.providerName}` : 'Provider quote',
          providerName: item.providerName ?? undefined,
          providerRating: item.providerRating,
        };
      }
      // Fall back to AI estimate (high)
      return { cents: high, sourceLabel: estimateLabel };
    }

    // ── Header ──
    doc.fontSize(24).fillColor('#E8632B').font('Helvetica-Bold').text('homie', 50, 50, { continued: true });
    doc.fontSize(14).fillColor('#9B9490').font('Helvetica').text(' inspect', { baseline: 'alphabetic' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#E8E4E0').stroke();
    doc.moveDown(0.6);

    // ── Title ──
    doc.fontSize(22).fillColor('#2D2926').font('Helvetica-Bold').text('REPAIR REQUEST');
    doc.moveDown(0.3);

    // ── Property + buyer info ──
    doc.fontSize(14).fillColor('#2D2926').font('Helvetica-Bold').text(report.propertyAddress);
    doc.fontSize(11).fillColor('#6B6560').font('Helvetica').text(`${report.propertyCity}, ${report.propertyState} ${report.propertyZip}`);
    doc.moveDown(0.4);

    const metaParts: string[] = [];
    if (homeowner) {
      const buyerName = [homeowner.firstName, homeowner.lastName].filter(Boolean).join(' ');
      if (buyerName) metaParts.push(`Buyer: ${buyerName}`);
    }
    if (report.inspectionDate) {
      metaParts.push(`Inspection Date: ${new Date(report.inspectionDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
    }
    metaParts.push(`Request Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
    doc.fontSize(10).fillColor('#9B9490').text(metaParts.join('  |  '));
    doc.moveDown(1);

    // ── Intro paragraph ──
    doc.fontSize(11).fillColor('#2D2926').font('Helvetica')
      .text('Following the inspection of the above property, the following items have been identified and require attention. We are requesting that the seller address each of these items prior to closing, either through completed repairs by licensed professionals or through a credit at closing equal to the amounts indicated below.', { align: 'left', lineGap: 2 });
    doc.moveDown(1);

    // ── Total ask summary box ──
    const totalAsk = items.reduce((sum, i) => sum + resolveAsk(i).cents, 0);

    const summaryY = doc.y;
    doc.roundedRect(50, summaryY, 512, 56, 6).fillAndStroke('#FEF3F2', '#F4C7C5');
    doc.fontSize(11).fillColor('#9B6260').font('Helvetica-Bold').text('TOTAL REPAIR REQUEST', 70, summaryY + 14);
    doc.fontSize(24).fillColor('#DC2626').font('Helvetica-Bold').text(fmt(totalAsk), 70, summaryY + 28);
    doc.fontSize(10).fillColor('#9B6260').font('Helvetica').text(`${items.length} item${items.length !== 1 ? 's' : ''}`, 470, summaryY + 28, { width: 75, align: 'right' });
    doc.y = summaryY + 70;

    // ── Severity helpers ──
    const sevColors: Record<string, string> = { safety_hazard: '#E24B4A', urgent: '#E24B4A', recommended: '#EF9F27', monitor: '#9B9490', informational: '#D3CEC9' };
    const sevLabels: Record<string, string> = { safety_hazard: 'Safety Hazard', urgent: 'Urgent', recommended: 'Recommended', monitor: 'Monitor', informational: 'Info' };

    // ── Item list ──
    let itemNum = 1;
    for (const item of items) {
      const ask = resolveAsk(item);
      const sevColor = sevColors[item.severity] ?? '#9B9490';

      // Estimate row height
      const noteHeight = item.homeownerNotes ? Math.ceil(item.homeownerNotes.length / 80) * 12 + 6 : 0;
      const descHeight = item.description ? Math.ceil(item.description.length / 80) * 12 : 0;
      const providerLineHeight = ask.providerName ? 14 : 0;
      const estRowHeight = 50 + noteHeight + descHeight + providerLineHeight;

      if (doc.y + estRowHeight > 720) doc.addPage();

      const rowY = doc.y;

      // Severity badge
      doc.roundedRect(50, rowY + 2, 4, estRowHeight - 8, 2).fill(sevColor);

      // Item number
      doc.fontSize(11).fillColor('#9B9490').font('Helvetica-Bold').text(`${itemNum}.`, 62, rowY, { width: 20 });

      // Title
      doc.fontSize(12).fillColor('#2D2926').font('Helvetica-Bold')
        .text(item.title, 84, rowY, { width: 320 });
      const titleEnd = doc.y;

      // Severity + category + location
      doc.fontSize(9).fillColor('#9B9490').font('Helvetica')
        .text(`${sevLabels[item.severity] ?? item.severity}  •  ${item.category.replace(/_/g, ' ')}${item.locationInProperty ? `  •  ${item.locationInProperty}` : ''}`, 84, titleEnd + 2, { width: 320 });

      // Ask amount (right side)
      doc.fontSize(13).fillColor('#DC2626').font('Helvetica-Bold')
        .text(fmt(ask.cents), 420, rowY, { width: 130, align: 'right' });
      // Subtext only shown for verified provider quotes (not for estimates or custom amounts)
      if (ask.providerName) {
        doc.fontSize(8).fillColor('#9B9490').font('Helvetica')
          .text(ask.sourceLabel, 420, rowY + 18, { width: 130, align: 'right' });
        const rating = ask.providerRating ? parseFloat(ask.providerRating) : 0;
        if (rating > 0) {
          doc.fontSize(8).fillColor('#9B9490').font('Helvetica')
            .text(`Rated ${rating.toFixed(1)}/5`, 420, rowY + 30, { width: 130, align: 'right' });
        }
      }

      doc.y = Math.max(doc.y, titleEnd + 16);

      // Description
      if (item.description) {
        doc.fontSize(10).fillColor('#4A4540').font('Helvetica').text(item.description, 84, doc.y, { width: 460, lineGap: 1 });
      }

      // Homeowner notes
      if (item.homeownerNotes) {
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor('#2563EB').font('Helvetica-Oblique')
          .text(`Note: ${item.homeownerNotes}`, 84, doc.y, { width: 460, lineGap: 1 });
      }

      doc.moveDown(0.6);
      doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#F0ECE8').stroke();
      doc.moveDown(0.4);

      itemNum++;
    }

    // ── Total at bottom ──
    if (doc.y + 80 > 720) doc.addPage();
    doc.moveDown(1);
    doc.fontSize(13).fillColor('#2D2926').font('Helvetica-Bold').text('TOTAL REQUESTED:', 50, doc.y, { continued: true });
    doc.fillColor('#DC2626').text(`  ${fmt(totalAsk)}`, { align: 'left' });
    doc.moveDown(0.6);

    // ── Signature line ──
    if (doc.y + 80 > 720) doc.addPage();
    doc.moveDown(1.5);
    doc.fontSize(10).fillColor('#9B9490').font('Helvetica').text('Buyer Signature', 50, doc.y);
    doc.moveTo(50, doc.y + 24).lineTo(280, doc.y + 24).strokeColor('#9B9490').stroke();
    doc.fontSize(10).fillColor('#9B9490').text('Date', 320, doc.y);
    doc.moveTo(320, doc.y + 24).lineTo(550, doc.y + 24).strokeColor('#9B9490').stroke();

    // ── Footer ──
    doc.y += 50;
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#E8E4E0').stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#9B9490').font('Helvetica')
      .text(`Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} by Homie Inspect  •  homiepro.ai/inspect-portal`, 50, doc.y, { align: 'center', width: 512 });

    doc.end();
    const pdfBuffer = await pdfDone;

    const addrSlug = report.propertyAddress.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const filename = `repair-request-${addrSlug}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    logger.error({ err }, '[GET /account/reports/:reportId/repair-request.pdf]');
    res.status(500).json({ data: null, error: 'Failed to generate PDF', meta: {} });
  }
});

// GET /api/v1/account/reports/:reportId/pre-listing-plan.pdf — generate seller pre-listing plan PDF
router.get('/reports/:reportId/pre-listing-plan.pdf', async (req: Request, res: Response) => {
  try {
    const [report] = await db.select().from(inspectionReports)
      .where(and(eq(inspectionReports.id, req.params.reportId), eq(inspectionReports.homeownerId, req.homeownerId)))
      .limit(1);

    if (!report) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    const items = await db.select().from(inspectionReportItems)
      .where(and(
        eq(inspectionReportItems.reportId, report.id),
        eq(inspectionReportItems.isIncludedInRequest, true),
      ))
      .orderBy(inspectionReportItems.sortOrder);

    if (items.length === 0) {
      res.status(400).json({ data: null, error: 'No items selected for the pre-listing plan. Check items to include them.', meta: {} });
      return;
    }

    const [homeowner] = await db.select({
      firstName: homeowners.firstName,
      lastName: homeowners.lastName,
    }).from(homeowners).where(eq(homeowners.id, req.homeownerId)).limit(1);

    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 50, bottom: 50, left: 50, right: 50 } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const pdfDone = new Promise<Buffer>((resolve) => { doc.on('end', () => resolve(Buffer.concat(chunks))); });

    const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

    // Classify items
    const fixItems: typeof items = [];
    const discloseItems: typeof items = [];
    const ignoreItems: typeof items = [];
    for (const item of items) {
      const sa = computeSellerAction(item.category, item.severity, item.aiCostEstimateLowCents ?? 0, item.aiCostEstimateHighCents ?? 0);
      if (sa.action === 'fix_before_listing') fixItems.push(item);
      else if (sa.action === 'disclose') discloseItems.push(item);
      else ignoreItems.push(item);
    }

    const preListingCost = fixItems.reduce((sum, i) => sum + (i.aiCostEstimateHighCents ?? 0), 0);
    const fhaVaCategories = new Set(['roofing', 'structural', 'foundation', 'electrical', 'plumbing', 'safety', 'pest_control']);
    const dealKillers = fixItems.filter(i => i.severity === 'safety_hazard' || i.severity === 'urgent' || fhaVaCategories.has(i.category)).length;
    // Rough value lift estimate: sum of fix items' avg cost * 1.3
    const valueLift = Math.round(fixItems.reduce((sum, i) => sum + ((i.aiCostEstimateLowCents ?? 0) + (i.aiCostEstimateHighCents ?? 0)) / 2, 0) * 1.3);

    // ── Header ──
    doc.fontSize(24).fillColor('#E8632B').font('Helvetica-Bold').text('homie', 50, 50, { continued: true });
    doc.fontSize(14).fillColor('#9B9490').font('Helvetica').text(' inspect', { baseline: 'alphabetic' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#E8E4E0').stroke();
    doc.moveDown(0.6);

    // ── Title ──
    doc.fontSize(22).fillColor('#E8632B').font('Helvetica-Bold').text('PRE-LISTING PLAN');
    doc.moveDown(0.3);

    // ── Property + seller info ──
    doc.fontSize(14).fillColor('#2D2926').font('Helvetica-Bold').text(report.propertyAddress);
    doc.fontSize(11).fillColor('#6B6560').font('Helvetica').text(`${report.propertyCity}, ${report.propertyState} ${report.propertyZip}`);
    doc.moveDown(0.4);

    const metaParts: string[] = [];
    if (homeowner) {
      const sellerName = [homeowner.firstName, homeowner.lastName].filter(Boolean).join(' ');
      if (sellerName) metaParts.push(`Seller: ${sellerName}`);
    }
    if (report.inspectionDate) metaParts.push(`Inspection: ${new Date(report.inspectionDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
    metaParts.push(`Plan Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`);
    doc.fontSize(10).fillColor('#9B9490').text(metaParts.join('  |  '));
    doc.moveDown(1);

    // ── Intro ──
    doc.fontSize(11).fillColor('#2D2926').font('Helvetica')
      .text('This pre-listing plan classifies each inspection finding into one of three actions: items to fix before listing, items to disclose and let the buyer price in, and items not worth acting on. Fix-before-listing items are prioritized by safety, lender requirements, and return on investment.', { align: 'left', lineGap: 2 });
    doc.moveDown(1);

    // ── Summary tiles ──
    const summaryY = doc.y;
    const tileW = 164;
    doc.roundedRect(50, summaryY, tileW, 60, 6).fillAndStroke('#FEF3F2', '#F4C7C5');
    doc.fontSize(10).fillColor('#9B6260').font('Helvetica-Bold').text('PRE-LISTING INVESTMENT', 60, summaryY + 10, { width: tileW - 20 });
    doc.fontSize(18).fillColor('#DC2626').font('Helvetica-Bold').text(fmt(preListingCost), 60, summaryY + 28, { width: tileW - 20 });
    doc.fontSize(9).fillColor('#9B6260').font('Helvetica').text(`${fixItems.length} item${fixItems.length !== 1 ? 's' : ''}`, 60, summaryY + 48);

    doc.roundedRect(50 + tileW + 10, summaryY, tileW, 60, 6).fillAndStroke('#ECFDF5', '#BBF7D0');
    doc.fontSize(10).fillColor('#047857').font('Helvetica-Bold').text('EST. VALUE LIFT', 60 + tileW + 10, summaryY + 10, { width: tileW - 20 });
    doc.fontSize(18).fillColor('#10B981').font('Helvetica-Bold').text(fmt(valueLift), 60 + tileW + 10, summaryY + 28, { width: tileW - 20 });
    doc.fontSize(9).fillColor('#047857').font('Helvetica').text('If all fix items completed', 60 + tileW + 10, summaryY + 48);

    doc.roundedRect(50 + (tileW + 10) * 2, summaryY, tileW, 60, 6).fillAndStroke('#FFF7ED', '#FED7AA');
    doc.fontSize(10).fillColor('#9A3412').font('Helvetica-Bold').text('DEAL-KILLERS', 60 + (tileW + 10) * 2, summaryY + 10, { width: tileW - 20 });
    doc.fontSize(18).fillColor('#EA580C').font('Helvetica-Bold').text(String(dealKillers), 60 + (tileW + 10) * 2, summaryY + 28, { width: tileW - 20 });
    doc.fontSize(9).fillColor('#9A3412').font('Helvetica').text('Safety / FHA-VA / urgent', 60 + (tileW + 10) * 2, summaryY + 48);
    doc.y = summaryY + 76;

    const sevColors: Record<string, string> = { safety_hazard: '#E24B4A', urgent: '#E24B4A', recommended: '#EF9F27', monitor: '#9B9490', informational: '#D3CEC9' };
    const sevLabels: Record<string, string> = { safety_hazard: 'Safety Hazard', urgent: 'Urgent', recommended: 'Recommended', monitor: 'Monitor', informational: 'Info' };

    // Helper to render a section
    function renderSection(title: string, sectionColor: string, sectionBg: string, sectionItems: typeof items, includeCost: boolean) {
      if (sectionItems.length === 0) return;
      if (doc.y > 680) doc.addPage();

      // Section header
      doc.roundedRect(50, doc.y, 512, 30, 4).fillAndStroke(sectionBg, sectionColor);
      doc.fontSize(12).fillColor(sectionColor).font('Helvetica-Bold').text(title, 60, doc.y + 8);
      doc.y += 38;

      let num = 1;
      for (const item of sectionItems) {
        const noteHeight = item.homeownerNotes ? Math.ceil(item.homeownerNotes.length / 80) * 12 + 6 : 0;
        const descHeight = item.description ? Math.ceil(item.description.length / 80) * 12 : 0;
        const estRowHeight = 42 + noteHeight + descHeight;
        if (doc.y + estRowHeight > 720) doc.addPage();

        const rowY = doc.y;
        const sevColor = sevColors[item.severity] ?? '#9B9490';
        doc.roundedRect(50, rowY + 2, 4, estRowHeight - 8, 2).fill(sevColor);
        doc.fontSize(10).fillColor('#9B9490').font('Helvetica-Bold').text(`${num}.`, 62, rowY, { width: 20 });
        doc.fontSize(11).fillColor('#2D2926').font('Helvetica-Bold').text(item.title, 84, rowY, { width: 330 });
        const titleEnd = doc.y;
        doc.fontSize(9).fillColor('#9B9490').font('Helvetica').text(`${sevLabels[item.severity] ?? item.severity}  •  ${item.category.replace(/_/g, ' ')}${item.locationInProperty ? '  •  ' + item.locationInProperty : ''}`, 84, titleEnd + 2, { width: 330 });

        if (includeCost) {
          const cost = item.aiCostEstimateHighCents ?? 0;
          doc.fontSize(12).fillColor(sectionColor).font('Helvetica-Bold').text(fmt(cost), 420, rowY, { width: 130, align: 'right' });
        }

        doc.y = Math.max(doc.y, titleEnd + 16);
        if (item.description) {
          doc.fontSize(9).fillColor('#4A4540').font('Helvetica').text(item.description, 84, doc.y, { width: 460, lineGap: 1 });
        }
        if (item.homeownerNotes) {
          doc.moveDown(0.3);
          doc.fontSize(9).fillColor('#2563EB').font('Helvetica-Oblique').text(`Note: ${item.homeownerNotes}`, 84, doc.y, { width: 460, lineGap: 1 });
        }
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#F0ECE8').stroke();
        doc.moveDown(0.3);
        num++;
      }
      doc.moveDown(0.5);
    }

    renderSection(`\uD83D\uDD27  FIX BEFORE LISTING  (${fixItems.length} items  •  ${fmt(preListingCost)})`, '#DC2626', '#FEF3F2', fixItems, true);
    renderSection(`\uD83D\uDCCB  DISCLOSE & PRICE-ADJUST  (${discloseItems.length} items)`, '#EA580C', '#FFF7ED', discloseItems, false);
    renderSection(`\u23ED\uFE0F  IGNORE  (${ignoreItems.length} items)`, '#6B6560', '#F5F5F5', ignoreItems, false);

    // Footer
    if (doc.y + 40 > 720) doc.addPage();
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(562, doc.y).strokeColor('#E8E4E0').stroke();
    doc.moveDown(0.5);
    doc.fontSize(8).fillColor('#9B9490').font('Helvetica')
      .text(`Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} by Homie Inspect  •  homiepro.ai/inspect-portal`, 50, doc.y, { align: 'center', width: 512 });

    doc.end();
    const pdfBuffer = await pdfDone;

    const addrSlug = report.propertyAddress.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    const filename = `pre-listing-plan-${addrSlug}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (err) {
    logger.error({ err }, '[GET /account/reports/:reportId/pre-listing-plan.pdf]');
    res.status(500).json({ data: null, error: 'Failed to generate PDF', meta: {} });
  }
});

// ── Supporting Documents (multi-doc analysis) ──────────────────────────────

const VALID_DOC_TYPES = new Set(['pest_report', 'seller_disclosure']);

async function ownsReport(reportId: string, homeownerId: string): Promise<boolean> {
  const [r] = await db.select({ id: inspectionReports.id }).from(inspectionReports)
    .where(and(eq(inspectionReports.id, reportId), eq(inspectionReports.homeownerId, homeownerId)))
    .limit(1);
  return !!r;
}

async function getReportToken(reportId: string, homeownerId: string): Promise<string | null> {
  const [r] = await db.select({ token: inspectionReports.clientAccessToken })
    .from(inspectionReports)
    .where(and(eq(inspectionReports.id, reportId), eq(inspectionReports.homeownerId, homeownerId)))
    .limit(1);
  return r?.token ?? null;
}

function buildDocSourcePdfUrl(clientAccessToken: string, docId: string): string {
  const base = (process.env.API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
  // Uses the report's clientAccessToken for auth so the link works when a
  // user clicks "View" — browser navigation doesn't send Authorization headers.
  return `${base}/api/v1/inspect/${clientAccessToken}/documents/${docId}/source-pdf`;
}

async function parseSupportingDocAsync(docId: string): Promise<void> {
  const [doc] = await db.select().from(inspectionSupportingDocuments)
    .where(eq(inspectionSupportingDocuments.id, docId)).limit(1);
  if (!doc) return;
  if (!doc.documentFileUrl) {
    await db.update(inspectionSupportingDocuments)
      .set({ parsingStatus: 'failed', parsingError: 'No file URL', updatedAt: new Date() })
      .where(eq(inspectionSupportingDocuments.id, docId));
    return;
  }
  try {
    const summary = await parseSupportingDoc(doc.documentType, doc.documentFileUrl);
    await db.update(inspectionSupportingDocuments)
      .set({ parsingStatus: 'parsed', parsedSummary: summary as never, updatedAt: new Date() })
      .where(eq(inspectionSupportingDocuments.id, docId));
    // Extract items from the parsed doc so they can be quoted/negotiated
    try {
      await extractItemsFromDoc(docId);
    } catch (err) {
      logger.error({ err, docId }, '[supporting-doc] Item extraction failed');
    }
    // Trigger cross-reference insight + item-link regeneration
    void generateCrossReferenceInsights(doc.reportId).catch(err =>
      logger.error({ err, reportId: doc.reportId }, '[supporting-doc] Cross-ref generation failed'),
    );
  } catch (err) {
    logger.error({ err, docId }, '[supporting-doc] Parsing failed');
    await db.update(inspectionSupportingDocuments)
      .set({ parsingStatus: 'failed', parsingError: (err as Error).message, updatedAt: new Date() })
      .where(eq(inspectionSupportingDocuments.id, docId));
  }
}

// POST /api/v1/account/reports/:reportId/documents — upload a supporting document
router.post('/reports/:reportId/documents', async (req: Request, res: Response) => {
  const body = req.body as { document_type?: string; file_data_url?: string; file_name?: string };

  if (!body.document_type || !VALID_DOC_TYPES.has(body.document_type)) {
    res.status(400).json({ data: null, error: `document_type must be one of: ${Array.from(VALID_DOC_TYPES).join(', ')}`, meta: {} });
    return;
  }
  if (!body.file_data_url || !body.file_name) {
    res.status(400).json({ data: null, error: 'file_data_url and file_name are required', meta: {} });
    return;
  }

  try {
    const token = await getReportToken(req.params.reportId, req.homeownerId);
    if (!token) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }

    // Try Cloudinary upload, fallback to data URL
    let documentFileUrl: string | null = null;
    try {
      const { uploadFile } = await import('../services/image-upload');
      const result = await uploadFile(body.file_data_url, 'homie/inspection-supporting-docs');
      if (result) documentFileUrl = result.url;
    } catch (err) {
      logger.warn({ err }, '[supporting-doc/upload] Cloudinary upload failed, using data URL directly');
    }
    if (!documentFileUrl) documentFileUrl = body.file_data_url;

    const [doc] = await db.insert(inspectionSupportingDocuments).values({
      reportId: req.params.reportId,
      documentType: body.document_type,
      fileName: body.file_name,
      documentFileUrl,
      parsingStatus: 'processing',
    }).returning();

    // Kick off async parsing
    void parseSupportingDocAsync(doc.id).catch(err =>
      logger.error({ err, docId: doc.id }, '[supporting-doc/upload] Async parse failed'),
    );

    res.status(201).json({
      data: {
        id: doc.id,
        reportId: doc.reportId,
        documentType: doc.documentType,
        fileName: doc.fileName,
        documentFileUrl: buildDocSourcePdfUrl(token, doc.id),
        parsingStatus: doc.parsingStatus,
        parsedSummary: null,
        createdAt: doc.createdAt.toISOString(),
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /account/reports/:reportId/documents]');
    res.status(500).json({ data: null, error: 'Failed to upload document', meta: {} });
  }
});

// GET /api/v1/account/reports/:reportId/documents — list documents for a report
router.get('/reports/:reportId/documents', async (req: Request, res: Response) => {
  try {
    const token = await getReportToken(req.params.reportId, req.homeownerId);
    if (!token) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    const docs = await db.select().from(inspectionSupportingDocuments)
      .where(eq(inspectionSupportingDocuments.reportId, req.params.reportId))
      .orderBy(desc(inspectionSupportingDocuments.createdAt));

    res.json({
      data: {
        documents: docs.map(d => ({
          id: d.id,
          reportId: d.reportId,
          documentType: d.documentType,
          fileName: d.fileName,
          documentFileUrl: d.documentFileUrl ? buildDocSourcePdfUrl(token, d.id) : null,
          parsingStatus: d.parsingStatus,
          parsingError: d.parsingError,
          parsedSummary: d.parsedSummary,
          createdAt: d.createdAt.toISOString(),
        })),
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account/reports/:reportId/documents]');
    res.status(500).json({ data: null, error: 'Failed to load documents', meta: {} });
  }
});

// DELETE /api/v1/account/reports/:reportId/documents/:docId — delete a supporting doc
router.delete('/reports/:reportId/documents/:docId', async (req: Request, res: Response) => {
  try {
    if (!await ownsReport(req.params.reportId, req.homeownerId)) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    // Delete items extracted from this doc first (the FK is ON DELETE SET NULL,
    // but doc-sourced items don't make sense without the source doc)
    await db.delete(inspectionReportItems)
      .where(and(
        eq(inspectionReportItems.reportId, req.params.reportId),
        eq(inspectionReportItems.sourceDocumentId, req.params.docId),
      ));
    const result = await db.delete(inspectionSupportingDocuments)
      .where(and(
        eq(inspectionSupportingDocuments.id, req.params.docId),
        eq(inspectionSupportingDocuments.reportId, req.params.reportId),
      )).returning({ id: inspectionSupportingDocuments.id });
    if (result.length === 0) {
      res.status(404).json({ data: null, error: 'Document not found', meta: {} });
      return;
    }
    // Regenerate insights + cross-refs without this doc's items
    void generateCrossReferenceInsights(req.params.reportId).catch(err =>
      logger.error({ err }, '[supporting-doc/delete] Cross-ref regen failed'),
    );
    res.json({ data: { deleted: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[DELETE /account/reports/:reportId/documents/:docId]');
    res.status(500).json({ data: null, error: 'Failed to delete document', meta: {} });
  }
});

// POST /api/v1/account/reports/:reportId/documents/:docId/reprocess — re-extract items + regenerate insights for an already-parsed doc
router.post('/reports/:reportId/documents/:docId/reprocess', async (req: Request, res: Response) => {
  try {
    if (!await ownsReport(req.params.reportId, req.homeownerId)) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    const [doc] = await db.select().from(inspectionSupportingDocuments)
      .where(and(
        eq(inspectionSupportingDocuments.id, req.params.docId),
        eq(inspectionSupportingDocuments.reportId, req.params.reportId),
      )).limit(1);
    if (!doc) {
      res.status(404).json({ data: null, error: 'Document not found', meta: {} });
      return;
    }
    if (doc.parsingStatus !== 'parsed' || !doc.parsedSummary) {
      res.status(400).json({ data: null, error: 'Document has not been parsed successfully yet', meta: {} });
      return;
    }
    // Remove existing items from this doc, then re-extract
    await db.delete(inspectionReportItems)
      .where(and(
        eq(inspectionReportItems.reportId, req.params.reportId),
        eq(inspectionReportItems.sourceDocumentId, req.params.docId),
      ));
    let itemsExtracted = 0;
    try {
      itemsExtracted = await extractItemsFromDoc(req.params.docId);
    } catch (err) {
      logger.error({ err, docId: req.params.docId }, '[supporting-doc/reprocess] Extraction failed');
    }
    // Regenerate insights + cross-refs
    const insights = await generateCrossReferenceInsights(req.params.reportId).catch(err => {
      logger.error({ err }, '[supporting-doc/reprocess] Cross-ref regen failed');
      return [];
    });
    res.json({
      data: {
        itemsExtracted,
        insightsGenerated: insights.length,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /account/reports/:reportId/documents/:docId/reprocess]');
    res.status(500).json({ data: null, error: 'Failed to reprocess document', meta: {} });
  }
});

// GET /api/v1/account/reports/:reportId/documents/:docId/source-pdf — proxy the doc PDF
router.get('/reports/:reportId/documents/:docId/source-pdf', async (req: Request, res: Response) => {
  try {
    if (!await ownsReport(req.params.reportId, req.homeownerId)) {
      res.status(404).send('Not found');
      return;
    }
    const [doc] = await db.select({ documentFileUrl: inspectionSupportingDocuments.documentFileUrl })
      .from(inspectionSupportingDocuments)
      .where(and(
        eq(inspectionSupportingDocuments.id, req.params.docId),
        eq(inspectionSupportingDocuments.reportId, req.params.reportId),
      )).limit(1);
    if (!doc || !doc.documentFileUrl) {
      res.status(404).send('Document not found');
      return;
    }
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
    logger.error({ err }, '[GET /account/reports/:reportId/documents/:docId/source-pdf]');
    res.status(500).send('Failed to load document');
  }
});

// GET /api/v1/account/reports/:reportId/insights — fetch cached cross-reference insights
router.get('/reports/:reportId/insights', async (req: Request, res: Response) => {
  try {
    if (!await ownsReport(req.params.reportId, req.homeownerId)) {
      res.status(404).json({ data: null, error: 'Report not found', meta: {} });
      return;
    }
    const [row] = await db.select().from(inspectionCrossReferenceInsights)
      .where(eq(inspectionCrossReferenceInsights.reportId, req.params.reportId))
      .limit(1);
    res.json({
      data: {
        insights: row ? row.insights : [],
        generatedAt: row ? row.generatedAt.toISOString() : null,
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account/reports/:reportId/insights]');
    res.status(500).json({ data: null, error: 'Failed to load insights', meta: {} });
  }
});

// GET /api/v1/account/documents — aggregate list of all of the homeowner's supporting docs
router.get('/documents', async (req: Request, res: Response) => {
  try {
    // Get all reports for this homeowner
    const reports = await db.select({
      id: inspectionReports.id,
      propertyAddress: inspectionReports.propertyAddress,
      clientAccessToken: inspectionReports.clientAccessToken,
    }).from(inspectionReports)
      .where(eq(inspectionReports.homeownerId, req.homeownerId));

    const reportIds = reports.map(r => r.id);
    if (reportIds.length === 0) {
      res.json({ data: { documents: [] }, error: null, meta: {} });
      return;
    }

    const docs = await db.select().from(inspectionSupportingDocuments)
      .where(inArray(inspectionSupportingDocuments.reportId, reportIds))
      .orderBy(desc(inspectionSupportingDocuments.createdAt));

    const reportMap = new Map(reports.map(r => [r.id, r]));

    res.json({
      data: {
        documents: docs.map(d => {
          const report = reportMap.get(d.reportId);
          return {
            id: d.id,
            reportId: d.reportId,
            reportAddress: report?.propertyAddress ?? '',
            documentType: d.documentType,
            fileName: d.fileName,
            documentFileUrl: d.documentFileUrl && report?.clientAccessToken
              ? buildDocSourcePdfUrl(report.clientAccessToken, d.id)
              : null,
            parsingStatus: d.parsingStatus,
            parsedSummary: d.parsedSummary,
            createdAt: d.createdAt.toISOString(),
          };
        }),
      },
      error: null, meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account/documents]');
    res.status(500).json({ data: null, error: 'Failed to load documents', meta: {} });
  }
});

export default router;
