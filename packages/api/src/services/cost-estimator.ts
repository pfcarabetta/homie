import { db } from '../db';
import { repairCostData, costEstimateLog } from '../db/schema/cost-estimates';
import { REGIONAL_MULTIPLIERS } from '../db/seeds/repair-cost-benchmarks';
import { sql, eq, and, desc } from 'drizzle-orm';
import logger from '../logger';

interface EstimateInput {
  category: string;
  subcategory: string;
  complexity?: string;
  zipCode: string;
  workspaceId?: string;
  propertyType?: string;
  brand?: string;
  systemAgeYears?: number;
  urgency?: string; // asap, this_week, this_month, flexible
  photoAnalysisSummary?: string;
}

interface AdjustmentFactor {
  name: string;
  direction: 'up' | 'down' | 'neutral';
  percentage: number;
  reason: string;
}

interface EstimateOutput {
  estimateLowCents: number;
  estimateHighCents: number;
  estimateMedianCents: number;
  confidence: number;
  dataPointsUsed: number;
  adjustmentFactors: AdjustmentFactor[];
  dataSourceLabel: string;
  comparableRangeLabel: string;
}

// Map first 3 digits of zip to region
function zipToRegion(zipCode: string): string {
  const prefix = zipCode.slice(0, 3);
  const map: Record<string, string> = {
    '921': 'san_diego', '920': 'san_diego',
    '850': 'phoenix', '852': 'phoenix',
    '331': 'miami', '330': 'miami',
    '372': 'nashville', '370': 'nashville',
    '900': 'los_angeles', '901': 'los_angeles', '902': 'los_angeles',
    '100': 'new_york', '101': 'new_york', '102': 'new_york',
    '802': 'denver', '800': 'denver',
    '787': 'austin', '786': 'austin',
    '981': 'seattle', '980': 'seattle',
    '606': 'chicago', '605': 'chicago',
  };
  return map[prefix] ?? 'national';
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

type PriceRow = { quoted_price_cents: number; age_days: number; [key: string]: unknown };

async function fetchPriceData(
  category: string,
  subcategory: string,
  zipCode: string,
  region: string,
  complexity?: string,
): Promise<{ rows: PriceRow[]; sourceLabel: string }> {
  // Tier 1: exact subcategory + zip
  let result = await db.execute<PriceRow>(sql`
    SELECT quoted_price_cents, EXTRACT(DAY FROM now() - created_at)::int AS age_days
    FROM repair_cost_data
    WHERE category = ${category} AND subcategory = ${subcategory} AND zip_code = ${zipCode}
      AND quoted_price_cents IS NOT NULL
    ORDER BY created_at DESC LIMIT 50
  `);
  if (result.length >= 3) return { rows: result, sourceLabel: 'Local quotes & benchmarks' };

  // Tier 2: subcategory + region
  result = await db.execute<PriceRow>(sql`
    SELECT quoted_price_cents, EXTRACT(DAY FROM now() - created_at)::int AS age_days
    FROM repair_cost_data
    WHERE category = ${category} AND subcategory = ${subcategory}
      AND (region = ${region} OR region = 'national')
      AND quoted_price_cents IS NOT NULL
    ORDER BY created_at DESC LIMIT 50
  `);
  if (result.length >= 3) return { rows: result, sourceLabel: 'Regional data & benchmarks' };

  // Tier 3: category + zip
  result = await db.execute<PriceRow>(sql`
    SELECT quoted_price_cents, EXTRACT(DAY FROM now() - created_at)::int AS age_days
    FROM repair_cost_data
    WHERE category = ${category} AND zip_code = ${zipCode}
      AND quoted_price_cents IS NOT NULL
    ORDER BY created_at DESC LIMIT 50
  `);
  if (result.length >= 3) return { rows: result, sourceLabel: 'Category averages (local)' };

  // Tier 4: national benchmarks for category
  result = await db.execute<PriceRow>(sql`
    SELECT quoted_price_cents, EXTRACT(DAY FROM now() - created_at)::int AS age_days
    FROM repair_cost_data
    WHERE category = ${category} AND data_source = 'industry_benchmark'
      AND quoted_price_cents IS NOT NULL
    ORDER BY created_at DESC LIMIT 50
  `);
  return { rows: result, sourceLabel: 'Industry benchmarks' };
}

function computePercentiles(rows: PriceRow[]): { p25: number; p50: number; p75: number } {
  // Recency-weighted: more recent data gets higher weight
  const weighted = rows.map((r) => {
    const ageDays = Math.max(Number(r.age_days) || 0, 1);
    const weight = 1 / Math.sqrt(ageDays);
    return { price: Number(r.quoted_price_cents), weight };
  });
  weighted.sort((a, b) => a.price - b.price);

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);

  function percentile(p: number): number {
    const target = totalWeight * p;
    let cumulative = 0;
    for (const w of weighted) {
      cumulative += w.weight;
      if (cumulative >= target) return w.price;
    }
    return weighted[weighted.length - 1].price;
  }

  return { p25: percentile(0.25), p50: percentile(0.5), p75: percentile(0.75) };
}

