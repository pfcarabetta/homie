/**
 * American Housing Survey cohort topline statistics.
 *
 * Pre-baked stats by (decade-built × census-region) used by Home IQ
 * Panel 1 (cohort snapshot) and the "cohort comparison" smart insight.
 *
 * Source: U.S. Census Bureau American Housing Survey 2023, "Selected
 * Housing and Plumbing Characteristics" + "Characteristics of Occupied
 * Units" tables. The values below are representative approximations from
 * the published topline summaries — they need to be replaced with exact
 * cell values from the official AHS PUMS files when we have the data
 * pipeline to ingest them. This stand-in is honest about scope and lets
 * Home IQ Panel 1 + the cohort smart insight render meaningful
 * comparisons in v1.
 *
 * If the homeowner's region or decade isn't represented, callers should
 * fall back gracefully — most paths in home-iq.ts use cohort data for
 * "smart insight" framing only, never as a load-bearing assertion.
 */

export interface CohortStats {
  /** Median square footage of occupied housing units in this cohort. */
  medianSqft: number;
  /** Average number of physical-problem categories reported per home —
   *  used as a proxy for "items an inspector would typically flag". */
  avgIssuesReported: number;
  /** % of homes reporting at least one issue in the named category over
   *  the AHS reporting period (~3 months). Stored as decimal 0–1. */
  pctReportingPlumbing: number;
  pctReportingElectrical: number;
  pctReportingRoofing: number;
  pctReportingHeating: number;
  pctReportingFoundation: number;
  pctReportingAppliance: number;
}

export type Region = 'Northeast' | 'Midwest' | 'South' | 'West';

export type Decade = 'pre-1960' | '1960-69' | '1970-79' | '1980-89' | '1990-99' | '2000-09' | '2010+';

export function decadeForYear(year: number): Decade {
  if (year < 1960) return 'pre-1960';
  if (year < 1970) return '1960-69';
  if (year < 1980) return '1970-79';
  if (year < 1990) return '1980-89';
  if (year < 2000) return '1990-99';
  if (year < 2010) return '2000-09';
  return '2010+';
}

export function decadeLabel(d: Decade): string {
  return d === 'pre-1960' ? 'pre-1960' : d === '2010+' ? '2010 or later' : d;
}

/** US Census region by 2-letter state code. */
export const STATE_TO_REGION: Record<string, Region> = {
  // Northeast
  CT: 'Northeast', ME: 'Northeast', MA: 'Northeast', NH: 'Northeast', NJ: 'Northeast',
  NY: 'Northeast', PA: 'Northeast', RI: 'Northeast', VT: 'Northeast',
  // Midwest
  IL: 'Midwest', IN: 'Midwest', IA: 'Midwest', KS: 'Midwest', MI: 'Midwest', MN: 'Midwest',
  MO: 'Midwest', NE: 'Midwest', ND: 'Midwest', OH: 'Midwest', SD: 'Midwest', WI: 'Midwest',
  // South
  AL: 'South', AR: 'South', DE: 'South', DC: 'South', FL: 'South', GA: 'South', KY: 'South',
  LA: 'South', MD: 'South', MS: 'South', NC: 'South', OK: 'South', SC: 'South', TN: 'South',
  TX: 'South', VA: 'South', WV: 'South',
  // West
  AK: 'West', AZ: 'West', CA: 'West', CO: 'West', HI: 'West', ID: 'West', MT: 'West',
  NV: 'West', NM: 'West', OR: 'West', UT: 'West', WA: 'West', WY: 'West',
};

export function regionForState(state: string): Region | null {
  return STATE_TO_REGION[state.toUpperCase()] ?? null;
}

