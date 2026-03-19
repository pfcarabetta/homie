import { recordProviderResponse, recordHomeownerRating } from '../scores';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Capture the insert chain so tests can inspect what was passed to .values()
// and what was passed to .onConflictDoUpdate().
let lastValues: unknown;
let lastConflictSet: unknown;

interface InsertChain {
  values: jest.Mock;
  onConflictDoUpdate: jest.Mock;
  then: (resolve: (v: unknown) => unknown) => Promise<unknown>;
  catch: (r: (e: unknown) => unknown) => Promise<unknown>;
  finally: (cb: () => void) => Promise<unknown>;
}

function makeInsertChain(): InsertChain {
  const chain: InsertChain = {
    values: jest.fn((v: unknown) => { lastValues = v; return chain; }),
    onConflictDoUpdate: jest.fn((opts: unknown) => { lastConflictSet = (opts as { set: unknown }).set; return chain; }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(undefined).then(resolve),
    catch: (r: (e: unknown) => unknown) => Promise.resolve(undefined).catch(r),
    finally: (cb: () => void) => Promise.resolve(undefined).finally(cb),
  };
  return chain;
}

jest.mock('../../../db', () => ({
  db: { insert: jest.fn() },
  providerScores: { providerId: 'mock_provider_id_col', avgResponseSec: 'mock_avg_response_sec_col', avgHomeownerRating: 'mock_avg_homeowner_rating_col', completionRate: 'mock_completion_rate_col' },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../../db') as { db: Record<string, jest.Mock> };

beforeEach(() => {
  jest.resetAllMocks();
  lastValues = undefined;
  lastConflictSet = undefined;
  db.insert.mockReturnValue(makeInsertChain());
});

// ─── recordProviderResponse ───────────────────────────────────────────────────

describe('recordProviderResponse', () => {
  it('calls db.insert with the provider id and clamped response time', async () => {
    await recordProviderResponse('prov-1', 120);

    expect(db.insert).toHaveBeenCalledTimes(1);
    const values = lastValues as { providerId: string; avgResponseSec: string; totalOutreach: number };
    expect(values.providerId).toBe('prov-1');
    expect(values.avgResponseSec).toBe('120.0000');
    expect(values.totalOutreach).toBe(0);
  });

  it('clamps negative response times to 0', async () => {
    await recordProviderResponse('prov-2', -50);

    const values = lastValues as { avgResponseSec: string };
    expect(values.avgResponseSec).toBe('0.0000');
  });

  it('passes an EMA SQL expression to onConflictDoUpdate', async () => {
    await recordProviderResponse('prov-3', 60);

    // The set object should contain avgResponseSec (an SQL expression) and updatedAt
    const set = lastConflictSet as Record<string, unknown>;
    expect(set).toHaveProperty('avgResponseSec');
    expect(set).toHaveProperty('updatedAt');
    // avgResponseSec should NOT be a plain string — it is a Drizzle SQL template object
    expect(typeof set.avgResponseSec).not.toBe('string');
  });
});

// ─── recordHomeownerRating ────────────────────────────────────────────────────

describe('recordHomeownerRating', () => {
  it('calls db.insert with the provider id and clamped rating', async () => {
    await recordHomeownerRating('prov-10', 4);

    expect(db.insert).toHaveBeenCalledTimes(1);
    const values = lastValues as { providerId: string; avgHomeownerRating: string; completionRate: string };
    expect(values.providerId).toBe('prov-10');
    expect(values.avgHomeownerRating).toBe('4.0000');
    expect(values.completionRate).toBe('1.0000');
  });

  it('clamps ratings above 5 to 5', async () => {
    await recordHomeownerRating('prov-11', 10);

    const values = lastValues as { avgHomeownerRating: string };
    expect(values.avgHomeownerRating).toBe('5.0000');
  });

  it('clamps ratings below 1 to 1', async () => {
    await recordHomeownerRating('prov-12', 0);

    const values = lastValues as { avgHomeownerRating: string };
    expect(values.avgHomeownerRating).toBe('1.0000');
  });

  it('passes EMA SQL expressions for avgHomeownerRating and completionRate', async () => {
    await recordHomeownerRating('prov-13', 5);

    const set = lastConflictSet as Record<string, unknown>;
    expect(set).toHaveProperty('avgHomeownerRating');
    expect(set).toHaveProperty('completionRate');
    expect(set).toHaveProperty('updatedAt');
    // Both score columns should be SQL expressions, not plain strings
    expect(typeof set.avgHomeownerRating).not.toBe('string');
    expect(typeof set.completionRate).not.toBe('string');
  });
});
