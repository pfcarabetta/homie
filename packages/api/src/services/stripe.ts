import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { getPricingConfig } from './pricing';

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
      apiVersion: '2025-01-27.acacia' as Stripe.LatestApiVersion,
    });
  }
  return _stripe;
}

const TIER_NAMES: Record<string, string> = {
  standard: 'Standard Quote Package',
  priority: 'Priority Quote Package',
  emergency: 'Emergency Quote Package',
};

// ── Canonical Stripe metadata ──────────────────────────────────────────────
// Every payment-creating call site tags its Stripe objects using this schema
// so the admin revenue dashboard can slice revenue by product, tier, and
// customer without ambiguity. Call sites may add extra fields on top (e.g.
// job_id, report_id, response_id) for webhook routing — those stay alongside.

/** Slugs we tag every Stripe object with so the admin revenue
 *  dashboard can group by product line:
 *    homie_quote            — homeowner pays for a quote dispatch
 *    inspect_report         — homeowner upgrades an inspection report
 *                             tier (essential/professional/premium)
 *    inspector_upload       — inspector pays the per-report wholesale
 *                             fee at upload time. Triggers parsing +
 *                             auto-emails the parsed report to the
 *                             homeowner whose contact info is on the
 *                             upload form.
 *    workspace_subscription — business workspace SaaS subscription. */
export type HomieProduct = 'homie_quote' | 'inspect_report' | 'inspector_upload' | 'workspace_subscription';

export interface CanonicalStripeMetadata {
  product: HomieProduct;
  homeowner_id?: string;
  workspace_id?: string;
  tier?: string;          // inspect: essential|professional|premium ; consumer: standard|priority|emergency
  plan?: string;          // business: subscription plan id
  [key: string]: string | undefined;
}

/**
 * Build a Stripe metadata object using the canonical schema.
 * Extra product-specific fields (job_id, report_id, response_id, etc.) are
 * merged in alongside the canonical keys. Undefined values are stripped so
 * Stripe's metadata API doesn't reject them.
 */
export function buildStripeMetadata(input: CanonicalStripeMetadata): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v != null && v !== '') out[k] = String(v);
  }
  return out;
}

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
  homeownerId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const pricing = await getPricingConfig();
  const tierConfig = pricing.homeowner[params.tier];
  // Charge promo price if active, otherwise regular price
  const amount = tierConfig?.promoPriceCents ?? tierConfig?.priceCents;
  if (!amount) throw new Error(`Invalid tier: ${params.tier}`);

  const metadata = buildStripeMetadata({
    product: 'homie_quote',
    homeowner_id: params.homeownerId,
    tier: params.tier,
    job_id: params.jobId,
    response_id: params.responseId,
    provider_id: params.providerId,
  });

  return getStripe().checkout.sessions.create({
    mode: 'payment',
    customer: params.customerId,
    payment_intent_data: {
      capture_method: 'manual', // Authorize only — capture later when results arrive
      metadata,
    },
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: amount,
        product_data: { name: TIER_NAMES[params.tier] ?? 'Quote Package' },
      },
      quantity: 1,
    }],
    metadata,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

/** Inspector pays Homie's wholesale fee at upload time, before the
 *  parser fires. Single-line-item flat fee, immediate capture (no
 *  authorize-then-capture dance — we want the cash on file before
 *  spending Claude tokens on parsing). The webhook for
 *  product:'inspector_upload' is what flips the report to 'paid'
 *  and kicks off parseInspectionReportAsync — see stripe-webhook.ts. */
