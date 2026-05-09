import { eq } from 'drizzle-orm';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import {
  dispatchAllowanceLedger,
  DISPATCH_PAY_PER_ITEM_CENTS,
  DISPATCH_PAY_PER_BUNDLE_SMALL_CENTS,
  DISPATCH_PAY_PER_BUNDLE_LARGE_CENTS,
  DISPATCH_BUNDLE_LARGE_THRESHOLD,
  PLUS_MONTHLY_GRANT,
  PLUS_MONTHLY_BANK_CAP,
  INSPECT_PREMIUM_BUNDLE_DAYS,
  type AllowanceReason,
  type DispatchAllowanceLedgerRow,
} from '../db/schema/dispatch-allowance';
import logger from '../logger';

/**
 * Dispatch Allowance service (Membership Phase 1, Session 8).
 *
 * Single source of truth for "can this homeowner dispatch a quote
 * without paying?" Spans the inspect product, Homie Chat, and the
 * upcoming seasonal walkthrough flow. Every grant and consumption goes
 * through this module — callers never read the ledger directly.
 *
 * The allowance is computed by SUMming the ledger:
 *   monthly bank = Σ(monthly_grant + consume_monthly)
 *   pro bundle  = Σ(pro_bundle_grant + consume_pro_bundle) ≥ 1
 *   unlimited   = exists unlimited_grant w/ expires_at > now, OR tier='premier'
 *
 * Premier → unlimited via tier flag (no expiry, no ledger needed).
 * Plus → monthly bank with rollover, capped at PLUS_MONTHLY_BANK_CAP.
 * Inspect Premium → unlimited until membership_expires_at.
 * Inspect Pro → one bundle credit, no expiry.
 * Free / no allowance → pay-per-action.
 *
 * `consumeDispatch` is the only writer that tracks consumption. It
 * picks the right pool to draw from in priority order:
 *   1. unlimited (free, just an audit row)
 *   2. pro_bundle credit (only valid for `kind: 'bundle'` dispatches)
 *   3. monthly bank
 *   4. fall through → return { allowed: false, requiresPayment: true }
 */

// ─── Types ────────────────────────────────────────────────────────────

export interface AllowanceState {
  homeownerId: string;
  /** Premier subscriber OR Inspect Premium bundle still active. */
  hasUnlimited: boolean;
  /** Date the unlimited window ends. Null when hasUnlimited=false OR
   *  unlimited is from a Premier subscription (which never expires). */
  unlimitedUntil: Date | null;
  /** Number of monthly_grant credits remaining (capped at bank cap). */
  monthlyBank: number;
  /** Pro tier first-bundle credit unconsumed. 0 or 1 in practice. */
  proBundleCredits: number;
  /** Pricing the user pays if they dispatch with no allowance. */
  payPerItemCents: number;
  payPerBundleSmallCents: number;
  payPerBundleLargeCents: number;
  /** Effective tier label — for UI rendering. */
  effectiveTier: 'free' | 'plus' | 'premier';
  /** Membership source for the dashboard's "renews" / "expires" copy. */
  membershipSource: string | null;
}

export type DispatchKind = 'item' | 'bundle';

export interface DispatchAttempt {
  homeownerId: string;
  /** 'item' = single-item dispatch (counts as 1 against bank).
   *  'bundle' = batch dispatch (counts as 1 against bank if drawn from
   *  monthly, OR uses the Pro bundle credit). */
  kind: DispatchKind;
  /** Item count — only used for billing computation when no allowance
   *  is available; the deduction is always 1 per dispatch event. */
  itemCount: number;
  /** Stable upstream identifier for idempotency. Pass the dispatch
   *  event id (job id, inspection dispatch id, etc.). */
  sourceId: string;
}

export type DispatchResult =
  | {
      allowed: true;
      drewFrom: 'unlimited' | 'pro_bundle' | 'monthly';
      ledgerEntryId: string;
    }
  | {
      allowed: false;
      requiresPayment: true;
      amountCents: number;
    };

// ─── Read: current allowance ──────────────────────────────────────────

