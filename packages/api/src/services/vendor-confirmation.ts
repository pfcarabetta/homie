import crypto from 'crypto';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { recurringVendors, type RecurringVendor } from '../db/schema/recurring-vendors';
import { sendSms } from './notifications';
import {
  createConnectAccount,
  createAccountLink,
} from './stripe';
import logger from '../logger';

/**
 * Vendor SMS Confirmation flow (Membership Phase 1, Session 2).
 *
 * When a member adds a BYO vendor, this service:
 *   1. Generates a one-time URL token (7-day expiry per spec)
 *   2. Sends the vendor an SMS with a /vendor-confirmation/:token link
 *   3. On vendor click, the unauth route reads via findActiveByToken
 *   4. On vendor "Set up payments" tap, beginConnectOnboarding creates a
 *      Connect Express account + returns the Stripe-hosted onboarding URL
 *   5. Stripe redirects back to /vendor-confirmation/:token?onboarded=1
 *   6. The webhook handler (account.updated) flips status to 'active'
 *      when payouts_enabled becomes true
 *
 * No business logic for payment processing here — that's
 * services/vendor-payments.processPayment, called from the visit
 * completion path.
 */

// ─── Tunables ──────────────────────────────────────────────────────────────

const TOKEN_TTL_DAYS = 7;
const TOKEN_BYTES = 24; // ~32 char base64url

/** Where Stripe redirects after vendor finishes onboarding.
 *  Falls back to localhost for dev — real deploys must set
 *  PUBLIC_WEB_BASE_URL or similar in env. */
function publicWebBase(): string {
  const corsOrigin = process.env.CORS_ORIGIN?.split(',')[0]?.trim();
  return corsOrigin || 'http://localhost:3000';
}

// ─── Errors ────────────────────────────────────────────────────────────────

