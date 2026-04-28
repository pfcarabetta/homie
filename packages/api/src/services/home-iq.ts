import { eq, and, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { inspectionReports, inspectionReportItems } from '../db/schema/inspector';
import logger from '../logger';
import {
  AHS_COHORTS, decadeForYear, decadeLabel, regionForState,
  type Region, type Decade,
} from '../data/ahs-cohorts';
import { NAHB_LIFESPANS, lifespanStatus } from '../data/nahb-lifespans';
import { INSURANCE_RISK_PATTERNS } from '../data/insurance-risk-patterns';
import { getRadonZone } from '../data/epa-radon-zones';
import { getFloodZone } from './hazards-flood';

// ──────────────────────────────────────────────────────────────────────────
// Home IQ — generation service.
//
// Computes the full payload that Home IQ (the inspect-portal tab) renders:
//  - Panel 1: cohort snapshot (yearBuilt + sqft + total items vs AHS cohort)
//  - Panel 3: per-category system breakdown (grade, cost, AI assessment,
//    top fix, smart insight, lifespan tracker)
//  - Panel 4: hazards (FEMA flood, EPA radon)
//
// Generated on-demand the first time a homeowner opens the Home IQ tab,
// then cached in inspection_reports.home_iq_data until items change.
// Per-category AI assessments are generated with Claude Sonnet. Failures
// degrade gracefully — a category with no AI text still renders with
// rule-based grade + insight.
// ──────────────────────────────────────────────────────────────────────────

export type SystemKey =
  | 'plumbing' | 'roofing' | 'hvac' | 'electrical'
  | 'structural' | 'appliance' | 'foundation';

export type Grade = 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'Critical';

export type SmartInsightType =
  | 'insurance' | 'lifespan' | 'cross-doc' | 'bundle' | 'cohort' | 'hazard' | 'recall';

export interface HomeIQData {
  generatedAt: string;
  property: {
    yearBuilt: number | null;
    sqft: number | null;
    region: Region | null;
    decade: Decade | null;
    decadeLabel: string | null;
    zip: string;
    address: string;
    city: string;
    state: string;
  };
  cohort: {
    medianSqft: number;
    avgItemsFound: number;
    sqftDelta: number | null;
    itemsDelta: number;
    sourceNote: string;
  } | null;
  systems: SystemBreakdown[];
  hazards: {
    flood: HazardCard | null;
    radon: HazardCard | null;
  };
  /** Surface generation issues to the UI without failing the whole payload. */
  warnings: string[];
}

export interface SystemBreakdown {
  key: SystemKey;
  label: string;
  itemCount: number;
  costLowCents: number;
  costHighCents: number;
  severityCounts: { urgent: number; recommended: number; monitor: number };
  grade: Grade;
  aiAssessmentShort: string;
  aiAssessmentLong: string;
  topFix: { title: string; cost: string; rationale: string } | null;
  smartInsight: { type: SmartInsightType; label: string; text: string };
  items: Array<{
    id: string;
    title: string;
    severity: string;
    location: string | null;
    description: string | null;
    costLowCents: number;
    costHighCents: number;
  }>;
  lifespan: {
    componentLabel: string;
    age: number;
    typicalLow: number;
    typicalHigh: number;
    statusLabel: string;
    /** 'green' | 'amber' | 'red' — frontend maps these to its theme. */
    statusColor: 'green' | 'amber' | 'red';
  } | null;
}

export interface HazardCard {
  /** Primary headline value (e.g. "Zone X", "Zone 2", "High"). */
  primary: string;
  /** Subtitle next to the primary value. */
  sub: string;
  /** Severity bucket the frontend uses to color the card. */
  level: 'low' | 'moderate' | 'high';
  source: string;
  detail: string;
}

// Categories Home IQ surfaces. These match inspectionReportItems.category
// strings exactly. Categories outside this list are ignored.
const SYSTEM_CATEGORIES: Array<{ key: SystemKey; label: string }> = [
  { key: 'plumbing', label: 'Plumbing' },
  { key: 'electrical', label: 'Electrical' },
  { key: 'hvac', label: 'HVAC' },
  { key: 'roofing', label: 'Roofing' },
  { key: 'structural', label: 'Structural' },
  { key: 'appliance', label: 'Appliances' },
  { key: 'foundation', label: 'Foundation' },
];

const GRADE_RANK: Record<Grade, number> = {
  Critical: 0, Poor: 1, Fair: 2, Good: 3, Excellent: 4,
};

// ──────────────────────────────────────────────────────────────────────────
// Public entry points
// ──────────────────────────────────────────────────────────────────────────

/** Lookup result for the read endpoint. `'generating'` means a cache
 *  miss with a background generation already kicked off — the caller
 *  should respond 202 and the frontend should poll. `'unavailable'`
 *  means the report can't have Home IQ yet (still parsing). */
export type HomeIQLookup =
  | { status: 'ready'; data: HomeIQData }
  | { status: 'generating' }
  | { status: 'unavailable' };

/** In-memory lock so concurrent reads of an un-cached report share the
 *  same generation instead of stampeding Claude. Per-process — fine
 *  for the single-API-instance setup; if we ever scale horizontally
 *  this needs to move to Redis (or just lean on the DB cache write
 *  being idempotent and accept occasional duplicate work). */
const inFlight = new Map<string, Promise<HomeIQData | null>>();

/** Returns the cached Home IQ data if it exists. Otherwise kicks off
 *  background generation (idempotent — concurrent calls share the
 *  same in-flight Promise) and returns `{ status: 'generating' }`.
 *  Cache is sticky once written: it doesn't auto-invalidate when items
 *  change. The frontend "Refresh" button still triggers regeneration
 *  via getOrRegenerate(reportId, { force: true }) below.
 *
 *  Why sticky: previous behavior auto-regenerated whenever any item
 *  was updated since the cache was written, which fired Claude on
 *  every visit (item updatedAt churn from background backfills + the
 *  homeowner editing items). The error "Failed to generate Home IQ"
 *  on revisit comes from that regeneration aborting when the user
 *  navigates away. Sticky cache + explicit refresh fixes both.
 */
export async function readHomeIQ(reportId: string): Promise<HomeIQLookup> {
  const [report] = await db.select().from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1);
  if (!report) return { status: 'unavailable' };
  if (report.parsingStatus !== 'parsed' && report.parsingStatus !== 'review_pending' && report.parsingStatus !== 'sent_to_client') {
    return { status: 'unavailable' };
  }
  const cached = report.homeIqData as HomeIQData | null;
  if (cached) return { status: 'ready', data: cached };
  // No cache → make sure a generation is in flight, then tell the
  // caller to poll. Don't await it.
  kickOffHomeIQ(reportId);
  return { status: 'generating' };
}