export async function getCurrentAllowance(homeownerId: string): Promise<AllowanceState> {
  const [ho] = await db
    .select({
      tier: homeowners.membershipTier,
      source: homeowners.membershipSource,
      expiresAt: homeowners.membershipExpiresAt,
    })
    .from(homeowners)
    .where(eq(homeowners.id, homeownerId))
    .limit(1);

  if (!ho) {
    // Caller validated the id; defensive default.
    return {
      homeownerId,
      hasUnlimited: false,
      unlimitedUntil: null,
      monthlyBank: 0,
      proBundleCredits: 0,
      payPerItemCents: DISPATCH_PAY_PER_ITEM_CENTS,
      payPerBundleSmallCents: DISPATCH_PAY_PER_BUNDLE_SMALL_CENTS,
      payPerBundleLargeCents: DISPATCH_PAY_PER_BUNDLE_LARGE_CENTS,
      effectiveTier: 'free',
      membershipSource: null,
    };
  }

  const rows = await db
    .select()
    .from(dispatchAllowanceLedger)
    .where(eq(dispatchAllowanceLedger.homeownerId, homeownerId));

  return computeAllowance({
    homeownerId,
    tier: ho.tier as 'free' | 'plus' | 'premier',
    source: ho.source,
    membershipExpiresAt: ho.expiresAt,
    rows,
  });
}

/**
 * Pure compute over an in-memory ledger. Exported so tests can drive
 * the math without round-tripping the DB.
 */
export function computeAllowance(input: {
  homeownerId: string;
  tier: 'free' | 'plus' | 'premier';
  source: string | null;
  membershipExpiresAt: Date | null;
  rows: DispatchAllowanceLedgerRow[];
  now?: Date;
}): AllowanceState {
  const now = input.now ?? new Date();

  // Premier subscription → unlimited, no expiry.
  if (input.tier === 'premier') {
    return {
      homeownerId: input.homeownerId,
      hasUnlimited: true,
      unlimitedUntil: null,
      monthlyBank: 0,
      proBundleCredits: 0,
      payPerItemCents: DISPATCH_PAY_PER_ITEM_CENTS,
      payPerBundleSmallCents: DISPATCH_PAY_PER_BUNDLE_SMALL_CENTS,
      payPerBundleLargeCents: DISPATCH_PAY_PER_BUNDLE_LARGE_CENTS,
      effectiveTier: 'premier',
      membershipSource: input.source,
    };
  }

  // Inspect Premium bundle → unlimited until expiry.
  const activeUnlimitedGrant = input.rows.find(
    (r) => r.reason === 'unlimited_grant' && r.expiresAt && r.expiresAt > now,
  );
  if (activeUnlimitedGrant) {
    return {
      homeownerId: input.homeownerId,
      hasUnlimited: true,
      unlimitedUntil: activeUnlimitedGrant.expiresAt!,
      monthlyBank: 0,
      proBundleCredits: 0,
      payPerItemCents: DISPATCH_PAY_PER_ITEM_CENTS,
      payPerBundleSmallCents: DISPATCH_PAY_PER_BUNDLE_SMALL_CENTS,
      payPerBundleLargeCents: DISPATCH_PAY_PER_BUNDLE_LARGE_CENTS,
      effectiveTier: input.tier === 'plus' ? 'plus' : 'free',
      membershipSource: input.source,
    };
  }

  // Otherwise sum the bank + pro bundle pools.
  let monthlyBank = 0;
  let proBundleCredits = 0;
  for (const r of input.rows) {
    if (r.reason === 'monthly_grant' || r.reason === 'consume_monthly') {
      monthlyBank += r.delta;
    } else if (r.reason === 'pro_bundle_grant' || r.reason === 'consume_pro_bundle') {
      proBundleCredits += r.delta;
    } else if (r.reason === 'manual_adjustment') {
      // Admin overrides accrue to the monthly bank by convention. The
      // notes column should explain why; capping below still applies.
      monthlyBank += r.delta;
    }
    // 'unlimited_grant' / 'consume_unlimited' don't contribute (delta=0).
  }

  // Bank can't go negative (would indicate a consume bug); clamp to 0
  // for display safety while still letting tests catch the underflow.
  if (monthlyBank < 0) {
    logger.warn(
      { homeownerId: input.homeownerId, monthlyBank },
      '[dispatch-allowance] negative monthly bank — ledger may be inconsistent',
    );
    monthlyBank = 0;
  }
  if (proBundleCredits < 0) {
    logger.warn(
      { homeownerId: input.homeownerId, proBundleCredits },
      '[dispatch-allowance] negative pro bundle credits — ledger may be inconsistent',
    );
    proBundleCredits = 0;
  }

  return {
    homeownerId: input.homeownerId,
    hasUnlimited: false,
    unlimitedUntil: null,
    monthlyBank,
    proBundleCredits,
    payPerItemCents: DISPATCH_PAY_PER_ITEM_CENTS,
    payPerBundleSmallCents: DISPATCH_PAY_PER_BUNDLE_SMALL_CENTS,
    payPerBundleLargeCents: DISPATCH_PAY_PER_BUNDLE_LARGE_CENTS,
    effectiveTier: input.tier,
    membershipSource: input.source,
  };
}

