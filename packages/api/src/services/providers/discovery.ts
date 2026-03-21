import { eq, inArray, gte, and, sql } from 'drizzle-orm';
import logger from '../../logger';
import { db } from '../../db';
import { providers } from '../../db/schema/providers';
import { providerScores } from '../../db/schema/provider-scores';
import { suppressionList } from '../../db/schema/suppression-list';
import { outreachAttempts } from '../../db/schema/outreach-attempts';
import * as googleMaps from './google-maps';
import * as yelp from './yelp';
import { calculateRankScore, buildHomieScore, haversineDistanceMiles } from './ranking';
import { DiscoveryParams, DiscoveredProvider, DiscoveryResult } from '../../types/providers';

const MILES_TO_METERS = 1609.344;
const RATE_LIMIT_DAYS = 7;

export async function discoverProviders(params: DiscoveryParams): Promise<DiscoveryResult> {
  const { category, zipCode, radiusMiles, minRating, limit } = params;
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
  const detailsResults = await Promise.all(
    newPlaces.map((p) => googleMaps.getPlaceDetails(p.placeId)),
  );

  // Try to find email addresses from provider websites (for those without email)
  const { scrapeEmailFromWebsite } = await import('./email-scraper');
  const emailResults = await Promise.allSettled(
    detailsResults.map((d) => d.website ? scrapeEmailFromWebsite(d.website) : Promise.resolve(null)),
  );

  let googleProviderRows = existingProviders;
  if (newPlaces.length > 0) {
    const valuesToInsert = newPlaces.map((p, i) => ({
      name: p.name,
      phone: detailsResults[i].phone,
      email: emailResults[i].status === 'fulfilled' ? emailResults[i].value : null,
      website: detailsResults[i].website,
      googlePlaceId: p.placeId,
      googleRating: p.rating.toFixed(1),
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
          googleRating: sql`excluded.google_rating`,
          reviewCount: sql`excluded.review_count`,
        },
      })
      .returning();

    googleProviderRows = [...existingProviders, ...inserted];
  }

  // ── Phase 2b: Merge Yelp providers ──────────────────────────────────────

  // Dedup Yelp results against already-known phone numbers to avoid duplicates
  const knownPhones = new Set(googleProviderRows.map((p) => p.phone).filter(Boolean));

  const newYelpBusinesses = yelpResults.filter(
    (b) => !b.phone || !knownPhones.has(b.phone),
  );

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
      googleRating: b.rating.toFixed(1),
      reviewCount: b.reviewCount,
      categories: [category],
      lat: b.lat.toFixed(7),
      lng: b.lng.toFixed(7),
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

  const [suppressedRows, recentContactRows, scoreRows, lastContactRows] = await Promise.all([
    db
      .select({ providerId: suppressionList.providerId })
      .from(suppressionList)
      .where(inArray(suppressionList.providerId, providerIds)),

    db
      .select({ providerId: outreachAttempts.providerId })
      .from(outreachAttempts)
      .where(
        and(
          inArray(outreachAttempts.providerId, providerIds),
          gte(outreachAttempts.attemptedAt, new Date(Date.now() - RATE_LIMIT_DAYS * 86_400_000)),
        ),
      )
      .groupBy(outreachAttempts.providerId),

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
        google_rating: p.googleRating,
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
