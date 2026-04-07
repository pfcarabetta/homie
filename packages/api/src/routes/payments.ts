import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { homeowners } from '../db/schema/homeowners';
import { ApiResponse } from '../types/api';
import { getOrCreateCustomer, createCheckoutSession } from '../services/stripe';
import { dispatchJob } from '../services/orchestration';

const router = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BASE_URL = process.env.API_BASE_URL ?? 'https://api.homie.app';
const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

// POST /api/v1/payments/checkout
router.post('/checkout', async (req: Request, res: Response) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(503).json({ data: null, error: 'Payment processing is not configured', meta: {} });
    return;
  }

  const { job_id, response_id, provider_id, return_path } = req.body as {
    job_id?: string;
    response_id?: string;
    provider_id?: string;
    return_path?: string;
  };

  if (!job_id || !UUID_RE.test(job_id)) {
    res.status(400).json({ data: null, error: 'job_id must be a valid UUID', meta: {} });
    return;
  }

  try {
    const [job] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, job_id), eq(jobs.homeownerId, req.homeownerId)))
      .limit(1);

    if (!job) {
      res.status(404).json({ data: null, error: 'Job not found', meta: {} });
      return;
    }

    if (job.paymentStatus === 'paid') {
      res.status(409).json({ data: null, error: 'Job is already paid', meta: {} });
      return;
    }

    const [homeowner] = await db
      .select({ email: homeowners.email })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);

    const customerId = await getOrCreateCustomer(req.homeownerId, homeowner.email);

    const session = await createCheckoutSession({
      customerId,
      jobId: job.id,
      tier: job.tier,
      responseId: response_id ?? '',
      providerId: provider_id ?? '',
      successUrl: `${APP_URL}${return_path ?? '/quote'}?paid=1`,
      cancelUrl: `${APP_URL}${return_path ?? '/quote'}`,
    });

    await db.update(jobs).set({
      paymentStatus: 'pending',
      stripeSessionId: session.id,
    }).where(eq(jobs.id, job.id));

    const out: ApiResponse<{ checkout_url: string }> = {
      data: { checkout_url: session.url! },
      error: null,
      meta: {},
    };
    res.json(out);
  } catch (err) {
    logger.error({ err }, '[POST /payments/checkout]');
    res.status(500).json({ data: null, error: 'Failed to create checkout session', meta: {} });
  }
});

// GET /api/v1/payments/status/:jobId
router.get('/status/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  if (!UUID_RE.test(jobId)) {
    res.status(400).json({ data: null, error: 'Invalid job ID', meta: {} });
    return;
  }

  try {
    const [job] = await db
      .select({ paymentStatus: jobs.paymentStatus, status: jobs.status })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.homeownerId, req.homeownerId)))
      .limit(1);

    if (!job) {
      res.status(404).json({ data: null, error: 'Job not found', meta: {} });
      return;
    }

    res.json({ data: { payment_status: job.paymentStatus, job_status: job.status }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /payments/status]');
    res.status(500).json({ data: null, error: 'Failed to fetch payment status', meta: {} });
  }
});

// POST /api/v1/payments/dispatch/:jobId
// Called by frontend after returning from Stripe to trigger outreach
// Only dispatches if payment is authorized and job hasn't started yet
router.post('/dispatch/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  if (!UUID_RE.test(jobId)) {
    res.status(400).json({ data: null, error: 'Invalid job ID', meta: {} });
    return;
  }

  try {
    const [job] = await db
      .select({ paymentStatus: jobs.paymentStatus, status: jobs.status })
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.homeownerId, req.homeownerId)))
      .limit(1);

    if (!job) {
      res.status(404).json({ data: null, error: 'Job not found', meta: {} });
      return;
    }

    if (job.paymentStatus !== 'authorized' && job.paymentStatus !== 'paid') {
      res.status(402).json({ data: null, error: 'Payment required', meta: {} });
      return;
    }

    // Only dispatch if not already dispatching/collecting
    if (job.status === 'open') {
      await db.update(jobs).set({ status: 'dispatching' }).where(eq(jobs.id, jobId));
      dispatchJob(jobId).catch((err: unknown) => logger.error({ err }, `[payments] dispatchJob failed for ${jobId}`));
      logger.info(`[payments] Dispatching job ${jobId} after payment confirmation`);
    }

    res.json({ data: { dispatched: true, status: job.status === 'open' ? 'dispatching' : job.status }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /payments/dispatch]');
    res.status(500).json({ data: null, error: 'Failed to dispatch', meta: {} });
  }
});

export default router;
