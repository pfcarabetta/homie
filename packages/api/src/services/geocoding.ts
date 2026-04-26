import logger from '../logger';

/**
 * Geocoding service backed by the U.S. Census Bureau Geocoder.
 *
 * Why this provider:
 *  - Free, no API key, no auth, no per-request rate limit (within reason)
 *  - Returns lat/lon AND full census geography (county FIPS, tract GEOID)
 *    in a single call, which is exactly the shape Home IQ needs to look
 *    up FEMA flood zones, EPA radon zones, and AHS regional cohorts
 *  - Authoritative for U.S. addresses
 *
 * Endpoint:
 *   https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress
 *
 * The "geographies" path (vs. "locations") returns both coordinates AND
 * the census-tract / county-FIPS hierarchy in one shot. We use the
 * "Current_Current" benchmark + vintage so results align with the latest
 * published TIGER/Line files (matches how FEMA/EPA reference geographies).
 */

const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';
const REQUEST_TIMEOUT_MS = 8000;

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** 5-digit county FIPS, e.g. "06075" for San Francisco. */
  countyFips: string;
  /** 11-digit census tract GEOID (state + county + tract). */
  censusTract: string;
}

interface CensusMatch {
  coordinates?: { x: number; y: number };
  geographies?: {
    'Census Tracts'?: Array<{
      GEOID?: string;
      STATE?: string;
      COUNTY?: string;
    }>;
  };
}

interface CensusResponse {
  result?: {
    addressMatches?: CensusMatch[];
  };
}

/**
 * Geocode a U.S. address and return lat/lon + census geography.
 *
 * Returns null when the geocoder doesn't find a match (bad address, PO box,
 * non-US, etc.) — callers should treat the absence as "geography unknown"
 * and skip downstream lookups rather than treat it as a hard failure.
 *
 * Logs but does not throw on transient errors (timeout, 5xx). The Home IQ
 * pipeline runs after the AI parser succeeds — we don't want a flaky
 * external geocoder to mark the whole report as failed.
 */
export async function geocodeAddress(
  address: string,
  city: string,
  state: string,
  zip: string,
): Promise<GeocodeResult | null> {
  const oneLine = `${address}, ${city}, ${state} ${zip}`.trim();
  if (!address || !city || !state) {
    logger.warn({ oneLine }, '[geocoding] skipping — missing address components');
    return null;
  }

  const params = new URLSearchParams({
    address: oneLine,
    benchmark: 'Public_AR_Current',
    vintage: 'Current_Current',
    format: 'json',
  });

  const url = `${GEOCODER_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.warn({ status: res.status, oneLine }, '[geocoding] non-OK response');
      return null;
    }
    const json = await res.json() as CensusResponse;
    const match = json.result?.addressMatches?.[0];
    if (!match) {
      logger.info({ oneLine }, '[geocoding] no address match');
      return null;
    }
    const coords = match.coordinates;
    const tract = match.geographies?.['Census Tracts']?.[0];
    if (!coords || !tract?.GEOID || !tract.STATE || !tract.COUNTY) {
      logger.warn({ oneLine, hasCoords: !!coords, hasTract: !!tract }, '[geocoding] match missing required fields');
      return null;
    }
    return {
      // Census API returns x = longitude, y = latitude.
      latitude: coords.y,
      longitude: coords.x,
      countyFips: `${tract.STATE}${tract.COUNTY}`,
      censusTract: tract.GEOID,
    };
  } catch (err: unknown) {
    const msg = (err as Error).message ?? String(err);
    if ((err as Error).name === 'AbortError') {
      logger.warn({ oneLine }, '[geocoding] timed out');
    } else {
      logger.warn({ err: msg, oneLine }, '[geocoding] request failed');
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