/** Forces a fresh generation, awaiting completion. Used by the
 *  "Refresh" button (?refresh=1) — the user explicitly asked, so
 *  blocking is acceptable. Falls through to readHomeIQ semantics on
 *  load failures (returns existing cache rather than wiping it). */
export async function getOrRegenerate(reportId: string, opts: { force?: boolean } = {}): Promise<HomeIQLookup> {
  if (!opts.force) return readHomeIQ(reportId);
  const data = await runWithLock(reportId);
  if (!data) {
    // Generation failed — fall back to whatever's in the cache so a
    // bad regeneration attempt doesn't strand the user with nothing.
    const fallback = await readHomeIQ(reportId);
    return fallback.status === 'ready' ? fallback : { status: 'unavailable' };
  }
  return { status: 'ready', data };
}

/** Fire-and-forget generator for a report. Idempotent — repeat calls
 *  while one is already in flight no-op. Used at parse completion to
 *  warm the cache before the user opens the Home IQ tab. */
export function kickOffHomeIQ(reportId: string): void {
  // No await — the caller is fire-and-forget. Errors are logged
 //  inside runWithLock, never thrown.
  void runWithLock(reportId);
}

async function runWithLock(reportId: string): Promise<HomeIQData | null> {
  const existing = inFlight.get(reportId);
  if (existing) return existing;
  const promise = generateHomeIQ(reportId)
    .catch(err => {
      logger.error({ err, reportId }, '[home-iq] generation failed');
      return null;
    })
    .finally(() => { inFlight.delete(reportId); });
  inFlight.set(reportId, promise);
  return promise;
}

