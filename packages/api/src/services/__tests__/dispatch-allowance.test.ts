// Mock DB so the service can import without a live connection.
jest.mock('../../db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));

import {
  computeAllowance,
  periodKeyFor,
  PLUS_MONTHLY_BANK_CAP,
  PLUS_MONTHLY_GRANT,
  DISPATCH_PAY_PER_ITEM_CENTS,
  DISPATCH_PAY_PER_BUNDLE_SMALL_CENTS,
  DISPATCH_PAY_PER_BUNDLE_LARGE_CENTS,
} from '../dispatch-allowance';
import { DispatchAllowanceLedgerRow } from '../../db/schema/dispatch-allowance';

const HOMEOWNER_ID = '11111111-1111-1111-1111-111111111111';

function row(partial: Partial<DispatchAllowanceLedgerRow>): DispatchAllowanceLedgerRow {
  return {
    id: partial.id ?? 'r-' + Math.random(),
    homeownerId: partial.homeownerId ?? HOMEOWNER_ID,
    reason: partial.reason ?? 'monthly_grant',
    delta: partial.delta ?? 0,
    sourceId: partial.sourceId ?? null,
    expiresAt: partial.expiresAt ?? null,
    notes: partial.notes ?? null,
    createdAt: partial.createdAt ?? new Date('2026-05-01T00:00:00Z'),
  };
}

const NOW = new Date('2026-05-15T12:00:00Z');

describe('computeAllowance — Premier subscriber', () => {
  it('always returns unlimited regardless of ledger state', () => {
    const a = computeAllowance({
      homeownerId: HOMEOWNER_ID,
      tier: 'premier',
      source: 'direct_subscription',
      membershipExpiresAt: null,
      rows: [
        row({ reason: 'monthly_grant', delta: 3 }),
        row({ reason: 'consume_monthly', delta: -1 }),
      ],
      now: NOW,
    });
    expect(a.hasUnlimited).toBe(true);
    expect(a.unlimitedUntil).toBeNull();
    expect(a.effectiveTier).toBe('premier');
    // Bank values are reset for premier — they don't apply.
    expect(a.monthlyBank).toBe(0);
    expect(a.proBundleCredits).toBe(0);
  });
});

describe('computeAllowance — Inspect Premium bundle', () => {
  it('reports unlimited until the unlimited_grant expiry', () => {
    const expires = new Date('2027-05-15T12:00:00Z');
    const a = computeAllowance({
      homeownerId: HOMEOWNER_ID,
      tier: 'plus', // tier is 'plus' during the bundle window
      source: 'inspect_premium_bundle',
      membershipExpiresAt: expires,
      rows: [
        row({ reason: 'unlimited_grant', delta: 0, expiresAt: expires, sourceId: 'cs_test_xxx' }),
      ],
      now: NOW,
    });
    expect(a.hasUnlimited).toBe(true);
    expect(a.unlimitedUntil).toEqual(expires);
    expect(a.effectiveTier).toBe('plus');
    expect(a.membershipSource).toBe('inspect_premium_bundle');
  });

  it('falls back to plus monthly bank when the unlimited grant has expired', () => {
    const longAgo = new Date('2025-05-15T12:00:00Z');
    const a = computeAllowance({
      homeownerId: HOMEOWNER_ID,
      tier: 'plus',
      source: 'inspect_premium_bundle',
      membershipExpiresAt: longAgo,
      rows: [
        row({ reason: 'unlimited_grant', delta: 0, expiresAt: longAgo }),
        row({ reason: 'monthly_grant', delta: 3, sourceId: '2026-05' }),
      ],
      now: NOW,
    });
    expect(a.hasUnlimited).toBe(false);
    expect(a.monthlyBank).toBe(3);
    expect(a.effectiveTier).toBe('plus');
  });
});

describe('computeAllowance — monthly bank math', () => {
  it('sums monthly_grants minus consume_monthly', () => {
    const a = computeAllowance({
      homeownerId: HOMEOWNER_ID,
      tier: 'plus',
      source: 'direct_subscription',
      membershipExpiresAt: null,
      rows: [
        row({ reason: 'monthly_grant', delta: 3, sourceId: '2026-03' }),
        row({ reason: 'monthly_grant', delta: 3, sourceId: '2026-04' }),
        row({ reason: 'consume_monthly', delta: -1 }),
        row({ reason: 'consume_monthly', delta: -1 }),
        row({ reason: 'monthly_grant', delta: 3, sourceId: '2026-05' }),
      ],
      now: NOW,
    });
    expect(a.monthlyBank).toBe(7); // 3+3-1-1+3
    expect(a.proBundleCredits).toBe(0);
    expect(a.hasUnlimited).toBe(false);
  });

  it('clamps a negative monthly bank to 0 (defensive — should never happen)', () => {
    const a = computeAllowance({
      homeownerId: HOMEOWNER_ID,
      tier: 'plus',
      source: 'direct_subscription',
      membershipExpiresAt: null,
      rows: [
        row({ reason: 'consume_monthly', delta: -1 }),
        row({ reason: 'consume_monthly', delta: -1 }),
      ],
      now: NOW,
    });
    expect(a.monthlyBank).toBe(0);
  });

  it('treats manual_adjustment rows as monthly bank delta', () => {
    const a = computeAllowance({
      homeownerId: HOMEOWNER_ID,
      tier: 'plus',
      source: 'direct_subscription',
      membershipExpiresAt: null,
      rows: [
        row({ reason: 'monthly_grant', delta: 3, sourceId: '2026-05' }),
        row({ reason: 'manual_adjustment', delta: 2, notes: 'Goodwill credit' }),
      ],
      now: NOW,
    });
    expect(a.monthlyBank).toBe(5);
  });
});

describe('computeAllowance — pro bundle pool', () => {
  it('tracks pro_bundle_grant + consume_pro_bundle separately from monthly', () => {
    const a = computeAllowance({
      homeownerId: HOMEOWNER_ID,
      tier: 'free',
      source: null,
      membershipExpiresAt: null,
      rows: [
        row({ reason: 'pro_bundle_grant', delta: 1, sourceId: 'cs_pro_xxx' }),
      ],
      now: NOW,
    });
    expect(a.proBundleCredits).toBe(1);
    expect(a.monthlyBank).toBe(0);
    expect(a.hasUnlimited).toBe(false);
  });

  it('drops pro bundle credits to 0 after consume', () => {
    const a = computeAllowance({
      homeownerId: HOMEOWNER_ID,
      tier: 'free',
      source: null,
      membershipExpiresAt: null,
      rows: [
        row({ reason: 'pro_bundle_grant', delta: 1, sourceId: 'cs_pro_xxx' }),
        row({ reason: 'consume_pro_bundle', delta: -1 }),
      ],
      now: NOW,
    });
    expect(a.proBundleCredits).toBe(0);
  });
});

describe('computeAllowance — Free tier baseline', () => {
  it('returns zero balance and pay-per-action prices', () => {
    const a = computeAllowance({
      homeownerId: HOMEOWNER_ID,
      tier: 'free',
      source: null,
      membershipExpiresAt: null,
      rows: [],
      now: NOW,
    });
    expect(a.hasUnlimited).toBe(false);
    expect(a.monthlyBank).toBe(0);
    expect(a.proBundleCredits).toBe(0);
    expect(a.payPerItemCents).toBe(DISPATCH_PAY_PER_ITEM_CENTS);
    expect(a.payPerBundleSmallCents).toBe(DISPATCH_PAY_PER_BUNDLE_SMALL_CENTS);
    expect(a.payPerBundleLargeCents).toBe(DISPATCH_PAY_PER_BUNDLE_LARGE_CENTS);
    expect(a.effectiveTier).toBe('free');
  });
});

describe('periodKeyFor', () => {
  it.each([
    [new Date('2026-01-15T12:00:00Z'), '2026-01'],
    [new Date('2026-05-01T00:00:00Z'), '2026-05'],
    [new Date('2026-12-31T23:59:59Z'), '2026-12'],
    [new Date('2027-02-01T00:00:00Z'), '2027-02'],
  ] as Array<[Date, string]>)('formats %s as %s', (input, expected) => {
    expect(periodKeyFor(input)).toBe(expected);
  });
});

describe('Membership constants — sanity check', () => {
  it('Plus monthly grant is 3', () => {
    expect(PLUS_MONTHLY_GRANT).toBe(3);
  });
  it('Plus bank cap is 12', () => {
    expect(PLUS_MONTHLY_BANK_CAP).toBe(12);
  });
  it('Bank cap is 4 months of grants — matches the "save up for clustered work" UX', () => {
    expect(PLUS_MONTHLY_BANK_CAP).toBe(PLUS_MONTHLY_GRANT * 4);
  });
});
