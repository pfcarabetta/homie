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
export type HomieProduct =
  | 'homie_quote'
  | 'inspect_report'
  | 'inspector_upload'
  | 'workspace_subscription'
  /** Consumer Membership subscription (Plus / Premier) — Phase 1, Session 6.
   *  Tagged on `customer.subscription.created` checkout session metadata so
   *  the admin revenue dashboard can split membership MRR from the rest. */
  | 'homeowner_membership';

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

/** Inspector pays Homie's tiered wholesale fee at upload. Single
 *  line item with the tier-specific price; immediate capture (no
 *  authorize-then-capture dance — we want the cash on file before
 *  spending Claude tokens on parsing). The webhook for
 *  product:'inspector_upload' flips the report to 'paid' and fires
 *  parseInspectionReportAsync — see stripe-webhook.ts. */
export async function createInspectorReportUploadCheckoutSession(params: {
  reportId: string;
  inspectorPartnerId: string;
  inspectorEmail: string;
  inspectorCompanyName: string | null;
  /** essential | professional | premium — used in metadata + line-
   *  item description so receipts and the admin dashboard can split
   *  revenue by tier. */
  tier: 'essential' | 'professional' | 'premium';
  /** Tier-specific wholesale amount in cents (resolved by caller
   *  from getInspectorTierPricing). */
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const metadata = buildStripeMetadata({
    product: 'inspector_upload',
    report_id: params.reportId,
    inspector_partner_id: params.inspectorPartnerId,
    tier: params.tier,
  });

  const tierLabel =
    params.tier === 'essential' ? 'Essential'
    : params.tier === 'professional' ? 'Professional'
    : 'Premium';

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
          name: `Homie inspection report — ${tierLabel}`,
          description: params.inspectorCompanyName
            ? `Wholesale tier fee · ${params.inspectorCompanyName}`
            : 'Wholesale tier fee',
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

// ─── Stripe Connect (vendor payouts — Membership Phase 1, Session 2) ───────
//
// Vendors are Stripe Connect Express accounts. The flow is:
//   1. Member adds a BYO vendor → we create a Connect Express account
//      placeholder via createConnectAccount + createAccountLink, send the
//      link via SMS.
//   2. Vendor finishes Stripe-hosted onboarding (bank account, ToS, etc.).
//      Stripe fires `account.updated` to our webhook; we flip
//      recurring_vendors.status to 'active' once payouts_enabled.
//   3. When vendor_visits → completed, services/vendor-payments.processPayment
//      creates a PaymentIntent against the homeowner and a Transfer to the
//      vendor's Connect account.
//
// All Connect calls take an idempotency key derived from a stable resource
// identifier so retries don't double-charge or double-create.

/**
 * Create a Stripe Connect Express account for a vendor. The vendor's
 * email is pre-filled into the onboarding flow; everything else (legal
 * entity, bank account, ToS) is collected during the Stripe-hosted
 * onboarding step.
 *
 * `idempotencyKey` should be the stable Homie identifier (e.g. the
 * recurring_vendor.id) so a retry of this call never creates a second
 * account for the same vendor.
 */
export async function createConnectAccount(params: {
  email: string;
  vendorName: string;
  /** Stable Homie identifier (recurring_vendor.id) for idempotency. */
  idempotencyKey: string;
}): Promise<Stripe.Account> {
  return getStripe().accounts.create(
    {
      type: 'express',
      email: params.email,
      business_profile: {
        name: params.vendorName,
        // Service-provider home repair / cleaning / landscaping etc. The
        // exact MCC matters less than declaring "service" as the type.
        mcc: '7349', // "Cleaning, maintenance, & janitorial services"
      },
      capabilities: {
        transfers: { requested: true },
      },
      metadata: { homie_recurring_vendor_id: params.idempotencyKey },
    },
    { idempotencyKey: `connect-account:${params.idempotencyKey}` },
  );
}

/**
 * Generate a one-time Stripe-hosted onboarding URL for a Connect
 * Express account. URLs are short-lived (Stripe expires them quickly,
 * minutes-scale) — caller should request a fresh one each time the
 * vendor opens the SMS link or refreshes the page.
 *
 * The `returnUrl` is where Stripe redirects the vendor on success;
 * `refreshUrl` is for if the link goes stale.
 */
export async function createAccountLink(params: {
  accountId: string;
  returnUrl: string;
  refreshUrl: string;
}): Promise<Stripe.AccountLink> {
  return getStripe().accountLinks.create({
    account: params.accountId,
    type: 'account_onboarding',
    return_url: params.returnUrl,
    refresh_url: params.refreshUrl,
  });
}

/**
 * Read-only fetch of a Connect account. Used to check
 * `details_submitted` / `payouts_enabled` after the vendor finishes
 * onboarding (also fired async via the `account.updated` webhook).
 */
export async function getConnectAccount(accountId: string): Promise<Stripe.Account> {
  return getStripe().accounts.retrieve(accountId);
}

/**
 * Transfer funds from Homie's platform balance to a connected vendor.
 * Called by services/vendor-payments.processPayment after a successful
 * PaymentIntent against the homeowner. Idempotent on `transferGroup`
 * (typically the vendor_visit.id).
 */
export async function createConnectTransfer(params: {
  amountCents: number;
  destinationAccountId: string;
  /** vendor_visit.id — used for idempotency + the Stripe `transfer_group`
   *  field so reporting can correlate charge → transfer. */
  visitId: string;
  /** vendor_payments.id — added to metadata for webhook routing. */
  paymentId: string;
  /** Optional: the PaymentIntent ID that funded this transfer, for
   *  reporting + reconciliation. */
  sourceTransactionId?: string;
}): Promise<Stripe.Transfer> {
  return getStripe().transfers.create(
    {
      amount: params.amountCents,
      currency: 'usd',
      destination: params.destinationAccountId,
      transfer_group: `visit:${params.visitId}`,
      ...(params.sourceTransactionId
        ? { source_transaction: params.sourceTransactionId }
        : {}),
      metadata: {
        homie_vendor_payment_id: params.paymentId,
        homie_vendor_visit_id: params.visitId,
      },
    },
    { idempotencyKey: `connect-transfer:${params.paymentId}` },
  );
}

// ─── Setup Intents (Membership Phase 1, Session 4) ─────────────────────────
//
// Setup Intents let a homeowner save a payment method for off-session use
// (which is what auto-pay needs — `processPayment` calls
// `paymentIntents.create` with `off_session: true` and references a saved
// payment method). The flow is:
//   1. Frontend asks backend for a Setup Intent client secret
//   2. Stripe Elements collects card details, confirms the SetupIntent
//      against Stripe (no Homie server roundtrip for raw card data)
//   3. Stripe attaches the resulting payment method to the customer
//   4. Frontend tells backend "done" — backend lists the customer's
//      payment methods to verify and surface them in the UI

/** Create a Setup Intent for a homeowner. Caller must have called
 *  `getOrCreateCustomer` to ensure the homeowner has a Stripe customer ID. */
export async function createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
  return getStripe().setupIntents.create({
    customer: customerId,
    // off_session is the key flag: the saved PM will be used to charge
    // the customer when they're not present (i.e. when a vendor visit
    // completes and auto-pay fires).
    usage: 'off_session',
    payment_method_types: ['card'],
  });
}

/** List a customer's saved card payment methods. */
export async function listCustomerPaymentMethods(customerId: string): Promise<Stripe.PaymentMethod[]> {
  const result = await getStripe().paymentMethods.list({
    customer: customerId,
    type: 'card',
    limit: 20,
  });
  return result.data;
}

/** Detach a payment method. Caller must verify ownership first. */
export async function detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
  return getStripe().paymentMethods.detach(paymentMethodId);
}