/** @deprecated Use readHomeIQ + kickOffHomeIQ for the read path or
 *  getOrRegenerate({ force: true }) for the explicit-refresh path.
 *  Kept as a thin shim so any unmigrated caller still works. */
export async function getOrGenerateHomeIQ(reportId: string, opts: { force?: boolean } = {}): Promise<HomeIQData | null> {
  const result = await getOrRegenerate(reportId, opts);
  return result.status === 'ready' ? result.data : null;
}

/** Generates Home IQ data fresh from the inspection items + property
 *  context, runs Claude assessments per category, runs hazard lookups,
 *  caches on the report row, returns the payload. */
export async function generateHomeIQ(reportId: string): Promise<HomeIQData | null> {
  const [report] = await db.select().from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1);
  if (!report) return null;

  const items = await db.select().from(inspectionReportItems).where(eq(inspectionReportItems.reportId, reportId));

  const warnings: string[] = [];

  // ── Property + cohort ────────────────────────────────────────────────
  const region = regionForState(report.propertyState);
  const decade = report.yearBuilt ? decadeForYear(report.yearBuilt) : null;
  const cohortStats = (region && decade) ? AHS_COHORTS[decade]?.[region] : null;
  if (!report.yearBuilt) warnings.push('year_built_missing');
  if (!region) warnings.push('region_unknown');

  const totalItemsFound = items.length;

  // ── Systems ──────────────────────────────────────────────────────────
  const systems: SystemBreakdown[] = [];
  for (const cat of SYSTEM_CATEGORIES) {
    const catItems = items.filter(i => i.category === cat.key);
    const breakdown = await buildSystemBreakdown(cat.key, cat.label, catItems, {
      yearBuilt: report.yearBuilt,
      decade,
      region,
      cohortStats,
      hasCrossDocItems: catItems.some(i => i.sourceDocumentId !== null || (Array.isArray(i.crossReferencedItemIds) && i.crossReferencedItemIds.length > 0)),
    });
    systems.push(breakdown);
  }
  // Sort worst-grade-first so urgent stuff lands top-left in the grid.
  systems.sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade]);

  // ── Hazards ──────────────────────────────────────────────────────────
  const radon = getRadonZone(report.propertyState, report.countyFips);
  let radonCard: HazardCard | null = null;
  if (radon) {
    radonCard = {
      primary: `Zone ${radon.zone}`,
      sub: radon.description,
      level: radon.zone === 1 ? 'high' : radon.zone === 2 ? 'moderate' : 'low',
      source: `EPA Map of Radon Zones${radon.precision === 'state' ? ' (state-level estimate)' : ''}`,
      detail: radon.zone === 3
        ? 'Low radon zone. EPA still recommends testing every home — radon varies house-to-house regardless of zone.'
        : radon.zone === 2
          ? 'Moderate radon zone. Test the home; if levels exceed 4 pCi/L, mitigation systems run $800–$2,500.'
          : 'High radon zone. Test the home; mitigation is widely available and effective.',
    };
  }

  let floodCard: HazardCard | null = null;
  const lat = report.latitude ? parseFloat(report.latitude) : null;
  const lon = report.longitude ? parseFloat(report.longitude) : null;
  if (lat != null && lon != null) {
    try {
      const flood = await getFloodZone(lat, lon);
      if (flood) {
        floodCard = {
          primary: `Zone ${flood.zone}`,
          sub: flood.description,
          level: flood.level,
          source: 'FEMA NFHL',
          detail: flood.detail,
        };
      }
    } catch (err) {
      logger.warn({ err, reportId }, '[home-iq] FEMA flood lookup failed (non-fatal)');
      warnings.push('flood_lookup_failed');
    }
  } else {
    warnings.push('no_geocode');
  }

  const data: HomeIQData = {
    generatedAt: new Date().toISOString(),
    property: {
      yearBuilt: report.yearBuilt,
      sqft: null, // properties.sqft is on a separate table; not currently linked to reports
      region,
      decade,
      decadeLabel: decade ? decadeLabel(decade) : null,
      zip: report.propertyZip,
      address: report.propertyAddress,
      city: report.propertyCity,
      state: report.propertyState,
    },
    cohort: cohortStats ? {
      medianSqft: cohortStats.medianSqft,
      avgItemsFound: cohortStats.avgIssuesReported,
      sqftDelta: null, // need property linkage to compute
      itemsDelta: totalItemsFound - cohortStats.avgIssuesReported,
      sourceNote: `American Housing Survey 2023 · ${region} region · built ${decade ? decadeLabel(decade) : '?'}`,
    } : null,
    systems,
    hazards: { flood: floodCard, radon: radonCard },
    warnings,
  };

  // Cache
  await db.update(inspectionReports).set({
    homeIqData: data,
    homeIqGeneratedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(inspectionReports.id, reportId));

  logger.info({ reportId, systems: systems.length, warnings }, '[home-iq] generated');
  return data;
}

