import {
  findById,
  listForHomeowner,
  findPrimaryForHomeowner,
  create,
  update,
  HomeownerPropertyValidationError,
} from '../homeowner-properties';

// ─── Mocks ─────────────────────────────────────────────────────────────────

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };

// Builds a thenable Drizzle-query chain that resolves to `resolveValue`.
// Mirrors the orchestration.test.ts pattern: every chain method returns
// the same chain object, and `.then` resolves to the value.
function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'values', 'returning', 'orderBy', 'set']) {
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

// ─── Fixtures ──────────────────────────────────────────────────────────────

const HOMEOWNER_ID = '11111111-1111-1111-1111-111111111111';
const PROPERTY_ID = '22222222-2222-2222-2222-222222222222';

const sampleProperty = {
  id: PROPERTY_ID,
  homeownerId: HOMEOWNER_ID,
  isPrimary: true,
  nickname: 'Main house',
  address: '1247 Sunset Cliffs Blvd',
  city: 'San Diego',
  state: 'CA',
  zipCode: '92107',
  propertyType: 'single_family',
  bedrooms: 3,
  bathrooms: '2.5',
  sqft: 1850,
  details: null,
  createdAt: new Date('2026-02-01T00:00:00Z'),
  updatedAt: new Date('2026-02-01T00:00:00Z'),
};

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('homeowner-properties: findById', () => {
  it('returns the row when found', async () => {
    db.select.mockReturnValue(makeChain([sampleProperty]));
    const row = await findById(PROPERTY_ID);
    expect(row).toEqual(sampleProperty);
  });

  it('returns null when no row matches', async () => {
    db.select.mockReturnValue(makeChain([]));
    const row = await findById('00000000-0000-0000-0000-000000000000');
    expect(row).toBeNull();
  });
});

describe('homeowner-properties: listForHomeowner', () => {
  it('returns all properties for a homeowner', async () => {
    db.select.mockReturnValue(makeChain([sampleProperty]));
    const rows = await listForHomeowner(HOMEOWNER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].homeownerId).toBe(HOMEOWNER_ID);
  });
});

describe('homeowner-properties: findPrimaryForHomeowner', () => {
  it('returns the primary row when present', async () => {
    db.select.mockReturnValue(makeChain([sampleProperty]));
    const row = await findPrimaryForHomeowner(HOMEOWNER_ID);
    expect(row?.isPrimary).toBe(true);
  });

  it('returns null when no primary set', async () => {
    db.select.mockReturnValue(makeChain([]));
    const row = await findPrimaryForHomeowner(HOMEOWNER_ID);
    expect(row).toBeNull();
  });
});

describe('homeowner-properties: create', () => {
  it('inserts and returns the new row', async () => {
    db.insert.mockReturnValue(makeChain([sampleProperty]));
    const row = await create({
      homeownerId: HOMEOWNER_ID,
      address: '1247 Sunset Cliffs Blvd',
      city: 'San Diego',
      state: 'CA',
      propertyType: 'single_family',
    });
    expect(row).toEqual(sampleProperty);
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('throws HomeownerPropertyValidationError on invalid propertyType', async () => {
    await expect(
      create({
        homeownerId: HOMEOWNER_ID,
        propertyType: 'mansion' as unknown as 'single_family',
      }),
    ).rejects.toBeInstanceOf(HomeownerPropertyValidationError);
    // DB should not be touched if validation fails first
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('homeowner-properties: update', () => {
  it('updates and returns the row', async () => {
    const updated = { ...sampleProperty, nickname: 'New nickname' };
    db.update.mockReturnValue(makeChain([updated]));
    const row = await update(PROPERTY_ID, { nickname: 'New nickname' });
    expect(row?.nickname).toBe('New nickname');
  });

  it('returns null when no row matches', async () => {
    db.update.mockReturnValue(makeChain([]));
    const row = await update('00000000-0000-0000-0000-000000000000', {
      nickname: 'X',
    });
    expect(row).toBeNull();
  });

  it('throws HomeownerPropertyValidationError on invalid propertyType', async () => {
    await expect(
      update(PROPERTY_ID, { propertyType: 'castle' as unknown as 'single_family' }),
    ).rejects.toBeInstanceOf(HomeownerPropertyValidationError);
    expect(db.update).not.toHaveBeenCalled();
  });
});
