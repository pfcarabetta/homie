import {
  issueConfirmation,
  findActiveByToken,
  beginConnectOnboarding,
  markVendorActive,
  VendorConfirmationError,
} from '../vendor-confirmation';

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../notifications', () => ({
  sendSms: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../stripe', () => ({
  createConnectAccount: jest.fn(),
  createAccountLink: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendSms } = require('../notifications') as { sendSms: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createConnectAccount, createAccountLink } = require('../stripe') as {
  createConnectAccount: jest.Mock;
  createAccountLink: jest.Mock;
};

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
  sendSms.mockResolvedValue(undefined);
});

const VENDOR_ID = 'v-1';
const sampleVendor = {
  id: VENDOR_ID,
  homeownerPropertyId: 'p-1',
  homeownerId: 'h-1',
  vendorName: "Maria's Cleaning",
  vendorPhone: '+15551234567',
  vendorEmail: 'maria@example.com',
  serviceCategory: 'cleaning',
  vendorType: 'byo',
  amountCents: 18000,
  paymentMethod: 'card',
  autoPayRule: 'always',
  schedulePattern: 'biweekly_even',
  status: 'pending_vendor_confirmation',
  stripeConnectAccountId: null,
  vendorConfirmationToken: null,
  vendorConfirmationTokenExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── issueConfirmation ─────────────────────────────────────────────────────

describe('issueConfirmation', () => {
  it('writes a token + expiry, sends SMS, returns both', async () => {
    db.select.mockReturnValue(makeChain([sampleVendor]));
    db.update.mockReturnValue(makeChain([]));
    const result = await issueConfirmation({
      vendorId: VENDOR_ID,
      homeownerName: 'David Thompson',
      propertyAddress: '1247 Sunset Cliffs Blvd',
    });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(sendSms).toHaveBeenCalledTimes(1);
    const [phone, body] = sendSms.mock.calls[0];
    expect(phone).toBe('+15551234567');
    expect(body).toContain("Maria's Cleaning");
    expect(body).toContain('David Thompson');
    expect(body).toContain('1247 Sunset Cliffs Blvd');
    expect(body).toContain('vendor-confirmation/');
  });

  it('throws when vendor not found', async () => {
    db.select.mockReturnValue(makeChain([]));
    await expect(
      issueConfirmation({
        vendorId: 'missing',
        homeownerName: 'X',
        propertyAddress: 'Y',
      }),
    ).rejects.toBeInstanceOf(VendorConfirmationError);
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('throws no_phone when vendor has no phone', async () => {
    db.select.mockReturnValue(makeChain([{ ...sampleVendor, vendorPhone: null }]));
    await expect(
      issueConfirmation({
        vendorId: VENDOR_ID,
        homeownerName: 'X',
        propertyAddress: 'Y',
      }),
    ).rejects.toMatchObject({ code: 'no_phone' });
    expect(sendSms).not.toHaveBeenCalled();
  });

  it('wraps SMS failures in VendorConfirmationError', async () => {
    db.select.mockReturnValue(makeChain([sampleVendor]));
    db.update.mockReturnValue(makeChain([]));
    sendSms.mockRejectedValueOnce(new Error('Twilio down'));
    await expect(
      issueConfirmation({
        vendorId: VENDOR_ID,
        homeownerName: 'X',
        propertyAddress: 'Y',
      }),
    ).rejects.toMatchObject({ code: 'sms_failed' });
  });
});

// ─── findActiveByToken ─────────────────────────────────────────────────────

describe('findActiveByToken', () => {
  it('returns the vendor when token + expiry are valid', async () => {
    db.select.mockReturnValue(makeChain([sampleVendor]));
    expect(await findActiveByToken('t1')).toEqual(sampleVendor);
  });

  it('returns null when no row matches (handles expired tokens too)', async () => {
    db.select.mockReturnValue(makeChain([]));
    expect(await findActiveByToken('expired')).toBeNull();
  });
});

// ─── beginConnectOnboarding ────────────────────────────────────────────────

describe('beginConnectOnboarding', () => {
  it('creates a Connect account on first call and returns the onboarding URL', async () => {
    db.select.mockReturnValue(makeChain([sampleVendor]));
    db.update.mockReturnValue(makeChain([]));
    createConnectAccount.mockResolvedValue({ id: 'acct_123' });
    createAccountLink.mockResolvedValue({ url: 'https://connect.stripe.com/setup/abc' });

    const { onboardingUrl } = await beginConnectOnboarding('t1');
    expect(onboardingUrl).toBe('https://connect.stripe.com/setup/abc');
    expect(createConnectAccount).toHaveBeenCalledWith({
      email: 'maria@example.com',
      vendorName: "Maria's Cleaning",
      idempotencyKey: VENDOR_ID,
    });
  });

  it('reuses an existing Connect account on retry', async () => {
    db.select.mockReturnValue(makeChain([{ ...sampleVendor, stripeConnectAccountId: 'acct_existing' }]));
    createAccountLink.mockResolvedValue({ url: 'https://connect.stripe.com/setup/xyz' });

    await beginConnectOnboarding('t1');
    expect(createConnectAccount).not.toHaveBeenCalled();
    expect(createAccountLink).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acct_existing' }),
    );
  });

  it('throws token_expired when no active vendor matches', async () => {
    db.select.mockReturnValue(makeChain([]));
    await expect(beginConnectOnboarding('expired')).rejects.toMatchObject({
      code: 'token_expired',
    });
  });

  it("throws already_confirmed when vendor is already 'active'", async () => {
    db.select.mockReturnValue(makeChain([{ ...sampleVendor, status: 'active' }]));
    await expect(beginConnectOnboarding('t1')).rejects.toMatchObject({
      code: 'already_confirmed',
    });
  });

  it('throws no_connect_email when vendor has no email', async () => {
    db.select.mockReturnValue(makeChain([{ ...sampleVendor, vendorEmail: null }]));
    await expect(beginConnectOnboarding('t1')).rejects.toMatchObject({
      code: 'no_connect_email',
    });
  });
});

// ─── markVendorActive ──────────────────────────────────────────────────────

describe('markVendorActive', () => {
  it('flips status to active, stamps confirmed_at, clears token', async () => {
    db.select.mockReturnValue(makeChain([sampleVendor]));
    db.update.mockReturnValue(makeChain([]));
    await markVendorActive('acct_123');
    // verify the .set() call captured the right shape
    const setArg = (db.update.mock.results[0].value as { set: jest.Mock }).set;
    expect(setArg).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'active',
        vendorConfirmationToken: null,
        vendorConfirmationTokenExpiresAt: null,
      }),
    );
  });

  it('skips when vendor is already active (idempotent)', async () => {
    db.select.mockReturnValue(makeChain([{ ...sampleVendor, status: 'active' }]));
    await markVendorActive('acct_123');
    expect(db.update).not.toHaveBeenCalled();
  });

  it('logs and returns gracefully when account is unknown', async () => {
    db.select.mockReturnValue(makeChain([]));
    await expect(markVendorActive('acct_unknown')).resolves.toBeUndefined();
    expect(db.update).not.toHaveBeenCalled();
  });
});
