import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import {
  homeownerProperties,
  type HomeownerProperty,
  type NewHomeownerProperty,
  HOMEOWNER_PROPERTY_TYPES,
  type HomeownerPropertyType,
} from '../db/schema/homeowner-properties';

/**
 * Data access for `homeowner_properties` (Membership Phase 1).
 *
 * Pattern matches the rest of the codebase: thin functions that call
 * Drizzle directly. Validation of allowed-value text columns
 * (propertyType) lives here so write paths can't bypass it.
 *
 * Business logic — schedule generation, multi-property pricing
 * (Premier perk), the actual UI flows that create these rows — lives
 * in later sessions. This file is data access only.
 */

// ─── Errors ────────────────────────────────────────────────────────────────

/**
 * Thrown when a write would violate the partial-unique constraint on
 * (homeowner_id, is_primary=true). The DB also enforces this — this
 * class lets callers handle the case in a typed way without parsing
 * Postgres error codes.
 */
export class HomeownerPropertyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HomeownerPropertyValidationError';
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function assertValidPropertyType(value: string): asserts value is HomeownerPropertyType {
  if (!(HOMEOWNER_PROPERTY_TYPES as readonly string[]).includes(value)) {
    throw new HomeownerPropertyValidationError(
      `Invalid property_type: "${value}". Allowed: ${HOMEOWNER_PROPERTY_TYPES.join(', ')}`,
    );
  }
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function findById(id: string): Promise<HomeownerProperty | null> {
  const [row] = await db
    .select()
    .from(homeownerProperties)
    .where(eq(homeownerProperties.id, id))
    .limit(1);
  return row ?? null;
}

export async function listForHomeowner(homeownerId: string): Promise<HomeownerProperty[]> {
  return db
    .select()
    .from(homeownerProperties)
    .where(eq(homeownerProperties.homeownerId, homeownerId))
    .orderBy(desc(homeownerProperties.isPrimary), desc(homeownerProperties.createdAt));
}

export async function findPrimaryForHomeowner(
  homeownerId: string,
): Promise<HomeownerProperty | null> {
  const [row] = await db
    .select()
    .from(homeownerProperties)
    .where(
      and(
        eq(homeownerProperties.homeownerId, homeownerId),
        eq(homeownerProperties.isPrimary, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export async function create(input: NewHomeownerProperty): Promise<HomeownerProperty> {
  if (input.propertyType !== undefined && input.propertyType !== null) {
    assertValidPropertyType(input.propertyType);
  }
  const [row] = await db.insert(homeownerProperties).values(input).returning();
  if (!row) {
    throw new Error('Insert returned no row');
  }
  return row;
}

export async function update(
  id: string,
  patch: Partial<Omit<NewHomeownerProperty, 'id' | 'homeownerId' | 'createdAt'>>,
): Promise<HomeownerProperty | null> {
  if (patch.propertyType !== undefined && patch.propertyType !== null) {
    assertValidPropertyType(patch.propertyType);
  }
  const [row] = await db
    .update(homeownerProperties)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(homeownerProperties.id, id))
    .returning();
  return row ?? null;
}
