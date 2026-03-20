import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { jobs } from '../db/schema/jobs';
import { bookings } from '../db/schema/bookings';
import { providers } from '../db/schema/providers';
import { providerResponses } from '../db/schema/provider-responses';
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
        created_at: homeowner.createdAt.toISOString(),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    console.error('[GET /account]', err);
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
    console.error('[PATCH /account]', err);
    res.status(500).json({ data: null, error: 'Failed to update account', meta: {} });
  }
});

// GET /api/v1/account/jobs
router.get('/jobs', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(jobs)
      .where(eq(jobs.homeownerId, req.homeownerId))
      .orderBy(desc(jobs.createdAt));

    res.json({
      data: {
        jobs: rows.map((j) => ({
          id: j.id,
          status: j.status,
          tier: j.tier,
          zip_code: j.zipCode,
          diagnosis: j.diagnosis,
          created_at: j.createdAt.toISOString(),
          expires_at: j.expiresAt?.toISOString() ?? null,
        })),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    console.error('[GET /account/jobs]', err);
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
    console.error('[GET /account/bookings]', err);
    res.status(500).json({ data: null, error: 'Failed to fetch bookings', meta: {} });
  }
});

export default router;
