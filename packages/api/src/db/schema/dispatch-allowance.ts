import { pgTable, uuid, text, integer, timestamp, index } from 'drizzle-orm/pg-core';
import { homeowners } from './homeowners';

/**
 * Dispatch Allowance Ledger (Membership Phase 1, Session 8).
 *
 * Append-only ledger tracking every dispatch credit granted (by Plus
 * monthly tick, Inspect Pro purchase, Inspect Premium bundle) and every
 * dispatch consumed. The current allowance for a homeowner is computed
 * by summing the ledger — there is no mutable balance column. The
 * ledger is the source of truth so we can audit every grant and
 * consumption forever.
 *
 * Spans both products: dispatches from `/inspect/:token` (inspection
 * report dispatches) and `/api/v1/jobs` (Homie Chat outreach) both go
 * through services/dispatch-allowance#consumeDispatch, which writes a
 * single ledger row regardless of source. That gives the homeowner one
 * consolidated view of their dispatch budget.
 *
 * Idempotency: the partial unique index on (homeowner_id, reason,
 * source_id) makes webhook retries and cron re-runs safe — Stripe will
 * occasionally retry a webhook, the monthly grant cron may double-fire
 * if the host restarts, and Inspect Premium dedupe matters for refund
 * scenarios. The deduper key is `(reason + source_id)` so two different
 * grant types can share a source_id without colliding (rare).
 *
 * The "consumed_*" rows always have negative `delta`; "*_grant" rows
 * always have positive (or zero, for the unlimited-grant audit row).
 * Allowance computation uses a simple SUM — no special-case logic
 * around sign.
 */

// ─── Reason taxonomy ──────────────────────────────────────────────────

export const ALLOWANCE_GRANT_REASONS = [
  'monthly_grant',           // Plus monthly +3 (capped to 12 in worker)
  'pro_bundle_grant',        // Inspect Pro purchase: +1 single-bundle credit
  'unlimited_grant',         // Inspect Premium: 0-delta marker, expires_at set
  'manual_adjustment',       // Admin override (sign varies; notes required)
] as const;
export type AllowanceGrantReason = (typeof ALLOWANCE_GRANT_REASONS)[number];

export const ALLOWANCE_CONSUME_REASONS = [
  'consume_monthly',         // Dispatch drawn from monthly bank
  'consume_pro_bundle',      // Dispatch drawn from Inspect Pro bundle credit
  'consume_unlimited',       // Audit row when consumed under unlimited grant
] as const;
export type AllowanceConsumeReason = (typeof ALLOWANCE_CONSUME_REASONS)[number];

export const ALLOWANCE_REASONS = [
  ...ALLOWANCE_GRANT_REASONS,
  ...ALLOWANCE_CONSUME_REASONS,
] as const;
export type AllowanceReason = (typeof ALLOWANCE_REASONS)[number];

// ─── Ledger table ─────────────────────────────────────────────────────

export const dispatchAllowanceLedger = pgTable(
  'dispatch_allowance_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    homeownerId: uuid('homeowner_id')
      .notNull()
      .references(() => homeowners.id, { onDelete: 'cascade' }),
    /** Allowed values: ALLOWANCE_REASONS. */
    reason: text('reason').notNull(),
    /** Positive for grants, negative for consumes, zero for audit rows. */
    delta: integer('delta').notNull(),
    /** Stable upstream identifier for idempotency. For monthly_grant
     *  this is the period key (e.g. "2026-05"); for pro_bundle_grant it
     *  is the Stripe checkout session id; for consume rows it is the
     *  dispatch event id. NULL allowed but discouraged — webhook
     *  retries depend on this. */
    sourceId: text('source_id'),
    /** When this credit becomes invalid. NULL = no expiry (rolls
     *  forward indefinitely until consumed, e.g. monthly_grant credits
     *  in the bank). For unlimited_grant rows this is the bundle expiry. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Free-form notes for manual_adjustment rows; null otherwise. */
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('dispatch_ledger_homeowner_idx').on(table.homeownerId),
    // Unique index on (homeowner_id, reason, source_id) is partial —
    // declared in the SQL migration directly because Drizzle's
    // uniqueIndex helper doesn't support WHERE clauses cleanly. Defined
    // here purely for documentation alignment.
  ],
);

export type DispatchAllowanceLedgerRow = typeof dispatchAllowanceLedger.$inferSelect;
export type NewDispatchAllowanceLedgerRow = typeof dispatchAllowanceLedger.$inferInsert;

// ─── Pricing constants (kept here so service + tests share one source) ──

/** Pay-per-action prices when the homeowner has no allowance to draw
 *  from. Mirrors the existing /inspect/:token/checkout pricing — keep
 *  this aligned with PER_ITEM_PRICE_CENTS / BUNDLE_*_PRICE_CENTS in
 *  routes/inspector.ts. */
export const DISPATCH_PAY_PER_ITEM_CENTS = 999;
export const DISPATCH_PAY_PER_BUNDLE_SMALL_CENTS = 9900;
export const DISPATCH_PAY_PER_BUNDLE_LARGE_CENTS = 14900;
export const DISPATCH_BUNDLE_LARGE_THRESHOLD = 16; // ≥16 items → large bundle

/** Plus-tier monthly grant + bank cap. */
export const PLUS_MONTHLY_GRANT = 3;
export const PLUS_MONTHLY_BANK_CAP = 12;

/** Inspect Premium bundle: how long the bundled Plus + unlimited
 *  dispatches stay active. */
export const INSPECT_PREMIUM_BUNDLE_DAYS = 365;
