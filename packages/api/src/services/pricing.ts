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

/** Inspector-side tiered wholesale pricing. Inspector picks a tier
 *  at upload — each unlocks a different feature set in the
 *  homeowner-facing portal:
 *
 *    essential     → AI report analysis, items, severity, AI cost
 *                    estimates, category breakdown
 *    professional  → everything in essential PLUS dispatch quotes,
 *                    real-time quote tracking, comparison
 *    premium       → everything in professional PLUS negotiation
 *                    documents (repair-request PDFs / pre-listing PDFs),
 *                    priority dispatch, year-round maintenance timeline
 *
 *  Each tier carries both a wholesale (what the inspector pays Homie)
 *  and retail (suggested price the inspector charges the homeowner on
 *  their own invoice). Retail is purely a display value here — the
 *  inspector bills the homeowner off-platform; we never see that
 *  transaction. The wholesale is what flows through Stripe at
 *  upload time. */
export interface InspectorTierConfig {
  wholesalePriceCents: number;
  /** What we suggest the inspector charges their client. Display-
   *  only — Homie never collects this. */
  retailPriceCents: number;
}
export interface InspectorPricingConfig {
  tiers: {
    essential: InspectorTierConfig;
    professional: InspectorTierConfig;
    premium: InspectorTierConfig;
  };
}

/** Allowed pricing-tier slugs. The schema column on inspection_reports
 *  uses these exact strings; the homeowner portal's tab-level gates
 *  check for them with `===` equality, so don't rename without
 *  migrating both. */
export type InspectorTier = 'essential' | 'professional' | 'premium';
export const INSPECTOR_TIERS: readonly InspectorTier[] = ['essential', 'professional', 'premium'] as const;

export interface PricingConfig {
  homeowner: Record<string, HomeownerTierConfig>;
  business: Record<string, BusinessPlanConfig>;
  inspector: InspectorPricingConfig;
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
  inspector: {
    // Tiered wholesale rates. Inspector spread (= retail − wholesale)
    // climbs intentionally with tier so reps push the higher SKUs:
    //   essential:    $50 spread on $99 retail (50% inspector cut)
    //   professional: $120 spread on $199 retail (60%)
    //   premium:      $200 spread on $299 retail (67%)
    // Override at any time by writing to the singleton
    // pricing_config row — defaults only apply when the DB row is
    // missing the inspector key.
    tiers: {
      essential:    { wholesalePriceCents: 4900,  retailPriceCents: 9900  },
      professional: { wholesalePriceCents: 7900,  retailPriceCents: 19900 },
      premium:      { wholesalePriceCents: 9900,  retailPriceCents: 29900 },
    },
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
    const stored = (row?.config as Partial<PricingConfig> | null) ?? null;
    // Fill in any keys the stored singleton is missing (e.g. legacy
    // rows from before the inspector tiers landed). Stored values
    // take precedence so prod overrides aren't silently reverted.
    //
    // Inspector key has its own backwards-compat shim because an
    // earlier ship of this feature stored `{ reportPriceCents: N }`
    // (flat-fee shape). If the stored blob has that shape — i.e.
    // missing `tiers` — we fall through to the tiered defaults so
    // the upload path keeps working without a manual data fix.
    const storedInspector = stored?.inspector as InspectorPricingConfig | { reportPriceCents?: number } | undefined;
    const inspector: InspectorPricingConfig =
      storedInspector && 'tiers' in storedInspector && storedInspector.tiers
        ? storedInspector
        : DEFAULT_PRICING.inspector;
    const config: PricingConfig = {
      homeowner: stored?.homeowner ?? DEFAULT_PRICING.homeowner,
      business: stored?.business ?? DEFAULT_PRICING.business,
      inspector,
    };
    _cache = { config, at: Date.now() };
    return config;
  } catch {
    return DEFAULT_PRICING;
  }
}

