import { Router, Request, Response } from 'express';
import { eq, desc, and } from 'drizzle-orm';
import crypto from 'crypto';
import logger from '../logger';
import { db } from '../db';
import {
  jobs,
  properties,
  bookings,
  providers,
  jobTrackingLinks,
  jobTrackingEvents,
  TRACKING_EVENT_TYPES,
} from '../db/schema';
import type { TrackingEventType } from '../db/schema';
import { ApiResponse } from '../types/api';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url').slice(0, 32);
}

// ── Public router (no auth) ──────────────────────────────────────────────────

export const trackingPublicRouter = Router();

// GET /api/v1/tracking/:token
trackingPublicRouter.get('/:token', async (req: Request, res: Response) => {
  const { token } = req.params;

  try {
    const [link] = await db
      .select()
      .from(jobTrackingLinks)
      .where(eq(jobTrackingLinks.trackingToken, token))
      .limit(1);

    if (!link) {
      const out: ApiResponse<{ expired: boolean }> = {
        data: { expired: true },
        error: 'Tracking link not found',
        meta: {},
      };
      res.status(404).json(out);
      return;
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      const out: ApiResponse<{ expired: boolean }> = {
        data: { expired: true },
        error: 'Tracking link has expired',
        meta: {},
      };
      res.status(404).json(out);
      return;
    }

    const [job] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, link.jobId))
      .limit(1);

    if (!job) {
      const out: ApiResponse<{ expired: boolean }> = {
        data: { expired: true },
        error: 'Job not found',
        meta: {},
      };
      res.status(404).json(out);
      return;
    }

    const timeline = await db
      .select()
      .from(jobTrackingEvents)
      .where(eq(jobTrackingEvents.jobId, link.jobId))
      .orderBy(desc(jobTrackingEvents.createdAt));

    // Look up provider info only if a booking exists
    let providerInfo: { name: string; rating: string | null } | null = null;
    const [booking] = await db
      .select({ providerId: bookings.providerId })
      .from(bookings)
      .where(eq(bookings.jobId, link.jobId))
      .limit(1);

    if (booking) {
      const [provider] = await db
        .select({ name: providers.name, googleRating: providers.googleRating })
        .from(providers)
        .where(eq(providers.id, booking.providerId))
        .limit(1);

      if (provider) {
        // Show first name + last initial only
        const parts = provider.name.trim().split(/\s+/);
        const safeName =
          parts.length > 1
            ? `${parts[0]} ${parts[parts.length - 1][0]}.`
            : parts[0];

        providerInfo = {
          name: safeName,
          rating: provider.googleRating,
        };
      }
    }

    const diagnosis = job.diagnosis as { category?: string; severity?: string; summary?: string } | null;

    const lastEvent = timeline[0];
    const lastUpdated = lastEvent
      ? lastEvent.createdAt.toISOString()
      : job.createdAt.toISOString();

    const out: ApiResponse<{
      property_name: string;
      job_title: string | null;
      job_category: string | null;
      severity: string | null;
      status: string;
      timeline: Array<{
        event_type: string;
        title: string;
        description: string | null;
        metadata: Record<string, unknown> | null;
        created_at: string;
      }>;
      provider: { name: string; rating: string | null } | null;
      last_updated: string;
    }> = {
      data: {
        property_name: link.propertyName,
        job_title: diagnosis?.summary ?? null,
        job_category: diagnosis?.category ?? null,
        severity: diagnosis?.severity ?? null,
        status: job.status,
        timeline: timeline.map((e) => ({
          event_type: e.eventType,
          title: e.title,
          description: e.description,
          metadata: e.metadata,
          created_at: e.createdAt.toISOString(),
        })),
        provider: providerInfo,
        last_updated: lastUpdated,
      },
      error: null,
      meta: {},
    };
    res.json(out);
  } catch (err) {
    logger.error({ err }, '[GET /tracking/:token]');
    const out: ApiResponse<null> = { data: null, error: 'Failed to fetch tracking info', meta: {} };
    res.status(500).json(out);
  }
});

// ── Authenticated router ─────────────────────────────────────────────────────

export const trackingAuthRouter = Router();

// POST /api/v1/jobs/:id/tracking
trackingAuthRouter.post('/:id/tracking', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    const out: ApiResponse<null> = { data: null, error: 'Invalid job ID', meta: {} };
    res.status(400).json(out);
    return;
  }

  const body = req.body as {
    notify_phone?: string;
    notify_email?: string;
    property_name?: string;
  };

  try {
    // Verify job ownership
    const [job] = await db
      .select({ homeownerId: jobs.homeownerId, propertyId: jobs.propertyId })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    if (!job) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    if (job.homeownerId !== req.homeownerId) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }

    // Resolve property name
    let propertyName = body.property_name ?? '';
    if (!propertyName && job.propertyId) {
      const [property] = await db
        .select({ name: properties.name })
        .from(properties)
        .where(eq(properties.id, job.propertyId))
        .limit(1);
      if (property) {
        propertyName = property.name;
      }
    }
    if (!propertyName) {
      propertyName = 'My Property';
    }

    const token = generateToken();

    const [link] = await db
      .insert(jobTrackingLinks)
      .values({
        jobId: id,
        trackingToken: token,
        notifyPhone: body.notify_phone ?? null,
        notifyEmail: body.notify_email ?? null,
        propertyName,
        createdBy: req.homeownerId,
      })
      .returning();

    const trackingUrl = `https://homiepro.ai/t/${token}`;

    const out: ApiResponse<{
      tracking_token: string;
      tracking_url: string;
      notify_phone: string | null;
      notify_email: string | null;
    }> = {
      data: {
        tracking_token: link.trackingToken,
        tracking_url: trackingUrl,
        notify_phone: link.notifyPhone,
        notify_email: link.notifyEmail,
      },
      error: null,
      meta: {},
    };
    res.status(201).json(out);
  } catch (err) {
    logger.error({ err }, '[POST /jobs/:id/tracking]');
    const out: ApiResponse<null> = { data: null, error: 'Failed to create tracking link', meta: {} };
    res.status(500).json(out);
  }
});