function buildAdjustments(input: EstimateInput): AdjustmentFactor[] {
  const factors: AdjustmentFactor[] = [];

  // Brand premium
  if (input.brand) {
    const premiumBrands = ['sub-zero', 'wolf', 'viking', 'thermador', 'miele'];
    if (premiumBrands.some((b) => input.brand!.toLowerCase().includes(b))) {
      factors.push({ name: 'premium_brand', direction: 'up', percentage: 20, reason: 'Premium brand parts/expertise' });
    }
  }

  // System age
  if (input.systemAgeYears != null) {
    if (input.systemAgeYears > 15) {
      factors.push({ name: 'aging_system', direction: 'up', percentage: 15, reason: 'Older system may need extra work' });
    } else if (input.systemAgeYears < 3) {
      factors.push({ name: 'newer_system', direction: 'down', percentage: 10, reason: 'Newer system, likely simpler fix' });
    }
  }

  // Urgency
  if (input.urgency === 'asap') {
    factors.push({ name: 'emergency_surcharge', direction: 'up', percentage: 25, reason: 'Emergency/same-day service' });
  } else if (input.urgency === 'flexible') {
    factors.push({ name: 'flexible_discount', direction: 'down', percentage: 5, reason: 'Flexible timing' });
  }

  // Seasonal (HVAC-specific)
  const month = new Date().getMonth();
  if (input.category === 'hvac') {
    if (month >= 5 && month <= 8) {
      factors.push({ name: 'peak_season', direction: 'up', percentage: 10, reason: 'Peak summer season for HVAC' });
    } else if (month >= 10 || month <= 1) {
      factors.push({ name: 'heating_season', direction: 'up', percentage: 8, reason: 'Winter heating season demand' });
    }
  }

  return factors;
}

function applyAdjustments(cents: number, factors: AdjustmentFactor[]): number {
  let result = cents;
  for (const f of factors) {
    const delta = result * (f.percentage / 100);
    result += f.direction === 'up' ? delta : f.direction === 'down' ? -delta : 0;
  }
  return Math.round(result);
}

export async function generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
  const region = zipToRegion(input.zipCode);
  const { rows, sourceLabel } = await fetchPriceData(
    input.category, input.subcategory, input.zipCode, region, input.complexity,
  );

  if (rows.length === 0) {
    throw new Error(`No pricing data found for ${input.category}/${input.subcategory}`);
  }

  const { p25, p50, p75 } = computePercentiles(rows);

  // Apply regional multiplier
  const multiplier = REGIONAL_MULTIPLIERS[region] ?? 1.0;
  const adjustedP25 = Math.round(p25 * multiplier);
  const adjustedP50 = Math.round(p50 * multiplier);
  const adjustedP75 = Math.round(p75 * multiplier);

  const factors = buildAdjustments(input);
  const estimateLowCents = applyAdjustments(adjustedP25, factors);
  const estimateHighCents = applyAdjustments(adjustedP75, factors);
  const estimateMedianCents = applyAdjustments(adjustedP50, factors);

  // Confidence: more data points + local data = higher confidence
  const dataPointsUsed = rows.length;
  const baseConfidence = Math.min(0.5 + dataPointsUsed * 0.05, 0.95);
  const localBonus = sourceLabel.includes('Local') ? 0.05 : 0;
  const confidence = Math.min(Number((baseConfidence + localBonus).toFixed(2)), 0.99);

  const comparableRangeLabel = `${formatDollars(estimateLowCents)} - ${formatDollars(estimateHighCents)}`;

  // Log the estimate (fire-and-forget)
  db.insert(costEstimateLog).values({
    jobId: undefined,
    workspaceId: input.workspaceId ?? undefined,
    zipCode: input.zipCode,
    category: input.category,
    subcategory: input.subcategory,
    complexity: input.complexity ?? 'moderate',
    photoAnalyzed: !!input.photoAnalysisSummary,
    estimateLowCents,
    estimateHighCents,
    estimateMedianCents,
    confidenceScore: String(confidence),
    dataPointsUsed,
    adjustmentFactors: factors,
  }).catch((err) => logger.error({ err }, '[cost-estimator] Failed to log estimate'));

  return {
    estimateLowCents,
    estimateHighCents,
    estimateMedianCents,
    confidence,
    dataPointsUsed,
    adjustmentFactors: factors,
    dataSourceLabel: sourceLabel,
    comparableRangeLabel,
  };
}
