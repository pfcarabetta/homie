const MAPS_BASE = 'https://maps.googleapis.com/maps/api';

// Maps Homie categories to Google Places types.
const CATEGORY_TO_GOOGLE_TYPE: Record<string, string> = {
  plumbing: 'plumber',
  electrical: 'electrician',
  hvac: 'hvac_contractor',
  roofing: 'roofing_contractor',
  landscaping: 'landscaping',
  painting: 'painter',
  flooring: 'flooring_contractor',
  handyman: 'general_contractor',
  pest_control: 'pest_control_service',
  cleaning: 'house_cleaning_service',
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
}
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
  const googleType = CATEGORY_TO_GOOGLE_TYPE[params.category] ?? params.category;
  const qs = new URLSearchParams({
    location: `${params.lat},${params.lng}`,
    radius: params.radiusMeters.toString(),
    type: googleType,
    key: apiKey(),
  });

  const res = await fetch(`${MAPS_BASE}/place/nearbysearch/json?${qs}`);
  const data = (await res.json()) as NearbyResponse;
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Nearby search failed: ${data.status}`);
  }

  return (data.results ?? [])
    .filter((p) => (p.rating ?? 0) >= params.minRating)
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
