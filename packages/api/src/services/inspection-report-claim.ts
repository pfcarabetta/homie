import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '../db';
import { inspectionReports } from '../db/schema/inspector';
import logger from '../logger';

/**
 * Bind newly-created homeowner accounts to any inspection reports they
 * should have access to based on email match. Two paths:
 *
 *   1. PRIMARY claim — reports where `client_email = newEmail` AND no
 *      `homeowner_id` is set yet. The new account becomes the primary
 *      claimer (homeowner_id is set).
 *
 *   2. CC bind — reports where `newEmail` appears in `cc_emails`. The
 *      new account's UUID is appended to `cc_homeowner_ids` so they
 *      gain full read/edit access to the report alongside the primary.
 *
 * Both paths run on every signup. A single signup can claim multiple
 * reports (e.g., a client with two recent inspections) and can also
 * be a CC on others.
 *
 * Failures are logged but never thrown — the signup itself succeeds
 * even if binding has a transient DB hiccup. Worst case, the account
 * exists without auto-bound reports and the user can manually claim
 * via the access link from their email.
 */
export async function autoBindReportsToHomeowner(homeownerId: string, email: string): Promise<{
  primaryClaimed: number;
  ccAdded: number;
}> {
  const normalized = email.toLowerCase().trim();
  let primaryClaimed = 0;
  let ccAdded = 0;

  try {
    // Path 1: claim as primary on any unclaimed reports addressed to this email.
    const claimedRows = await db.update(inspectionReports)
      .set({ homeownerId, updatedAt: new Date() })
      .where(and(
        eq(inspectionReports.clientEmail, normalized),
        isNull(inspectionReports.homeownerId),
      ))
      .returning({ id: inspectionReports.id });
    primaryClaimed = claimedRows.length;
  } catch (err) {
    logger.warn({ err, homeownerId, email: normalized }, '[inspection-report-claim] primary claim failed (non-fatal)');
  }

  try {
    // Path 2: append to cc_homeowner_ids on any report that lists this
    // email as a CC AND doesn't already have this homeowner's UUID in
    // the array. The `||` is Postgres array-concat. The `NOT @>` guard
    // makes the update idempotent — a re-run for the same homeowner is
    // a no-op.
    const ccRows = await db.update(inspectionReports)
      .set({
        ccHomeownerIds: sql`${inspectionReports.ccHomeownerIds} || ARRAY[${homeownerId}]::uuid[]`,
        updatedAt: new Date(),
      })
      .where(sql`
        ${inspectionReports.ccEmails} @> ARRAY[${normalized}]::text[]
        AND NOT (${inspectionReports.ccHomeownerIds} @> ARRAY[${homeownerId}]::uuid[])
      `)
      .returning({ id: inspectionReports.id });
    ccAdded = ccRows.length;
  } catch (err) {
    logger.warn({ err, homeownerId, email: normalized }, '[inspection-report-claim] CC bind failed (non-fatal)');
  }

  if (primaryClaimed > 0 || ccAdded > 0) {
    logger.info({ homeownerId, email: normalized, primaryClaimed, ccAdded }, '[inspection-report-claim] auto-bound reports on signup');
  }
  return { primaryClaimed, ccAdded };
}
