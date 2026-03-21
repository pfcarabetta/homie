import logger from '../../logger';

const YELP_BASE = 'https://api.yelp.com/v3';

// Maps Homie categories to Yelp category aliases.
const CATEGORY_TO_YELP_TERM: Record<string, string> = {
  plumbing: 'plumbers',
  electrical: 'electricians',
  hvac: 'hvac',
  roofing: 'roofing',
  landscaping: 'landscaping',
  painting: 'painters',
  flooring: 'flooring',
  handyman: 'handyman',
  pest_control: 'pestcontrol',
  cleaning: 'homecleaning',
};

export interface YelpBusiness {
  name: string;
  phone: string | null;
  rating: number;
  reviewCount: number;
  lat: number;
  lng: number;
}

// Internal shapes from Yelp Fusion Business Search response
interface YelpBizResult {
  name: string;
  phone: string;
  rating: number;
  review_count: number;
  is_closed: boolean;
  coordinates: { latitude: number; longitude: number };
}
interface YelpSearchResponse {
  businesses: YelpBizResult[];
}

/**
 * Searches Yelp Fusion for nearby businesses matching the given category.
 * Returns an empty array (with a warning) if YELP_API_KEY is not configured,
 * so discovery can still succeed using only Google Maps results.
 */
export async function searchNearby(params: {
  lat: number;
  lng: number;
  radiusMeters: number;
  category: string;
  minRating: number;
  limit: number;
}): Promise<YelpBusiness[]> {
  const apiKey = process.env.YELP_API_KEY;
  if (!apiKey) {
    logger.warn('[yelp] YELP_API_KEY not configured — skipping Yelp supplementary search');
    return [];
  }

  const term = CATEGORY_TO_YELP_TERM[params.category] ?? params.category;
  // Yelp radius is capped at 40,000 meters
  const radius = Math.min(Math.round(params.radiusMeters), 40_000);

  const qs = new URLSearchParams({
    term,
    latitude: params.lat.toString(),
    longitude: params.lng.toString(),
    radius: radius.toString(),
    limit: Math.min(params.limit, 50).toString(),
  });

  const res = await fetch(`${YELP_BASE}/businesses/search?${qs}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Yelp search failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as YelpSearchResponse;

  return data.businesses
    .filter((b) => !b.is_closed && b.rating >= params.minRating)
    .map((b) => ({
      name: b.name,
      phone: b.phone || null,
      rating: b.rating,
      reviewCount: b.review_count,
      lat: b.coordinates.latitude,
      lng: b.coordinates.longitude,
    }));
}
