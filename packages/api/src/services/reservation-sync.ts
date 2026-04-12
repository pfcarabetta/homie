import cron from 'node-cron';
import { db } from '../db';
import { workspaces } from '../db/schema/workspaces';
import { properties } from '../db/schema/properties';
import { reservations } from '../db/schema/reservations';
import { applyStandardCheckInTime, applyStandardCheckOutTime } from './reservation-times';
import { eq, and } from 'drizzle-orm';
import logger from '../logger';

interface TrackReservation {
  id?: number | string;
  unitId?: number | string;
  unit_id?: number | string;
  propertyId?: number | string;
  property_id?: number | string;
  guestName?: string;
  guest?: string;
  name?: string;
  arrivalDate?: string;
  checkIn?: string;
  startDate?: string;
  departureDate?: string;
  checkOut?: string;
  endDate?: string;
  status?: string;
  numGuests?: number;
  guests?: number;
  numberOfGuests?: number;
  contactId?: number | string;
  _embedded?: Record<string, unknown>;
  _links?: Record<string, unknown>;
}

let syncing = false;

async function syncWorkspaceReservations(ws: {
  id: string;
  name: string;
  trackDomain: string;
  trackApiKey: string;
  trackApiSecret: string;
}): Promise<{ imported: number; updated: number }> {
  const domain = ws.trackDomain;
  const authHeader = 'Basic ' + Buffer.from(`${ws.trackApiKey}:${ws.trackApiSecret}`).toString('base64');
  const base = domain.includes('/api') ? `https://${domain}` : `https://${domain}/api`;

  const trackProperties = await db
    .select({ id: properties.id, pmsExternalId: properties.pmsExternalId })
    .from(properties)
    .where(and(
      eq(properties.workspaceId, ws.id),
      eq(properties.pmsSource, 'track'),
    ));

  const linkedProps = trackProperties.filter(p => p.pmsExternalId != null && p.pmsExternalId !== '');
  if (linkedProps.length === 0) return { imported: 0, updated: 0 };

  const now = new Date();
  let totalImported = 0;
  let totalUpdated = 0;

  // Discover endpoint style
  let endpointStyle: 'per-unit' | 'global' | null = null;
  const testUnitId = linkedProps[0].pmsExternalId!;

  try {
    const testRes = await fetch(`${base}/pms/units/${testUnitId}/reservations?size=1`, {
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
    });
    if (testRes.ok) endpointStyle = 'per-unit';
  } catch { /* not available */ }

  if (!endpointStyle) {
    try {
      const testRes = await fetch(`${base}/pms/reservations?size=1`, {
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
      });
      if (testRes.ok) endpointStyle = 'global';
    } catch { /* not available */ }
  }

  if (!endpointStyle) {
    logger.warn({ workspaceId: ws.id }, '[ReservationSync] no working reservation endpoint');
    return { imported: 0, updated: 0 };
  }

  // Fetch reservations
  const allReservationsByUnit = new Map<string, TrackReservation[]>();

  if (endpointStyle === 'global') {
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dateFilters = [
      `arrivalStart=${sixMonthsAgo}`,
      `arrival_start=${sixMonthsAgo}`,
      `startDate=${sixMonthsAgo}`,
      `from=${sixMonthsAgo}`,
      `arrivalDate[gte]=${sixMonthsAgo}`,
    ];

    let dateFilterParam = '';
    for (const filter of dateFilters) {
      try {
        const testUrl = `${base}/pms/reservations?size=1&${filter}`;
        const testRes = await fetch(testUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
        if (testRes.ok) {
          const testData = await testRes.json() as Record<string, unknown>;
          const filteredTotal = testData.total_items as number;
          if (filteredTotal != null && filteredTotal < 11000) {
            dateFilterParam = filter;
            break;
          }
        }
      } catch { /* try next */ }
    }

    let nextUrl: string | null = dateFilterParam
      ? `${base}/pms/reservations?size=50&${dateFilterParam}`
      : `${base}/pms/reservations?size=50`;
    let currentPage = 0;
    let stopPaginating = false;

    while (nextUrl && currentPage < 200 && !stopPaginating) {
      currentPage++;
      try {
        const gRes = await fetch(nextUrl, { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } });
        if (!gRes.ok) break;
        const ct = gRes.headers.get('content-type') || '';
        if (!ct.includes('json')) break;
        const gData = await gRes.json() as Record<string, unknown>;

        let items: TrackReservation[] = [];
        if (Array.isArray(gData)) {
          items = gData as TrackReservation[];
        } else {
          const embedded = gData._embedded as Record<string, unknown> | undefined;
          items = (
            embedded?.reservations ?? embedded?.unitReservations ??
            gData.reservations ?? gData.contents ?? gData.results ??
            gData.data ?? gData.items ?? gData.records ?? []
          ) as TrackReservation[];
        }

        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        let allOld = items.length > 0;
        for (const r of items) {
          const rr = r as Record<string, unknown>;
          const depStr = (rr.departureDate ?? rr.checkOut ?? rr.endDate) as string | undefined;
          if (depStr && new Date(depStr) > ninetyDaysAgo) allOld = false;
          const uid = String(rr.unitId ?? rr.unit_id ?? rr.propertyId ?? rr.property_id ?? rr.unit ?? '');
          if (!uid) continue;
          if (!allReservationsByUnit.has(uid)) allReservationsByUnit.set(uid, []);
          allReservationsByUnit.get(uid)!.push(r);
        }

        if (allOld) stopPaginating = true;

        const links = gData._links as Record<string, { href?: string }> | undefined;
        const rawNext = links?.next?.href;
        if (rawNext && typeof rawNext === 'string') {
          nextUrl = rawNext.startsWith('http') ? rawNext : `https://${domain}${rawNext}`;
        } else {
          nextUrl = null;
        }
      } catch (err) {
        logger.warn({ err, page: currentPage, workspaceId: ws.id }, '[ReservationSync] page fetch error');
        break;
      }
    }
  }

  // Extract contacts from embedded data
  const contactCache = new Map<string, { name: string; email: string | null; phone: string | null }>();
  for (const resList of allReservationsByUnit.values()) {
    for (const r of resList) {
      const rr = r as Record<string, unknown>;
      const embedded = rr._embedded as Record<string, unknown> | undefined;
      const contact = (embedded?.contact ?? embedded?.guest) as Record<string, unknown> | undefined;
      if (contact) {
        const cid = String(rr.contactId ?? (rr as Record<string, unknown>).contact_id ?? '');
        const firstName = String(contact.firstName ?? contact.first_name ?? contact.givenName ?? '');
        const lastName = String(contact.lastName ?? contact.last_name ?? contact.familyName ?? '');
        const name = [firstName, lastName].filter(Boolean).join(' ');
        const email = (contact.primaryEmail ?? contact.email ?? contact.emailAddress ?? null) as string | null;
        const phone = (contact.cellPhone ?? contact.homePhone ?? contact.phone ?? contact.mobile ?? null) as string | null;
        if (cid) contactCache.set(cid, { name, email, phone });
      }
    }
  }

  // Process each linked property
  for (const prop of linkedProps) {
    const unitId = prop.pmsExternalId!;
    let trackReservations: TrackReservation[] = [];

    if (endpointStyle === 'global') {
      trackReservations = allReservationsByUnit.get(unitId) ?? [];
    } else {
      // Per-unit fetch
      try {
        const res = await fetch(`${base}/pms/units/${unitId}/reservations?size=50`, {
          headers: { 'Authorization': authHeader, 'Accept': 'application/json' },
        });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('json')) continue;
        const data = await res.json() as Record<string, unknown>;

        if (Array.isArray(data)) {
          trackReservations = data as TrackReservation[];
        } else {
          const embedded = data._embedded as Record<string, unknown> | undefined;
          trackReservations = (
            embedded?.reservations ?? embedded?.unitReservations ??
            data.reservations ?? data.contents ?? data.results ??
            data.data ?? data.items ?? data.records ?? []
          ) as TrackReservation[];
        }

        // Extract embedded contacts for per-unit
        for (const r of trackReservations) {
          const rr = r as Record<string, unknown>;
          const emb = rr._embedded as Record<string, unknown> | undefined;
          const contact = (emb?.contact ?? emb?.guest) as Record<string, unknown> | undefined;
          if (contact) {
            const cid = String(rr.contactId ?? rr.contact_id ?? '');
            const firstName = String(contact.firstName ?? contact.first_name ?? '');
            const lastName = String(contact.lastName ?? contact.last_name ?? '');
            const email = (contact.primaryEmail ?? contact.email ?? null) as string | null;
            const phone = (contact.cellPhone ?? contact.phone ?? null) as string | null;
            if (cid) contactCache.set(cid, { name: [firstName, lastName].filter(Boolean).join(' '), email, phone });
          }
        }
      } catch (err) {
        logger.warn({ err, unitId, workspaceId: ws.id }, '[ReservationSync] per-unit fetch error');
        continue;
      }
    }

    // Upsert reservations
    for (const tr of trackReservations) {
      const externalId = tr.id != null ? String(tr.id) : null;
      if (!externalId) continue;

      const contactId = String((tr as Record<string, unknown>).contactId ?? (tr as Record<string, unknown>).contact_id ?? '');
      const contact = contactId ? contactCache.get(contactId) : undefined;

      const rawGuestName = tr.guestName ?? tr.guest ?? tr.name ?? null;
      const guestName = (contact?.name && contact.name.length > 0) ? contact.name : rawGuestName;
      const guestEmail = contact?.email ?? null;
      const guestPhone = contact?.phone ?? null;

      const checkInStr = tr.arrivalDate ?? tr.checkIn ?? tr.startDate;
      const checkOutStr = tr.departureDate ?? tr.checkOut ?? tr.endDate;
      if (!checkInStr || !checkOutStr) continue;

      // Normalize to standard times: 4 PM check-in, 11 AM check-out
      const checkIn = applyStandardCheckInTime(new Date(checkInStr));
      const checkOut = applyStandardCheckOutTime(new Date(checkOutStr));
      if (checkOut < now) continue;

      const guestCount = tr.numGuests ?? tr.guests ?? tr.numberOfGuests ?? null;
      const status = tr.status ?? 'confirmed';
      if (status.toLowerCase() === 'cancelled' || status.toLowerCase() === 'canceled') continue;

      const [existing] = await db
        .select({ id: reservations.id })
        .from(reservations)
        .where(and(
          eq(reservations.propertyId, prop.id),
          eq(reservations.pmsReservationId, externalId),
        ))
        .limit(1);

      if (existing) {
        await db.update(reservations)
          .set({ guestName, guestEmail, guestPhone, checkIn, checkOut, status, guests: guestCount, updatedAt: new Date() })
          .where(eq(reservations.id, existing.id));
        totalUpdated++;
      } else {
        await db.insert(reservations).values({
          propertyId: prop.id,
          workspaceId: ws.id,
          guestName, guestEmail, guestPhone,
          checkIn, checkOut, status,
          guests: guestCount,
          source: 'track',
          pmsReservationId: externalId,
        });
        totalImported++;
      }
    }
  }

  // Update last sync timestamp
  await db.update(workspaces).set({ trackLastSyncAt: new Date() }).where(eq(workspaces.id, ws.id));

  return { imported: totalImported, updated: totalUpdated };
}

