import logger from '../logger';

/**
 * Warranty + recall lookups for home appliances/systems.
 *
 * RECALLS come from the CPSC's SaferProducts.gov public Recall REST
 * endpoint — free, no API key required, permissive rate limits. We
 * query by manufacturer + product description, then filter matches by
 * model number on the client side because the API's model-number
 * matching is erratic.
 *
 * WARRANTIES are looked up against an internal table of typical
 * manufacturer coverage by product class. The result is an estimate,
 * not a guarantee — we always caveat "check your paperwork" in the UI.
 * Most homeowners have no idea their fridge is still under warranty
 * at year 4, and this single feature will save meaningful money.
 *
 * An in-process Map caches both lookups for 24h per (brand, model) key
 * since neither set of data changes on any shorter timescale.
 */

// ── Types ─────────────────────────────────────────────────────────────

export interface RecallHit {
  id: string;
  title: string;
  date: string | null;
  url: string;
  hazard: string | null;
  remedy: string | null;
  /** The matched model number (if model-specific), otherwise null. */
  modelMatched: string | null;
}

export interface WarrantyEstimate {
  category: string;
  /** Human-readable description of the typical coverage, e.g.
   *  "1 year parts & labor; 10 years on sealed refrigeration system." */
  description: string;
  /** Approximate years from manufacture. Nullable when manufactureDate unknown. */
  partsYears: number;
  /** Some product classes have extended coverage on specific components. */
  extendedComponentYears?: number | null;
  extendedComponentLabel?: string | null;
  /** Computed expiry date (ISO) — null if no manufactureDate supplied. */
  expiresAt: string | null;
  /** Is the warranty likely still active today? null if unknown. */
  stillActive: boolean | null;
}

export interface ProtectionLookupResult {
  recalls: RecallHit[];
  warranty: WarrantyEstimate | null;
}

// ── Warranty table ────────────────────────────────────────────────────
// Industry-standard manufacturer defaults. Real coverage varies by
// model/region/store but the generic baselines are a useful first-pass
// signal for the homeowner.

interface WarrantyRow {
  description: string;
  partsYears: number;
  extendedComponentYears?: number;
  extendedComponentLabel?: string;
}

const WARRANTY_BY_CATEGORY: Record<string, WarrantyRow> = {
  refrigerator:        { description: '1 year parts & labor; 5–10 years on the sealed refrigeration system.', partsYears: 1, extendedComponentYears: 10, extendedComponentLabel: 'sealed refrigeration system' },
  dishwasher:          { description: '1 year parts & labor; many brands cover the tub + racks longer.', partsYears: 1, extendedComponentYears: 5, extendedComponentLabel: 'tub + racks' },
  washer:              { description: '1 year parts & labor; some brands cover the motor/drum longer.', partsYears: 1, extendedComponentYears: 5, extendedComponentLabel: 'motor/drum' },
  dryer:               { description: '1 year parts & labor.', partsYears: 1 },
  oven:                { description: '1 year parts & labor.', partsYears: 1 },
  range:               { description: '1 year parts & labor.', partsYears: 1 },
  microwave:           { description: '1 year parts & labor; magnetron often covered 5–10 years.', partsYears: 1, extendedComponentYears: 7, extendedComponentLabel: 'magnetron tube' },
  garbage_disposal:    { description: '2–7 years parts & labor depending on model tier.', partsYears: 4 },
  water_heater:        { description: '6–12 years on the tank; 1 year on parts.', partsYears: 1, extendedComponentYears: 9, extendedComponentLabel: 'tank' },
  tankless_water_heater: { description: '10–15 years on the heat exchanger; 5 years on parts.', partsYears: 5, extendedComponentYears: 12, extendedComponentLabel: 'heat exchanger' },
  furnace:             { description: '10 years on heat exchanger; 5–10 years on parts.', partsYears: 5, extendedComponentYears: 10, extendedComponentLabel: 'heat exchanger' },
  hvac_ac_unit:        { description: '10 years on compressor (registered); 5 years on parts.', partsYears: 5, extendedComponentYears: 10, extendedComponentLabel: 'compressor (registration required)' },
  heat_pump:           { description: '10 years on compressor (registered); 5 years on parts.', partsYears: 5, extendedComponentYears: 10, extendedComponentLabel: 'compressor (registration required)' },
  mini_split:          { description: '5 years on parts; 7–10 years on compressor.', partsYears: 5, extendedComponentYears: 10, extendedComponentLabel: 'compressor' },
  boiler:              { description: '10–15 years on heat exchanger; 1 year on parts.', partsYears: 1, extendedComponentYears: 12, extendedComponentLabel: 'heat exchanger' },
  thermostat:          { description: '1–5 years depending on brand/tier.', partsYears: 2 },
  kitchen_faucet:      { description: 'Lifetime warranty from most major brands (Moen, Delta, Kohler).', partsYears: 50 },
  bathroom_faucet:     { description: 'Lifetime warranty from most major brands (Moen, Delta, Kohler).', partsYears: 50 },
  toilet:              { description: '5–10 years on tank + bowl; 1 year on mechanical parts.', partsYears: 1, extendedComponentYears: 10, extendedComponentLabel: 'tank + bowl' },
  water_softener:      { description: '3–10 years depending on brand.', partsYears: 5 },
  pool_heater:         { description: '1–3 years parts, variable by brand.', partsYears: 2 },
  pool_pump:           { description: '1–3 years parts.', partsYears: 2 },
  hot_tub:             { description: '5–7 years on shell; 1–5 years on components.', partsYears: 2, extendedComponentYears: 5, extendedComponentLabel: 'shell' },
  garage_door_opener:  { description: '1–5 years on parts; belt/chain often lifetime.', partsYears: 2 },
  irrigation_controller: { description: '2–5 years.', partsYears: 3 },
  generator:           { description: '2–5 years on residential standby; 1 year on portable.', partsYears: 3 },
  solar:               { description: '10–25 years on panels; 5–10 years on inverter.', partsYears: 10 },
  ev_charger:          { description: '3 years on most home Level 2 chargers.', partsYears: 3 },
  sump_pump:           { description: '1–3 years.', partsYears: 2 },
};

