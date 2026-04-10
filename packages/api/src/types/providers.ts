export type SuppressionReason = 'provider_requested' | 'rate_limited' | 'permanently_unreachable';

export interface DiscoveryParams {
  category: string;
  zipCode: string;
  radiusMiles: number;
  minRating: number;
  limit: number;
  // When set, rate-limiting is scoped to attempts made by this workspace only
  // (and uses a shorter cooldown) instead of the global 7-day window.
  workspaceId?: string;
}

export interface HomieScore {
  acceptance_rate: number;
  completion_rate: number;
  avg_homeowner_rating: number;
  avg_response_sec: number;
  total_jobs: number;
}

export interface DiscoveredProvider {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  google_place_id: string | null;
  google_rating: string | null;
  review_count: number;
  categories: string[] | null;
  distance_miles: number;
  rank_score: number;
  homie_score: HomieScore;
  channels_available: string[];
  open_now: boolean | null;
  suppressed: boolean;
  rate_limited: boolean;
  last_contacted: string | null;
}

export interface DiscoveryResult {
  providers: DiscoveredProvider[];
  total_found: number;
  filtered_out: number;
  sources: {
    google_maps: number;
    internal: number;
    yelp: number;
  };
}
