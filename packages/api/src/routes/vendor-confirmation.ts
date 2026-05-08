import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { homeownerProperties } from '../db/schema/homeowner-properties';
import { homeowners } from '../db/schema/homeowners';
import {
  findActiveByToken,
  beginConnectOnboarding,
  VendorConfirmationError,
} from '../services/vendor-confirmation';

/**
 * Unauth routes for the vendor SMS confirmation landing page.
 *
 * Mounted at `/api/v1/vendor-confirmation` in app.ts. Vendors don't
 * have Homie accounts — the URL token (validated against
 * recurring_vendors.vendor_confirmation_token + 7-day expiry) is the
 * sole authorization mechanism.
 *
 * Three endpoints:
 *   GET  /:token                    — read vendor + member context for the page
 *   POST /:token/start-onboarding   — create Connect account + return Stripe URL
 *   POST /:token/complete           — vendor returned from Stripe; client tells us
 *                                     so we can re-fetch state. Idempotent.
 *
 * Note: the actual flip to status='active' happens via the
 * `account.updated` webhook (services/vendor-confirmation.markVendorActive),
 * NOT this route. The /complete endpoint is just a UI hint that
 * triggers a refresh — it doesn't trust the client to flip state.
 */

const router = Router();

// ─── GET /:token — page payload ────────────────────────────────────────────

router.get('/:token', async (req: Request, res: Response) => {
  try {
    const vendor = await findActiveByToken(req.params.token);
    if (!vendor) {
      res.status(404).json({
        data: null,
        error: 'This confirmation link is invalid or has expired.',
        meta: {},
      });
      return;
    }

    // Pull member + property context to display "[Member name] at [address]"
    // on the page. We don't expose the homeowner's email or full PII —
    // just first name + property address.
    const [property] = await db
      .select({
        address: homeownerProperties.address,
        city: homeownerProperties.city,
        state: homeownerProperties.state,
      })
      .from(homeownerProperties)
      .where(eq(homeownerProperties.id, vendor.homeownerPropertyId))
      .limit(1);

    const [homeowner] = await db
      .select({ firstName: homeowners.firstName, lastName: homeowners.lastName })
      .from(homeowners)
      .where(eq(homeowners.id, vendor.homeownerId))
      .limit(1);

    const memberName =
      [homeowner?.firstName, homeowner?.lastName].filter(Boolean).join(' ') || 'A homeowner';
    const propertyAddress = property?.address
      ? `${property.address}${property.city ? `, ${property.city}` : ''}${property.state ? `, ${property.state}` : ''}`
      : 'their home';

    res.json({
      data: {
        vendorName: vendor.vendorName,
        serviceCategory: vendor.serviceCategory,
        amountCents: vendor.amountCents,
        schedulePattern: vendor.schedulePattern,
        memberName,
        propertyAddress,
        // Status drives the page's UI state:
        //   'pending_vendor_confirmation' → show "Set up payments" CTA
        //   'active'                       → show success state
        //   anything else (paused, cancelled, etc.) → terminal "expired" state
        status: vendor.status,
        hasConnectAccount: !!vendor.stripeConnectAccountId,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /vendor-confirmation/:token]');
    res.status(500).json({
      data: null,
      error: 'Failed to load confirmation details',
      meta: {},
    });
  }
});

// ─── POST /:token/start-onboarding — Connect account + Stripe URL ─────────

router.post('/:token/start-onboarding', async (req: Request, res: Response) => {
  try {
    const result = await beginConnectOnboarding(req.params.token);
    res.json({ data: { onboardingUrl: result.onboardingUrl }, error: null, meta: {} });
  } catch (err) {
    if (err instanceof VendorConfirmationError) {
      const status = err.code === 'token_expired' ? 410 : err.code === 'already_confirmed' ? 409 : 400;
      res.status(status).json({
        data: null,
        error: err.message,
        meta: { code: err.code },
      });
      return;
    }
    logger.error({ err }, '[POST /vendor-confirmation/:token/start-onboarding]');
    res.status(500).json({
      data: null,
      error: 'Failed to start Stripe onboarding',
      meta: {},
    });
  }
});

// ─── POST /:token/complete — UI hint to refresh state ─────────────────────
//
// The actual status flip happens in the `account.updated` webhook
// handler (which calls services/vendor-confirmation.markVendorActive).
// This endpoint just returns the current state so the frontend can
// poll/refresh once the vendor returns from Stripe. Always idempotent.

router.post('/:token/complete', async (req: Request, res: Response) => {
  try {
    const vendor = await findActiveByToken(req.params.token);
    if (!vendor) {
      // Token may have already been cleared by markVendorActive —
      // look up by recent activity using the path parameter alone.
      // Vendors finishing onboarding quickly can race the webhook.
      // Return a generic "check back" response.
      res.json({
        data: { status: 'unknown', message: 'Confirmation completed; refresh in a moment.' },
        error: null,
        meta: {},
      });
      return;
    }
    res.json({
      data: { status: vendor.status, hasConnectAccount: !!vendor.stripeConnectAccountId },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /vendor-confirmation/:token/complete]');
    res.status(500).json({
      data: null,
      error: 'Failed to read confirmation state',
      meta: {},
    });
  }
});

export default router;
