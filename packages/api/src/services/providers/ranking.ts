import { Provider } from '../../db/schema/providers';
import { ProviderScore } from '../../db/schema/provider-scores';
import { HomieScore } from '../../types/providers';

/**
 * Scores a provider on a 0–1 scale using the 5-factor weighted algorithm from the spec:
 *   Distance      25%
 *   Rating        20%
 *   Homie history 30%
 *   Response speed 15%
 *   Availability  10%
 */
export function calculateRankScore(
  provider: Provider,
  distanceMiles: number,
  maxDistanceMiles: number,
  minRating: number,
  score: ProviderScore | undefined,
  openNow: boolean | null = null,
): number {
  // Distance (25%) — closer = higher
  const distanceScore = 1 - Math.min(distanceMiles / maxDistanceMiles, 1);

  // Rating (20%) — normalize within [minRating, 5], dampen with review-count confidence
  const ratingRange = 5 - minRating;
  const normalizedRating =
    ratingRange > 0
      ? Math.max(0, (parseFloat(provider.googleRating ?? '0') - minRating) / ratingRange)
      : 0;
  const reviewConfidence = Math.min(Math.sqrt(provider.reviewCount / 50), 1); // full at 50+ reviews
  const ratingScore = normalizedRating * reviewConfidence;

  // Homie history (30%) — neutral 0.5 for providers with no history
  let historyScore = 0.5;
  if (score) {
    const acceptance = parseFloat(score.acceptanceRate ?? '0.5');
    const completion = parseFloat(score.completionRate ?? '0.5');
    const avgRating = parseFloat(score.avgHomeownerRating ?? '2.5') / 5;
    historyScore = acceptance * 0.4 + completion * 0.4 + avgRating * 0.2;
  }

  // Response speed (15%) — neutral 0.5 for new providers; ≥1 hour → 0
  let speedScore = 0.5;
  if (score?.avgResponseSec) {
    speedScore = 1 - Math.min(parseFloat(score.avgResponseSec) / 3600, 1);
  }

  // Availability (10%) — open now from Google Places; null means no data (neutral)
  const availabilityScore = openNow === true ? 1.0 : openNow === false ? 0.2 : 0.5;

  return (
    distanceScore * 0.25 +
    ratingScore * 0.20 +
    historyScore * 0.30 +
    speedScore * 0.15 +
    availabilityScore * 0.10
  );
}

/** Builds the homie_score object surfaced in the API response. */
export function buildHomieScore(score: ProviderScore | undefined): HomieScore {
  if (!score) {
    return {
      acceptance_rate: 0,
      completion_rate: 0,
      avg_homeowner_rating: 0,
      avg_response_sec: 0,
      total_jobs: 0,
    };
  }
  return {
    acceptance_rate: parseFloat(score.acceptanceRate ?? '0'),
    completion_rate: parseFloat(score.completionRate ?? '0'),
    avg_homeowner_rating: parseFloat(score.avgHomeownerRating ?? '0'),
    avg_response_sec: parseFloat(score.avgResponseSec ?? '0'),
    total_jobs: score.totalAccepted,
  };
}

/** Haversine distance between two lat/lng points, in miles. */
export function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3959; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
