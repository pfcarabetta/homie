import { completeVisit, approvePayment } from '../vendor-visit-orchestrator';

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  },
}));

jest.mock('../vendor-payments', () => ({
  processPayment: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { processPayment } = require('../vendor-payments') as { processPayment: jest.Mock };

function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'returning']) {
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

const VISIT_ID = 'v-1';

const completedRow = {
  id: VISIT_ID,
  recurringVendorId: 'vendor-1',
  scheduledAt: new Date(),
  status: 'completed',
  amountChargedCents: 18000,
};

describe('completeVisit', () => {
  it('triggers payment when autoPayRule is "always"', async () => {
    db.update.mockReturnValueOnce(makeChain([completedRow])); // visit completion
    db.select.mockReturnValueOnce(
      makeChain([{ autoPayRule: 'always', autoPayThresholdCents: null }]),
    );
    processPayment.mockResolvedValue({ id: 'p-1' });

    const result = await completeVisit({ visitId: VISIT_ID, amountChargedCents: 18000 });
    expect(result.paymentTriggered).toBe(true);
    expect(result.paymentReason).toBe('always');
    expect(processPayment).toHaveBeenCalledWith(VISIT_ID);
  });

  it('triggers payment when autoPayRule is "if_under_threshold" and amount is under', async () => {
    db.update.mockReturnValueOnce(makeChain([completedRow]));
    db.select.mockReturnValueOnce(
      makeChain([{ autoPayRule: 'if_under_threshold', autoPayThresholdCents: 20000 }]),
    );
    processPayment.mockResolvedValue({ id: 'p-1' });

    const result = await completeVisit({ visitId: VISIT_ID, amountChargedCents: 18000 });
    expect(result.paymentTriggered).toBe(true);
    expect(result.paymentReason).toBe('under_threshold');
    expect(processPayment).toHaveBeenCalled();
  });

  it('skips payment when "if_under_threshold" and amount is over', async () => {
    db.update.mockReturnValueOnce(makeChain([completedRow]));
    db.select.mockReturnValueOnce(
      makeChain([{ autoPayRule: 'if_under_threshold', autoPayThresholdCents: 10000 }]),
    );

    const result = await completeVisit({ visitId: VISIT_ID, amountChargedCents: 18000 });
    expect(result.paymentTriggered).toBe(false);
    expect(result.paymentReason).toBe('over_threshold');
    expect(processPayment).not.toHaveBeenCalled();
  });

  it('skips payment when autoPayRule is "manual_approval"', async () => {
    db.update.mockReturnValueOnce(makeChain([completedRow]));
    db.select.mockReturnValueOnce(
      makeChain([{ autoPayRule: 'manual_approval', autoPayThresholdCents: null }]),
    );

    const result = await completeVisit({ visitId: VISIT_ID, amountChargedCents: 18000 });
    expect(result.paymentTriggered).toBe(false);
    expect(result.paymentReason).toBe('manual_approval');
    expect(processPayment).not.toHaveBeenCalled();
  });

  it('does not trigger payment when amount is 0 or missing', async () => {
    db.update.mockReturnValueOnce(makeChain([completedRow]));
    db.select.mockReturnValueOnce(
      makeChain([{ autoPayRule: 'always', autoPayThresholdCents: null }]),
    );

    const result = await completeVisit({ visitId: VISIT_ID, amountChargedCents: 0 });
    expect(result.paymentTriggered).toBe(false);
    expect(result.paymentReason).toBe('no_amount');
    expect(processPayment).not.toHaveBeenCalled();
  });

  it('returns paymentError when processPayment throws but visit still completes', async () => {
    db.update.mockReturnValueOnce(makeChain([completedRow]));
    db.select.mockReturnValueOnce(
      makeChain([{ autoPayRule: 'always', autoPayThresholdCents: null }]),
    );
    processPayment.mockRejectedValue(new Error('Stripe error: card_declined'));

    const result = await completeVisit({ visitId: VISIT_ID, amountChargedCents: 18000 });
    expect(result.visit.status).toBe('completed'); // still completed
    expect(result.paymentTriggered).toBe(false);
    expect(result.paymentError).toMatch(/card_declined/);
  });

  it('throws when the visit row does not exist', async () => {
    db.update.mockReturnValueOnce(makeChain([])); // returning() empty

    await expect(
      completeVisit({ visitId: 'nope', amountChargedCents: 1000 }),
    ).rejects.toThrow(/not found/);
  });
});

describe('approvePayment', () => {
  it('returns ok:true on successful processPayment', async () => {
    processPayment.mockResolvedValue({ id: 'p-1' });
    expect(await approvePayment(VISIT_ID)).toEqual({ ok: true });
  });

  it('returns ok:false with error message on failure', async () => {
    processPayment.mockRejectedValue(new Error('boom'));
    const result = await approvePayment(VISIT_ID);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/boom/);
  });
});
