import { db } from '../index';
import { repairCostData } from '../schema/cost-estimates';

export const REGIONAL_MULTIPLIERS: Record<string, number> = {
  'san_diego': 1.05, 'phoenix': 0.95, 'miami': 1.10, 'nashville': 0.90,
  'los_angeles': 1.15, 'new_york': 1.25, 'denver': 1.00, 'austin': 0.98,
  'seattle': 1.10, 'chicago': 1.05, 'national': 1.00,
};

interface BenchmarkEntry {
  category: string;
  subcategory: string;
  complexity: string;
  quotedPriceCents: number;
}

// Each subcategory gets low/mid/high variants
function variants(category: string, subcategory: string, lowCents: number, midCents: number, highCents: number): BenchmarkEntry[] {
  return [
    { category, subcategory, complexity: 'simple', quotedPriceCents: lowCents },
    { category, subcategory, complexity: 'moderate', quotedPriceCents: midCents },
    { category, subcategory, complexity: 'complex', quotedPriceCents: highCents },
  ];
}

const BENCHMARKS: BenchmarkEntry[] = [
  // Plumbing (8 subcategories)
  ...variants('plumbing', 'leak_repair', 15000, 27500, 50000),
  ...variants('plumbing', 'drain_cleaning', 10000, 22500, 40000),
  ...variants('plumbing', 'toilet_repair', 12000, 25000, 45000),
  ...variants('plumbing', 'water_heater_repair', 15000, 35000, 80000),
  ...variants('plumbing', 'water_heater_replacement', 80000, 150000, 300000),
  ...variants('plumbing', 'pipe_replacement', 50000, 150000, 400000),
  ...variants('plumbing', 'faucet_replacement', 15000, 30000, 55000),
  ...variants('plumbing', 'garbage_disposal', 15000, 30000, 50000),

  // Electrical (5 subcategories)
  ...variants('electrical', 'outlet_repair', 10000, 20000, 35000),
  ...variants('electrical', 'panel_upgrade', 100000, 200000, 400000),
  ...variants('electrical', 'ceiling_fan_install', 15000, 30000, 50000),
  ...variants('electrical', 'light_fixture_install', 10000, 22500, 40000),
  ...variants('electrical', 'wiring_repair', 20000, 50000, 120000),

  // HVAC (6 subcategories)
  ...variants('hvac', 'ac_repair', 15000, 40000, 90000),
  ...variants('hvac', 'furnace_repair', 15000, 40000, 80000),
  ...variants('hvac', 'ac_replacement', 300000, 550000, 1000000),
  ...variants('hvac', 'furnace_replacement', 250000, 450000, 800000),
  ...variants('hvac', 'duct_cleaning', 25000, 45000, 80000),
  ...variants('hvac', 'thermostat_install', 15000, 25000, 50000),

  // Appliance (4 subcategories)
  ...variants('appliance', 'refrigerator_repair', 15000, 35000, 70000),
  ...variants('appliance', 'dishwasher_repair', 10000, 25000, 45000),
  ...variants('appliance', 'washer_dryer_repair', 15000, 30000, 55000),
  ...variants('appliance', 'oven_repair', 12000, 27500, 50000),

  // General (4 subcategories)
  ...variants('general', 'drywall_repair', 15000, 35000, 75000),
  ...variants('general', 'painting_interior', 20000, 50000, 120000),
  ...variants('general', 'door_repair', 10000, 25000, 50000),
  ...variants('general', 'window_repair', 15000, 35000, 80000),

  // Roofing (3 subcategories)
  ...variants('roofing', 'leak_repair', 25000, 55000, 120000),
  ...variants('roofing', 'shingle_replacement', 30000, 80000, 200000),
  ...variants('roofing', 'gutter_repair', 15000, 30000, 60000),

  // Landscaping (3 subcategories)
  ...variants('landscaping', 'lawn_maintenance', 5000, 12500, 25000),
  ...variants('landscaping', 'tree_trimming', 20000, 50000, 120000),
  ...variants('landscaping', 'sprinkler_repair', 10000, 22500, 45000),

  // Cleaning (3 subcategories)
  ...variants('cleaning', 'deep_clean', 15000, 30000, 55000),
  ...variants('cleaning', 'carpet_cleaning', 10000, 22500, 45000),
  ...variants('cleaning', 'pressure_washing', 15000, 30000, 55000),

  // Pool (3 subcategories)
  ...variants('pool', 'pump_repair', 15000, 35000, 70000),
  ...variants('pool', 'filter_replacement', 20000, 40000, 75000),
  ...variants('pool', 'resurfacing', 300000, 600000, 1200000),

  // Pest Control (2 subcategories)
  ...variants('pest_control', 'general_treatment', 10000, 20000, 40000),
  ...variants('pest_control', 'termite_treatment', 25000, 60000, 150000),
];

export async function seedBenchmarks(): Promise<void> {
  const rows = BENCHMARKS.map((b) => ({
    category: b.category,
    subcategory: b.subcategory,
    complexity: b.complexity,
    quotedPriceCents: b.quotedPriceCents,
    region: 'national',
    dataSource: 'industry_benchmark' as const,
  }));

  await db.insert(repairCostData).values(rows);
  console.log(`Seeded ${rows.length} benchmark rows`);
}
