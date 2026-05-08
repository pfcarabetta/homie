import { Request, Response, NextFunction } from 'express';
import { meetsTier, requireTier, getCurrentTier, type MembershipTier } from '../require-tier';

jest.mock('../../db', () => ({
  db: { select: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };

function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain['then'] = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(resolveValue).then(resolve, reject);
  chain['catch'] = (r: (e: unknown) => unknown) => Promise.resolve(resolveValue).catch(r);
  chain['finally'] = (cb: () => void) => Promise.resolve(resolveValue).finally(cb);
  return chain;
}

beforeEach(() => {
  jest.resetAllMocks();
});

// ─── meetsTier (pure rank logic) ───────────────────────────────────────────

describe('meetsTier', () => {
  const cases: Array<[MembershipTier, MembershipTier, boolean]> = [
    ['free', 'free', true],
    ['free', 'plus', false],
    ['free', 'premier', false],
    ['plus', 'free', true],
    ['plus', 'plus', true],
    ['plus', 'premier', false],
    ['premier', 'free', true],
    ['premier', 'plus', true],
    ['premier', 'premier', true],
  ];
  it.each(cases)('current=%s required=%s → %p', (current, required, expected) => {
    expect(meetsTier(current, required)).toBe(expected);
  });
});

// ─── getCurrentTier ────────────────────────────────────────────────────────

describe('getCurrentTier', () => {
  it("returns the homeowner's tier when set", async () => {
    db.select.mockReturnValue(makeChain([{ tier: 'plus' }]));
    expect(await getCurrentTier('h1')).toBe('plus');
  });

  it("returns 'free' when no homeowner row found (defensive)", async () => {
    db.select.mockReturnValue(makeChain([]));
    expect(await getCurrentTier('h1')).toBe('free');
  });

  it("returns 'free' when tier is corrupt/unknown (defensive)", async () => {
    db.select.mockReturnValue(makeChain([{ tier: 'platinum' }]));
    expect(await getCurrentTier('h1')).toBe('free');
  });
});

// ─── requireTier middleware ────────────────────────────────────────────────

function fakeRes() {
  const res: Partial<Response> & { _status?: number; _json?: unknown } = {};
  res.status = jest.fn().mockImplementation((code: number) => {
    res._status = code;
    return res as Response;
  });
  res.json = jest.fn().mockImplementation((body: unknown) => {
    res._json = body;
    return res as Response;
  });
  return res as Response & { _status?: number; _json?: unknown };
}

describe('requireTier middleware', () => {
  it('calls next() when homeowner is on the required tier', async () => {
    db.select.mockReturnValue(makeChain([{ tier: 'plus' }]));
    const req = { homeownerId: 'h1' } as Request;
    const res = fakeRes();
    const next = jest.fn() as NextFunction;
    const mw = requireTier('plus', 'Test feature');
    await mw(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBeUndefined();
  });

  it('calls next() when homeowner is above the required tier', async () => {
    db.select.mockReturnValue(makeChain([{ tier: 'premier' }]));
    const req = { homeownerId: 'h1' } as Request;
    const res = fakeRes();
    const next = jest.fn() as NextFunction;
    await requireTier('plus', 'Test feature')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 with structured upgrade meta when below required tier', async () => {
    db.select.mockReturnValue(makeChain([{ tier: 'free' }]));
    const req = { homeownerId: 'h1' } as Request;
    const res = fakeRes();
    const next = jest.fn() as NextFunction;
    await requireTier('plus', 'Home Health Score')(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(403);
    const body = res._json as { meta: Record<string, unknown>; error: string };
    expect(body.meta).toMatchObject({
      upgradeRequired: true,
      currentTier: 'free',
      requiredTier: 'plus',
      featureName: 'Home Health Score',
    });
    expect(body.error).toMatch(/Plus membership/);
  });

  it('returns 401 when req.homeownerId is missing', async () => {
    const req = {} as Request;
    const res = fakeRes();
    const next = jest.fn() as NextFunction;
    await requireTier('plus', 'X')(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
