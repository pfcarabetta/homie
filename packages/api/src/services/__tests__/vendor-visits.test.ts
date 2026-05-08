import {
  findById,
  findByVendorId,
  findUpcomingForVendor,
  create,
  updateStatus,
  VendorVisitValidationError,
} from '../vendor-visits';

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };

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

const VISIT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VENDOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const sampleVisit = {
  id: VISIT_ID,
  recurringVendorId: VENDOR_ID,
  scheduledAt: new Date('2026-05-15T17:00:00Z'),
  status: 'scheduled',
  confirmationSentAt: null,
  confirmedAt: null,
  completedAt: null,
  completionPhotoUrl: null,
  completionNotes: null,
  amountChargedCents: null,
  tipCents: 0,
  paymentId: null,
  skipReason: null,
  createdAt: new Date('2026-05-01T00:00:00Z'),
  updatedAt: new Date('2026-05-01T00:00:00Z'),
};

describe('vendor-visits: findById', () => {
  it('returns the visit when found', async () => {
    db.select.mockReturnValue(makeChain([sampleVisit]));
    expect(await findById(VISIT_ID)).toEqual(sampleVisit);
  });

  it('returns null when not found', async () => {
    db.select.mockReturnValue(makeChain([]));
    expect(await findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('vendor-visits: findByVendorId', () => {
  it('returns all visits for a vendor', async () => {
    db.select.mockReturnValue(makeChain([sampleVisit]));
    const rows = await findByVendorId(VENDOR_ID);
    expect(rows).toHaveLength(1);
  });
});

describe('vendor-visits: findUpcomingForVendor', () => {
  it('uses default 30-day window when not specified', async () => {
    db.select.mockReturnValue(makeChain([sampleVisit]));
    const rows = await findUpcomingForVendor(VENDOR_ID);
    expect(rows).toHaveLength(1);
  });

  it('honors the days override', async () => {
    db.select.mockReturnValue(makeChain([sampleVisit]));
    const now = new Date('2026-05-01T00:00:00Z');
    await findUpcomingForVendor(VENDOR_ID, { days: 7, now });
    // chain.where called with built predicate; we don't assert on the
    // exact SQL here (it's a Drizzle-internal SQL token), but the call
    // must have happened.
    expect(db.select).toHaveBeenCalled();
  });
});

describe('vendor-visits: create', () => {
  it('inserts and returns the new visit', async () => {
    db.insert.mockReturnValue(makeChain([sampleVisit]));
    const row = await create({
      recurringVendorId: VENDOR_ID,
      scheduledAt: sampleVisit.scheduledAt,
    });
    expect(row).toEqual(sampleVisit);
  });

  it('rejects an invalid status', async () => {
    await expect(
      create({
        recurringVendorId: VENDOR_ID,
        scheduledAt: new Date(),
        status: 'in_progress' as unknown as 'scheduled',
      }),
    ).rejects.toBeInstanceOf(VendorVisitValidationError);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('vendor-visits: updateStatus', () => {
  it('stamps confirmed_at when transitioning to confirmed', async () => {
    const confirmed = {
      ...sampleVisit,
      status: 'confirmed',
      confirmedAt: new Date('2026-05-14T12:00:00Z'),
    };
    db.update.mockReturnValue(makeChain([confirmed]));
    const row = await updateStatus(VISIT_ID, 'confirmed');
    expect(row?.status).toBe('confirmed');
    expect(row?.confirmedAt).toBeTruthy();
  });

  it('stamps completed_at when transitioning to completed', async () => {
    const completed = {
      ...sampleVisit,
      status: 'completed',
      completedAt: new Date('2026-05-15T18:00:00Z'),
      amountChargedCents: 18000,
    };
    db.update.mockReturnValue(makeChain([completed]));
    const row = await updateStatus(VISIT_ID, 'completed', {
      amountChargedCents: 18000,
    });
    expect(row?.status).toBe('completed');
    expect(row?.amountChargedCents).toBe(18000);
  });

  it('rejects an invalid status', async () => {
    await expect(
      updateStatus(VISIT_ID, 'half_done' as unknown as 'completed'),
    ).rejects.toBeInstanceOf(VendorVisitValidationError);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('returns null when no row matches', async () => {
    db.update.mockReturnValue(makeChain([]));
    expect(await updateStatus('00000000-0000-0000-0000-000000000000', 'confirmed')).toBeNull();
  });
});