export class VendorConfirmationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'token_not_found'
      | 'token_expired'
      | 'already_confirmed'
      | 'no_phone'
      | 'sms_failed'
      | 'no_connect_email',
  ) {
    super(message);
    this.name = 'VendorConfirmationError';
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function generateToken(): string {
  // base64url so it's URL-safe without escaping
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function tokenExpiry(now = new Date()): Date {
  return new Date(now.getTime() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

// ─── Token issuance + SMS ──────────────────────────────────────────────────

/**
 * Issue a fresh confirmation token for a vendor and send the SMS.
 * Rotates any existing token (the partial unique index ensures we
 * never have two live tokens at once).
 *
 * Idempotent in the soft sense: re-running re-rotates the token and
 * re-sends the SMS. Caller controls cadence (don't call this in a loop).
 */
export async function issueConfirmation(params: {
  vendorId: string;
  homeownerName: string;
  propertyAddress: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const [vendor] = await db
    .select()
    .from(recurringVendors)
    .where(eq(recurringVendors.id, params.vendorId))
    .limit(1);
  if (!vendor) {
    throw new VendorConfirmationError(
      `Recurring vendor ${params.vendorId} not found`,
      'token_not_found',
    );
  }
  if (!vendor.vendorPhone) {
    throw new VendorConfirmationError(
      `Vendor ${vendor.id} has no phone number — cannot send SMS confirmation`,
      'no_phone',
    );
  }

  const token = generateToken();
  const expiresAt = tokenExpiry();

  await db
    .update(recurringVendors)
    .set({
      vendorConfirmationToken: token,
      vendorConfirmationTokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(recurringVendors.id, vendor.id));

  const url = `${publicWebBase()}/vendor-confirmation/${token}`;
  const body =
    `Hi ${vendor.vendorName}, ${params.homeownerName} at ${params.propertyAddress} ` +
    `would like to pay you through Homie. Tap to confirm your payment details ` +
    `(60 sec, free for you): ${url}`;

  try {
    await sendSms(vendor.vendorPhone, body);
  } catch (err) {
    logger.error({ err, vendorId: vendor.id }, '[vendor-confirmation] SMS send failed');
    throw new VendorConfirmationError(
      `Failed to send confirmation SMS to ${vendor.vendorPhone}`,
      'sms_failed',
    );
  }

  return { token, expiresAt };
}

// ─── Token lookup ──────────────────────────────────────────────────────────

/**
 * Resolve a confirmation token to the underlying recurring_vendor row.
 * Returns null if the token doesn't exist or is expired (so the unauth
 * route can return 404 / 410 cleanly without exposing the distinction).
 */
export async function findActiveByToken(
  token: string,
): Promise<RecurringVendor | null> {
  const [vendor] = await db
    .select()
    .from(recurringVendors)
    .where(
      and(
        eq(recurringVendors.vendorConfirmationToken, token),
        gt(recurringVendors.vendorConfirmationTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);
  return vendor ?? null;
}

// ─── Connect onboarding kickoff ────────────────────────────────────────────

/**
 * Called when the vendor taps "Set up payments" on the confirmation
 * page. Creates a Stripe Connect Express account if one doesn't exist
 * yet (idempotent via the createConnectAccount idempotencyKey), then
 * returns a fresh Stripe-hosted onboarding URL.
 *
 * The URL is short-lived (Stripe expires it minutes-scale), so we
 * always generate a new one rather than caching.
 */
export async function beginConnectOnboarding(
  token: string,
): Promise<{ onboardingUrl: string }> {
  const vendor = await findActiveByToken(token);
  if (!vendor) {
    throw new VendorConfirmationError(
      'Confirmation token not found or expired',
      'token_expired',
    );
  }
  if (vendor.status === 'active') {
    throw new VendorConfirmationError(
      'Vendor is already confirmed and active',
      'already_confirmed',
    );
  }
  if (!vendor.vendorEmail) {
    throw new VendorConfirmationError(
      `Vendor ${vendor.id} has no email — cannot create Connect account`,
      'no_connect_email',
    );
  }

  // Create the Connect account if it doesn't exist; the idempotency key
  // ensures retries don't create duplicates.
  let accountId = vendor.stripeConnectAccountId;
  if (!accountId) {
    const account = await createConnectAccount({
      email: vendor.vendorEmail,
      vendorName: vendor.vendorName,
      idempotencyKey: vendor.id,
    });
    accountId = account.id;
    await db
      .update(recurringVendors)
      .set({ stripeConnectAccountId: accountId, updatedAt: new Date() })
      .where(eq(recurringVendors.id, vendor.id));
  }

  const base = publicWebBase();
  const link = await createAccountLink({
    accountId,
    // Stripe redirects here on success — the page reads ?onboarded=1
    // and shows the success state. The webhook flips status to 'active'
    // independently when payouts_enabled becomes true.
    returnUrl: `${base}/vendor-confirmation/${token}?onboarded=1`,
    // If the link goes stale, Stripe sends them back here so we can
    // mint a fresh one.
    refreshUrl: `${base}/vendor-confirmation/${token}?refresh=1`,
  });
  return { onboardingUrl: link.url };
}

// ─── Webhook side: clear token + flip to active when payouts_enabled ───────

/**
 * Called by routes/stripe-webhook.ts on `account.updated` once
 * payouts_enabled becomes true. Idempotent: safe to call repeatedly.
 *
 * Looks up the vendor by stripe_connect_account_id, flips status to
 * 'active', stamps vendor_confirmed_at, and clears the confirmation
 * token so the SMS link can't be re-used.
 */
export async function markVendorActive(stripeAccountId: string): Promise<void> {
  const [vendor] = await db
    .select()
    .from(recurringVendors)
    .where(eq(recurringVendors.stripeConnectAccountId, stripeAccountId))
    .limit(1);
  if (!vendor) {
    logger.warn(
      { stripeAccountId },
      '[vendor-confirmation] account.updated for unknown Connect account',
    );
    return;
  }
  if (vendor.status === 'active') return; // already there

  await db
    .update(recurringVendors)
    .set({
      status: 'active',
      vendorConfirmedAt: new Date(),
      vendorConfirmationToken: null,
      vendorConfirmationTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(recurringVendors.id, vendor.id));

  logger.info(
    { vendorId: vendor.id, stripeAccountId },
    '[vendor-confirmation] vendor flipped to active after Connect onboarding',
  );
}
