import { eq, inArray, gte, and, sql } from 'drizzle-orm';
import logger from '../../logger';
import { db } from '../../db';
import { providers } from '../../db/schema/providers';
import { providerScores } from '../../db/schema/provider-scores';
import { suppressionList } from '../../db/schema/suppression-list';
import { outreachAttempts } from '../../db/schema/outreach-attempts';
import { jobs } from '../../db/schema/jobs';
import * as googleMaps from './google-maps';
import * as yelp from './yelp';
import { calculateRankScore, buildHomieScore, haversineDistanceMiles } from './ranking';
import { DiscoveryParams, DiscoveredProvider, DiscoveryResult } from '../../types/providers';

const MILES_TO_METERS = 1609.344;
// Global default — applied when no workspace context is provided (consumer flow)
const RATE_LIMIT_DAYS = 7;
// Per-workspace cooldown — same workspace can re-contact a provider after 2 days
const WORKSPACE_RATE_LIMIT_DAYS = 2;

/**
 * Normalize a phone number to a comparable dedupe key (digits only, US country
 * code stripped). Google returns "+1 415-555-1234" or "(415) 555-1234"; Yelp
 * returns "+14155551234". Without this, set-based dedupe silently misses them.
 */
function phoneKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length >= 10) return digits;
  return null;
}