// ──────────────────────────────────────────────────────────────────────────
// Per-category breakdown
// ──────────────────────────────────────────────────────────────────────────

interface BuildContext {
  yearBuilt: number | null;
  decade: Decade | null;
  region: Region | null;
  cohortStats: { pctReportingPlumbing: number; pctReportingElectrical: number; pctReportingRoofing: number; pctReportingHeating: number; pctReportingFoundation: number; pctReportingAppliance: number } | null;
  hasCrossDocItems: boolean;
}

async function buildSystemBreakdown(
  key: SystemKey,
  label: string,
  items: Array<typeof inspectionReportItems.$inferSelect>,
  ctx: BuildContext,
): Promise<SystemBreakdown> {
  // ── Stats ────────────────────────────────────────────────────────────
  const itemCount = items.length;
  const costLowCents = items.reduce((s, i) => s + (i.aiCostEstimateLowCents ?? 0), 0);
  const costHighCents = items.reduce((s, i) => s + (i.aiCostEstimateHighCents ?? 0), 0);
  const severityCounts = {
    urgent: items.filter(i => i.severity === 'safety_hazard' || i.severity === 'urgent').length,
    recommended: items.filter(i => i.severity === 'recommended').length,
    monitor: items.filter(i => i.severity === 'monitor' || i.severity === 'informational').length,
  };

  // ── Grade ────────────────────────────────────────────────────────────
  const insuranceMatch = findInsuranceMatch(key, items);
  const grade: Grade = computeGrade({ itemCount, severityCounts, hasInsuranceCritical: insuranceMatch?.severity === 'critical' });

  // ── AI assessment + top fix + ages ──────────────────────────────────
  const aiResult = itemCount === 0
    ? deterministicEmptyAssessment(label)
    : await runCategoryAssessment(key, label, items).catch(err => {
        logger.warn({ err, key }, '[home-iq] AI assessment failed — falling back to deterministic');
        return deterministicFallbackAssessment(label, items, severityCounts);
      });

  // ── Lifespan tracker (pick first matching component if AI returned ages) ──
  let lifespan: SystemBreakdown['lifespan'] = null;
  if (aiResult.componentAges) {
    for (const [compKey, age] of Object.entries(aiResult.componentAges)) {
      const comp = NAHB_LIFESPANS[compKey];
      if (!comp || typeof age !== 'number') continue;
      const status = lifespanStatus(comp, age);
      if (status) {
        lifespan = {
          componentLabel: comp.label,
          age,
          typicalLow: comp.typicalLow,
          typicalHigh: comp.typicalHigh,
          statusLabel: status.description,
          statusColor: status.label === 'past' ? 'red' : status.label === 'late' ? 'amber' : 'green',
        };
      } else if (comp.replaceImmediately) {
        // Treat as past lifespan with a special label.
        lifespan = {
          componentLabel: comp.label,
          age,
          typicalLow: 0,
          typicalHigh: 0,
          statusLabel: comp.note ?? 'Replace regardless of age.',
          statusColor: 'red',
        };
      }
      break; // surface one lifespan per system
    }
  }

  // ── Smart insight cascade ────────────────────────────────────────────
  const smartInsight = pickSmartInsight({
    key,
    label,
    items,
    insuranceMatch,
    lifespan,
    hasCrossDocItems: ctx.hasCrossDocItems,
    cohortStats: ctx.cohortStats,
    cohortLabelParts: { decade: ctx.decade, region: ctx.region },
  });

  return {
    key,
    label,
    itemCount,
    costLowCents,
    costHighCents,
    severityCounts,
    grade,
    aiAssessmentShort: aiResult.short,
    aiAssessmentLong: aiResult.long,
    topFix: aiResult.topFix,
    smartInsight,
    items: items.map(i => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      location: i.locationInProperty,
      description: i.description,
      costLowCents: i.aiCostEstimateLowCents ?? 0,
      costHighCents: i.aiCostEstimateHighCents ?? 0,
    })),
    lifespan,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Grading
