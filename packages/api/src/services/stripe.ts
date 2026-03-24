import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
    });
  }
  return _stripe;
}

const TIER_PRICES: Record<string, number> = {
  standard: 999,
  priority: 1999,
  emergency: 2999,
};

const TIER_NAMES: Record<string, string> = {
  standard: 'Standard Quote Package',
  priority: 'Priority Quote Package',
  emergency: 'Emergency Quote Package',
};

export async function getOrCreateCustomer(homeownerId: string, email: string): Promise<string> {
  const [homeowner] = await db
    .select({ stripeCustomerId: homeowners.stripeCustomerId })
    .from(homeowners)
    .where(eq(homeowners.id, homeownerId))
    .limit(1);

  if (homeowner?.stripeCustomerId) return homeowner.stripeCustomerId;

  const customer = await getStripe().customers.create({
    email,
    metadata: { homie_homeowner_id: homeownerId },
  });

  await db.update(homeowners).set({ stripeCustomerId: customer.id } as Record<string, unknown>).where(eq(homeowners.id, homeownerId));

  return customer.id;
}

export async function createCheckoutSession(params: {
  customerId: string;
  jobId: string;
  tier: string;
  responseId: string;
  providerId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const amount = TIER_PRICES[params.tier];
  if (!amount) throw new Error(`Invalid tier: ${params.tier}`);

  return getStripe().checkout.sessions.create({
    mode: 'payment',
    customer: params.customerId,
    payment_intent_data: {
      capture_method: 'manual', // Authorize only — capture later when results arrive
      metadata: {
        job_id: params.jobId,
        response_id: params.responseId,
        provider_id: params.providerId,
      },
    },
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: amount,
        product_data: { name: TIER_NAMES[params.tier] ?? 'Quote Package' },
      },
      quantity: 1,
    }],
    metadata: {
      job_id: params.jobId,
      response_id: params.responseId,
      provider_id: params.providerId,
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

/**
 * Capture a previously authorized payment (charge the card).
 * Call this when provider results are returned.
 */
export async function capturePayment(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.capture(paymentIntentId);
}

/**
 * Cancel a previously authorized payment (release the hold).
 * Call this when a job expires with no results.
 */
export async function cancelPayment(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
  return getStripe().paymentIntents.cancel(paymentIntentId);
}

export function constructWebhookEvent(body: Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  return getStripe().webhooks.constructEvent(body, signature, secret);
}