/** Estimate warranty coverage for a given item class. Returns null
 *  when the category isn't in our table. */
export function estimateWarranty(
  category: string,
  manufactureDate: string | null | undefined,
): WarrantyEstimate | null {
  const row = WARRANTY_BY_CATEGORY[category.toLowerCase()];
  if (!row) return null;

  let expiresAt: string | null = null;
  let stillActive: boolean | null = null;
  if (manufactureDate) {
    const d = new Date(manufactureDate);
    if (!isNaN(d.getTime())) {
      const expiry = new Date(d);
      // Use the LONGER of parts and extended-component coverage as the
      // "warranty likely active" cutoff — most homeowners care about
      // the optimistic bound.
      const years = Math.max(row.partsYears, row.extendedComponentYears ?? 0);
      expiry.setFullYear(expiry.getFullYear() + years);
      expiresAt = expiry.toISOString();
      stillActive = expiry.getTime() > Date.now();
    }
  }

  return {
    category,
    description: row.description,
    partsYears: row.partsYears,
    extendedComponentYears: row.extendedComponentYears ?? null,
    extendedComponentLabel: row.extendedComponentLabel ?? null,
    expiresAt,
    stillActive,
  };
}

// ── Recall lookup ─────────────────────────────────────────────────────

// CPSC SaferProducts.gov Recall REST endpoint.
// Docs: https://www.saferproducts.gov/RestWebServices/Recall
const SAFERPRODUCTS_BASE = 'https://www.saferproducts.gov/RestWebServices/Recall';
const FETCH_TIMEOUT_MS = 6000;

interface SaferProductsRecall {
  RecallID?: number;
  RecallNumber?: string;
  RecallDate?: string;
  Description?: string;
  URL?: string;
  Title?: string;
  Hazards?: Array<{ Name?: string }>;
  Remedies?: Array<{ Name?: string }>;
  Products?: Array<{ Name?: string; Model?: string; Type?: string }>;
  Manufacturers?: Array<{ Name?: string; CompanyID?: number }>;
}

export async function lookupRecalls(brand: string, modelNumber: string | null | undefined): Promise<RecallHit[]> {
  if (!brand || brand.trim().length < 2) return [];

  const url = new URL(SAFERPRODUCTS_BASE);
  url.searchParams.set('format', 'json');
  url.searchParams.set('Manufacturer', brand.trim());

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    clearTimeout(timer);

    if (!res.ok) {
      logger.warn({ status: res.status, brand }, '[warranty-recall] SaferProducts query failed');
      return [];
    }
    const raw = await res.json();
    const rows = Array.isArray(raw) ? raw as SaferProductsRecall[] : [];

    // SaferProducts returns ALL recalls by this manufacturer. Filter by
    // the model number when supplied so we don't alarm the user about
    // unrelated recalls. Fall back to returning all (capped at 3) when
    // no model is provided — lets the user browse their brand's recalls.
    const normalizedModel = (modelNumber || '').trim().toLowerCase();
    const filtered = normalizedModel
      ? rows.filter(r => {
          const products = r.Products || [];
          return products.some(p => {
            const m = (p.Model || '').toLowerCase();
            // Consider it a match if the model field CONTAINS our model
            // (handles "DW80K5050US" in a longer product description) or
            // vice versa (handles "DW80K5050" matching "DW80K5050US").
            return m && (m.includes(normalizedModel) || normalizedModel.includes(m));
          });
        })
      : rows;

    return filtered.slice(0, 5).map((r) => ({
      id: String(r.RecallID ?? r.RecallNumber ?? Math.random().toString(36).slice(2)),
      title: r.Title || r.Description?.slice(0, 140) || 'Product recall',
      date: r.RecallDate ?? null,
      url: r.URL || 'https://www.saferproducts.gov/Recalls',
      hazard: r.Hazards?.[0]?.Name || null,
      remedy: r.Remedies?.[0]?.Name || null,
      modelMatched: normalizedModel || null,
    }));
  } catch (err) {
    logger.warn({ err, brand }, '[warranty-recall] SaferProducts fetch error');
    return [];
  }
}

// ── Combined lookup with 24h in-process cache ─────────────────────────

interface CacheEntry {
  result: ProtectionLookupResult;
  fetchedAt: number;
}
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function cacheKey(brand: string, model: string | null | undefined, category: string | null | undefined, manufactureDate: string | null | undefined): string {
  return [
    brand.trim().toLowerCase(),
    (model || '').trim().toLowerCase(),
    (category || '').trim().toLowerCase(),
    manufactureDate || '',
  ].join('|');
}

export async function lookupProtection(params: {
  brand: string;
  modelNumber: string | null;
  category: string | null;
  manufactureDate: string | null;
}): Promise<ProtectionLookupResult> {
  const key = cacheKey(params.brand, params.modelNumber, params.category, params.manufactureDate);
  const cached = CACHE.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const [recalls, warranty] = await Promise.all([
    lookupRecalls(params.brand, params.modelNumber),
    Promise.resolve(params.category ? estimateWarranty(params.category, params.manufactureDate) : null),
  ]);

  const result: ProtectionLookupResult = { recalls, warranty };
  CACHE.set(key, { result, fetchedAt: Date.now() });
  return result;
}