// ──────────────────────────────────────────────────────────────────────────

function computeGrade(args: {
  itemCount: number;
  severityCounts: { urgent: number; recommended: number; monitor: number };
  hasInsuranceCritical: boolean;
}): Grade {
  const { itemCount, severityCounts: s, hasInsuranceCritical } = args;
  if (hasInsuranceCritical) return 'Critical';
  if (itemCount === 0) return 'Excellent';
  if (s.urgent >= 2) return 'Critical';
  if (s.urgent === 1) return 'Poor';
  if (s.recommended >= 5) return 'Poor';
  if (s.recommended >= 1) return 'Fair';
  return 'Good';
}

// ──────────────────────────────────────────────────────────────────────────
// Smart insight cascade
// ──────────────────────────────────────────────────────────────────────────

function pickSmartInsight(args: {
  key: SystemKey;
  label: string;
  items: Array<typeof inspectionReportItems.$inferSelect>;
  insuranceMatch: ReturnType<typeof findInsuranceMatch>;
  lifespan: SystemBreakdown['lifespan'];
  hasCrossDocItems: boolean;
  cohortStats: BuildContext['cohortStats'];
  cohortLabelParts: { decade: Decade | null; region: Region | null };
}): SystemBreakdown['smartInsight'] {
  const { key, label, items, insuranceMatch, lifespan, hasCrossDocItems, cohortStats, cohortLabelParts } = args;

  // 1. Insurance dealbreaker (always wins when present)
  if (insuranceMatch) {
    return { type: 'insurance', label: 'Insurance impact', text: insuranceMatch.insight };
  }

  // 2. Lifespan past expected life
  if (lifespan && lifespan.statusColor === 'red') {
    return {
      type: 'lifespan',
      label: 'Lifespan tracker',
      text: `${lifespan.componentLabel} is ${lifespan.age} yrs old — past the typical ${lifespan.typicalLow}–${lifespan.typicalHigh} yr lifespan. Emergency-failure risk is rising each season.`,
    };
  }

  // 3. Cross-document tie-in (pest/disclosure overlap)
  if (hasCrossDocItems) {
    return {
      type: 'cross-doc',
      label: 'Cross-document tie',
      text: `One or more ${label.toLowerCase()} items reference findings from your supporting documents (pest report or seller disclosure). Treat as related and address together where possible.`,
    };
  }

  // 4. Bundle opportunity
  if (items.length >= 3) {
    return {
      type: 'bundle',
      label: 'Bundle opportunity',
      text: `These ${items.length} ${label.toLowerCase()} items can likely be quoted as a single visit. Expected labor savings: 15–25% vs. separate calls.`,
    };
  }

  // 5. Cohort comparison fallback
  if (cohortStats) {
    const pct = cohortPctForCategory(key, cohortStats);
    if (pct != null) {
      const pctRounded = Math.round(pct * 100);
      const cohortDescriptor = cohortLabelParts.decade && cohortLabelParts.region
        ? `homes built ${decadeLabel(cohortLabelParts.decade)} in the ${cohortLabelParts.region}`
        : 'homes in your cohort';
      if (items.length === 0) {
        return {
          type: 'cohort',
          label: 'Cohort comparison',
          text: `0 ${label.toLowerCase()} items found. ~${pctRounded}% of ${cohortDescriptor} report at least one issue in this category. You're in the better majority.`,
        };
      }
      return {
        type: 'cohort',
        label: 'Cohort comparison',
        text: `${items.length} ${label.toLowerCase()} item${items.length === 1 ? '' : 's'} flagged. ~${pctRounded}% of ${cohortDescriptor} typically report issues in this category.`,
      };
    }
  }

  // Last resort — neutral acknowledgement
  return {
    type: 'cohort',
    label: 'Summary',
    text: items.length === 0
      ? `No ${label.toLowerCase()} items flagged in your inspection.`
      : `${items.length} ${label.toLowerCase()} item${items.length === 1 ? '' : 's'} flagged in your inspection.`,
  };
}

