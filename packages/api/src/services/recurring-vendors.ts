import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import {
  recurringVendors,
  type RecurringVendor,
  type NewRecurringVendor,
  VENDOR_SERVICE_CATEGORIES,
  VENDOR_TYPES,
  VENDOR_SCHEDULE_PATTERNS,
  VENDOR_PAYMENT_METHODS,
  VENDOR_AUTO_PAY_RULES,
  RECURRING_VENDOR_STATUSES,
  type RecurringVendorStatus,
} from '../db/schema/recurring-vendors';

/**
 * Data access for `recurring_vendors` (Membership Phase 1).
 *
 * Validates allowed text-column values (service_category, vendor_type,
 * schedule_pattern, payment_method, auto_pay_rule, status) on write so
 * invalid data can't bypass the app layer.
 *
 * No business logic here: schedule engine, vendor SMS confirmation,
 * payment processing, and auto-pay rule evaluation all live in later
 * sessions (Session 3+).
 */

// ─── Errors ────────────────────────────────────────────────────────────────

export class RecurringVendorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecurringVendorValidationError';
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function validateOnWrite(input: Partial<NewRecurringVendor>): void {
  if (input.serviceCategory !== undefined && input.serviceCategory !== null) {
    if (!(VENDOR_SERVICE_CATEGORIES as readonly string[]).includes(input.serviceCategory)) {
      throw new RecurringVendorValidationError(
        `Invalid service_category: "${input.serviceCategory}". Allowed: ${VENDOR_SERVICE_CATEGORIES.join(', ')}`,
      );
    }
  }
  if (input.vendorType !== undefined && input.vendorType !== null) {
    if (!(VENDOR_TYPES as readonly string[]).includes(input.vendorType)) {
      throw new RecurringVendorValidationError(
        `Invalid vendor_type: "${input.vendorType}". Allowed: ${VENDOR_TYPES.join(', ')}`,
      );
    }
  }
  if (input.schedulePattern !== undefined && input.schedulePattern !== null) {
    if (!(VENDOR_SCHEDULE_PATTERNS as readonly string[]).includes(input.schedulePattern)) {
      throw new RecurringVendorValidationError(
        `Invalid schedule_pattern: "${input.schedulePattern}". Allowed: ${VENDOR_SCHEDULE_PATTERNS.join(', ')}`,
      );
    }
  }
  if (input.paymentMethod !== undefined && input.paymentMethod !== null) {
    if (!(VENDOR_PAYMENT_METHODS as readonly string[]).includes(input.paymentMethod)) {
      throw new RecurringVendorValidationError(
        `Invalid payment_method: "${input.paymentMethod}". Allowed: ${VENDOR_PAYMENT_METHODS.join(', ')}`,
      );
    }
  }
  if (input.autoPayRule !== undefined && input.autoPayRule !== null) {
    if (!(VENDOR_AUTO_PAY_RULES as readonly string[]).includes(input.autoPayRule)) {
      throw new RecurringVendorValidationError(
        `Invalid auto_pay_rule: "${input.autoPayRule}". Allowed: ${VENDOR_AUTO_PAY_RULES.join(', ')}`,
      );
    }
  }
  if (input.status !== undefined && input.status !== null) {
    if (!(RECURRING_VENDOR_STATUSES as readonly string[]).includes(input.status)) {
      throw new RecurringVendorValidationError(
        `Invalid status: "${input.status}". Allowed: ${RECURRING_VENDOR_STATUSES.join(', ')}`,
      );
    }
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<RecurringVendor | null> {
  const [row] = await db
    .select()
    .from(recurringVendors)
    .where(eq(recurringVendors.id, id))
    .limit(1);
  return row ?? null;
}

/** All vendors at the given homeowner_property, newest first.
 *  Excludes 'cancelled' by default; pass {includeCancelled: true} to
 *  include them (e.g. tax export, history view). */
export async function findByPropertyId(
  homeownerPropertyId: string,
  options: { includeCancelled?: boolean } = {},
): Promise<RecurringVendor[]> {
  const includeCancelled = options.includeCancelled ?? false;
  if (includeCancelled) {
    return db
      .select()
      .from(recurringVendors)
      .where(eq(recurringVendors.homeownerPropertyId, homeownerPropertyId))
      .orderBy(desc(recurringVendors.createdAt));
  }
  return db
    .select()
    .from(recurringVendors)
    .where(
      and(
        eq(recurringVendors.homeownerPropertyId, homeownerPropertyId),
        // status != 'cancelled' as a safe default for active-list views.
        // Drizzle has no `ne` import here; using SQL-template inequality
        // would couple to internals, so we filter in JS. Vendor counts
        // per property are small (<10 typical) so this is fine.
      ),
    )
    .orderBy(desc(recurringVendors.createdAt))
    .then((rows) => rows.filter((r) => r.status !== 'cancelled'));
}

export async function findByHomeownerId(homeownerId: string): Promise<RecurringVendor[]> {
  return db
    .select()
    .from(recurringVendors)
    .where(eq(recurringVendors.homeownerId, homeownerId))
    .orderBy(desc(recurringVendors.createdAt));
}

/** Convenience alias for the homeowner-scoped list view. Mirrors the
 *  spec's `listForUser` rename. */
export async function listForHomeowner(homeownerId: string): Promise<RecurringVendor[]> {
  return findByHomeownerId(homeownerId);
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export async function create(input: NewRecurringVendor): Promise<RecurringVendor> {
  validateOnWrite(input);
  const [row] = await db.insert(recurringVendors).values(input).returning();
  if (!row) throw new Error('Insert returned no row');
  return row;
}

export async function update(
  id: string,
  patch: Partial<Omit<NewRecurringVendor, 'id' | 'homeownerId' | 'createdAt'>>,
): Promise<RecurringVendor | null> {
  validateOnWrite(patch);
  const [row] = await db
    .update(recurringVendors)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(recurringVendors.id, id))
    .returning();
  return row ?? null;
}

/** Soft-delete: marks the vendor as 'cancelled' rather than deleting
 *  the row. Preserves visit + payment history (vendor_payments references
 *  this row with ON DELETE CASCADE — a hard delete would lose all
 *  payment history for tax/accounting). */
export async function softDelete(id: string): Promise<RecurringVendor | null> {
  const cancelledStatus: RecurringVendorStatus = 'cancelled';
  const [row] = await db
    .update(recurringVendors)
    .set({ status: cancelledStatus, updatedAt: new Date() })
    .where(eq(recurringVendors.id, id))
    .returning();
  return row ?? null;
}