async function syncAllReservations() {
  if (syncing) {
    logger.info('[ReservationSync] already running, skipping');
    return;
  }
  syncing = true;

  try {
    // ── Legacy path: workspaces with Track credentials in workspace columns ──
    const trackWorkspaces = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        trackDomain: workspaces.trackDomain,
        trackApiKey: workspaces.trackApiKey,
        trackApiSecret: workspaces.trackApiSecret,
      })
      .from(workspaces)
      .where(eq(workspaces.trackSyncEnabled, 1));

    const legacyEligible = trackWorkspaces.filter(w => w.trackDomain && w.trackApiKey && w.trackApiSecret);

    for (const ws of legacyEligible) {
      try {
        const result = await syncWorkspaceReservations(ws as {
          id: string; name: string; trackDomain: string; trackApiKey: string; trackApiSecret: string;
        });
        logger.info({ workspaceId: ws.id, workspaceName: ws.name, ...result }, '[ReservationSync] legacy Track sync complete');
      } catch (err) {
        logger.error({ err, workspaceId: ws.id }, '[ReservationSync] legacy Track sync failed');
      }
    }

    // ── New path: DB-backed PMS connections (Track + Guesty) ──
    try {
      const { workspacePmsConnections } = await import('../db/schema/pms-connections');
      type TCreds = { domain: string; apiKey: string; apiSecret: string };
      type GCreds = { clientId: string; clientSecret: string; accessToken?: string; tokenExpiresAt?: string };
      const connections = await db.select().from(workspacePmsConnections)
        .where(eq(workspacePmsConnections.status, 'connected'));

      for (const conn of connections) {
        try {
          if (conn.pmsType === 'track') {
            const creds = conn.credentials as unknown as TCreds;
            if (!creds.domain || !creds.apiKey || !creds.apiSecret) continue;
            const result = await syncWorkspaceReservations({
              id: conn.workspaceId, name: `ws-${conn.workspaceId.slice(0, 8)}`,
              trackDomain: creds.domain, trackApiKey: creds.apiKey, trackApiSecret: creds.apiSecret,
            });
            await db.update(workspacePmsConnections).set({
              reservationsSynced: result.imported + result.updated,
              lastReservationSyncAt: new Date(), lastError: null, updatedAt: new Date(),
            }).where(eq(workspacePmsConnections.id, conn.id));
            logger.info({ connId: conn.id, ...result }, '[ReservationSync] Track (DB) sync complete');
          } else if (conn.pmsType === 'guesty') {
            const creds = conn.credentials as unknown as GCreds;
            const { syncGuestyReservations } = await import('./guesty');
            const result = await syncGuestyReservations(conn.id, creds, conn.workspaceId);
            logger.info({ connId: conn.id, ...result }, '[ReservationSync] Guesty sync complete');
          }
        } catch (err) {
          logger.error({ err, connId: conn.id, pmsType: conn.pmsType }, '[ReservationSync] PMS connection sync failed');
          await db.update(workspacePmsConnections).set({
            status: 'error', lastError: (err as Error).message, updatedAt: new Date(),
          }).where(eq(workspacePmsConnections.id, conn.id));
        }
      }
    } catch (err) {
      logger.warn({ err }, '[ReservationSync] PMS connections sync failed');
    }
  } catch (err) {
    logger.error({ err }, '[ReservationSync] sync failed');
  } finally {
    syncing = false;
  }
}

