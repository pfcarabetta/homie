import { eq } from 'drizzle-orm';
import { db } from '../db';
import { pricingConfig } from '../db/schema/pricing-config';

export interface HomeownerTierConfig {
  priceCents: number;
  promoPriceCents: number | null;
  promoLabel: string | null;
}

export interface BusinessPlanConfig {
  base: number;
  perProperty: number;
  promoBase: number | null;
  promoLabel: string | null;
  searchesPerProperty: number;
  maxProperties: number;
  maxTeamMembers: number;
}

export interface PricingConfig {
  homeowner: Record<string, HomeownerTierConfig>;
  business: Record<string, BusinessPlanConfig>;
}

export const DEFAULT_PRICING: PricingConfig = {
  homeowner: {
    standard:  { priceCents: 999,  promoPriceCents: null, promoLabel: null },
    priority:  { priceCents: 1999, promoPriceCents: null, promoLabel: null },
    emergency: { priceCents: 2999, promoPriceCents: null, promoLabel: null },
  },
  business: {
    trial:        { base: 0,   perProperty: 0,  promoBase: null, promoLabel: null, searchesPerProperty: 5, maxProperties: 5,    maxTeamMembers: 1 },
    starter:      { base: 0,   perProperty: 10, promoBase: null, promoLabel: null, searchesPerProperty: 5, maxProperties: 10,   maxTeamMembers: 1 },
    professional: { base: 99,  perProperty: 10, promoBase: null, promoLabel: null, searchesPerProperty: 5, maxProperties: 150,  maxTeamMembers: 5 },
    business:     { base: 249, perProperty: 10, promoBase: null, promoLabel: null, searchesPerProperty: 5, maxProperties: 500,  maxTeamMembers: 9999 },
    enterprise:   { base: 0,   perProperty: 10, promoBase: null, promoLabel: null, searchesPerProperty: 5, maxProperties: 9999, maxTeamMembers: 9999 },
  },
};

let _cache: { config: PricingConfig; at: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

export async function getPricingConfig(): Promise<PricingConfig> {
  if (_cache && Date.now() - _cache.at < CACHE_TTL_MS) return _cache.config;

  try {
    const [row] = await db
      .select()
      .from(pricingConfig)
      .where(eq(pricingConfig.id, 'singleton'))
      .limit(1);
    const config = (row?.config as PricingConfig) ?? DEFAULT_PRICING;
    _cache = { config, at: Date.now() };
    return config;
  } catch {
    return DEFAULT_PRICING;
  }
}

export function invalidatePricingCache(): void {
  _cache = null;
}

/**
 * Resolve the effective BusinessPlanConfig for a specific workspace.
 * If the workspace has customPricing overrides, those fields take
 * precedence over the global plan defaults. This is how enterprise
 * and custom-deal workspaces get non-standard pricing.
 *
 * Resolution order per field:
 *   workspace.customPricing.X  >  globalConfig[workspace.plan].X  >  DEFAULT_PRICING[plan].X
 */
export async function getWorkspacePlanConfig(
  plan: string,
  customPricing: Record<string, unknown> | null | undefined,
): Promise<BusinessPlanConfig & { isCustom: boolean; planLabel: string }> {
  const globalConfig = await getPricingConfig();
  const base = globalConfig.business[plan] ?? DEFAULT_PRICING.business[plan] ?? DEFAULT_PRICING.business.starter;

  if (!customPricing || Object.keys(customPricing).length === 0) {
    return { ...base, isCustom: false, planLabel: plan.charAt(0).toUpperCase() + plan.slice(1) };
  }

  const cp = customPricing as Record<string, unknown>;
  return {
    base: typeof cp.base === 'number' ? cp.base : base.base,
    perProperty: typeof cp.perProperty === 'number' ? cp.perProperty : base.perProperty,
    promoBase: cp.promoBase !== undefined ? (cp.promoBase as number | null) : base.promoBase,
    promoLabel: cp.promoLabel !== undefined ? (cp.promoLabel as string | null) : base.promoLabel,
    searchesPerProperty: typeof cp.searchesPerProperty === 'number' ? cp.searchesPerProperty : base.searchesPerProperty,
    maxProperties: typeof cp.maxProperties === 'number' ? cp.maxProperties : base.maxProperties,
    maxTeamMembers: typeof cp.maxTeamMembers === 'number' ? cp.maxTeamMembers : base.maxTeamMembers,
    isCustom: true,
    planLabel: typeof cp.planLabel === 'string' ? cp.planLabel : `${plan.charAt(0).toUpperCase() + plan.slice(1)} (Custom)`,
  };
}
