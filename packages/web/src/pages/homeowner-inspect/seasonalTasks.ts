/**
 * Seasonal home maintenance tasks. Hard-coded, no DB.
 * Months are 1-indexed (January = 1, December = 12).
 */

export interface SeasonalTask {
  id: string;
  title: string;
  description: string;
  /** Maps to inspection category. Used to surface only when homeowner has related items, OR show generic if 'general' */
  category: string;
  months: number[];
  icon: string;
}

export const SEASONAL_TASKS: SeasonalTask[] = [
  // ── Spring (Mar-May) ──────────────────────────────────────────────────────
  { id: 'spring-ac', title: 'Schedule AC tune-up', description: 'Get your air conditioner serviced before peak summer demand.', category: 'hvac', months: [3, 4, 5], icon: '\u2744\uFE0F' },
  { id: 'spring-gutters', title: 'Clean gutters and downspouts', description: 'Clear winter debris so spring rains drain properly.', category: 'roofing', months: [3, 4, 5], icon: '\uD83C\uDF27\uFE0F' },
  { id: 'spring-roof', title: 'Inspect roof for winter damage', description: 'Look for missing/damaged shingles, flashing issues, or sagging spots.', category: 'roofing', months: [3, 4], icon: '\uD83C\uDFE0' },
  { id: 'spring-foundation', title: 'Check foundation for cracks', description: 'Freeze-thaw cycles can open new cracks. Inspect interior and exterior walls.', category: 'foundation', months: [4, 5], icon: '\uD83C\uDFDB\uFE0F' },
  { id: 'spring-sump', title: 'Test sump pump', description: 'Pour a bucket of water into the pit and confirm it cycles on properly before spring rains.', category: 'plumbing', months: [3, 4], icon: '\uD83D\uDCA7' },
  { id: 'spring-pest', title: 'Schedule spring pest treatment', description: 'Termites, ants, and other pests become active in spring. Get a perimeter treatment.', category: 'pest_control', months: [3, 4, 5], icon: '\uD83D\uDC1B' },
  { id: 'spring-windows', title: 'Re-caulk windows and doors', description: 'Seal any gaps to prevent water intrusion and improve summer cooling efficiency.', category: 'windows_doors', months: [4, 5], icon: '\uD83E\uDE9F' },
  { id: 'spring-detector', title: 'Test smoke + CO detectors', description: 'Replace batteries and verify all units beep when tested.', category: 'safety', months: [3, 10], icon: '\u26A0\uFE0F' },

  // ── Summer (Jun-Aug) ──────────────────────────────────────────────────────
  { id: 'summer-ac-filter', title: 'Replace AC filter', description: 'Heavy summer use clogs filters fast. Check monthly, replace every 1-3 months.', category: 'hvac', months: [6, 7, 8], icon: '\u2744\uFE0F' },
  { id: 'summer-deck', title: 'Inspect deck and exterior wood', description: 'Look for rot, loose boards, and railing wobble. Reseal if needed.', category: 'structural', months: [6, 7], icon: '\uD83C\uDFD7\uFE0F' },
  { id: 'summer-siding', title: 'Power-wash siding and walkways', description: 'Remove mildew and dirt; check for damaged or loose siding.', category: 'general_repair', months: [6, 7], icon: '\uD83D\uDD27' },
  { id: 'summer-dryer', title: 'Clean dryer vent', description: 'Lint buildup is the #1 cause of dryer fires. Clean the full vent run, not just the lint trap.', category: 'safety', months: [7, 8], icon: '\uD83D\uDD25' },

  // ── Fall (Sep-Nov) ────────────────────────────────────────────────────────
  { id: 'fall-furnace', title: 'Schedule furnace tune-up', description: 'Before heating season — inspect burner, change filter, test thermostat.', category: 'hvac', months: [9, 10, 11], icon: '\uD83D\uDD25' },
  { id: 'fall-gutters', title: 'Clean gutters after leaf drop', description: 'Remove leaves and debris before winter to prevent ice dams and overflow.', category: 'roofing', months: [10, 11], icon: '\uD83C\uDF42' },
  { id: 'fall-pipes', title: 'Insulate exposed pipes', description: 'Wrap pipes in unheated areas (basements, crawl spaces, garages) to prevent freezing.', category: 'plumbing', months: [10, 11], icon: '\uD83D\uDCA7' },
  { id: 'fall-hose', title: 'Disconnect outdoor hoses + shut off bibs', description: 'Drain hoses and turn off the indoor shut-off for exterior spigots to prevent burst pipes.', category: 'plumbing', months: [10, 11], icon: '\uD83D\uDEBF' },
  { id: 'fall-weather', title: 'Weatherstrip doors and windows', description: 'Check for drafts; replace any worn weatherstripping or caulk gaps.', category: 'windows_doors', months: [10, 11], icon: '\uD83E\uDE9F' },
  { id: 'fall-fireplace', title: 'Schedule chimney sweep + inspection', description: 'Have your fireplace and chimney professionally cleaned and inspected before use.', category: 'fireplace', months: [9, 10, 11], icon: '\uD83D\uDD25' },
  { id: 'fall-leaves', title: 'Rake leaves away from foundation', description: 'Wet leaves trap moisture against your siding and foundation, accelerating rot.', category: 'landscaping', months: [10, 11], icon: '\uD83C\uDF43' },
  { id: 'fall-detector', title: 'Test smoke + CO detectors', description: 'Replace batteries and verify all units beep when tested.', category: 'safety', months: [3, 10], icon: '\u26A0\uFE0F' },

  // ── Winter (Dec-Feb) ──────────────────────────────────────────────────────
  { id: 'winter-icedam', title: 'Watch for ice dams on roof edges', description: 'Heavy ice buildup at gutters can force water under shingles. Address with roof rake or call a pro.', category: 'roofing', months: [12, 1, 2], icon: '\u2744\uFE0F' },
  { id: 'winter-attic', title: 'Check attic insulation + ventilation', description: 'Adequate insulation prevents ice dams and reduces heating costs.', category: 'insulation', months: [12, 1], icon: '\uD83E\uDDF1' },
  { id: 'winter-electrical', title: 'Inspect electrical for holiday load', description: 'Avoid overloading outlets with space heaters and decorations. Don\u2019t daisy-chain power strips.', category: 'electrical', months: [12, 1], icon: '\u26A1' },
  { id: 'winter-radon', title: 'Test for radon (best in winter)', description: 'Closed-house winter conditions give the most accurate radon readings. Test kits are cheap.', category: 'safety', months: [1, 2], icon: '\u26A0\uFE0F' },
];

/**
 * Returns seasonal tasks relevant for the given month + categories present in the homeowner's inspection items.
 * Tasks not tied to a specific category (general_repair, safety) always show; others only show if the homeowner
 * has at least one inspection item in that category.
 */
const ALWAYS_SHOW_CATEGORIES = new Set(['safety', 'general_repair']);

export function getCurrentSeasonalTasks(month: number, relevantCategories: Set<string>): SeasonalTask[] {
  return SEASONAL_TASKS.filter(task =>
    task.months.includes(month) &&
    (ALWAYS_SHOW_CATEGORIES.has(task.category) || relevantCategories.has(task.category))
  );
}

export function getSeasonName(month: number): { name: string; icon: string } {
  if (month >= 3 && month <= 5) return { name: 'Spring', icon: '\uD83C\uDF31' };
  if (month >= 6 && month <= 8) return { name: 'Summer', icon: '\u2600\uFE0F' };
  if (month >= 9 && month <= 11) return { name: 'Fall', icon: '\uD83C\uDF41' };
  return { name: 'Winter', icon: '\u2744\uFE0F' };
}
