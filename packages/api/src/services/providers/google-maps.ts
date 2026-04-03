const MAPS_BASE = 'https://maps.googleapis.com/maps/api';

// Maps Homie categories to Google Places types.
const CATEGORY_TO_GOOGLE_TYPE: Record<string, string> = {
  // Repair
  plumbing: 'plumber',
  electrical: 'electrician',
  hvac: 'hvac_contractor',
  appliance: 'appliance_repair_service',
  roofing: 'roofing_contractor',
  general: 'general_contractor',
  garage_door: 'garage_door_supplier',
  // Electrical subcategories — all map to electrician
  ev_charger_install: 'electrician',
  generator_install: 'electrician',
  solar: 'solar_energy_contractor',
  security_systems: 'electrician',
  // Plumbing subcategories
  water_heater: 'plumber',
  septic_sewer: 'plumber',
  sprinkler_irrigation: 'landscaper',
  // HVAC subcategories
  chimney: 'general_contractor',
  insulation: 'insulation_contractor',
  // Services
  house_cleaning: 'house_cleaning_service',
  cleaning: 'house_cleaning_service',
  landscaping: 'landscaper',
  pool: 'swimming_pool_contractor',
  hot_tub: 'swimming_pool_contractor',
  pest_control: 'pest_control_service',
  painting: 'painter',
  moving: 'moving_company',
  pressure_washing: 'pressure_washing_service',
  locksmith: 'locksmith',
  // Structural
  handyman: 'general_contractor',
  drywall: 'general_contractor',
  flooring: 'flooring_contractor',
  tile: 'flooring_contractor',
  fence: 'fence_contractor',
  fencing: 'fence_contractor',
  tree_trimming: 'tree_service',
  gutter: 'gutter_cleaning_service',
  carpet_cleaning: 'carpet_cleaning_service',
  window_cleaning: 'window_cleaning_service',
  steam_cleaning: 'carpet_cleaning_service',
  concrete: 'concrete_contractor',
  masonry: 'masonry_contractor',
  siding: 'siding_contractor',
  security: 'electrician',
  // Property ops
  trash: 'waste_management',
  junk_removal: 'moving_company',
  // Remodeling
  kitchen_remodel: 'general_contractor',
  bathroom_remodel: 'general_contractor',
  // Other
  window_door_install: 'general_contractor',
  deck_patio: 'general_contractor',
  foundation_waterproofing: 'general_contractor',
  welding_metal_work: 'general_contractor',
  tv_mounting: 'general_contractor',
  furniture_assembly: 'general_contractor',
  photography: 'photographer',
};

export interface NearbyPlace {
  placeId: string;
  name: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  openNow: boolean | null;
}

export interface PlaceDetails {
  phone: string | null;
  website: string | null;
}

// --- Internal response shapes from the Google Maps REST API ---

interface GeoResult {
  geometry: { location: { lat: number; lng: number } };
}
interface GeocodeResponse {
  status: string;
  results: GeoResult[];
}

interface PlaceResult {
  place_id: string;
  name: string;
  geometry: { location: { lat: number; lng: number } };
  rating?: number;
  user_ratings_total?: number;
  opening_hours?: { open_now?: boolean };
  types?: string[];
}

// Override the keyword used in search (when category name alone is misleading)
const CATEGORY_KEYWORD_OVERRIDE: Record<string, string> = {
  ev_charger_install: 'electrician',
  generator_install: 'electrician generator',
  security_systems: 'security system installer',
  water_heater: 'water heater plumber',
  septic_sewer: 'septic sewer plumber',
  sprinkler_irrigation: 'sprinkler irrigation',
  hot_tub: 'hot tub spa repair',
  drywall: 'drywall contractor',
  tv_mounting: 'handyman',
  furniture_assembly: 'handyman',
  deck_patio: 'deck patio contractor',
  foundation_waterproofing: 'waterproofing contractor',
  welding_metal_work: 'welding fabrication',
  kitchen_remodel: 'kitchen remodeling',
  bathroom_remodel: 'bathroom remodeling',
  window_door_install: 'window door installation',
  junk_removal: 'junk removal hauling',
  photography: 'real estate photographer',
};