// POST /api/v1/jobs/:id/tracking/events
trackingAuthRouter.post('/:id/tracking/events', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) {
    const out: ApiResponse<null> = { data: null, error: 'Invalid job ID', meta: {} };
    res.status(400).json(out);
    return;
  }

  const body = req.body as {
    event_type?: string;
    title?: string;
    description?: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.event_type || !TRACKING_EVENT_TYPES.includes(body.event_type as TrackingEventType)) {
    const out: ApiResponse<null> = {
      data: null,
      error: `event_type must be one of: ${TRACKING_EVENT_TYPES.join(', ')}`,
      meta: {},
    };
    res.status(400).json(out);
    return;
  }
  if (!body.title) {
    const out: ApiResponse<null> = { data: null, error: 'title is required', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    // Verify job ownership
    const [job] = await db
      .select({ homeownerId: jobs.homeownerId })
      .from(jobs)
      .where(eq(jobs.id, id))
      .limit(1);

    if (!job) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }
    if (job.homeownerId !== req.homeownerId) {
      const out: ApiResponse<null> = { data: null, error: 'Job not found', meta: {} };
      res.status(404).json(out);
      return;
    }

    const [event] = await db
      .insert(jobTrackingEvents)
      .values({
        jobId: id,
        eventType: body.event_type as TrackingEventType,
        title: body.title,
        description: body.description ?? null,
        metadata: body.metadata ?? null,
      })
      .returning();

    // Look up all tracking links for this job and send notifications
    const links = await db
      .select()
      .from(jobTrackingLinks)
      .where(eq(jobTrackingLinks.jobId, id));

    if (links.length > 0) {
      // Dynamic imports to match existing codebase pattern
      const { sendSms, sendEmail } = await import('../services/notifications');

      for (const link of links) {
        const trackingUrl = `https://homiepro.ai/t/${link.trackingToken}`;

        if (link.notifyPhone) {
          void sendSms(
            link.notifyPhone,
            `🏠 ${link.propertyName} — ${body.title}. View status: ${trackingUrl}`,
          );
        }

        if (link.notifyEmail) {
          const emailHtml = `
            <div style="font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; background: #F9F5F2; padding: 32px 20px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <span style="font-family: 'Fraunces', Georgia, serif; font-size: 28px; font-weight: 700; color: #E8632B;">homie</span>
              </div>
              <div style="background: #ffffff; border-radius: 16px; padding: 32px 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <div style="font-size: 12px; font-weight: 600; color: #9B9490; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Maintenance Update</div>
                <h2 style="margin: 0 0 6px; font-size: 22px; font-weight: 700; color: #2D2926; font-family: 'Fraunces', Georgia, serif;">${link.propertyName}</h2>
                <p style="margin: 0 0 20px; color: #6B6560; font-size: 16px; line-height: 1.6;">${body.title}</p>
                ${body.description ? `<p style="margin: 0 0 20px; color: #9B9490; font-size: 14px; line-height: 1.6;">${body.description}</p>` : ''}
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
                  <a href="${trackingUrl}" style="display: inline-block; background: #E8632B; color: #ffffff; padding: 14px 36px; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 16px;">View Status</a>
                </td></tr></table>
              </div>
              <div style="text-align: center; margin-top: 24px;">
                <p style="color: #9B9490; font-size: 12px; margin: 0; line-height: 1.5;">
                  Sent by <a href="https://homiepro.ai" style="color: #E8632B; text-decoration: none; font-weight: 600;">homie</a> — Your home's best friend
                </p>
              </div>
            </div>
          `;
          void sendEmail(
            link.notifyEmail,
            `🏠 ${link.propertyName} — ${body.title}`,
            emailHtml,
          );
        }
      }
    }

    const out: ApiResponse<{
      id: string;
      event_type: string;
      title: string;
      description: string | null;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }> = {
      data: {
        id: event.id,
        event_type: event.eventType,
        title: event.title,
        description: event.description,
        metadata: event.metadata,
        created_at: event.createdAt.toISOString(),
      },
      error: null,
      meta: {},
    };
    res.status(201).json(out);
  } catch (err) {
    logger.error({ err }, '[POST /jobs/:id/tracking/events]');
    const out: ApiResponse<null> = { data: null, error: 'Failed to create tracking event', meta: {} };
    res.status(500).json(out);
  }
});