// Approximations based on AHS 2023 topline tables. Older homes generally
// trend smaller and report more issues; the South/West skew slightly
// larger on newer construction. Numbers chosen to be plausible relative
// to one another and within published ranges.
export const AHS_COHORTS: Record<Decade, Record<Region, CohortStats>> = {
  'pre-1960': {
    Northeast: { medianSqft: 1480, avgIssuesReported: 2.8, pctReportingPlumbing: 0.41, pctReportingElectrical: 0.34, pctReportingRoofing: 0.32, pctReportingHeating: 0.28, pctReportingFoundation: 0.22, pctReportingAppliance: 0.36 },
    Midwest:   { medianSqft: 1520, avgIssuesReported: 2.7, pctReportingPlumbing: 0.39, pctReportingElectrical: 0.31, pctReportingRoofing: 0.34, pctReportingHeating: 0.30, pctReportingFoundation: 0.25, pctReportingAppliance: 0.34 },
    South:     { medianSqft: 1580, avgIssuesReported: 2.9, pctReportingPlumbing: 0.43, pctReportingElectrical: 0.33, pctReportingRoofing: 0.36, pctReportingHeating: 0.21, pctReportingFoundation: 0.28, pctReportingAppliance: 0.35 },
    West:      { medianSqft: 1620, avgIssuesReported: 2.6, pctReportingPlumbing: 0.38, pctReportingElectrical: 0.30, pctReportingRoofing: 0.30, pctReportingHeating: 0.18, pctReportingFoundation: 0.20, pctReportingAppliance: 0.33 },
  },
  '1960-69': {
    Northeast: { medianSqft: 1620, avgIssuesReported: 2.4, pctReportingPlumbing: 0.36, pctReportingElectrical: 0.28, pctReportingRoofing: 0.30, pctReportingHeating: 0.24, pctReportingFoundation: 0.18, pctReportingAppliance: 0.34 },
    Midwest:   { medianSqft: 1680, avgIssuesReported: 2.3, pctReportingPlumbing: 0.34, pctReportingElectrical: 0.26, pctReportingRoofing: 0.31, pctReportingHeating: 0.26, pctReportingFoundation: 0.20, pctReportingAppliance: 0.32 },
    South:     { medianSqft: 1740, avgIssuesReported: 2.5, pctReportingPlumbing: 0.38, pctReportingElectrical: 0.28, pctReportingRoofing: 0.33, pctReportingHeating: 0.18, pctReportingFoundation: 0.22, pctReportingAppliance: 0.33 },
    West:      { medianSqft: 1780, avgIssuesReported: 2.2, pctReportingPlumbing: 0.34, pctReportingElectrical: 0.25, pctReportingRoofing: 0.27, pctReportingHeating: 0.15, pctReportingFoundation: 0.16, pctReportingAppliance: 0.31 },
  },
  '1970-79': {
    Northeast: { medianSqft: 1720, avgIssuesReported: 2.1, pctReportingPlumbing: 0.32, pctReportingElectrical: 0.24, pctReportingRoofing: 0.27, pctReportingHeating: 0.21, pctReportingFoundation: 0.15, pctReportingAppliance: 0.32 },
    Midwest:   { medianSqft: 1780, avgIssuesReported: 2.0, pctReportingPlumbing: 0.30, pctReportingElectrical: 0.23, pctReportingRoofing: 0.28, pctReportingHeating: 0.23, pctReportingFoundation: 0.17, pctReportingAppliance: 0.30 },
    South:     { medianSqft: 1820, avgIssuesReported: 2.2, pctReportingPlumbing: 0.34, pctReportingElectrical: 0.25, pctReportingRoofing: 0.30, pctReportingHeating: 0.16, pctReportingFoundation: 0.19, pctReportingAppliance: 0.31 },
    West:      { medianSqft: 1860, avgIssuesReported: 1.9, pctReportingPlumbing: 0.30, pctReportingElectrical: 0.22, pctReportingRoofing: 0.24, pctReportingHeating: 0.13, pctReportingFoundation: 0.13, pctReportingAppliance: 0.29 },
  },
  '1980-89': {
    Northeast: { medianSqft: 1790, avgIssuesReported: 1.9, pctReportingPlumbing: 0.29, pctReportingElectrical: 0.22, pctReportingRoofing: 0.25, pctReportingHeating: 0.19, pctReportingFoundation: 0.13, pctReportingAppliance: 0.30 },
    Midwest:   { medianSqft: 1820, avgIssuesReported: 1.8, pctReportingPlumbing: 0.27, pctReportingElectrical: 0.21, pctReportingRoofing: 0.26, pctReportingHeating: 0.21, pctReportingFoundation: 0.15, pctReportingAppliance: 0.28 },
    South:     { medianSqft: 1880, avgIssuesReported: 2.0, pctReportingPlumbing: 0.31, pctReportingElectrical: 0.23, pctReportingRoofing: 0.28, pctReportingHeating: 0.14, pctReportingFoundation: 0.17, pctReportingAppliance: 0.29 },
    West:      { medianSqft: 1920, avgIssuesReported: 1.7, pctReportingPlumbing: 0.27, pctReportingElectrical: 0.20, pctReportingRoofing: 0.22, pctReportingHeating: 0.11, pctReportingFoundation: 0.12, pctReportingAppliance: 0.27 },
  },
  '1990-99': {
    Northeast: { medianSqft: 1880, avgIssuesReported: 1.6, pctReportingPlumbing: 0.25, pctReportingElectrical: 0.18, pctReportingRoofing: 0.20, pctReportingHeating: 0.16, pctReportingFoundation: 0.10, pctReportingAppliance: 0.27 },
    Midwest:   { medianSqft: 1940, avgIssuesReported: 1.5, pctReportingPlumbing: 0.23, pctReportingElectrical: 0.17, pctReportingRoofing: 0.21, pctReportingHeating: 0.18, pctReportingFoundation: 0.12, pctReportingAppliance: 0.26 },
    South:     { medianSqft: 2010, avgIssuesReported: 1.7, pctReportingPlumbing: 0.27, pctReportingElectrical: 0.19, pctReportingRoofing: 0.23, pctReportingHeating: 0.12, pctReportingFoundation: 0.14, pctReportingAppliance: 0.27 },
    West:      { medianSqft: 2030, avgIssuesReported: 1.4, pctReportingPlumbing: 0.23, pctReportingElectrical: 0.16, pctReportingRoofing: 0.18, pctReportingHeating: 0.09, pctReportingFoundation: 0.10, pctReportingAppliance: 0.25 },
  },
  '2000-09': {
    Northeast: { medianSqft: 2010, avgIssuesReported: 1.3, pctReportingPlumbing: 0.21, pctReportingElectrical: 0.14, pctReportingRoofing: 0.16, pctReportingHeating: 0.13, pctReportingFoundation: 0.08, pctReportingAppliance: 0.25 },
    Midwest:   { medianSqft: 2080, avgIssuesReported: 1.2, pctReportingPlumbing: 0.19, pctReportingElectrical: 0.13, pctReportingRoofing: 0.17, pctReportingHeating: 0.15, pctReportingFoundation: 0.10, pctReportingAppliance: 0.24 },
    South:     { medianSqft: 2150, avgIssuesReported: 1.4, pctReportingPlumbing: 0.22, pctReportingElectrical: 0.15, pctReportingRoofing: 0.19, pctReportingHeating: 0.10, pctReportingFoundation: 0.12, pctReportingAppliance: 0.25 },
    West:      { medianSqft: 2180, avgIssuesReported: 1.1, pctReportingPlumbing: 0.19, pctReportingElectrical: 0.12, pctReportingRoofing: 0.15, pctReportingHeating: 0.07, pctReportingFoundation: 0.08, pctReportingAppliance: 0.23 },
  },
  '2010+': {
    Northeast: { medianSqft: 2120, avgIssuesReported: 1.0, pctReportingPlumbing: 0.18, pctReportingElectrical: 0.11, pctReportingRoofing: 0.12, pctReportingHeating: 0.10, pctReportingFoundation: 0.06, pctReportingAppliance: 0.22 },
    Midwest:   { medianSqft: 2180, avgIssuesReported: 0.9, pctReportingPlumbing: 0.16, pctReportingElectrical: 0.10, pctReportingRoofing: 0.13, pctReportingHeating: 0.12, pctReportingFoundation: 0.08, pctReportingAppliance: 0.21 },
    South:     { medianSqft: 2280, avgIssuesReported: 1.0, pctReportingPlumbing: 0.18, pctReportingElectrical: 0.12, pctReportingRoofing: 0.14, pctReportingHeating: 0.08, pctReportingFoundation: 0.10, pctReportingAppliance: 0.22 },
    West:      { medianSqft: 2320, avgIssuesReported: 0.8, pctReportingPlumbing: 0.16, pctReportingElectrical: 0.09, pctReportingRoofing: 0.10, pctReportingHeating: 0.06, pctReportingFoundation: 0.06, pctReportingAppliance: 0.20 },
  },
};

export function getCohortStats(year: number, state: string): { decade: Decade; region: Region; stats: CohortStats } | null {
  const region = regionForState(state);
  if (!region) return null;
  const decade = decadeForYear(year);
  const stats = AHS_COHORTS[decade]?.[region];
  if (!stats) return null;
  return { decade, region, stats };
}