/**
 * Public wrapper so the PMS connection endpoints can trigger a Track
 * reservation sync for a specific workspace using stored credentials.
 */
export async function syncTrackReservationsForWorkspace(
  workspaceId: string,
  domain: string,
  apiKey: string,
  apiSecret: string,
): Promise<{ imported: number; updated: number; total: number }> {
  const [ws] = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!ws) throw new Error('Workspace not found');
  const result = await syncWorkspaceReservations({
    id: ws.id, name: ws.name, trackDomain: domain, trackApiKey: apiKey, trackApiSecret: apiSecret,
  });
  return { ...result, total: result.imported + result.updated };
}

const SYNC_INTERVAL = process.env.PMS_SYNC_CRON || '0 */4 * * *'; // default every 4 hours

export function startReservationSync() {
  logger.info({ schedule: SYNC_INTERVAL }, '[ReservationSync] scheduling reservation sync');

  // Run initial sync after 10 second delay (let server start up)
  setTimeout(() => {
    syncAllReservations().catch(err => logger.error({ err }, '[ReservationSync] initial sync failed'));
  }, 10_000);

  // Schedule recurring sync
  cron.schedule(SYNC_INTERVAL, () => {
    syncAllReservations().catch(err => logger.error({ err }, '[ReservationSync] scheduled sync failed'));
  });
}
