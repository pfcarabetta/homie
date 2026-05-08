import {
  findById,
  findByVisitId,
  findByVendorId,
  listForHomeownerYear,
  create,
  computeFees,
  VendorPaymentValidationError,
} from '../vendor-payments';

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

const PAYMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const VISIT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VENDOR_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOMEOWNER_ID = '11111111-1111-1111-1111-111111111111';

const samplePayment = {
  id: PAYMENT_ID,
  vendorVisitId: VISIT_ID,
  recurringVendorId: VENDOR_ID,
  amountCents: 18000,
  processingFeeCents: 522,
  homieTakeCents: 360,
  netToVendorCents: 17118,
  paymentMethod: 'card',
  stripePaymentIntentId: 'pi_xxx',
  stripeTransferId: 'tr_yyy',
  status: 'succeeded',
  failureReason: null,
  processedAt: new Date('2026-05-15T18:30:00Z'),
  createdAt: new Date('2026-05-15T18:00:00Z'),
};

describe('vendor-payments: findById', () => {
  it('returns the payment when found', async () => {
    db.select.mockReturnValue(makeChain([samplePayment]));
    expect(await findById(PAYMENT_ID)).toEqual(samplePayment);
  });

  it('returns null when not found', async () => {
    db.select.mockReturnValue(makeChain([]));
    expect(await findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});

describe('vendor-payments: findByVisitId', () => {
  it('returns payments tied to a visit', async () => {
    db.select.mockReturnValue(makeChain([samplePayment]));
    const rows = await findByVisitId(VISIT_ID);
    expect(rows).toHaveLength(1);
  });
});

describe('vendor-payments: findByVendorId', () => {
  it('returns payments for a vendor', async () => {
    db.select.mockReturnValue(makeChain([samplePayment]));
    const rows = await findByVendorId(VENDOR_ID);
    expect(rows).toHaveLength(1);
  });
});

describe('vendor-payments: listForHomeownerYear', () => {
  it('returns empty array when homeowner has no vendors', async () => {
    db.select.mockReturnValueOnce(makeChain([])); // first call: vendor list
    const rows = await listForHomeownerYear(HOMEOWNER_ID, 2026);
    expect(rows).toEqual([]);
    // The payments select must NOT have been called when there are no vendors
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('returns payments scoped to the homeowner and year', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ id: VENDOR_ID }])) // vendor list
      .mockReturnValueOnce(makeChain([samplePayment])); // payments list
    const rows = await listForHomeownerYear(HOMEOWNER_ID, 2026);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('succeeded');
    expect(db.select).toHaveBeenCalledTimes(2);
  });
});

describe('vendor-payments: create', () => {
  it('inserts and returns the new payment', async () => {
    db.insert.mockReturnValue(makeChain([samplePayment]));
    const row = await create({
      recurringVendorId: VENDOR_ID,
      amountCents: 18000,
      netToVendorCents: 17118,
      paymentMethod: 'card',
    });
    expect(row).toEqual(samplePayment);
  });

  it('rejects an invalid payment_method', async () => {
    await expect(
      create({
        recurringVendorId: VENDOR_ID,
        amountCents: 100,
        netToVendorCents: 99,
        paymentMethod: 'crypto' as unknown as 'card',
      }),
    ).rejects.toBeInstanceOf(VendorPaymentValidationError);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('rejects an invalid status', async () => {
    await expect(
      create({
        recurringVendorId: VENDOR_ID,
        amountCents: 100,
        netToVendorCents: 99,
        paymentMethod: 'card',
        status: 'reversed' as unknown as 'pending',
      }),
    ).rejects.toBeInstanceOf(VendorPaymentValidationError);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ─── computeFees (pure math from CLAUDE-MEMBERSHIP.md fee table) ───────────

describe('vendor-payments: computeFees', () => {
  it('card on $180 visit: member +$5.52 surcharge, vendor receives $176.40, Homie keeps $3.60', () => {
    // 18000 cents → Stripe processing 18000*0.029 = 522 + 30 = 552
    //              member charged 18552
    //              vendor receives 18000*0.98 = 17640
    //              Homie keeps 18000 - 17640 = 360
    expect(computeFees(18000, 'card')).toEqual({
      memberChargedCents: 18552,
      processingFeeCents: 552,
      homieTakeCents: 360,
      netToVendorCents: 17640,
    });
  });

  it('ACH on $180 visit: member +$0.90 surcharge, vendor receives $178.20, Homie keeps $1.80', () => {
    // 18000 → ACH 0.5% = 90 surcharge, vendor 18000*0.99 = 17820, Homie 180
    expect(computeFees(18000, 'ach')).toEqual({
      memberChargedCents: 18090,
      processingFeeCents: 90,
      homieTakeCents: 180,
      netToVendorCents: 17820,
    });
  });

  it('homie_credit on $180 visit: no Stripe processing, vendor receives 99%, Homie 1%', () => {
    expect(computeFees(18000, 'homie_credit')).toEqual({
      memberChargedCents: 18000,
      processingFeeCents: 0,
      homieTakeCents: 180,
      netToVendorCents: 17820,
    });
  });

  it('throws when amount_cents <= 0', () => {
    expect(() => computeFees(0, 'card')).toThrow(VendorPaymentValidationError);
    expect(() => computeFees(-1, 'card')).toThrow(VendorPaymentValidationError);
  });
});
