import { sql, isNotNull, and, eq, count } from 'drizzle-orm';
import { db } from '../db';
import { homeowners, providers, workspaceMembers } from '../db/schema';
import { inspectorPartners } from '../db/schema/inspector';

/**
 * Returns the set of Homie products this email is registered for, so the
 * portal account menus can surface "Switch to Business / Inspect / Provider"
 * links when appropriate. Match key is lower(email) — same human, three
 * separate identity tables.
 *
 * Each product's `available` flag is independent of the caller's current
 * portal: if you call this from /account, you'll get back personal=true
 * (you're calling as a homeowner) plus business/inspect/provider flagged
 * if those exist. The frontend filters to the products *other than* the
 * current portal when rendering the menu.
 */
export interface CrossProductMemberships {
  personal: { available: boolean; url: string };
  business: { available: boolean; url: string; workspaceCount: number };
  inspect_partner: { available: boolean; url: string; companyName: string | null; partnerSlug: string | null };
  provider: { available: boolean; url: string; name: string | null };
}

export async function crossProductMembershipsForEmail(rawEmail: string): Promise<CrossProductMemberships> {
  const email = rawEmail.trim().toLowerCase();

  const [hoRows, inspRows, provRows] = await Promise.all([
    db.select({ id: homeowners.id }).from(homeowners)
      .where(sql`LOWER(${homeowners.email}) = ${email}`).limit(1),
    db.select({
      id: inspectorPartners.id,
      companyName: inspectorPartners.companyName,
      partnerSlug: inspectorPartners.partnerSlug,
    }).from(inspectorPartners)
      .where(sql`LOWER(${inspectorPartners.email}) = ${email}`).limit(1),
    // Cold-outreach providers (no password_hash) are intentionally excluded
    // — they're not real "users" and have no portal to log into.
    db.select({ id: providers.id, name: providers.name }).from(providers)
      .where(and(
        sql`LOWER(${providers.email}) = ${email}`,
        isNotNull(providers.passwordHash),
      )!).limit(1),
  ]);

  let workspaceCount = 0;
  if (hoRows[0]) {
    const [{ value }] = await db.select({ value: count() })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.homeownerId, hoRows[0].id));
    workspaceCount = Number(value);
  }

  return {
    personal: {
      available: hoRows.length > 0,
      url: '/account',
    },
    business: {
      available: hoRows.length > 0 && workspaceCount > 0,
      url: '/business',
      workspaceCount,
    },
    inspect_partner: {
      available: inspRows.length > 0,
      url: '/inspector',
      companyName: inspRows[0]?.companyName ?? null,
      partnerSlug: inspRows[0]?.partnerSlug ?? null,
    },
    provider: {
      available: provRows.length > 0,
      url: '/portal',
      name: provRows[0]?.name ?? null,
    },
  };
}
