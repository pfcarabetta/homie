// Mock DB so the service can import.
jest.mock('../../db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));

import { scoreBandFor } from '../../db/schema/home-health-scores';
import { FACTOR_WEIGHTS } from '../health-score';

describe('scoreBandFor (band thresholds)', () => {
  it.each([
    [100, 'excellent'],
    [85, 'excellent'],
    [84, 'good'],
    [70, 'good'],
    [69, 'needs_work'],
    [50, 'needs_work'],
    [49, 'concerning'],
    [0, 'concerning'],
  ] as Array<[number, string]>)('score=%i → %s', (score, band) => {
    expect(scoreBandFor(score)).toBe(band);
  });
});

describe('FACTOR_WEIGHTS', () => {
  it('weights sum to 1.0 (within float tolerance)', () => {
    const sum = Object.values(FACTOR_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.001);
  });

  it('matches the spec breakdown', () => {
    expect(FACTOR_WEIGHTS.maintenance_compliance).toBeCloseTo(0.35, 5);
    expect(FACTOR_WEIGHTS.item_health).toBeCloseTo(0.25, 5);
    expect(FACTOR_WEIGHTS.asset_health).toBeCloseTo(0.2, 5);
    expect(FACTOR_WEIGHTS.inspection_recency).toBeCloseTo(0.1, 5);
    expect(FACTOR_WEIGHTS.warranty_coverage).toBeCloseTo(0.1, 5);
  });
});
