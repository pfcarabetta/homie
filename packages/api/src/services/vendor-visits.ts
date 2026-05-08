import { eq, and, gte, lte, desc, asc } from 'drizzle-orm';
import { db } from '../db';
import {
  vendorVisits,
  type VendorVisit,
  type NewVendorVisit,
  VENDOR_VISIT_STATUSES,
  type VendorVisitStatus,
} from '../db/schema/recurring-vendors';

/**
 * Data access for `vendor_visits` (Membership Phase 1).
 *
 * Lifecycle (per CLAUDE-MEMBERSHIP.md):
 *
 *   scheduled → confirmation_sent → confirmed → completed
 *                          ↓
 *                       skipped / missed / disputed (terminal)
 *
 * The schedule engine that creates 'scheduled' rows from each
 * recurring_vendor's pattern, the SMS confirmation worker, and the
 * payment trigger on transition to 'completed' all live in Session 3+.
 * This file is data access only.
 */

export class VendorVisitValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VendorVisitValidationError';
  }
}

function assertValidStatus(value: string): asserts value is VendorVisitStatus {
  if (!(VENDOR_VISIT_STATUSES as readonly string[]).includes(value)) {
    throw new VendorVisitValidationError(
      `Invalid vendor_visit status: "${value}". Allowed: ${VENDOR_VISIT_STATUSES.join(', ')}`,
    );
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<VendorVisit | null> {
  const [row] = await db
    .select()
    .from(vendorVisits)
    .where(eq(vendorVisits.id, id))
    .limit(1);
  return row ?? null;
}

/** All visits for a recurring_vendor, newest scheduled first. */
export async function findByVendorId(recurringVendorId: string): Promise<VendorVisit[]> {
  return db
    .select()
    .from(vendorVisits)
    .where(eq(vendorVisits.recurringVendorId, recurringVendorId))
    .orderBy(desc(vendorVisits.scheduledAt));
}

/** Upcoming visits within the next N days for a single vendor.
 *  Default 30d matches the spec's nightly schedule-engine horizon.
 *  Returned ascending by scheduled_at so the caller can iterate
 *  chronologically. */
export async function findUpcomingForVendor(
  recurringVendorId: string,
  options: { days?: number; now?: Date } = {},
): Promise<VendorVisit[]> {
  const days = options.days ?? 30;
  const now = options.now ?? new Date();
  const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(vendorVisits)
    .where(
      and(
        eq(vendorVisits.recurringVendorId, recurringVendorId),
        gte(vendorVisits.scheduledAt, now),
        lte(vendorVisits.scheduledAt, horizon),
      ),
    )
    .orderBy(asc(vendorVisits.scheduledAt));
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export async function create(input: NewVendorVisit): Promise<VendorVisit> {
  if (input.status !== undefined && input.status !== null) {
    assertValidStatus(input.status);
  }
  const [row] = await db.insert(vendorVisits).values(input).returning();
  if (!row) throw new Error('Insert returned no row');
  return row;
}

/** Move a visit through its lifecycle. Stamps the matching timestamp
 *  column when the status implies one (confirmation_sent_at,
 *  confirmed_at, completed_at). */
export async function updateStatus(
  id: string,
  status: VendorVisitStatus,
  extras: Partial<Omit<NewVendorVisit, 'id' | 'recurringVendorId' | 'createdAt'>> = {},
): Promise<VendorVisit | null> {
  assertValidStatus(status);
  const now = new Date();
  const stamp: Partial<NewVendorVisit> = { status, updatedAt: now };
  if (status === 'confirmation_sent' && extras.confirmationSentAt === undefined) {
    stamp.confirmationSentAt = now;
  }
  if (status === 'confirmed' && extras.confirmedAt === undefined) {
    stamp.confirmedAt = now;
  }
  if (status === 'completed' && extras.completedAt === undefined) {
    stamp.completedAt = now;
  }
  const [row] = await db
    .update(vendorVisits)
    .set({ ...stamp, ...extras })
    .where(eq(vendorVisits.id, id))
    .returning();
  return row ?? null;
}