// ─── Write: consume a dispatch ────────────────────────────────────────

export async function consumeDispatch(attempt: DispatchAttempt): Promise<DispatchResult> {
  const allowance = await getCurrentAllowance(attempt.homeownerId);

  // 1. Unlimited window active → 0-delta audit row.
  if (allowance.hasUnlimited) {
    const [row] = await db
      .insert(dispatchAllowanceLedger)
      .values({
        homeownerId: attempt.homeownerId,
        reason: 'consume_unlimited',
        delta: 0,
        sourceId: attempt.sourceId,
      })
      .onConflictDoNothing()
      .returning({ id: dispatchAllowanceLedger.id });
    return {
      allowed: true,
      drewFrom: 'unlimited',
      ledgerEntryId: row?.id ?? '',
    };
  }

  // 2. Bundle dispatch with a Pro bundle credit available → consume it.
  if (attempt.kind === 'bundle' && allowance.proBundleCredits > 0) {
    const [row] = await db
      .insert(dispatchAllowanceLedger)
      .values({
        homeownerId: attempt.homeownerId,
        reason: 'consume_pro_bundle',
        delta: -1,
        sourceId: attempt.sourceId,
      })
      .onConflictDoNothing()
      .returning({ id: dispatchAllowanceLedger.id });
    return {
      allowed: true,
      drewFrom: 'pro_bundle',
      ledgerEntryId: row?.id ?? '',
    };
  }

  // 3. Monthly bank has at least 1 → consume.
  if (allowance.monthlyBank > 0) {
    const [row] = await db
      .insert(dispatchAllowanceLedger)
      .values({
        homeownerId: attempt.homeownerId,
        reason: 'consume_monthly',
        delta: -1,
        sourceId: attempt.sourceId,
      })
      .onConflictDoNothing()
      .returning({ id: dispatchAllowanceLedger.id });
    return {
      allowed: true,
      drewFrom: 'monthly',
      ledgerEntryId: row?.id ?? '',
    };
  }

  // 4. No allowance → pay-per-action.
  return {
    allowed: false,
    requiresPayment: true,
    amountCents: priceForAttempt(attempt),
  };
}

function priceForAttempt(attempt: DispatchAttempt): number {
  if (attempt.kind === 'item') return DISPATCH_PAY_PER_ITEM_CENTS * attempt.itemCount;
  return attempt.itemCount >= DISPATCH_BUNDLE_LARGE_THRESHOLD
    ? DISPATCH_PAY_PER_BUNDLE_LARGE_CENTS
    : DISPATCH_PAY_PER_BUNDLE_SMALL_CENTS;
}

// ─── Write: grants ────────────────────────────────────────────────────

/**
 * Grant the Plus monthly +3 credits, capped at PLUS_MONTHLY_BANK_CAP.
 * Idempotent via (homeowner_id, 'monthly_grant', period_key) unique
 * index — calling this twice for the same period is safe.
 *
 * `periodKey` is YYYY-MM (e.g. '2026-05'). The cron passes the current
 * period; the consumer-facing signup webhook can pass the current
 * period to seed the bank when a new Plus subscriber upgrades mid-month.
 */
