import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import {
  getOrCreateCustomer,
  createMembershipCheckout,
  changeSubscriptionTier,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  getSubscription,
  getMembershipPriceId,
} from '../services/stripe';

/**
 * Membership subscription routes (Phase 1, Session 6).
 *
 * Mounted at `/api/v1/account/subscriptions` under `requireAuth`.
 * Handles the consumer-side Plus / Premier subscription lifecycle.
 *
 *   POST /upgrade      — start a Stripe Checkout Session for a paid tier.
 *                        For Free → Plus / Premier. For Plus → Premier and
 *                        Premier → Plus, calls `changeSubscriptionTier`
 *                        directly without going through Checkout.
 *   POST /cancel       — cancel at period end. Member keeps access until renewal.
 *   POST /reactivate   — undo a pending cancellation.
 *   GET  /current      — current tier + next renewal + cancel-pending state.
 */

const router = Router();

const RANK: Record<'free' | 'plus' | 'premier', number> = { free: 0, plus: 1, premier: 2 };
function isValidTier(tier: string): tier is 'free' | 'plus' | 'premier' {
  return tier === 'free' || tier === 'plus' || tier === 'premier';
}

function get503ForUnconfiguredPrices(tier: 'plus' | 'premier'): { status: 503; body: { data: null; error: string; meta: object } } {
  return {
    status: 503,
    body: {
      data: null,
      error: `Membership pricing not configured. Set STRIPE_PRICE_${tier.toUpperCase()}_MONTHLY before allowing upgrades.`,
      meta: {},
    },
  };
}

// ─── GET /current ──────────────────────────────────────────────────────────

