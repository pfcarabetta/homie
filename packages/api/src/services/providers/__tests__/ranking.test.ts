import { calculateRankScore, haversineDistanceMiles } from '../ranking';
import { Provider } from '../../../db/schema/providers';
import { ProviderScore } from '../../../db/schema/provider-scores';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_PROVIDER: Provider = {
  id: 'p1',
  name: 'Test Provider',
  phone: '555-1234',
  email: null,
  website: null,
  googlePlaceId: 'place-1',
  googleRating: '4.5',
  reviewCount: 100,
  categories: ['plumbing'],
  location: null,
  discoveredAt: new Date(),
};

const BASE_SCORE: ProviderScore = {
  id: 'score-1',
  providerId: 'p1',
  acceptanceRate: '0.8',
  completionRate: '0.9',
  avgHomeownerRating: '4.0',
  avgResponseSec: '300',
  totalOutreach: 20,
  totalAccepted: 16,
  updatedAt: new Date(),
};

// ─── calculateRankScore ───────────────────────────────────────────────────────

describe('calculateRankScore', () => {
  it('returns a score between 0 and 1', () => {
    const score = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('closer providers score higher (distance factor)', () => {
    const near = calculateRankScore(BASE_PROVIDER, 1, 15, 4.0, BASE_SCORE, null);
    const far = calculateRankScore(BASE_PROVIDER, 14, 15, 4.0, BASE_SCORE, null);
    expect(near).toBeGreaterThan(far);
  });

  describe('availability score (openNow)', () => {
    it('openNow=true gives higher score than null', () => {
      const open = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, true);
      const neutral = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, null);
      expect(open).toBeGreaterThan(neutral);
    });

    it('openNow=false gives lower score than null', () => {
      const closed = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, false);
      const neutral = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, null);
      expect(closed).toBeLessThan(neutral);
    });

    it('openNow=true gives higher score than openNow=false', () => {
      const open = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, true);
      const closed = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, false);
      expect(open).toBeGreaterThan(closed);
    });

    it('openNow difference is exactly 10% weight * (1.0 - 0.2) = 0.08', () => {
      const open = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, true);
      const closed = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, false);
      expect(open - closed).toBeCloseTo(0.08, 10);
    });

    it('openNow defaults to null when not provided', () => {
      const withNull = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, null);
      const withDefault = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE);
      expect(withNull).toBeCloseTo(withDefault, 10);
    });
  });

  it('provider with no history uses neutral 0.5 for history and speed', () => {
    const withHistory = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, BASE_SCORE, null);
    const noHistory = calculateRankScore(BASE_PROVIDER, 5, 15, 4.0, undefined, null);
    // With history score > 0.5 (good acceptance/completion), no-history should be lower
    expect(withHistory).toBeGreaterThan(noHistory);
  });

  it('provider at max distance gets distance score of 0', () => {
    // Distance score = 0 → only other factors contribute
    const atMax = calculateRankScore(BASE_PROVIDER, 15, 15, 4.0, undefined, null);
    // With all neutral scores (0.5): 0*0.25 + ratingScore*0.20 + 0.5*0.30 + 0.5*0.15 + 0.5*0.10
    expect(atMax).toBeGreaterThanOrEqual(0);
    expect(atMax).toBeLessThan(1);
  });
});

// ─── haversineDistanceMiles ───────────────────────────────────────────────────

describe('haversineDistanceMiles', () => {
  it('returns 0 for identical coordinates', () => {
    expect(haversineDistanceMiles(34.05, -118.24, 34.05, -118.24)).toBeCloseTo(0, 5);
  });

  it('LA to NYC is approximately 2445 miles', () => {
    // LA: 34.05, -118.24  NYC: 40.71, -74.01
    const dist = haversineDistanceMiles(34.05, -118.24, 40.71, -74.01);
    expect(dist).toBeGreaterThan(2400);
    expect(dist).toBeLessThan(2500);
  });

  it('is symmetric', () => {
    const d1 = haversineDistanceMiles(34.05, -118.24, 37.77, -122.41);
    const d2 = haversineDistanceMiles(37.77, -122.41, 34.05, -118.24);
    expect(d1).toBeCloseTo(d2, 5);
  });
});
