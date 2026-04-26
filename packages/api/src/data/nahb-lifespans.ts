/**
 * NAHB component lifespans — typical useful-life ranges by component type.
 *
 * Source: National Association of Home Builders, "Study of Life
 * Expectancy of Home Components" (2007 with periodic updates). The values
 * below are the ranges the industry quotes from that publication.
 *
 * Used by the Home IQ "lifespan tracker" smart insight: when the AI
 * extracts a component age from the inspection PDF (e.g. "AC unit, ~18
 * yrs"), we look up the matching component here and return whether that
 * age is in-band, late-life, or past expected life.
 *
 * Some components are flagged with `replaceImmediately: true` — these are
 * known-defective product types where age is irrelevant (Federal Pacific
 * panels, polybutylene pipe, knob-and-tube wiring). They get a special
 * "replace" status regardless of age.
 */

export interface ComponentLifespan {
  /** Display label for the component */
  label: string;
  /** Typical low end of useful life, years */
  typicalLow: number;
  /** Typical high end of useful life, years */
  typicalHigh: number;
  /** When true, the component should be replaced regardless of age — used
   *  for known-defective product types. */
  replaceImmediately?: boolean;
  /** Optional context shown alongside the lifespan tracker. */
  note?: string;
}

export const NAHB_LIFESPANS: Record<string, ComponentLifespan> = {
  // ── HVAC ────────────────────────────────────────────────────────────
  ac_unit: { label: 'Central AC unit', typicalLow: 15, typicalHigh: 20 },
  furnace_gas: { label: 'Gas furnace', typicalLow: 18, typicalHigh: 22 },
  furnace_electric: { label: 'Electric furnace', typicalLow: 20, typicalHigh: 30 },
  heat_pump: { label: 'Heat pump', typicalLow: 14, typicalHigh: 18 },
  mini_split: { label: 'Mini-split system', typicalLow: 15, typicalHigh: 20 },
  boiler: { label: 'Boiler', typicalLow: 13, typicalHigh: 25 },
  thermostat: { label: 'Thermostat', typicalLow: 35, typicalHigh: 50 },

  // ── Water heating ───────────────────────────────────────────────────
  water_heater_tank: { label: 'Water heater (tank)', typicalLow: 8, typicalHigh: 12 },
  water_heater_tankless: { label: 'Water heater (tankless)', typicalLow: 18, typicalHigh: 25 },

  // ── Roofing ─────────────────────────────────────────────────────────
  roof_asphalt_shingle: { label: 'Asphalt shingle roof', typicalLow: 20, typicalHigh: 25 },
  roof_architectural_shingle: { label: 'Architectural shingle roof', typicalLow: 25, typicalHigh: 30 },
  roof_metal: { label: 'Metal roof', typicalLow: 40, typicalHigh: 70 },
  roof_clay_tile: { label: 'Clay tile roof', typicalLow: 50, typicalHigh: 100 },
  roof_slate: { label: 'Slate roof', typicalLow: 50, typicalHigh: 100 },
  roof_wood_shake: { label: 'Wood shake roof', typicalLow: 20, typicalHigh: 30 },

  // ── Plumbing ────────────────────────────────────────────────────────
  pipe_copper: { label: 'Copper pipe', typicalLow: 50, typicalHigh: 70 },
  pipe_pex: { label: 'PEX pipe', typicalLow: 40, typicalHigh: 50 },
  pipe_galvanized_steel: { label: 'Galvanized steel pipe', typicalLow: 20, typicalHigh: 50, note: 'Often degraded by 40+ yrs; budget for replacement.' },
  pipe_polybutylene: { label: 'Polybutylene pipe', typicalLow: 0, typicalHigh: 0, replaceImmediately: true, note: 'Replace immediately — known to fail catastrophically. Many insurers will not write new policies.' },

  // ── Electrical ──────────────────────────────────────────────────────
  panel_modern: { label: 'Electrical panel (modern)', typicalLow: 30, typicalHigh: 40 },
  panel_federal_pacific: { label: 'Federal Pacific Stab-Lok panel', typicalLow: 0, typicalHigh: 0, replaceImmediately: true, note: 'Documented fire risk. Most major insurers decline new policies.' },
  panel_zinsco: { label: 'Zinsco panel', typicalLow: 0, typicalHigh: 0, replaceImmediately: true, note: 'Same documented failure pattern as Federal Pacific. Replace.' },
  wiring_aluminum: { label: 'Aluminum branch wiring', typicalLow: 0, typicalHigh: 0, replaceImmediately: true, note: 'Insurer dealbreaker. Remediation required (CO/ALR receptacles or full rewire).' },
  wiring_knob_tube: { label: 'Knob-and-tube wiring', typicalLow: 0, typicalHigh: 0, replaceImmediately: true, note: 'Replace before insulation contact. Insurer dealbreaker.' },

  // ── Appliances ──────────────────────────────────────────────────────
  refrigerator: { label: 'Refrigerator', typicalLow: 13, typicalHigh: 17 },
  dishwasher: { label: 'Dishwasher', typicalLow: 9, typicalHigh: 12 },
  washer: { label: 'Washing machine', typicalLow: 10, typicalHigh: 13 },
  dryer: { label: 'Clothes dryer', typicalLow: 13, typicalHigh: 15 },
  oven_electric: { label: 'Electric oven/range', typicalLow: 13, typicalHigh: 15 },
  oven_gas: { label: 'Gas oven/range', typicalLow: 15, typicalHigh: 17 },
  microwave: { label: 'Microwave', typicalLow: 9, typicalHigh: 10 },
  garbage_disposal: { label: 'Garbage disposal', typicalLow: 10, typicalHigh: 12 },

  // ── Envelope ────────────────────────────────────────────────────────
  windows_vinyl: { label: 'Vinyl windows', typicalLow: 20, typicalHigh: 40 },
  windows_wood: { label: 'Wood windows', typicalLow: 30, typicalHigh: 100 },
  windows_aluminum: { label: 'Aluminum windows', typicalLow: 15, typicalHigh: 20 },
  garage_door_opener: { label: 'Garage door opener', typicalLow: 10, typicalHigh: 15 },
  gutters_aluminum: { label: 'Aluminum gutters', typicalLow: 20, typicalHigh: 30 },
  gutters_copper: { label: 'Copper gutters', typicalLow: 50, typicalHigh: 100 },
  siding_vinyl: { label: 'Vinyl siding', typicalLow: 20, typicalHigh: 60 },
  siding_wood: { label: 'Wood siding', typicalLow: 20, typicalHigh: 100 },
  siding_stucco: { label: 'Stucco siding', typicalLow: 50, typicalHigh: 80 },
  siding_brick: { label: 'Brick siding', typicalLow: 100, typicalHigh: 200 },
  foundation_concrete: { label: 'Concrete foundation', typicalLow: 75, typicalHigh: 200 },
};

/** Compute lifespan status given current age. Returns null when the
 *  component is in a "replace immediately" class (caller renders a
 *  different message in that case). */
export function lifespanStatus(component: ComponentLifespan, ageYears: number): {
  pct: number;
  label: 'early' | 'mid' | 'late' | 'past';
  description: string;
} | null {
  if (component.replaceImmediately) return null;
  const { typicalLow, typicalHigh } = component;
  if (ageYears < typicalLow * 0.5) {
    return { pct: ageYears / typicalHigh, label: 'early', description: `Early life — well within the typical ${typicalLow}–${typicalHigh} yr range.` };
  }
  if (ageYears < typicalLow) {
    return { pct: ageYears / typicalHigh, label: 'mid', description: `Mid-life — within the typical ${typicalLow}–${typicalHigh} yr range.` };
  }
  if (ageYears <= typicalHigh) {
    return { pct: ageYears / typicalHigh, label: 'late', description: `Late life — plan for replacement within ${Math.max(0, typicalHigh - Math.round(ageYears))}–${typicalHigh - typicalLow} yrs.` };
  }
  return { pct: Math.min(1.5, ageYears / typicalHigh), label: 'past', description: `Past expected life — replace within 0–3 yrs to avoid emergency failure.` };
}
