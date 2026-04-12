/**
 * Guesty PMS integration.
 *
 * Uses Guesty's Open API v1 (https://open-api.guesty.com) with OAuth2
 * client-credentials flow. The client_id + client_secret are obtained from
 * the Guesty dashboard → Marketplace → API.
 */

import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { properties } from '../db/schema/properties';
import { reservations } from '../db/schema/reservations';
import { workspacePmsConnections, type GuestyCredentials } from '../db/schema/pms-connections';
import { applyStandardCheckInTime, applyStandardCheckOutTime } from './reservation-times';
import logger from '../logger';

const GUESTY_API_BASE = 'https://open-api.guesty.com';

/* ── OAuth2 token management ──────────────────────────────────────────── */

async function getAccessToken(connectionId: string, creds: GuestyCredentials): Promise<string> {
  // Use cached token if still valid (with 5-minute buffer)
  if (creds.accessToken && creds.tokenExpiresAt) {
    const expiresAt = new Date(creds.tokenExpiresAt).getTime();
    if (Date.now() < expiresAt - 5 * 60 * 1000) {
      return creds.accessToken;
    }
  }

  // Exchange client credentials for a new token
  const res = await fetch(`${GUESTY_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guesty OAuth2 failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number; token_type: string };
  const accessToken = data.access_token;
  const tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Cache the token in the connection row
  const updatedCreds: GuestyCredentials = { ...creds, accessToken, tokenExpiresAt };
  await db.update(workspacePmsConnections)
    .set({ credentials: updatedCreds, updatedAt: new Date() })
    .where(eq(workspacePmsConnections.id, connectionId));

  return accessToken;
}

async function guestyFetch(connectionId: string, creds: GuestyCredentials, path: string): Promise<unknown> {
  const token = await getAccessToken(connectionId, creds);
  const url = `${GUESTY_API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guesty API ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/* ── Property import ──────────────────────────────────────────────────── */

interface GuestyListing {
  _id: string;
  title?: string;
  nickname?: string;
  address?: {
    full?: string;
    street?: string;
    city?: string;
    state?: string;
    zipcode?: string;
    country?: string;
  };
  bedrooms?: number;
  bathrooms?: number;
  accommodates?: number;
  propertyType?: string;
  roomType?: string;
  squareFeet?: number;
  pictures?: Array<{ original?: string; thumbnail?: string }>;
  active?: boolean;
}

export async function importGuestyProperties(
  connectionId: string,
  creds: GuestyCredentials,
  workspaceId: string,
  updateExisting = false,
): Promise<{ imported: number; updated: number; skipped: number; total: number }> {
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let total = 0;

  // Paginate through listings
  let skip = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    const data = await guestyFetch(connectionId, creds, `/v1/listings?skip=${skip}&limit=${limit}&fields=_id title nickname address bedrooms bathrooms accommodates propertyType roomType squareFeet pictures active`) as {
      results?: GuestyListing[];
      count?: number;
      limit?: number;
    };

    const listings = data.results ?? [];
    if (listings.length === 0) break;
    total += listings.length;

    for (const listing of listings) {
      if (listing.active === false) { skipped++; continue; }

      const externalId = listing._id;
      const name = listing.title || listing.nickname || `Guesty ${externalId.slice(-6)}`;
      const addr = listing.address;

      // Map Guesty propertyType to Homie propertyType
      const typeMap: Record<string, string> = {
        apartment: 'apartment', house: 'residential', villa: 'residential',
        condo: 'condo', townhouse: 'townhouse', cabin: 'cabin',
        cottage: 'cabin', loft: 'apartment', studio: 'apartment',
      };
      const propType = typeMap[(listing.propertyType || listing.roomType || '').toLowerCase()] || 'residential';

      // Photo URLs
      const photoUrls = listing.pictures?.map(p => p.original || p.thumbnail).filter(Boolean).slice(0, 10) as string[] | undefined;

      const [existing] = await db
        .select({ id: properties.id })
        .from(properties)
        .where(and(eq(properties.workspaceId, workspaceId), eq(properties.pmsExternalId, externalId)))
        .limit(1);

      if (existing) {
        if (updateExisting) {
          await db.update(properties).set({
            name,
            address: addr?.street || addr?.full || null,
            city: addr?.city || null,
            state: addr?.state || null,
            zipCode: addr?.zipcode || null,
            propertyType: propType,
            bedrooms: listing.bedrooms ?? null,
            bathrooms: listing.bathrooms ? String(listing.bathrooms) : null,
            sqft: listing.squareFeet ?? null,
            photoUrls: photoUrls && photoUrls.length > 0 ? photoUrls : undefined,
            updatedAt: new Date(),
          }).where(eq(properties.id, existing.id));
          updated++;
        } else {
          skipped++;
        }
      } else {
        await db.insert(properties).values({
          workspaceId,
          name,
          address: addr?.street || addr?.full || null,
          city: addr?.city || null,
          state: addr?.state || null,
          zipCode: addr?.zipcode || null,
          propertyType: propType,
          unitCount: 1,
          bedrooms: listing.bedrooms ?? null,
          bathrooms: listing.bathrooms ? String(listing.bathrooms) : null,
          sqft: listing.squareFeet ?? null,
          pmsSource: 'guesty',
          pmsExternalId: externalId,
          photoUrls: photoUrls && photoUrls.length > 0 ? photoUrls : null,
        });
        imported++;
      }
    }

    skip += listings.length;
    hasMore = listings.length >= limit;
  }

  // Update connection stats
  await db.update(workspacePmsConnections).set({
    propertiesSynced: imported + updated,
    lastPropertySyncAt: new Date(),
    status: 'connected',
    lastError: null,
    updatedAt: new Date(),
  }).where(eq(workspacePmsConnections.id, connectionId));

  return { imported, updated, skipped, total };
}

/* ── Reservation sync ─────────────────────────────────────────────────── */

interface GuestyReservation {
  _id: string;
  listingId?: string;
  listing?: { _id: string };
  checkIn?: string;
  checkOut?: string;
  status?: string;
  guestId?: string;
  guest?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    hometown?: string;
  };
  guestsCount?: number;
  source?: string;
}

export async function syncGuestyReservations(
  connectionId: string,
  creds: GuestyCredentials,
  workspaceId: string,
): Promise<{ imported: number; updated: number; total: number }> {
  let imported = 0;
  let updated = 0;
  let total = 0;
  const now = new Date();

  // Get all workspace properties linked to Guesty
  const props = await db
    .select({ id: properties.id, pmsExternalId: properties.pmsExternalId })
    .from(properties)
    .where(and(eq(properties.workspaceId, workspaceId), eq(properties.pmsSource, 'guesty')));

  if (props.length === 0) return { imported: 0, updated: 0, total: 0 };

  const propByExternalId = new Map(props.map(p => [p.pmsExternalId, p.id]));

  // Fetch reservations — filter to future check-outs
  let skip = 0;
  const limit = 100;
  let hasMore = true;
  const fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week back

  while (hasMore) {
    const data = await guestyFetch(connectionId, creds,
      `/v1/reservations?skip=${skip}&limit=${limit}&sort=checkIn&filters=[{"field":"checkOut","operator":"$gte","value":"${fromDate}"}]`
    ) as { results?: GuestyReservation[]; count?: number };

    const reservationList = data.results ?? [];
    if (reservationList.length === 0) break;
    total += reservationList.length;

    for (const r of reservationList) {
      const listingId = r.listingId || r.listing?._id;
      if (!listingId) continue;

      const propertyId = propByExternalId.get(listingId);
      if (!propertyId) continue; // Listing not imported

      const checkInRaw = r.checkIn;
      const checkOutRaw = r.checkOut;
      if (!checkInRaw || !checkOutRaw) continue;

      const checkIn = applyStandardCheckInTime(new Date(checkInRaw));
      const checkOut = applyStandardCheckOutTime(new Date(checkOutRaw));
      if (checkOut < now) continue;

      // Map Guesty status
      const statusMap: Record<string, string> = {
        confirmed: 'confirmed', inquiry: 'tentative', reserved: 'confirmed',
        closed: 'checked_out', canceled: 'cancelled', cancelled: 'cancelled',
        checked_in: 'checked_in', checked_out: 'checked_out',
      };
      const status = statusMap[(r.status || '').toLowerCase()] || 'confirmed';
      if (status === 'cancelled') continue;

      const guestName = r.guest
        ? [r.guest.firstName, r.guest.lastName].filter(Boolean).join(' ') || null
        : null;
      const guestEmail = r.guest?.email || null;
      const guestPhone = r.guest?.phone || null;

      const [existing] = await db
        .select({ id: reservations.id })
        .from(reservations)
        .where(and(eq(reservations.propertyId, propertyId), eq(reservations.pmsReservationId, r._id)))
        .limit(1);

      if (existing) {
        await db.update(reservations).set({
          guestName, guestEmail, guestPhone,
          checkIn, checkOut, status,
          guests: r.guestsCount ?? null,
          updatedAt: now,
        }).where(eq(reservations.id, existing.id));
        updated++;
      } else {
        await db.insert(reservations).values({
          propertyId,
          workspaceId,
          guestName, guestEmail, guestPhone,
          checkIn, checkOut, status,
          guests: r.guestsCount ?? null,
          source: 'guesty',
          pmsReservationId: r._id,
        });
        imported++;
      }
    }

    skip += reservationList.length;
    hasMore = reservationList.length >= limit;
  }

  // Update connection stats
  await db.update(workspacePmsConnections).set({
    reservationsSynced: imported + updated,
    lastReservationSyncAt: new Date(),
    status: 'connected',
    lastError: null,
    updatedAt: new Date(),
  }).where(eq(workspacePmsConnections.id, connectionId));

  return { imported, updated, total };
}

/**
 * Test a Guesty connection by attempting to fetch the first listing.
 * Throws on auth failure.
 */
export async function testGuestyConnection(connectionId: string, creds: GuestyCredentials): Promise<{ listingCount: number }> {
  const data = await guestyFetch(connectionId, creds, '/v1/listings?limit=1&fields=_id') as { count?: number };
  return { listingCount: data.count ?? 0 };
}
