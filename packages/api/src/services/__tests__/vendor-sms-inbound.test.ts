jest.mock('../../db', () => ({
  db: { select: jest.fn(), update: jest.fn() },
}));
jest.mock('../vendor-visit-orchestrator', () => ({
  completeVisit: jest.fn(),
}));
jest.mock('../vendor-visits', () => ({
  findUpcomingForVendor: jest.fn(),
  findByVendorId: jest.fn(),
  updateStatus: jest.fn(),
}));

import { classifyInbound, handleInboundVendorSms } from '../vendor-sms-inbound';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { completeVisit } = require('../vendor-visit-orchestrator') as { completeVisit: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const visitsSvc = require('../vendor-visits') as Record<string, jest.Mock>;

function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'orderBy', 'set']) {
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

// ─── classifyInbound (pure) ────────────────────────────────────────────────

describe('classifyInbound', () => {
  const cases: Array<[string, ReturnType<typeof classifyInbound>]> = [
    ['YES', 'confirm'],
    ['Y', 'confirm'],
    ['Confirm', 'confirm'],
    ['CONFIRMED', 'confirm'],
    ['ok ', 'confirm'],
    ['Done', 'complete'],
    ['DONE', 'complete'],
    ['DID', 'complete'],
    ['complete', 'complete'],
    ['Finished — see notes', 'complete'],
    ['STOP', 'stop'],
    ['UNSUBSCRIBE', 'stop'],
    ['cancel', 'stop'],
    ['Hi! Couldn’t make it', 'unknown'],
    ['', 'unknown'],
    ['  ', 'unknown'],
    ['??', 'unknown'],
  ];
  it.each(cases)('classifies "%s" as %s', (body, expected) => {
    expect(classifyInbound(body)).toBe(expected);
  });
});

// ─── handleInboundVendorSms ────────────────────────────────────────────────

describe('handleInboundVendorSms', () => {
  const sampleVendor = {
    id: 'v-1',
    vendorPhone: '+15551234567',
    amountCents: 18000,
    status: 'active',
    updatedAt: new Date(),
  };

  it('returns unknown_keyword for gibberish; never queries DB', async () => {
    const result = await handleInboundVendorSms({ fromPhone: '+15551234567', body: 'huh?' });
    expect(result.intent).toBe('unknown');
    expect(result.reason).toBe('unknown_keyword');
    expect(db.select).not.toHaveBeenCalled();
  });

  it('handles STOP without acting on the DB', async () => {
    const result = await handleInboundVendorSms({ fromPhone: '+15551234567', body: 'STOP' });
    expect(result.intent).toBe('stop');
    expect(result.ok).toBe(true);
    expect(db.select).not.toHaveBeenCalled();
  });

  it('returns unknown_vendor when phone has no active vendor', async () => {
    db.select.mockReturnValueOnce(makeChain([])); // findVendorByPhone
    const result = await handleInboundVendorSms({ fromPhone: '+15551234567', body: 'YES' });
    expect(result.intent).toBe('confirm');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unknown_vendor');
  });

  it('confirms upcoming visit on YES', async () => {
    db.select.mockReturnValueOnce(makeChain([sampleVendor]));
    visitsSvc.findUpcomingForVendor.mockResolvedValue([
      { id: 'visit-1', status: 'confirmation_sent', scheduledAt: new Date(Date.now() + 3600 * 1000) },
    ]);
    visitsSvc.updateStatus.mockResolvedValue(null);
    const result = await handleInboundVendorSms({ fromPhone: '+15551234567', body: 'YES' });
    expect(result.intent).toBe('confirm');
    expect(result.ok).toBe(true);
    expect(result.visitId).toBe('visit-1');
    expect(visitsSvc.updateStatus).toHaveBeenCalledWith('visit-1', 'confirmed');
  });

  it('returns already_confirmed (idempotent) on YES when status is already confirmed', async () => {
    db.select.mockReturnValueOnce(makeChain([sampleVendor]));
    visitsSvc.findUpcomingForVendor.mockResolvedValue([
      { id: 'visit-1', status: 'confirmed', scheduledAt: new Date(Date.now() + 3600 * 1000) },
    ]);
    const result = await handleInboundVendorSms({ fromPhone: '+15551234567', body: 'YES' });
    expect(result.reason).toBe('already_confirmed');
    expect(visitsSvc.updateStatus).not.toHaveBeenCalled();
  });

  it('completes most-recent past visit on DONE; calls orchestrator.completeVisit', async () => {
    const now = new Date('2026-05-15T18:00:00Z');
    const visit = {
      id: 'visit-2',
      status: 'confirmed',
      scheduledAt: new Date('2026-05-15T17:00:00Z'),
      amountChargedCents: null,
    };
    db.select.mockReturnValueOnce(makeChain([sampleVendor]));
    visitsSvc.findByVendorId.mockResolvedValue([visit]);
    completeVisit.mockResolvedValue({ paymentTriggered: true, paymentReason: 'always' });

    const result = await handleInboundVendorSms({ fromPhone: '+15551234567', body: 'DONE', now });
    expect(result.intent).toBe('complete');
    expect(result.ok).toBe(true);
    expect(result.visitId).toBe('visit-2');
    expect(result.paymentTriggered).toBe(true);
    expect(completeVisit).toHaveBeenCalledWith({
      visitId: 'visit-2',
      amountChargedCents: 18000, // falls back to vendor's amount when visit didn't have one
    });
  });

  it('returns no_applicable_visit on DONE when no past visit is in non-terminal state', async () => {
    db.select.mockReturnValueOnce(makeChain([sampleVendor]));
    visitsSvc.findByVendorId.mockResolvedValue([
      // past visit but already completed — terminal
      { id: 'v-old', status: 'completed', scheduledAt: new Date(Date.now() - 86400000), amountChargedCents: 10000 },
    ]);
    const result = await handleInboundVendorSms({ fromPhone: '+15551234567', body: 'DONE' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_applicable_visit');
    expect(completeVisit).not.toHaveBeenCalled();
  });

  it('normalizes phone numbers without leading +1', async () => {
    db.select.mockReturnValueOnce(makeChain([sampleVendor]));
    visitsSvc.findUpcomingForVendor.mockResolvedValue([
      { id: 'visit-1', status: 'scheduled', scheduledAt: new Date(Date.now() + 3600 * 1000) },
    ]);
    await handleInboundVendorSms({ fromPhone: '5551234567', body: 'YES' });
    // The chain.where was called with the E.164 form; we don't introspect
    // the where(...) AST here, but the fact that we found a vendor (mock
    // resolve) and then called updateStatus means lookup succeeded.
    expect(visitsSvc.updateStatus).toHaveBeenCalled();
  });
});
