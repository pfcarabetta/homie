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
    professional: { base: 99,  perProperty: 10, promoBase: null, promoLabel: null, searchesPerProperty: 5, maxProperties: 50,   maxTeamMembers: 5 },
    business:     { base: 249, perProperty: 10, promoBase: null, promoLabel: null, searchesPerProperty: 5, maxProperties: 150,  maxTeamMembers: 15 },
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
