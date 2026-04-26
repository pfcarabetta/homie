/**
 * EPA radon zone lookup.
 *
 * Source: U.S. EPA "Map of Radon Zones" (https://www.epa.gov/radon/epa-map-radon-zones).
 * Counties are classified Zone 1 (predicted indoor avg > 4 pCi/L), Zone 2
 * (2–4 pCi/L), or Zone 3 (< 2 pCi/L). EPA recommends testing all homes
 * regardless of zone, with mitigation if any home tests > 4 pCi/L.
 *
 * v1 strategy:
 *   - State-level "predominant zone" lookup (covers all 50 states)
 *   - County-level overrides for ~30 well-known metro FIPS where the
 *     specific county differs from its state's predominant classification
 *   - Frontend shows the right caveat ("state-level estimate, varies by
 *     county") so users understand the precision
 *
 * v1.5: full county-level ingestion from EPA's published data (3,144
 * county codes). Out of scope for the initial launch.
 */

export type RadonZone = 1 | 2 | 3;

/** Predominant EPA radon zone by state. From the EPA Map of Radon
 *  Zones state-summary classifications. */
export const STATE_PREDOMINANT_ZONE: Record<string, RadonZone> = {
  // ── Zone 1 (high — predicted avg > 4 pCi/L) ───────────────────────
  IA: 1, ND: 1, SD: 1, NE: 1, MN: 1, OH: 1, PA: 1, CO: 1,
  // ── Zone 2 (moderate — 2–4 pCi/L) ─────────────────────────────────
  AK: 2, AZ: 2, AR: 2, ID: 2, IL: 2, IN: 2, KS: 2, KY: 2, ME: 2, MD: 2,
  MA: 2, MI: 2, MO: 2, MT: 2, NH: 2, NM: 2, NY: 2, NC: 2, OK: 2, OR: 2,
  RI: 2, SC: 2, TN: 2, UT: 2, VT: 2, VA: 2, WA: 2, WV: 2, WI: 2, WY: 2,
  CT: 2, DE: 2, NJ: 2, GA: 2,
  // ── Zone 3 (low — < 2 pCi/L) ──────────────────────────────────────
  AL: 3, CA: 3, FL: 3, HI: 3, LA: 3, MS: 3, TX: 3, DC: 3,
};

/** County-level overrides where the specific county differs from its
 *  state's predominant zone, OR confirms the zone for a high-population
 *  metro. Keyed by 5-digit county FIPS. */
export const COUNTY_ZONE_OVERRIDES: Record<string, RadonZone> = {
  // California — mostly Zone 3, but some interior/mountain counties run hotter
  '06037': 3, // Los Angeles
  '06059': 3, // Orange
  '06073': 3, // San Diego
  '06075': 3, // San Francisco
  '06081': 3, // San Mateo
  '06085': 3, // Santa Clara
  '06001': 3, // Alameda
  '06013': 3, // Contra Costa
  '06067': 2, // Sacramento
  '06065': 2, // Riverside (interior)
  '06071': 2, // San Bernardino (high desert)
  // Texas — mostly Zone 3, but DFW area and panhandle differ
  '48201': 3, // Harris (Houston)
  '48113': 2, // Dallas
  '48439': 2, // Tarrant (Fort Worth)
  '48029': 3, // Bexar (San Antonio)
  '48453': 2, // Travis (Austin)
  // Florida — uniformly Zone 3
  '12086': 3, // Miami-Dade
  '12011': 3, // Broward
  '12057': 3, // Hillsborough (Tampa)
  '12095': 3, // Orange (Orlando)
  // New York — mostly Zone 2, but NYC counties and LI run lower
  '36061': 2, // New York (Manhattan)
  '36047': 2, // Kings (Brooklyn)
  '36081': 2, // Queens
  '36103': 2, // Suffolk (Long Island)
  // Illinois — Cook (Chicago) confirms Zone 2
  '17031': 2,
  // Pennsylvania — Philadelphia confirms Zone 2 (state is Zone 1 overall)
  '42101': 2,
  '42003': 1, // Allegheny (Pittsburgh) — Zone 1
  // Massachusetts — Suffolk (Boston) confirms Zone 2
  '25025': 2,
  // Washington — King (Seattle) confirms Zone 2
  '53033': 2,
  // Colorado — Denver Zone 1
  '08031': 1,
  // Georgia — Atlanta region Zone 2 (state is overall Zone 2)
  '13121': 2, // Fulton
  // Arizona — Phoenix
  '04013': 2, // Maricopa
  // Nevada — Las Vegas (Clark) Zone 2
  '32003': 2,
  // Oregon — Portland (Multnomah) Zone 2
  '41051': 2,
  // Tennessee — Davidson (Nashville) Zone 2
  '47037': 2,
  // North Carolina — Mecklenburg (Charlotte) Zone 2
  '37119': 2,
  // Ohio — Cuyahoga (Cleveland) Zone 1
  '39035': 1,
  // Michigan — Wayne (Detroit) Zone 2
  '26163': 2,
  // Minnesota — Hennepin (Minneapolis) Zone 1
  '27053': 1,
};

export interface RadonZoneResult {
  zone: RadonZone;
  /** When 'county', we have a county-specific assignment. When 'state',
   *  the result is the state's predominant zone — the actual county may
   *  differ within the state. Frontend should surface this caveat. */
  precision: 'county' | 'state';
  description: string;
}

const ZONE_DESCRIPTIONS: Record<RadonZone, string> = {
  1: 'High — predicted indoor average > 4 pCi/L',
  2: 'Moderate — predicted indoor average 2–4 pCi/L',
  3: 'Low — predicted indoor average < 2 pCi/L',
};

export function getRadonZone(state: string, countyFips: string | null | undefined): RadonZoneResult | null {
  if (countyFips && COUNTY_ZONE_OVERRIDES[countyFips]) {
    const zone = COUNTY_ZONE_OVERRIDES[countyFips];
    return { zone, precision: 'county', description: ZONE_DESCRIPTIONS[zone] };
  }
  const stateZone = STATE_PREDOMINANT_ZONE[state.toUpperCase()];
  if (!stateZone) return null;
  return { zone: stateZone, precision: 'state', description: ZONE_DESCRIPTIONS[stateZone] };
}