export async function grantMonthly(params: {
  homeownerId: string;
  periodKey: string;
}): Promise<{ inserted: boolean; amountGranted: number }> {
  const allowance = await getCurrentAllowance(params.homeownerId);
  if (allowance.hasUnlimited) {
    // Premier or active Inspect Premium bundle — no grant needed.
    return { inserted: false, amountGranted: 0 };
  }
  const headroom = PLUS_MONTHLY_BANK_CAP - allowance.monthlyBank;
  if (headroom <= 0) return { inserted: false, amountGranted: 0 };
  const amount = Math.min(PLUS_MONTHLY_GRANT, headroom);

  const inserted = await db
    .insert(dispatchAllowanceLedger)
    .values({
      homeownerId: params.homeownerId,
      reason: 'monthly_grant',
      delta: amount,
      sourceId: params.periodKey,
    })
    .onConflictDoNothing()
    .returning({ id: dispatchAllowanceLedger.id });
  return { inserted: inserted.length > 0, amountGranted: inserted.length > 0 ? amount : 0 };
}

/**
 * Grant the Inspect Pro tier's single-bundle credit. Called by the
 * inspect checkout webhook when the report's pricing_tier is
 * 'professional'. Idempotent on (homeowner_id, 'pro_bundle_grant',
 * sourceId) — sourceId should be the Stripe checkout session id.
 */
export async function grantProBundle(params: {
  homeownerId: string;
  sourceId: string;
}): Promise<{ inserted: boolean }> {
  const inserted = await db
    .insert(dispatchAllowanceLedger)
    .values({
      homeownerId: params.homeownerId,
      reason: 'pro_bundle_grant',
      delta: 1,
      sourceId: params.sourceId,
    })
    .onConflictDoNothing()
    .returning({ id: dispatchAllowanceLedger.id });
  return { inserted: inserted.length > 0 };
}

/**
 * Grant the Inspect Premium 1-year bundle: marks unlimited dispatches
 * for INSPECT_PREMIUM_BUNDLE_DAYS days AND flips the homeowner's tier
 * to plus + sets membership_expires_at. Caller is the Stripe webhook
 * handler for inspect_client_dispatch (tier='premium').
 *
 * The expiry on the ledger row matches homeowners.membership_expires_at
 * exactly — both are read by the year-1 conversion cron.
 */
export async function grantInspectPremiumBundle(params: {
  homeownerId: string;
  sourceId: string;
  now?: Date;
}): Promise<{ inserted: boolean; expiresAt: Date }> {
  const now = params.now ?? new Date();
  const expiresAt = new Date(now.getTime() + INSPECT_PREMIUM_BUNDLE_DAYS * 24 * 60 * 60 * 1000);

  const inserted = await db
    .insert(dispatchAllowanceLedger)
    .values({
      homeownerId: params.homeownerId,
      reason: 'unlimited_grant',
      delta: 0,
      sourceId: params.sourceId,
      expiresAt,
    })
    .onConflictDoNothing()
    .returning({ id: dispatchAllowanceLedger.id });

  if (inserted.length > 0) {
    // Flip tier — but only forward (don't downgrade a Premier subscriber).
    const [ho] = await db
      .select({ tier: homeowners.membershipTier })
      .from(homeowners)
      .where(eq(homeowners.id, params.homeownerId))
      .limit(1);
    if (ho && ho.tier !== 'premier') {
      await db
        .update(homeowners)
        .set({
          membershipTier: 'plus',
          membershipSource: 'inspect_premium_bundle',
          membershipExpiresAt: expiresAt,
          tierStartedAt: now,
        })
        .where(eq(homeowners.id, params.homeownerId));
    }
  }
  return { inserted: inserted.length > 0, expiresAt };
}

/**
 * Build a YYYY-MM key for the given Date. Used as the source_id for
 * the monthly grant cron so re-runs in the same calendar month are
 * deduplicated by the unique index.
 */
export function periodKeyFor(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Re-export pricing constants so consumers don't need two imports.
export {
  DISPATCH_PAY_PER_ITEM_CENTS,
  DISPATCH_PAY_PER_BUNDLE_SMALL_CENTS,
  DISPATCH_PAY_PER_BUNDLE_LARGE_CENTS,
  DISPATCH_BUNDLE_LARGE_THRESHOLD,
  PLUS_MONTHLY_GRANT,
  PLUS_MONTHLY_BANK_CAP,
  INSPECT_PREMIUM_BUNDLE_DAYS,
};
export type { AllowanceReason };
