import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

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

/** Format cents to display string, e.g. 999 -> "$9.99" */
export function centsToDisplay(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars % 1 === 0 ? dollars.toFixed(0) : dollars.toFixed(2)}`;
}

// Module-level cache shared across hook instances
let _cached: PricingConfig | null = null;
let _fetchPromise: Promise<PricingConfig> | null = null;

function fetchPricing(): Promise<PricingConfig> {
  if (_cached) return Promise.resolve(_cached);
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = fetch(`${API_BASE}/api/v1/config/pricing`)
    .then((r) => r.json())
    .then((body) => {
      _cached = (body.data as PricingConfig) ?? DEFAULT_PRICING;
      _fetchPromise = null;
      return _cached;
    })
    .catch(() => {
      _fetchPromise = null;
      return DEFAULT_PRICING;
    });

  return _fetchPromise;
}

export function usePricing() {
  const [pricing, setPricing] = useState<PricingConfig>(_cached ?? DEFAULT_PRICING);
  const [loading, setLoading] = useState(!_cached);

  useEffect(() => {
    if (_cached) return;
    fetchPricing().then((p) => {
      setPricing(p);
      setLoading(false);
    });
  }, []);

  return { pricing, loading };
}
