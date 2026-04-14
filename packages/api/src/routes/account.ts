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
import { inspectionReports, inspectionReportItems } from '../db/schema/inspector';
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
      itemsParsed: inspectionReports.itemsParsed,
      itemsDispatched: inspectionReports.itemsDispatched,
      itemsQuoted: inspectionReports.itemsQuoted,
      totalQuoteValueCents: inspectionReports.totalQuoteValueCents,
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
          aiCostEstimateLowCents: inspectionReportItems.aiCostEstimateLowCents,
          aiCostEstimateHighCents: inspectionReportItems.aiCostEstimateHighCents,
          dispatchStatus: inspectionReportItems.dispatchStatus,
          quoteAmountCents: inspectionReportItems.quoteAmountCents,
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
        itemCount: reportItems.length,
        dispatchedCount,
        quotedCount,
        totalEstimateLow,
        totalEstimateHigh,
        totalQuoteValue,
        createdAt: r.createdAt,
        items: reportItems.map(i => ({
          id: i.id,
          title: i.title,
          severity: i.severity,
          category: i.category,
          costEstimateMin: i.aiCostEstimateLowCents,
          costEstimateMax: i.aiCostEstimateHighCents,
          dispatchStatus: i.dispatchStatus,
          quoteAmount: i.quoteAmountCents,
        })),
      };
    });

    res.json({ data: { reports: data }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /account/reports]');
    res.status(500).json({ data: null, error: 'Failed to load reports', meta: {} });
  }
});

// Per-report pricing tiers
const REPORT_TIER_PRICES: Record<string, { cents: number; label: string }> = {
  essential: { cents: 9900, label: 'Essential' },
  professional: { cents: 19900, label: 'Professional' },
  premium: { cents: 29900, label: 'Premium' },
};

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

    // Get items to dispatch
    const itemsToDispatch = await db.select().from(inspectionReportItems)
      .where(and(
        eq(inspectionReportItems.reportId, report.id),
        sql`${inspectionReportItems.dispatchStatus} IN ('not_dispatched', 'pending_dispatch')`,
        sql`${inspectionReportItems.severity} != 'informational'`,
      ));

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
          summary: `Inspection report — ${items.length} ${category.replace(/_/g, ' ')} item${items.length !== 1 ? 's' : ''} at ${report.propertyAddress}, ${report.propertyCity} ${report.propertyState}:\n${itemSummaries.join('\n')}\n\nView full details & photos: ${providerReportUrl}`,
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

export default router;