// ─── Membership subscriptions (Phase 1, Session 6) ─────────────────────────
//
// Plus + Premier are monthly subscriptions billed via Stripe Subscriptions.
// Each tier maps to a pre-created Stripe Product + Price (configured once
// in the Stripe dashboard) whose IDs live in env vars:
//
//   STRIPE_PRICE_PLUS_MONTHLY     — price_xxx for $29/mo
//   STRIPE_PRICE_PREMIER_MONTHLY  — price_xxx for $99/mo
//
// Without these env vars the subscription endpoints return 503. Annual
// billing is deferred — MVP ships monthly only.

export type MembershipTier = 'free' | 'plus' | 'premier';

/** Resolve the Stripe Price ID for a membership tier. */
export function getMembershipPriceId(tier: 'plus' | 'premier'): string | null {
  if (tier === 'plus') return process.env.STRIPE_PRICE_PLUS_MONTHLY ?? null;
  if (tier === 'premier') return process.env.STRIPE_PRICE_PREMIER_MONTHLY ?? null;
  return null;
}

/**
 * Create a Stripe Checkout Session that subscribes the homeowner to a
 * paid tier. Hosted-Checkout flow — Stripe collects payment method,
 * activates the subscription, and redirects back. Webhook handlers
 * (`customer.subscription.created` / `invoice.paid`) flip the
 * homeowner row's `membership_tier` + `tier_*_at` fields.
 *
 * Caller must have already called `getOrCreateCustomer` so the
 * homeowner has a Stripe customer ID.
 */