// Business types that indicate non-service businesses (filter these out)
const EXCLUDED_TYPES = new Set([
  'store', 'shopping_mall', 'supermarket', 'grocery_or_supermarket',
  'department_store', 'clothing_store', 'convenience_store',
  'restaurant', 'food', 'cafe', 'bar', 'bakery',
  'bank', 'atm', 'finance', 'insurance_agency',
  'hospital', 'doctor', 'dentist', 'pharmacy', 'drugstore',
  'gas_station', 'car_dealer', 'car_rental', 'car_wash',
  'electric_vehicle_charging_station',
  'gym', 'spa', 'beauty_salon', 'hair_care',
  'church', 'school', 'university', 'library',
  'lodging', 'hotel', 'travel_agency',
  'movie_theater', 'amusement_park', 'museum',
  'post_office', 'local_government_office', 'courthouse',
]);
interface NearbyResponse {
  status: string;
  results?: PlaceResult[];
}

interface DetailsResponse {
  status: string;
  result: {
    formatted_phone_number?: string;
    international_phone_number?: string;
    website?: string;
  };
}

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_API_KEY is not set');
  return key;
}

export async function geocodeZip(zipCode: string): Promise<{ lat: number; lng: number }> {
  const url = `${MAPS_BASE}/geocode/json?address=${encodeURIComponent(zipCode)}&key=${apiKey()}`;
  const res = await fetch(url);
  const data = (await res.json()) as GeocodeResponse;
  if (data.status !== 'OK' || data.results.length === 0) {
    throw new Error(`Geocoding failed for zip ${zipCode}: ${data.status}`);
  }
  return data.results[0].geometry.location;
}

export async function searchNearby(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  category: string;
  minRating: number;
}): Promise<NearbyPlace[]> {
  const googleType = CATEGORY_TO_GOOGLE_TYPE[params.category];
  const keyword = CATEGORY_KEYWORD_OVERRIDE[params.category] ?? params.category.replace(/_/g, ' ');
  const qs = new URLSearchParams({
    location: `${params.lat},${params.lng}`,
    radius: params.radiusMeters.toString(),
    keyword,
    key: apiKey(),
  });
  if (googleType) {
    qs.set('type', googleType);
  }

  const res = await fetch(`${MAPS_BASE}/place/nearbysearch/json?${qs}`);
  const data = (await res.json()) as NearbyResponse;
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Nearby search failed: ${data.status}`);
  }

  return (data.results ?? [])
    .filter((p) => {
      // Must meet minimum rating
      if ((p.rating ?? 0) < params.minRating) return false;
      // Filter out non-service businesses (retail, restaurants, etc.)
      if (p.types?.some(t => EXCLUDED_TYPES.has(t))) return false;
      return true;
    })
    .map((p) => ({
      placeId: p.place_id,
      name: p.name,
      lat: p.geometry.location.lat,
      lng: p.geometry.location.lng,
      rating: p.rating ?? 0,
      reviewCount: p.user_ratings_total ?? 0,
      openNow: p.opening_hours?.open_now ?? null,
    }));
}

export async function getPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const qs = new URLSearchParams({
    place_id: placeId,
    fields: 'formatted_phone_number,international_phone_number,website',
    key: apiKey(),
  });

  const res = await fetch(`${MAPS_BASE}/place/details/json?${qs}`);
  const data = (await res.json()) as DetailsResponse;
  if (data.status !== 'OK') {
    return { phone: null, website: null };
  }
  return {
    phone: data.result.international_phone_number ?? data.result.formatted_phone_number ?? null,
    website: data.result.website ?? null,
  };
}
