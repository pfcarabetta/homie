import { useMemo } from 'react';
import type { Property, RentalType, Workspace } from '@/services/api';

/**
 * Rental-type-aware vocabulary hook.
 *
 * Every user-facing label that says "guest" / "stay" / "reservation"
 * reads from here instead of hardcoding. That way a workspace flipped
 * to long_term mode surfaces "tenant" / "tenancy" / "lease" copy
 * everywhere without a per-string find-and-replace each time.
 *
 * Resolution order (mirrors the backend's resolvePropertyRentalType):
 *   1. property.rentalType (per-property override)
 *   2. workspace.rentalType (workspace default)
 *   3. 'short_term' (safety fallback — shouldn't happen once schema
 *      patches land, but keeps the UI sane on stale cached payloads)
 *
 * Usage:
 *   const terms = useRentalTerms({ workspace, property });
 *   <label>Notify {terms.occupant} of dispatch status</label>
 *   {terms.showOccupancy && <OccupancyPill ... />}
 */

export interface RentalTerms {
  /** Effective rental type after applying the per-property override. */
  rentalType: RentalType;

  /** Lowercase noun for a single occupant — used mid-sentence.
   *  "Notify guest", "the tenant reported...". */
  occupant: 'guest' | 'tenant';

  /** Title-cased variant — used at the start of a sentence or in
   *  headings. "Guest requests", "Tenant satisfaction". */
  Occupant: 'Guest' | 'Tenant';

  /** Plural lowercase — "3 guests", "all tenants". */
  occupants: 'guests' | 'tenants';

  /** Plural title-cased — "Guests", "Tenants" as a section header. */
  Occupants: 'Guests' | 'Tenants';

  /** Possessive form — "the guest's email", "the tenant's email". */
  possessive: "guest's" | "tenant's";

  /** Title-cased possessive — "Guest's email", "Tenant's email". */
  Possessive: "Guest's" | "Tenant's";

  /** Noun for the duration of their occupancy. STR = "stay" (short),
   *  LTR = "tenancy" (the whole lease). Used in copy like "during
   *  your stay" → "during your tenancy". */
  stayNoun: 'stay' | 'tenancy';

  /** Whether occupancy/reservation/calendar UI should render. False
   *  for LTR — tenants live in the unit continuously, so check-in/
   *  check-out dates and vacancy calendars are meaningless. */
  showOccupancy: boolean;

  /** Convenience booleans — slightly shorter than `rentalType === 'x'`
   *  at the call site. */
  isShortTerm: boolean;
  isLongTerm: boolean;
}

/** Resolve the effective rental type from a workspace + optional
 *  property. Pure function — exported separately so non-component
 *  contexts (utility helpers, reducers) can reuse the same logic
 *  without dragging in React. */
export function resolveRentalType(
  workspace: { rentalType?: RentalType | null } | null | undefined,
  property?: { rentalType?: RentalType | null } | null,
): RentalType {
  if (property?.rentalType === 'long_term' || property?.rentalType === 'short_term') {
    return property.rentalType;
  }
  if (workspace?.rentalType === 'long_term') return 'long_term';
  return 'short_term';
}

/** Build the full term set from an already-resolved rental type.
 *  Exported so surfaces that already know the type (e.g. a settings
 *  preview showing the rental-type card copy) can render without
 *  spinning up a workspace lookup. */
export function rentalTermsFor(rentalType: RentalType): RentalTerms {
  const isLongTerm = rentalType === 'long_term';
  return {
    rentalType,
    occupant: isLongTerm ? 'tenant' : 'guest',
    Occupant: isLongTerm ? 'Tenant' : 'Guest',
    occupants: isLongTerm ? 'tenants' : 'guests',
    Occupants: isLongTerm ? 'Tenants' : 'Guests',
    possessive: isLongTerm ? "tenant's" : "guest's",
    Possessive: isLongTerm ? "Tenant's" : "Guest's",
    stayNoun: isLongTerm ? 'tenancy' : 'stay',
    showOccupancy: !isLongTerm,
    isShortTerm: !isLongTerm,
    isLongTerm,
  };
}

/** React hook form — memoized so the returned object is stable across
 *  renders where the workspace/property hasn't actually changed. */
export function useRentalTerms(opts: {
  workspace: Pick<Workspace, 'rentalType'> | null | undefined;
  property?: Pick<Property, 'rentalType'> | null;
}): RentalTerms {
  const rentalType = resolveRentalType(opts.workspace, opts.property);
  return useMemo(() => rentalTermsFor(rentalType), [rentalType]);
}
