// Stub the db module so the engine imports cleanly. computeNextVisits is
// pure date math (no DB calls); the mock just keeps `import { db }` from
// blowing up when DATABASE_URL isn't set in the test env.
jest.mock('../../db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
}));

import { computeNextVisits } from '../vendor-schedule-engine';

/**
 * Pure date-math tests — no DB. Uses fixed `now` values to make
 * assertions deterministic across timezones / DST.
 */

const NOW = new Date('2026-05-01T00:00:00Z'); // Friday, May 1 2026 UTC

describe('computeNextVisits — weekly', () => {
  it('emits one visit per week on the chosen day', () => {
    const visits = computeNextVisits(
      { pattern: 'weekly', dayOfWeek: 2, scheduleTime: '09:00:00' }, // Tuesday
      NOW,
      30,
    );
    // First Tuesday on/after May 1 2026 is May 5; cadence weekly → ~4 visits in 30d
    expect(visits.length).toBeGreaterThanOrEqual(4);
    expect(visits.length).toBeLessThanOrEqual(5);
    for (const v of visits) {
      expect(v.getUTCDay()).toBe(2);
      expect(v.getUTCHours()).toBe(9);
    }
  });

  it('returns [] when dayOfWeek is missing', () => {
    expect(
      computeNextVisits({ pattern: 'weekly', scheduleTime: '09:00' }, NOW, 30),
    ).toEqual([]);
  });
});

describe('computeNextVisits — biweekly', () => {
  it('biweekly_even emits only even weeks', () => {
    const visits = computeNextVisits(
      { pattern: 'biweekly_even', dayOfWeek: 3, scheduleTime: '10:00' }, // Wed
      NOW,
      60,
    );
    // Two visits in 30d for biweekly cadence; in 60d → ~4
    expect(visits.length).toBeGreaterThanOrEqual(3);
    for (const v of visits) {
      expect(v.getUTCDay()).toBe(3);
    }
    // No two consecutive weeks present
    for (let i = 1; i < visits.length; i++) {
      const diffDays = (visits[i].getTime() - visits[i - 1].getTime()) / (24 * 60 * 60 * 1000);
      expect(diffDays).toBe(14);
    }
  });
});

describe('computeNextVisits — monthly_date', () => {
  it('emits the same date each month within horizon', () => {
    const visits = computeNextVisits(
      { pattern: 'monthly_date', dayOfMonth: 15, scheduleTime: '09:00' },
      NOW,
      90,
    );
    expect(visits.length).toBeGreaterThanOrEqual(3); // 3 months in 90 days
    for (const v of visits) {
      expect(v.getUTCDate()).toBe(15);
      expect(v.getUTCHours()).toBe(9);
    }
  });

  it('skips months where the day-of-month overflows (e.g. Feb 30)', () => {
    const visits = computeNextVisits(
      { pattern: 'monthly_date', dayOfMonth: 31 },
      new Date('2026-01-31T00:00:00Z'),
      90,
    );
    // 31 only valid in months with 31 days (Jan, Mar, May)
    for (const v of visits) {
      expect([0, 2, 4, 6, 7, 9, 11]).toContain(v.getUTCMonth());
      expect(v.getUTCDate()).toBe(31);
    }
  });
});

describe('computeNextVisits — monthly_nth_day', () => {
  it("first_tuesday emits the first Tuesday of each month", () => {
    const visits = computeNextVisits(
      { pattern: 'monthly_nth_day', nthWeekday: 'first_tuesday', scheduleTime: '10:00' },
      NOW,
      90,
    );
    expect(visits.length).toBeGreaterThanOrEqual(3);
    for (const v of visits) {
      expect(v.getUTCDay()).toBe(2);
      expect(v.getUTCDate()).toBeLessThanOrEqual(7); // first occurrence is in first week
    }
  });

  it('last_friday emits the last Friday of each month', () => {
    const visits = computeNextVisits(
      { pattern: 'monthly_nth_day', nthWeekday: 'last_friday' },
      NOW,
      90,
    );
    expect(visits.length).toBeGreaterThan(0);
    for (const v of visits) {
      expect(v.getUTCDay()).toBe(5);
      // "Last" means there's no Friday after it in the same month
      const next = new Date(v);
      next.setUTCDate(v.getUTCDate() + 7);
      expect(next.getUTCMonth()).not.toBe(v.getUTCMonth());
    }
  });

  it('returns [] for an unparseable nthWeekday', () => {
    expect(
      computeNextVisits({ pattern: 'monthly_nth_day', nthWeekday: 'fifteenth_dragday' }, NOW, 30),
    ).toEqual([]);
  });
});

describe('computeNextVisits — quarterly', () => {
  it('emits visits 3 months apart on the chosen day-of-month', () => {
    const visits = computeNextVisits(
      { pattern: 'quarterly', dayOfMonth: 1, scheduleTime: '09:00' },
      NOW,
      365,
    );
    // 4 quarters per year — should hit every quarter
    expect(visits.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < visits.length; i++) {
      const monthDelta =
        (visits[i].getUTCFullYear() - visits[i - 1].getUTCFullYear()) * 12 +
        (visits[i].getUTCMonth() - visits[i - 1].getUTCMonth());
      expect(monthDelta).toBe(3);
    }
  });
});

describe('computeNextVisits — custom', () => {
  it('emits only the dates within the horizon', () => {
    const visits = computeNextVisits(
      {
        pattern: 'custom',
        customDates: ['2026-05-10', '2026-05-20', '2026-08-01'], // 3rd is past 30d horizon
        scheduleTime: '14:00',
      },
      NOW,
      30,
    );
    expect(visits).toHaveLength(2);
    expect(visits[0].toISOString().startsWith('2026-05-10')).toBe(true);
    expect(visits[0].getUTCHours()).toBe(14);
  });

  it('returns [] when customDates is missing', () => {
    expect(
      computeNextVisits({ pattern: 'custom', scheduleTime: '14:00' }, NOW, 30),
    ).toEqual([]);
  });
});

describe('computeNextVisits — guard rails', () => {
  it('returns [] for non-positive horizon', () => {
    expect(
      computeNextVisits({ pattern: 'weekly', dayOfWeek: 1, scheduleTime: '09:00' }, NOW, 0),
    ).toEqual([]);
    expect(
      computeNextVisits({ pattern: 'weekly', dayOfWeek: 1, scheduleTime: '09:00' }, NOW, -7),
    ).toEqual([]);
  });

  it('defaults time to 09:00 when schedule_time is missing', () => {
    const [first] = computeNextVisits(
      { pattern: 'weekly', dayOfWeek: 1 },
      NOW,
      14,
    );
    expect(first.getUTCHours()).toBe(9);
  });
});
