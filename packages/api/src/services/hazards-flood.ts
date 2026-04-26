import logger from '../logger';

/**
 * FEMA flood zone lookup via the National Flood Hazard Layer (NFHL).
 *
 * Source: https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer
 * The S_FLD_HAZ_AR layer (id 28) contains flood hazard polygons. We query
 * by point (lat/lon) and return the FLD_ZONE attribute.
 *
 * Zone semantics (FEMA):
 *   - "X"        → Outside both the 1% and 0.2% annual chance floodplains.
 *                  No federal flood insurance requirement. (low risk)
 *   - "X (shaded)" → Outside 1% but inside 0.2% (low-to-moderate risk).
 *   - "AE", "A", "AH", "AO" → 1% annual chance (high risk).
 *                  Federal flood insurance required by lenders.
 *   - "VE", "V"  → Coastal high-hazard with wave action. Highest risk.
 *
 * Failure modes are non-fatal: if FEMA's service is slow or returns an
 * empty result, Home IQ omits the flood card and shows a friendly note.
 */

const NFHL_URL = 'https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/28/query';
const REQUEST_TIMEOUT_MS = 8000;

export interface FloodZoneResult {
  zone: string;
  level: 'low' | 'moderate' | 'high';
  description: string;
  detail: string;
}

interface FemaFeature {
  attributes?: {
    FLD_ZONE?: string;
    ZONE_SUBTY?: string;
  };
}

interface FemaResponse {
  features?: FemaFeature[];
}

export async function getFloodZone(latitude: number, longitude: number): Promise<FloodZoneResult | null> {
  const params = new URLSearchParams({
    geometry: `${longitude},${latitude}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    outFields: 'FLD_ZONE,ZONE_SUBTY',
    returnGeometry: 'false',
    f: 'json',
    where: '1=1',
  });

  const url = `${NFHL_URL}?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      logger.warn({ status: res.status, latitude, longitude }, '[fema-flood] non-OK response');
      return null;
    }
    const json = await res.json() as FemaResponse;
    const feature = json.features?.[0];
    const zone = feature?.attributes?.FLD_ZONE;

    // No feature returned means the point falls in an unmapped area
    // OR an effectively-zero-risk zone — FEMA only publishes polygons
    // for mapped hazard areas. Treat as "Zone X" (low risk).
    if (!zone) {
      return {
        zone: 'X',
        level: 'low',
        description: 'Outside mapped flood hazard areas',
        detail: 'No flood hazard polygon at this location. Federal flood insurance not required by lenders.',
      };
    }

    return classify(zone, feature?.attributes?.ZONE_SUBTY);
  } catch (err: unknown) {
    if ((err as Error).name === 'AbortError') {
      logger.warn({ latitude, longitude }, '[fema-flood] timed out');
    } else {
      logger.warn({ err, latitude, longitude }, '[fema-flood] request failed');
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function classify(zone: string, subType?: string): FloodZoneResult {
  const z = zone.trim().toUpperCase();
  // Coastal V zones — highest risk
  if (z.startsWith('V')) {
    return {
      zone: z,
      level: 'high',
      description: 'Coastal high-hazard area (wave action)',
      detail: 'Inside FEMA\'s 1% annual chance floodplain with wave hazards. Lender flood insurance required; expect significantly elevated premiums.',
    };
  }
  // A zones — 1% annual chance, high risk
  if (z.startsWith('A')) {
    return {
      zone: z,
      level: 'high',
      description: '1% annual chance flood area',
      detail: 'Inside the 100-year floodplain. Lender flood insurance is required for federally-backed mortgages.',
    };
  }
  // X (shaded) → 0.2% annual chance, moderate risk
  if (z === 'X' && subType?.toUpperCase().includes('0.2')) {
    return {
      zone: 'X (shaded)',
      level: 'moderate',
      description: '0.2% annual chance flood area',
      detail: 'Outside the 1% floodplain but inside the 0.2% (500-year) area. Insurance not required by lenders, but advised given moderate risk.',
    };
  }
  // X (unshaded) — minimal risk
  if (z === 'X') {
    return {
      zone: 'X',
      level: 'low',
      description: 'Minimal flood hazard',
      detail: 'Outside the 0.2% annual chance floodplain. Lender flood insurance not required.',
    };
  }
  // D — undetermined
  if (z === 'D') {
    return {
      zone: 'D',
      level: 'moderate',
      description: 'Undetermined flood hazard',
      detail: 'FEMA has not formally studied this area\'s flood risk. Consider an Elevation Certificate or independent risk assessment.',
    };
  }
  // Anything else — surface as-is at moderate level
  return {
    zone: z,
    level: 'moderate',
    description: 'Mapped flood hazard area',
    detail: 'See FEMA\'s flood map for this property to understand the specific zone designation.',
  };
}
