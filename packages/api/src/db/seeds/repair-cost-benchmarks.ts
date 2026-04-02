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
  // Plumbing
  ...variants('plumbing', 'leak_repair', 15000, 27500, 50000),
  ...variants('plumbing', 'drain_cleaning', 10000, 17500, 25000),
  ...variants('plumbing', 'toilet_repair', 8000, 15000, 25000),
  ...variants('plumbing', 'faucet_cartridge_replacement', 12000, 18500, 25000),
  ...variants('plumbing', 'faucet_replacement', 15000, 30000, 55000),
  ...variants('plumbing', 'garbage_disposal', 15000, 30000, 45000),
  ...variants('plumbing', 'water_heater_repair', 15000, 35000, 60000),
  ...variants('plumbing', 'water_heater_replacement', 80000, 150000, 250000),
  ...variants('plumbing', 'pipe_replacement', 50000, 150000, 400000),
  ...variants('plumbing', 'slab_leak_detection', 25000, 40000, 60000),

  // Electrical
  ...variants('electrical', 'outlet_repair', 10000, 15000, 20000),
  ...variants('electrical', 'circuit_breaker_replacement', 20000, 30000, 40000),
  ...variants('electrical', 'ceiling_fan_install', 15000, 25000, 35000),
  ...variants('electrical', 'light_fixture_install', 10000, 20000, 30000),
  ...variants('electrical', 'panel_upgrade', 150000, 200000, 300000),
  ...variants('electrical', 'wiring_repair', 20000, 40000, 80000),
  ...variants('electrical', 'ev_charger_install', 50000, 90000, 150000),
  ...variants('electrical', 'generator_install', 80000, 150000, 300000),

  // HVAC
  ...variants('hvac', 'ac_tune_up', 7500, 15000, 20000),
  ...variants('hvac', 'ac_repair', 15000, 35000, 60000),
  ...variants('hvac', 'ac_replacement', 300000, 550000, 1000000),
  ...variants('hvac', 'furnace_repair', 15000, 30000, 50000),
  ...variants('hvac', 'furnace_replacement', 250000, 450000, 800000),
  ...variants('hvac', 'duct_cleaning', 25000, 40000, 70000),
  ...variants('hvac', 'thermostat_install', 15000, 25000, 35000),
  ...variants('hvac', 'capacitor_replacement', 15000, 25000, 40000),
  ...variants('hvac', 'refrigerant_recharge', 20000, 35000, 50000),
  ...variants('hvac', 'filter_replacement', 6500, 9000, 12000),

  // Appliance
  ...variants('appliance', 'refrigerator_repair', 15000, 30000, 50000),
  ...variants('appliance', 'dishwasher_repair', 10000, 22500, 35000),
  ...variants('appliance', 'washer_dryer_repair', 15000, 27500, 45000),
  ...variants('appliance', 'oven_repair', 12000, 25000, 40000),
  ...variants('appliance', 'garbage_disposal_replacement', 15000, 30000, 45000),

  // Hot Tub
  ...variants('hot_tub', 'chemical_balance', 7500, 12500, 20000),
  ...variants('hot_tub', 'drain_refill', 10000, 17500, 25000),
  ...variants('hot_tub', 'filter_cleaning', 5000, 10000, 15000),
  ...variants('hot_tub', 'jet_repair', 15000, 25000, 40000),
  ...variants('hot_tub', 'heater_repair', 20000, 35000, 55000),
  ...variants('hot_tub', 'cover_replacement', 20000, 40000, 70000),
  ...variants('hot_tub', 'general_service', 8000, 15000, 25000),

  // Pool
  ...variants('pool', 'weekly_service', 8000, 12500, 15000),
  ...variants('pool', 'chemical_balance', 8000, 15000, 25000),
  ...variants('pool', 'pump_repair', 15000, 30000, 50000),
  ...variants('pool', 'filter_replacement', 15000, 30000, 50000),
  ...variants('pool', 'leak_detection', 25000, 40000, 60000),
  ...variants('pool', 'equipment_inspection', 10000, 15000, 20000),
  ...variants('pool', 'resurfacing', 300000, 600000, 1200000),

  // General / Handyman
  ...variants('general', 'drywall_repair', 15000, 25000, 40000),
  ...variants('general', 'painting_interior', 20000, 40000, 80000),
  ...variants('general', 'door_repair', 10000, 20000, 35000),
  ...variants('general', 'window_repair', 15000, 30000, 55000),
  ...variants('general', 'furniture_assembly', 8000, 15000, 25000),
  ...variants('general', 'tv_mounting', 10000, 17500, 25000),
  ...variants('general', 'shelving_install', 10000, 17500, 30000),

  // Roofing
  ...variants('roofing', 'leak_repair', 25000, 45000, 80000),
  ...variants('roofing', 'shingle_replacement', 30000, 60000, 120000),
  ...variants('roofing', 'gutter_cleaning', 10000, 17500, 25000),
  ...variants('roofing', 'gutter_repair', 15000, 25000, 45000),

  // Landscaping
  ...variants('landscaping', 'lawn_maintenance', 5000, 10000, 20000),
  ...variants('landscaping', 'tree_trimming', 20000, 40000, 80000),
  ...variants('landscaping', 'sprinkler_repair', 10000, 20000, 35000),
  ...variants('landscaping', 'hedge_trimming', 8000, 15000, 25000),
  ...variants('landscaping', 'yard_cleanup', 10000, 20000, 35000),

  // Cleaning
  ...variants('cleaning', 'turnover_clean', 10000, 17500, 25000),
  ...variants('cleaning', 'deep_clean', 15000, 27500, 45000),
  ...variants('cleaning', 'carpet_cleaning', 10000, 20000, 35000),
  ...variants('cleaning', 'window_cleaning', 10000, 20000, 35000),
  ...variants('cleaning', 'pressure_washing', 15000, 25000, 40000),
  ...variants('cleaning', 'steam_cleaning', 12000, 22500, 35000),

  // Pest Control
  ...variants('pest_control', 'general_treatment', 10000, 15000, 20000),
  ...variants('pest_control', 'termite_treatment', 25000, 50000, 100000),
  ...variants('pest_control', 'rodent_prevention', 10000, 17500, 25000),

  // Locksmith
  ...variants('locksmith', 'lockout_service', 7500, 12500, 20000),
  ...variants('locksmith', 'rekey_locks', 10000, 17500, 25000),
  ...variants('locksmith', 'new_lock_install', 15000, 25000, 40000),
  ...variants('locksmith', 'smart_lock_setup', 15000, 30000, 50000),

  // Concrete / Masonry
  ...variants('concrete', 'crack_repair', 15000, 30000, 50000),
  ...variants('concrete', 'new_driveway', 200000, 400000, 800000),
  ...variants('masonry', 'brick_repair', 20000, 40000, 70000),
  ...variants('masonry', 'retaining_wall', 100000, 300000, 600000),

  // Fencing
  ...variants('fencing', 'fence_repair', 15000, 30000, 50000),
  ...variants('fencing', 'new_fence', 150000, 350000, 700000),
  ...variants('fencing', 'gate_repair', 10000, 20000, 35000),

  // Painting
  ...variants('painting', 'interior_room', 15000, 30000, 50000),
  ...variants('painting', 'exterior', 200000, 400000, 800000),
  ...variants('painting', 'cabinet_painting', 100000, 250000, 500000),
  ...variants('painting', 'touch_ups', 10000, 17500, 25000),

  // Flooring / Tile
  ...variants('flooring', 'repair', 15000, 30000, 50000),
  ...variants('flooring', 'new_install', 200000, 500000, 1000000),
  ...variants('tile', 'repair', 15000, 25000, 40000),
  ...variants('tile', 'backsplash', 30000, 60000, 100000),

  // Remodeling
  ...variants('kitchen_remodel', 'cosmetic_update', 300000, 800000, 2000000),
  ...variants('bathroom_remodel', 'cosmetic_update', 200000, 500000, 1500000),

  // Garage Door
  ...variants('garage_door', 'opener_repair', 15000, 25000, 40000),
  ...variants('garage_door', 'spring_replacement', 15000, 25000, 35000),
  ...variants('garage_door', 'full_replacement', 80000, 150000, 250000),

  // Security
  ...variants('security_systems', 'camera_install', 20000, 40000, 80000),
  ...variants('security_systems', 'alarm_install', 30000, 60000, 120000),
  ...variants('security_systems', 'doorbell_camera', 15000, 25000, 40000),

  // Inspection
  ...variants('inspection', 'pre_guest_walkthrough', 5000, 7500, 10000),
  ...variants('inspection', 'quarterly_maintenance', 7500, 12500, 15000),
  ...variants('inspection', 'annual_safety', 15000, 25000, 40000),

  // Restocking / Supplies
  ...variants('restocking', 'post_checkout_restock', 3000, 5000, 7500),
  ...variants('restocking', 'welcome_package', 2500, 5000, 7500),

  // Trash
  ...variants('trash', 'scheduled_pickup', 2500, 3500, 5000),
  ...variants('trash', 'bulk_removal', 10000, 20000, 35000),

  // Photography
  ...variants('photography', 'property_listing', 15000, 30000, 50000),
  ...variants('photography', 'aerial_drone', 20000, 35000, 60000),
  ...variants('photography', 'virtual_tour', 20000, 40000, 70000),
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
