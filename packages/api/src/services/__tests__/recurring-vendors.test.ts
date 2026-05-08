import {
  findById,
  findByPropertyId,
  findByHomeownerId,
  listForHomeowner,
  create,
  update,
  softDelete,
  RecurringVendorValidationError,
} from '../recurring-vendors';

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

const VENDOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOMEOWNER_ID = '11111111-1111-1111-1111-111111111111';
const PROPERTY_ID = '22222222-2222-2222-2222-222222222222';

const sampleVendor = {
  id: VENDOR_ID,
  homeownerPropertyId: PROPERTY_ID,
  homeownerId: HOMEOWNER_ID,
  vendorName: "Maria's Cleaning Co.",
  vendorPhone: '+15551234567',
  vendorEmail: 'maria@cleaning.example',
  serviceCategory: 'cleaning',
  vendorType: 'byo',
  networkProviderId: null,
  schedulePattern: 'biweekly_even',
  scheduleDayOfWeek: 3, // Wednesday
  scheduleDayOfMonth: null,
  scheduleNthWeekday: null,
  scheduleTime: '10:00:00',
  scheduleCustomDates: null,
  amountCents: 18000,
  paymentMethod: 'card',
  paymentMethodId: 'pm_1234',
  autoPayRule: 'always',
  autoPayThresholdCents: null,
  status: 'active',
  travelHoldStartsAt: null,
  travelHoldEndsAt: null,
  vendorConfirmedAt: new Date('2026-02-05T00:00:00Z'),
  totalPaidYtdCents: 36000,
  createdAt: new Date('2026-02-01T00:00:00Z'),
  updatedAt: new Date('2026-02-15T00:00:00Z'),
};

// ─── Reads ─────────────────────────────────────────────────────────────────

describe('recurring-vendors: findById', () => {
  it('returns the vendor when found', async () => {
    db.select.mockReturnValue(makeChain([sampleVendor]));
    const row = await findById(VENDOR_ID);
    expect(row).toEqual(sampleVendor);
  });

  it('returns null when not found', async () => {
    db.select.mockReturnValue(makeChain([]));
    expect(await findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('recurring-vendors: findByPropertyId', () => {
  it('filters out cancelled vendors by default', async () => {
    const active = { ...sampleVendor, id: 'aaaa-1', status: 'active' };
    const cancelled = { ...sampleVendor, id: 'aaaa-2', status: 'cancelled' };
    db.select.mockReturnValue(makeChain([active, cancelled]));
    const rows = await findByPropertyId(PROPERTY_ID);
    expect(rows.map((r) => r.id)).toEqual(['aaaa-1']);
  });

  it('includes cancelled when option is set', async () => {
    const active = { ...sampleVendor, id: 'aaaa-1', status: 'active' };
    const cancelled = { ...sampleVendor, id: 'aaaa-2', status: 'cancelled' };
    db.select.mockReturnValue(makeChain([active, cancelled]));
    const rows = await findByPropertyId(PROPERTY_ID, { includeCancelled: true });
    expect(rows).toHaveLength(2);
  });
});

describe('recurring-vendors: findByHomeownerId / listForHomeowner', () => {
  it('returns vendors scoped to homeowner', async () => {
    db.select.mockReturnValue(makeChain([sampleVendor]));
    const rows = await findByHomeownerId(HOMEOWNER_ID);
    expect(rows).toHaveLength(1);
  });

  it('listForHomeowner is an alias', async () => {
    db.select.mockReturnValue(makeChain([sampleVendor]));
    const rows = await listForHomeowner(HOMEOWNER_ID);
    expect(rows).toHaveLength(1);
  });
});

// ─── Writes ────────────────────────────────────────────────────────────────

describe('recurring-vendors: create', () => {
  it('inserts and returns the new vendor', async () => {
    db.insert.mockReturnValue(makeChain([sampleVendor]));
    const row = await create({
      homeownerPropertyId: PROPERTY_ID,
      homeownerId: HOMEOWNER_ID,
      vendorName: "Maria's Cleaning Co.",
      serviceCategory: 'cleaning',
      vendorType: 'byo',
      schedulePattern: 'biweekly_even',
      amountCents: 18000,
      paymentMethod: 'card',
      autoPayRule: 'always',
    });
    expect(row).toEqual(sampleVendor);
  });

  it('rejects an invalid service_category', async () => {
    await expect(
      create({
        homeownerPropertyId: PROPERTY_ID,
        homeownerId: HOMEOWNER_ID,
        vendorName: 'X',
        serviceCategory: 'asbestos_removal' as unknown as 'cleaning',
        vendorType: 'byo',
        schedulePattern: 'weekly',
        amountCents: 100,
        paymentMethod: 'card',
        autoPayRule: 'always',
      }),
    ).rejects.toBeInstanceOf(RecurringVendorValidationError);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects an invalid vendor_type', async () => {
    await expect(
      create({
        homeownerPropertyId: PROPERTY_ID,
        homeownerId: HOMEOWNER_ID,
        vendorName: 'X',
        serviceCategory: 'cleaning',
        vendorType: 'staff' as unknown as 'byo',
        schedulePattern: 'weekly',
        amountCents: 100,
        paymentMethod: 'card',
        autoPayRule: 'always',
      }),
    ).rejects.toBeInstanceOf(RecurringVendorValidationError);
  });
});

describe('recurring-vendors: update', () => {
  it('updates and returns the row', async () => {
    const updated = { ...sampleVendor, amountCents: 20000 };
    db.update.mockReturnValue(makeChain([updated]));
    const row = await update(VENDOR_ID, { amountCents: 20000 });
    expect(row?.amountCents).toBe(20000);
  });

  it('returns null when no row matches', async () => {
    db.update.mockReturnValue(makeChain([]));
    expect(await update('00000000-0000-0000-0000-000000000000', { amountCents: 1 })).toBeNull();
  });

  it('rejects an invalid auto_pay_rule', async () => {
    await expect(
      update(VENDOR_ID, { autoPayRule: 'always_no_questions' as unknown as 'always' }),
    ).rejects.toBeInstanceOf(RecurringVendorValidationError);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe('recurring-vendors: softDelete', () => {
  it('marks status=cancelled', async () => {
    const cancelled = { ...sampleVendor, status: 'cancelled' };
    db.update.mockReturnValue(makeChain([cancelled]));
    const row = await softDelete(VENDOR_ID);
    expect(row?.status).toBe('cancelled');
  });

  it('returns null when no row matches', async () => {
    db.update.mockReturnValue(makeChain([]));
    expect(await softDelete('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