export async function createInspectorReportUploadCheckoutSession(params: {
  reportId: string;
  inspectorPartnerId: string;
  inspectorEmail: string;
  inspectorCompanyName: string | null;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const metadata = buildStripeMetadata({
    product: 'inspector_upload',
    report_id: params.reportId,
    inspector_partner_id: params.inspectorPartnerId,
  });

  return getStripe().checkout.sessions.create({
    mode: 'payment',
    // Use customer_email rather than a stored Stripe Customer object
    // — inspectors don't have a stripeCustomerId column today, and
    // creating one per upload is wasteful. Stripe will prefill the
    // email field on Checkout from this and emit a receipt to it.
    customer_email: params.inspectorEmail,
    line_items: [{
      price_data: {
        currency: 'usd',
        unit_amount: params.amountCents,
        product_data: {
          name: 'Homie inspection report parsing',
          description: params.inspectorCompanyName
            ? `Per-report wholesale fee · ${params.inspectorCompanyName}`
            : 'Per-report wholesale fee',
        },
      },
      quantity: 1,
    }],
    payment_intent_data: {
      // Capture immediately — different from the homeowner quote flow
      // (which authorizes-then-captures-on-results) because there's no
      // delivery-window risk here; parsing is on us, not the inspector.
      capture_method: 'automatic',
      metadata,
    },
    metadata,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}

/** Auto-refund a captured payment in full. Used for the inspector
 *  upload retry-then-refund path: if parsing fails twice in a row we
 *  refund the wholesale fee so the inspector isn't paying for compute
 *  that didn't deliver. Idempotent at the Stripe level — calling
 *  twice returns the same Refund row. */
export async function refundPaymentInFull(paymentIntentId: string, reason?: string): Promise<Stripe.Refund> {
  return getStripe().refunds.create({
    payment_intent: paymentIntentId,
    reason: 'requested_by_customer',
    metadata: reason ? { homie_reason: reason } : undefined,
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

/* ── Workspace Subscription Billing ─────────────────────────────────────── */

import { workspaces } from '../db/schema/workspaces';
import { getWorkspacePlanConfig } from './pricing';
import { properties } from '../db/schema/properties';
import { count } from 'drizzle-orm';
import logger from '../logger';

/**
 * Get or create a Stripe Customer for a workspace. Uses the workspace's
 * stripeCustomerId if it exists, otherwise creates a new one.
 */
export async function getOrCreateWorkspaceCustomer(
  workspaceId: string,
  ownerEmail: string,
  workspaceName: string,
): Promise<string> {
  const [ws] = await db.select({ stripeCustomerId: workspaces.stripeCustomerId }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (ws?.stripeCustomerId) return ws.stripeCustomerId;

  const customer = await getStripe().customers.create({
    email: ownerEmail,
    name: workspaceName,
    metadata: { workspace_id: workspaceId },
  });

  await db.update(workspaces).set({ stripeCustomerId: customer.id }).where(eq(workspaces.id, workspaceId));
  return customer.id;
}

/**
 * Create a Stripe Checkout Session for a workspace subscription.
 * Uses two line items: base fee + per-property fee × property count.
 * Pricing comes from the workspace's resolved config (global + custom).
 */
export async function createSubscriptionCheckout(
  workspaceId: string,
  plan: string,
  customPricing: Record<string, unknown> | null,
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const resolved = await getWorkspacePlanConfig(plan, customPricing);

  // Count active properties
  const [{ value: propCount }] = await db
    .select({ value: count() })
    .from(properties)
    .where(eq(properties.workspaceId, workspaceId));

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  // Base fee (skip if $0)
  if (resolved.base > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: `${resolved.planLabel} — Base Fee` },
        unit_amount: Math.round(resolved.base * 100),
        recurring: { interval: 'month' },
      },
      quantity: 1,
    });
  }

  // Per-property fee
  if (resolved.perProperty > 0 && propCount > 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: `Per-Property Fee (${propCount} properties)` },
        unit_amount: Math.round(resolved.perProperty * 100),
        recurring: { interval: 'month' },
      },
      quantity: propCount,
    });
  }

  // If both are $0, add a $0 line item so the subscription still creates
  if (lineItems.length === 0) {
    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: `${resolved.planLabel} — Free Plan` },
        unit_amount: 0,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    });
  }

  const metadata = buildStripeMetadata({
    product: 'workspace_subscription',
    workspace_id: workspaceId,
    plan,
  });

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: lineItems,
    subscription_data: {
      metadata,
    },
    success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&success=true`,
    cancel_url: `${returnUrl}?canceled=true`,
    metadata,
  });

  return session.url!;
}

/**
 * Create a Stripe Customer Portal session so the workspace owner can
 * manage their payment method, view invoices, or cancel.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/**
 * Update the per-property quantity on an existing subscription.
 * Uses proration_behavior: 'none' so the change takes effect on the
 * next billing cycle — not mid-cycle.
 */
export async function updateSubscriptionPropertyCount(
  subscriptionId: string,
  propertyCount: number,
): Promise<void> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Find the per-property line item (the one with quantity > 1 or name containing "Per-Property")
  const perPropertyItem = subscription.items.data.find(
    item => (item.quantity ?? 0) > 1 || item.price.nickname?.includes('Per-Property') || (item.price.unit_amount ?? 0) < 10000,
  );

  if (perPropertyItem) {
    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: perPropertyItem.id, quantity: Math.max(1, propertyCount) }],
      proration_behavior: 'none',
    });
    logger.info({ subscriptionId, propertyCount }, '[stripe] Updated subscription property count');
  }
}

/**
 * List recent invoices for a Stripe customer.
 */
export async function listInvoices(
  customerId: string,
  limit = 12,
): Promise<Array<{ id: string; status: string | null; amountDue: number; amountPaid: number; created: number; hostedUrl: string | null; pdf: string | null }>> {
  const invoices = await getStripe().invoices.list({ customer: customerId, limit });
  return invoices.data.map(inv => ({
    id: inv.id,
    status: inv.status ?? null,
    amountDue: inv.amount_due,
    amountPaid: inv.amount_paid,
    created: inv.created,
    hostedUrl: inv.hosted_invoice_url ?? null,
    pdf: inv.invoice_pdf ?? null,
  }));
}