export async function discoverProviders(params: DiscoveryParams): Promise<DiscoveryResult> {
  const { category, zipCode, radiusMiles, minRating, limit, workspaceId } = params;
  const radiusMeters = Math.round(radiusMiles * MILES_TO_METERS);

  // ── Phase 1: External discovery — Google Maps + Yelp in parallel ─────────

  const { lat, lng } = await googleMaps.geocodeZip(zipCode);

  const [places, yelpResults] = await Promise.all([
    googleMaps.searchNearby({ lat, lng, radiusMeters, category, minRating }),
    yelp.searchNearby({ lat, lng, radiusMeters, category, minRating, limit }).catch((err) => {
      logger.error({ err }, '[discovery] Yelp search failed, continuing without it');
      return [] as yelp.YelpBusiness[];
    }),
  ]);

  const totalFound = places.length + yelpResults.length;
  let filteredOut = 0;

  // Track coords + openNow per Google place_id for ranking
  const coordsByPlaceId = new Map<string, { lat: number; lng: number; openNow: boolean | null }>();
  for (const p of places) {
    coordsByPlaceId.set(p.placeId, { lat: p.lat, lng: p.lng, openNow: p.openNow });
  }

  // ── Phase 2: Upsert Google providers ────────────────────────────────────

  const placeIds = places.map((p) => p.placeId);

  const existingProviders =
    placeIds.length > 0
      ? await db
          .select()
          .from(providers)
          .where(inArray(providers.googlePlaceId, placeIds))
      : [];

  const existingByPlaceId = new Map(existingProviders.map((p) => [p.googlePlaceId, p]));
  const newPlaces = places.filter((p) => !existingByPlaceId.has(p.placeId));

  // Fetch Place Details for new Google providers (phone, website) — run in parallel
  const detailsSettled = await Promise.allSettled(
    newPlaces.map((p) => googleMaps.getPlaceDetails(p.placeId)),
  );
  const detailsResults = detailsSettled.map(r => r.status === 'fulfilled' ? r.value : { phone: null, website: null });

  // Try to find email addresses from provider websites (for those without email)
  const { scrapeEmailFromWebsite } = await import('./email-scraper');
  const emailResults = await Promise.allSettled(
    detailsResults.map((d) => d.website ? scrapeEmailFromWebsite(d.website) : Promise.resolve(null)),
  );

  logger.info(`[discovery] ${places.length} from Google, ${existingProviders.length} existing, ${newPlaces.length} new to insert`);

  let googleProviderRows = existingProviders;
  if (newPlaces.length > 0) {
    const valuesToInsert = newPlaces.map((p, i) => ({
      name: p.name,
      phone: detailsResults[i].phone,
      email: emailResults[i].status === 'fulfilled' ? emailResults[i].value : null,
      website: detailsResults[i].website,
      googlePlaceId: p.placeId,
      rating: p.rating.toFixed(1),
      reviewCount: p.reviewCount,
      categories: [category],
      lat: p.lat.toFixed(7),
      lng: p.lng.toFixed(7),
    }));

    const inserted = await db
      .insert(providers)
      .values(valuesToInsert)
      .onConflictDoUpdate({
        target: providers.googlePlaceId,
        set: {
          rating: sql`excluded.google_rating`,
          reviewCount: sql`excluded.review_count`,
        },
      })
      .returning();

    googleProviderRows = [...existingProviders, ...inserted];
  }

  // ── Phase 2b: Merge Yelp providers ──────────────────────────────────────

  // Dedup Yelp results against already-known phone numbers to avoid duplicates.
  // Normalize before compare — Google and Yelp return phones in different formats
  // (e.g. "+1 415-555-1234" vs "+14155551234") so exact string match would miss them.
  const knownPhoneKeys = new Set(
    googleProviderRows.map((p) => phoneKey(p.phone)).filter((k): k is string => !!k),
  );

  const newYelpBusinesses = yelpResults.filter((b) => {
    const key = phoneKey(b.phone);
    return !key || !knownPhoneKeys.has(key);
  });

  // coordsByProviderId covers all providers (Google rows use UUID after upsert;
  // Yelp rows will be mapped after insert below)
  const coordsByProviderId = new Map<string, { lat: number; lng: number; openNow: boolean | null }>();

  for (const p of googleProviderRows) {
    const coords = coordsByPlaceId.get(p.googlePlaceId ?? '');
    if (coords) coordsByProviderId.set(p.id, coords);
  }

  let yelpCount = 0;
  let yelpProviderRows: (typeof googleProviderRows)[number][] = [];

  if (newYelpBusinesses.length > 0) {
    const yelpValues = newYelpBusinesses.map((b) => ({
      name: b.name,
      phone: b.phone,
      rating: b.rating.toFixed(1),
      reviewCount: b.reviewCount,
      categories: [category],
      lat: b.lat.toFixed(7),
      lng: b.lng.toFixed(7),
      yelpUrl: b.url,
    }));

    // Plain inserts — no googlePlaceId, so no conflict possible
    yelpProviderRows = await db.insert(providers).values(yelpValues).returning();

    for (let i = 0; i < yelpProviderRows.length; i++) {
      const p = yelpProviderRows[i];
      const b = newYelpBusinesses[i];
      // Yelp doesn't give us open-now status from the search endpoint
      coordsByProviderId.set(p.id, { lat: b.lat, lng: b.lng, openNow: null });
    }

    yelpCount = yelpProviderRows.length;
  }

  // Trial-decision metric — measures whether Yelp is adding net-new providers beyond Google.
  // Grep Railway for "[yelp-trial-metric]" before day 28 to decide on the $229/mo conversion.
  if (yelpResults.length > 0 || places.length > 0) {
    const yelpDupes = yelpResults.length - newYelpBusinesses.length;
    const yelpUniquePct = yelpResults.length > 0
      ? Math.round((newYelpBusinesses.length / yelpResults.length) * 100)
      : 0;
    logger.info({
      category,
      radiusMiles,
      googleCount: places.length,
      yelpReturned: yelpResults.length,
      yelpUnique: newYelpBusinesses.length,
      yelpDupesWithGoogle: yelpDupes,
      yelpUniquePct,
    }, '[yelp-trial-metric]');
  }

  // Google providers not in coordsByProviderId yet (DB-only providers with no coord match)
  // fall back to radiusMiles in Phase 3.

  const allProviders = [...googleProviderRows, ...yelpProviderRows];
  const providerIds = allProviders.map((p) => p.id);

  if (providerIds.length === 0) {
    return {
      providers: [],
      total_found: totalFound,
      filtered_out: filteredOut,
      sources: { google_maps: 0, internal: 0, yelp: 0 },
    };
  }

  // ── Phase 2c: Enrichment — suppression, rate limits, scores, last contact ─

  // Rate-limit window depends on whether we have a workspace context:
  //   - Workspace flow: 2-day cooldown, scoped to attempts from this workspace's jobs only
  //   - Consumer flow: 7-day global cooldown across all attempts
  const rateLimitDays = workspaceId ? WORKSPACE_RATE_LIMIT_DAYS : RATE_LIMIT_DAYS;
  const rateLimitCutoff = new Date(Date.now() - rateLimitDays * 86_400_000);

  const recentContactQuery = workspaceId
    ? db
        .select({ providerId: outreachAttempts.providerId })
        .from(outreachAttempts)
        .innerJoin(jobs, eq(outreachAttempts.jobId, jobs.id))
        .where(
          and(
            inArray(outreachAttempts.providerId, providerIds),
            gte(outreachAttempts.attemptedAt, rateLimitCutoff),
            eq(jobs.workspaceId, workspaceId),
          ),
        )
        .groupBy(outreachAttempts.providerId)
    : db
        .select({ providerId: outreachAttempts.providerId })
        .from(outreachAttempts)
        .where(
          and(
            inArray(outreachAttempts.providerId, providerIds),
            gte(outreachAttempts.attemptedAt, rateLimitCutoff),
          ),
        )
        .groupBy(outreachAttempts.providerId);

  const [suppressedRows, recentContactRows, scoreRows, lastContactRows] = await Promise.all([
    db
      .select({ providerId: suppressionList.providerId })
      .from(suppressionList)
      .where(inArray(suppressionList.providerId, providerIds)),

    recentContactQuery,

    db
      .select()
      .from(providerScores)
      .where(inArray(providerScores.providerId, providerIds)),

    db
      .select({
        providerId: outreachAttempts.providerId,
        lastAt: sql<string>`max(${outreachAttempts.attemptedAt})`,
      })
      .from(outreachAttempts)
      .where(inArray(outreachAttempts.providerId, providerIds))
      .groupBy(outreachAttempts.providerId),
  ]);

  const suppressedIds = new Set(suppressedRows.map((r) => r.providerId));
  const rateLimitedIds = new Set(recentContactRows.map((r) => r.providerId));
  const scoresById = new Map(scoreRows.map((s) => [s.providerId, s]));
  const lastContactById = new Map(lastContactRows.map((r) => [r.providerId, r.lastAt]));

  // ── Phase 3: Rank and shape the response ────────────────────────────────

  const ranked: DiscoveredProvider[] = allProviders
    .map((p) => {
      const coords = coordsByProviderId.get(p.id);
      const distanceMiles = coords
        ? haversineDistanceMiles(lat, lng, coords.lat, coords.lng)
        : radiusMiles;
      const openNow = coords?.openNow ?? null;

      const score = scoresById.get(p.id);
      const rankScore = calculateRankScore(p, distanceMiles, radiusMiles, minRating, score, openNow);

      const channelsAvailable: string[] = [];
      if (p.phone) channelsAvailable.push('voice', 'sms');
      if (p.website) channelsAvailable.push('web');

      const lastContacted = lastContactById.get(p.id) ?? null;

      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        email: p.email,
        website: p.website,
        google_place_id: p.googlePlaceId,
        google_rating: p.rating,
        review_count: p.reviewCount,
        categories: p.categories,
        distance_miles: Math.round(distanceMiles * 10) / 10,
        rank_score: Math.round(rankScore * 1000) / 1000,
        homie_score: buildHomieScore(score),
        channels_available: channelsAvailable,
        open_now: openNow,
        suppressed: suppressedIds.has(p.id),
        rate_limited: rateLimitedIds.has(p.id),
        last_contacted: lastContacted,
      };
    })
    .sort((a, b) => b.rank_score - a.rank_score);

  filteredOut = totalFound - allProviders.length;

  return {
    providers: ranked.slice(0, limit),
    total_found: totalFound,
    filtered_out: filteredOut,
    sources: {
      google_maps: newPlaces.length,
      internal: existingProviders.length,
      yelp: yelpCount,
    },
  };
}