export async function createMembershipCheckout(params: {
  customerId: string;
  homeownerId: string;
  tier: 'plus' | 'premier';
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  const priceId = getMembershipPriceId(params.tier);
  if (!priceId) {
    throw new Error(`Stripe Price ID not configured for tier: ${params.tier}`);
  }
  return getStripe().checkout.sessions.create({
    mode: 'subscription',
    customer: params.customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: buildStripeMetadata({
      product: 'homeowner_membership',
      homeowner_id: params.homeownerId,
      tier: params.tier,
    }),
  });
}

/**
 * Switch an existing subscription to a different price. Use for
 * Plus → Premier upgrades and Premier → Plus downgrades.
 *
 * Strategy:
 *   - Upgrades: prorate immediately + charge the difference now
 *     (`proration_behavior: 'create_prorations'`, `billing_cycle_anchor: 'now'`)
 *   - Downgrades: schedule for period end (no immediate charge,
 *     access stays at current tier until renewal). Done by setting
 *     the new price + `proration_behavior: 'none'` and accepting
 *     that the member finishes their billed period at the higher tier.
 */
export async function changeSubscriptionTier(params: {
  subscriptionId: string;
  newTier: 'plus' | 'premier';
  /** True for upgrades (prorate now), false for downgrades (period end). */
  upgrade: boolean;
}): Promise<Stripe.Subscription> {
  const newPriceId = getMembershipPriceId(params.newTier);
  if (!newPriceId) throw new Error(`Stripe Price ID not configured for tier: ${params.newTier}`);
  const stripe = getStripe();
  // Subscriptions have one item per price; need to update that item, not
  // create a new one (a second item would charge BOTH prices).
  const subscription = await stripe.subscriptions.retrieve(params.subscriptionId);
  const itemId = subscription.items.data[0]?.id;
  if (!itemId) throw new Error(`Subscription ${params.subscriptionId} has no items`);
  return stripe.subscriptions.update(params.subscriptionId, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: params.upgrade ? 'create_prorations' : 'none',
    cancel_at_period_end: false, // un-cancel if they were heading toward expiry
  });
}

/**
 * Cancel at period end. Member keeps access through the current
 * billing period; tier flips to 'free' when the subscription
 * actually deletes (handled by `customer.subscription.deleted` webhook).
 */
export async function cancelSubscriptionAtPeriodEnd(subscriptionId: string): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

/** Undo a "cancel at period end" while still in the paid window. */
export async function reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.update(subscriptionId, { cancel_at_period_end: false });
}

/**
 * Read-only fetch of the homeowner's current subscription, used by
 * `GET /subscriptions/current` to render the membership page.
 */
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.retrieve(subscriptionId);
}

/**
 * Create a Stripe-hosted Checkout Session for saving a payment method
 * off-session. Simpler UX than in-page Stripe Elements: redirect the
 * member to Stripe, they fill the form, Stripe redirects back. The
 * card auto-attaches to the customer.
 *
 * This is the MVP path; in-page Elements via `createSetupIntent` above
 * is a future enhancement when we want polished in-page UX.
 */
export async function createSetupCheckoutSession(params: {
  customerId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<Stripe.Checkout.Session> {
  return getStripe().checkout.sessions.create({
    mode: 'setup',
    customer: params.customerId,
    payment_method_types: ['card'],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });
}
