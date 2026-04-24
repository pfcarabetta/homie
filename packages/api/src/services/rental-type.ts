/**
 * Rental-type resolution for B2B workspaces.
 *
 * Every notification, label, and conditional UX gate runs through one
 * of the helpers here so the frontend + backend agree on the effective
 * rental type for a given property (or workspace, if no property is in
 * scope).
 *
 * Resolution order:
 *   1. properties.rental_type (per-property override — supports mixed
 *      portfolios where a workspace has both STRs + LTRs)
 *   2. workspaces.rental_type (workspace-level default)
 *   3. 'short_term' (schema default; applied to every existing
 *      workspace by the startup migration)
 */

import { eq } from 'drizzle-orm';
import { db } from '../db';
import { workspaces, properties } from '../db/schema';

export type RentalType = 'short_term' | 'long_term';

/** Normalize any string from the DB/API into a valid RentalType. Falls
 *  back to 'short_term' for null / unknown values so we never crash on
 *  stale rows written before the column existed. */
export function normalizeRentalType(value: unknown): RentalType {
  return value === 'long_term' ? 'long_term' : 'short_term';
}

/** Turn a RentalType into the user-facing occupant noun used in
 *  notifications + any backend-composed copy (Slack messages, email
 *  subject lines, etc.). Frontend has its own matching hook so the two
 *  surfaces stay aligned. */
export function occupantTerm(type: RentalType): 'guest' | 'tenant' {
  return type === 'long_term' ? 'tenant' : 'guest';
}

/** Title-cased variant for copy that opens a sentence or card header. */
export function OccupantTerm(type: RentalType): 'Guest' | 'Tenant' {
  return type === 'long_term' ? 'Tenant' : 'Guest';
}

/** Resolve the effective rental type for a workspace (ignoring any
 *  per-property overrides). Used when the caller is operating on the
 *  workspace as a whole — e.g. composing a Slack digest. */
export async function resolveWorkspaceRentalType(workspaceId: string): Promise<RentalType> {
  const [ws] = await db
    .select({ rentalType: workspaces.rentalType })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return normalizeRentalType(ws?.rentalType);
}

/** Resolve the effective rental type for a specific property. Honors
 *  the per-property override, falling back to the workspace default.
 *  Single round-trip (the property row carries workspaceId + its own
 *  override, and a JOIN pulls the workspace default when needed). */
export async function resolvePropertyRentalType(propertyId: string): Promise<RentalType> {
  const [row] = await db
    .select({
      propertyRentalType: properties.rentalType,
      workspaceRentalType: workspaces.rentalType,
    })
    .from(properties)
    .innerJoin(workspaces, eq(workspaces.id, properties.workspaceId))
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!row) return 'short_term';
  return normalizeRentalType(row.propertyRentalType ?? row.workspaceRentalType);
}