router.get('/current', async (req: Request, res: Response) => {
  try {
    const [row] = await db
      .select({
        tier: homeowners.membershipTier,
        stripeSubscriptionId: homeowners.stripeSubscriptionId,
        tierStartedAt: homeowners.tierStartedAt,
        tierRenewsAt: homeowners.tierRenewsAt,
        tierCancelsAt: homeowners.tierCancelsAt,
      })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);

    if (!row) {
      res.status(404).json({ data: null, error: 'Homeowner not found', meta: {} });
      return;
    }

    res.json({
      data: {
        tier: row.tier,
        stripeSubscriptionId: row.stripeSubscriptionId,
        tierStartedAt: row.tierStartedAt,
        tierRenewsAt: row.tierRenewsAt,
        tierCancelsAt: row.tierCancelsAt,
        cancelAtPeriodEnd: row.tierCancelsAt != null,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /account/subscriptions/current]');
    res.status(500).json({ data: null, error: 'Failed to load subscription', meta: {} });
  }
});

// ─── POST /upgrade ─────────────────────────────────────────────────────────

router.post('/upgrade', async (req: Request, res: Response) => {
  try {
    const body = req.body as { tier?: unknown };
    const targetTier = typeof body.tier === 'string' ? body.tier : '';
    if (targetTier !== 'plus' && targetTier !== 'premier') {
      res.status(400).json({ data: null, error: 'tier must be "plus" or "premier"', meta: {} });
      return;
    }
    if (!getMembershipPriceId(targetTier)) {
      const fail = get503ForUnconfiguredPrices(targetTier);
      res.status(fail.status).json(fail.body);
      return;
    }

    const [hRow] = await db
      .select({
        email: homeowners.email,
        membershipTier: homeowners.membershipTier,
        stripeSubscriptionId: homeowners.stripeSubscriptionId,
      })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);
    if (!hRow) {
      res.status(404).json({ data: null, error: 'Homeowner not found', meta: {} });
      return;
    }
    const currentTier = hRow.membershipTier;
    if (!isValidTier(currentTier)) {
      res.status(500).json({ data: null, error: 'Invalid current tier', meta: {} });
      return;
    }

    // Tier-equality is a no-op (already paying for that tier)
    if (currentTier === targetTier) {
      res.status(400).json({
        data: null,
        error: `You are already on the ${targetTier} tier.`,
        meta: { currentTier, targetTier },
      });
      return;
    }

    // Plus ↔ Premier: switch the existing subscription instead of
    // creating a new one. Otherwise we'd double-charge.
    if (hRow.stripeSubscriptionId && currentTier !== 'free') {
      const upgrade = RANK[targetTier] > RANK[currentTier];
      const subscription = await changeSubscriptionTier({
        subscriptionId: hRow.stripeSubscriptionId,
        newTier: targetTier,
        upgrade,
      });
      res.json({
        data: {
          mode: 'tier_change',
          upgrade,
          subscriptionId: subscription.id,
          // Webhook is the source of truth for tier flip; the change here
          // shows up via `customer.subscription.updated` shortly after.
          // The frontend should poll /current or wait for the webhook
          // to refresh.
        },
        error: null,
        meta: {},
      });
      return;
    }

    // Free → paid: open a Checkout Session. The Stripe webhook flips
    // membership_tier when the checkout completes.
    const customerId = await getOrCreateCustomer(req.homeownerId, hRow.email);
    const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
    const session = await createMembershipCheckout({
      customerId,
      homeownerId: req.homeownerId,
      tier: targetTier,
      successUrl: `${APP_URL}/membership?upgraded=${targetTier}`,
      cancelUrl: `${APP_URL}/membership`,
    });
    if (!session.url) throw new Error('Stripe returned a Checkout Session without a URL');
    res.json({
      data: { mode: 'checkout', checkoutUrl: session.url },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /account/subscriptions/upgrade]');
    res.status(500).json({ data: null, error: 'Failed to start upgrade', meta: {} });
  }
});

// ─── POST /cancel ──────────────────────────────────────────────────────────

router.post('/cancel', async (req: Request, res: Response) => {
  try {
    const [hRow] = await db
      .select({ stripeSubscriptionId: homeowners.stripeSubscriptionId })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);
    if (!hRow?.stripeSubscriptionId) {
      res.status(400).json({ data: null, error: 'No active subscription to cancel', meta: {} });
      return;
    }
    const subscription = await cancelSubscriptionAtPeriodEnd(hRow.stripeSubscriptionId);
    // Stamp tierCancelsAt locally for immediate UI feedback. Stripe's
    // webhook will confirm the cancellation effective date.
    // Stripe's TS types don't expose `current_period_end` on the
    // Subscription type in this SDK version, but it's there at runtime —
    // matches the cast in the existing webhook handler.
    const subRuntime = subscription as Stripe.Subscription & { current_period_end?: number };
    const cancelsAt = subRuntime.cancel_at
      ? new Date(subRuntime.cancel_at * 1000)
      : subRuntime.current_period_end
        ? new Date(subRuntime.current_period_end * 1000)
        : null;
    if (cancelsAt) {
      await db
        .update(homeowners)
        .set({ tierCancelsAt: cancelsAt })
        .where(eq(homeowners.id, req.homeownerId));
    }
    res.json({
      data: {
        cancelAtPeriodEnd: true,
        cancelsAt: cancelsAt?.toISOString() ?? null,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /account/subscriptions/cancel]');
    res.status(500).json({ data: null, error: 'Failed to cancel', meta: {} });
  }
});

// ─── POST /reactivate ──────────────────────────────────────────────────────

router.post('/reactivate', async (req: Request, res: Response) => {
  try {
    const [hRow] = await db
      .select({ stripeSubscriptionId: homeowners.stripeSubscriptionId })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);
    if (!hRow?.stripeSubscriptionId) {
      res.status(400).json({ data: null, error: 'No subscription to reactivate', meta: {} });
      return;
    }
    await reactivateSubscription(hRow.stripeSubscriptionId);
    await db
      .update(homeowners)
      .set({ tierCancelsAt: null })
      .where(eq(homeowners.id, req.homeownerId));
    res.json({ data: { cancelAtPeriodEnd: false }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /account/subscriptions/reactivate]');
    res.status(500).json({ data: null, error: 'Failed to reactivate', meta: {} });
  }
});

// Suppress lint on the unused getSubscription import — kept for future
// /current endpoint enhancements that fetch live Stripe state.
void getSubscription;

export default router;
