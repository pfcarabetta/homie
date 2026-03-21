import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-02-25.clover',
});

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

  const customer = await stripe.customers.create({
    email,
    metadata: { homie_homeowner_id: homeownerId },
  });

  await db.update(homeowners).set({ stripeCustomerId: customer.id }).where(eq(homeowners.id, homeownerId));

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

  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer: params.customerId,
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

export function constructWebhookEvent(body: Buffer, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? '';
  return stripe.webhooks.constructEvent(body, signature, secret);
}