/** Resolve the wholesale + retail price for a single inspector tier.
 *  Caller side validates the tier slug; we trust it here. Falls back
 *  to professional defaults if the config row is somehow missing the
 *  tier (defensive — schema-default seeded all three on first deploy). */
export async function getInspectorTierPricing(tier: InspectorTier): Promise<InspectorTierConfig> {
  const config = await getPricingConfig();
  return config.inspector.tiers[tier] ?? DEFAULT_PRICING.inspector.tiers[tier] ?? DEFAULT_PRICING.inspector.tiers.professional;
}

export function invalidatePricingCache(): void {
  _cache = null;
}

/** Per-inspector retail-price overrides — pulled from the
 *  inspector_partners row. Null in any field means "use the suggested
 *  default from pricing config for that tier". */
export interface InspectorRetailOverrides {
  retailPriceEssentialCents: number | null;
  retailPriceProfessionalCents: number | null;
  retailPricePremiumCents: number | null;
}

/** Resolve the inspector's effective retail price for a given tier,
 *  applying their override if set, falling back to the suggested
 *  default from pricing config. Synchronous so it can be called per
 *  report inside a list-projection without N async hops. Caller must
 *  pre-fetch the inspector pricing config once and pass it in. */
export function effectiveRetailCents(
  overrides: InspectorRetailOverrides,
  tier: InspectorTier,
  defaults: InspectorPricingConfig,
): number {
  const fallback = defaults.tiers[tier].retailPriceCents;
  switch (tier) {
    case 'essential':    return overrides.retailPriceEssentialCents    ?? fallback;
    case 'professional': return overrides.retailPriceProfessionalCents ?? fallback;
    case 'premium':      return overrides.retailPricePremiumCents      ?? fallback;
  }
}

/** Per-report estimated earnings = (effective retail) − (wholesale
 *  paid). Returns 0 for unpaid reports (no tier or no priceCentsPaid)
 *  or any tier the schema doesn't recognize. Clamped at 0 so a misset
 *  override below wholesale never displays a negative earning. */
export function estimatedEarningsCentsFor(
  overrides: InspectorRetailOverrides,
  report: { pricingTier: string | null; priceCentsPaid: number | null },
  defaults: InspectorPricingConfig,
): number {
  if (!report.pricingTier || typeof report.priceCentsPaid !== 'number') return 0;
  if (report.pricingTier !== 'essential' && report.pricingTier !== 'professional' && report.pricingTier !== 'premium') return 0;
  const retail = effectiveRetailCents(overrides, report.pricingTier, defaults);
  return Math.max(0, retail - report.priceCentsPaid);
}

/** Per-report partner referral bonus — the full retail-minus-wholesale
 *  spread when a homeowner pays Homie directly via a partner URL. Only
 *  fires for source='homeowner_upload' (the homeowner-paid retail flow
 *  in /account/reports/:reportId/checkout) — inspector-wholesale flows
 *  are intentionally excluded since paying out the spread there would
 *  be negative-margin for Homie (the inspector only paid wholesale,
 *  not retail).
 *
 *  Forward-compatible with future partner-specific URLs that override
 *  retail pricing: the homeowner pays whatever is stamped on
 *  priceCentsPaid (Homie's standard retail today; the partner's
 *  custom retail when that flow lands), and the partner gets the full
 *  spread either way.
 */
export function referralBonusCentsFor(
  report: {
    paymentStatus: string | null;
    priceCentsPaid: number | null;
    pricingTier: string | null;
    source: string | null;
  },
  defaults: InspectorPricingConfig,
): number {
  if (report.paymentStatus !== 'paid') return 0;
  if (report.source !== 'homeowner_upload') return 0;
  if (!report.pricingTier || (report.pricingTier !== 'essential' && report.pricingTier !== 'professional' && report.pricingTier !== 'premium')) return 0;
  const paid = report.priceCentsPaid ?? 0;
  const wholesale = defaults.tiers[report.pricingTier].wholesalePriceCents;
  if (paid <= 0 || wholesale <= 0) return 0;
  return Math.max(0, paid - wholesale);
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