function cohortPctForCategory(key: SystemKey, stats: NonNullable<BuildContext['cohortStats']>): number | null {
  switch (key) {
    case 'plumbing': return stats.pctReportingPlumbing;
    case 'electrical': return stats.pctReportingElectrical;
    case 'roofing': return stats.pctReportingRoofing;
    case 'hvac': return stats.pctReportingHeating;
    case 'foundation': return stats.pctReportingFoundation;
    case 'appliance': return stats.pctReportingAppliance;
    case 'structural': return null; // AHS doesn't break this out cleanly
  }
}

function findInsuranceMatch(category: string, items: Array<typeof inspectionReportItems.$inferSelect>) {
  for (const item of items) {
    const haystack = `${item.title} ${item.description ?? ''}`;
    for (const pattern of INSURANCE_RISK_PATTERNS) {
      if (pattern.category !== category) continue;
      if (pattern.pattern.test(haystack)) return pattern;
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// AI assessment via Claude
// ──────────────────────────────────────────────────────────────────────────

interface AssessmentResult {
  short: string;
  long: string;
  topFix: { title: string; cost: string; rationale: string } | null;
  componentAges?: Record<string, number>;
}

const NAHB_KEYS = Object.keys(NAHB_LIFESPANS).sort();

async function runCategoryAssessment(
  key: SystemKey,
  label: string,
  items: Array<typeof inspectionReportItems.$inferSelect>,
): Promise<AssessmentResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  const itemsBlock = items.map((it, i) => {
    const lo = ((it.aiCostEstimateLowCents ?? 0) / 100).toFixed(0);
    const hi = ((it.aiCostEstimateHighCents ?? 0) / 100).toFixed(0);
    return `Item ${i + 1}: [${it.severity}] ${it.title}
Location: ${it.locationInProperty ?? 'unspecified'}
Description: ${it.description ?? '(no description)'}
Estimated cost: $${lo}–$${hi}`;
  }).join('\n\n');

  const totalLow = items.reduce((s, i) => s + (i.aiCostEstimateLowCents ?? 0), 0) / 100;
  const totalHigh = items.reduce((s, i) => s + (i.aiCostEstimateHighCents ?? 0), 0) / 100;

  const systemPrompt = `You are a home maintenance advisor producing a per-system assessment from inspection findings. Generate a concise card summary, a longer detail-page paragraph, a top-fix recommendation, and (when mentioned in the items) component ages mapped to NAHB lifespan keys.

You MUST return strict JSON matching this exact schema, with no preamble, no markdown fences, no commentary:

{
  "aiAssessmentShort": "1–2 sentences, max ~180 chars, plain prose",
  "aiAssessmentLong": "1 paragraph (3–5 sentences) suitable for a detail page. No bullet points.",
  "topFix": {
    "title": "Specific action, under 70 chars",
    "cost": "Cost range with $ sign, e.g. '$250–$400' or '$8K–$15K' for big ranges",
    "rationale": "1 sentence explaining why this fix first"
  },
  "componentAges": { "<nahb_key>": <integer years>, ... }
}

Rules:
- componentAges keys MUST be from this allow-list: ${NAHB_KEYS.join(', ')}
- Only include componentAges entries when the inspection items explicitly state an age (e.g. "AC unit, ~18 yrs", "water heater installed 2016"). Omit the field if no ages are mentioned.
- topFix.title should name the action, not restate the issue
- topFix.rationale should explain the priority (which other items it addresses, near-term consequence, etc.)
- aiAssessmentLong should be specific to this set of items, not generic boilerplate
- Cost format: <$1000 use "$XXX–$XXX"; ≥$1000 use "$X.XK–$X.XK" or "$X,XXX–$X,XXX"
- If there's only ONE item, topFix can mirror that item but should still explain why it matters`;

  const userText = `System: ${label}
Total estimated cost across all items: $${totalLow.toFixed(0)}–$${totalHigh.toFixed(0)}

Items from the inspection report:

${itemsBlock}

Return the JSON object only.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userText }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') throw new Error('AI returned no text');

  // Strip code fences if Claude added them despite instructions.
  let raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const objStart = raw.indexOf('{');
  const objEnd = raw.lastIndexOf('}');
  if (objStart !== -1 && objEnd > objStart) raw = raw.slice(objStart, objEnd + 1);

  const parsed = JSON.parse(raw) as {
    aiAssessmentShort?: string;
    aiAssessmentLong?: string;
    topFix?: { title?: string; cost?: string; rationale?: string };
    componentAges?: Record<string, unknown>;
  };

  // Sanitize componentAges — keep only allow-list keys with positive integer values.
  let componentAges: Record<string, number> | undefined;
  if (parsed.componentAges && typeof parsed.componentAges === 'object') {
    componentAges = {};
    for (const [k, v] of Object.entries(parsed.componentAges)) {
      if (!NAHB_LIFESPANS[k]) continue;
      const age = typeof v === 'number' ? v : parseInt(String(v), 10);
      if (Number.isFinite(age) && age >= 0 && age < 200) componentAges[k] = age;
    }
    if (Object.keys(componentAges).length === 0) componentAges = undefined;
  }

  return {
    short: parsed.aiAssessmentShort?.trim() || '',
    long: parsed.aiAssessmentLong?.trim() || '',
    topFix: parsed.topFix?.title ? {
      title: parsed.topFix.title.trim(),
      cost: parsed.topFix.cost?.trim() || '',
      rationale: parsed.topFix.rationale?.trim() || '',
    } : null,
    componentAges,
  };
}

// Deterministic fallback when Claude fails — keeps the panel renderable.
function deterministicFallbackAssessment(
  label: string,
  items: Array<typeof inspectionReportItems.$inferSelect>,
  sev: { urgent: number; recommended: number; monitor: number },
): AssessmentResult {
  const total = items.length;
  const urgentNote = sev.urgent > 0 ? ` ${sev.urgent} flagged as urgent.` : '';
  const short = `${total} ${label.toLowerCase()} item${total === 1 ? '' : 's'} flagged.${urgentNote} See details for inspector findings.`;
  const long = `Your inspector identified ${total} ${label.toLowerCase()} item${total === 1 ? '' : 's'} during the inspection. ${sev.urgent > 0 ? `${sev.urgent} require near-term attention. ` : ''}Review each item's description and estimated cost in the detail view to prioritize work.`;
  const highest = [...items].sort((a, b) => (b.aiCostEstimateHighCents ?? 0) - (a.aiCostEstimateHighCents ?? 0))[0];
  const topFix = highest ? {
    title: highest.title.length > 70 ? `${highest.title.slice(0, 67)}…` : highest.title,
    cost: `$${((highest.aiCostEstimateLowCents ?? 0) / 100).toFixed(0)}–$${((highest.aiCostEstimateHighCents ?? 0) / 100).toFixed(0)}`,
    rationale: 'Largest single estimated cost in this system; tackling it first frees up budget visibility for the rest.',
  } : null;
  return { short, long, topFix };
}

function deterministicEmptyAssessment(label: string): AssessmentResult {
  return {
    short: `No ${label.toLowerCase()} issues flagged. Strong result.`,
    long: `Your inspector found no ${label.toLowerCase()} issues. This is a positive signal — continue routine maintenance to keep this system in good condition.`,
    topFix: null,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Drizzle helper — max(updated_at) over items for a report
// ──────────────────────────────────────────────────────────────────────────

import { sql } from 'drizzle-orm';

function maxItemUpdate(reportId: string) {
  // Drizzle SQL fragment used in select() above. Inlined as a helper so
  // the cached-vs-fresh logic stays readable.
  void reportId; // arg present so call sites read naturally; drizzle uses the eq() filter on the query
  return sql<Date | null>`MAX(${inspectionReportItems.updatedAt})`.as('maxUpdatedAt');
}

// Re-export internal helpers used by the route layer for selective ops.
export const _internal = { findInsuranceMatch, computeGrade };

// Suppress unused-import warnings for symbols kept available for future
// refinements (and/isNotNull may be needed when we add per-tier filters).
void and; void isNotNull;
