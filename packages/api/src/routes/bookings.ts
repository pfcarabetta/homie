import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { bookings, providers, providerResponses } from '../db/schema';
import { BookingResponse } from '../types/jobs';
import { ApiResponse } from '../types/api';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/v1/bookings/:id
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    const out: ApiResponse<null> = { data: null, error: 'Invalid booking ID', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    const rows = await db
      .select({ booking: bookings, provider: providers, response: providerResponses })
      .from(bookings)
      .innerJoin(providers, eq(bookings.providerId, providers.id))
      .leftJoin(providerResponses, eq(bookings.responseId, providerResponses.id))
      .where(and(eq(bookings.id, id), eq(bookings.homeownerId, req.homeownerId)))
      .limit(1);

    if (rows.length === 0) {
      const out: ApiResponse<null> = { data: null, error: 'Booking not found', meta: {} };
      res.status(404).json(out);
      return;
    }

    const { booking: b, provider: p, response: r } = rows[0];

    const out: ApiResponse<BookingResponse> = {
      data: {
        id: b.id,
        job_id: b.jobId,
        provider: { id: p.id, name: p.name, phone: p.phone },
        status: b.status,
        confirmed_at: b.confirmedAt.toISOString(),
        quoted_price: r?.quotedPrice ?? null,
        scheduled: r?.availability ?? null,
      },
      error: null,
      meta: {},
    };
    res.json(out);
  } catch (err) {
    logger.error({ err }, '[GET /bookings/:id]');
    const out: ApiResponse<null> = { data: null, error: 'Failed to fetch booking', meta: {} };
    res.status(500).json(out);
  }
});

export default router;
