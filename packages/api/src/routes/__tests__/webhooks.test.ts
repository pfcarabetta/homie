import request from 'supertest';
import app from '../../app';
import { buildWebhookToken } from '../../services/outreach/web';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db', () => ({
  db: { select: jest.fn(), update: jest.fn(), insert: jest.fn() },
  outreachAttempts: {},
  providerResponses: {},
  providers: {},
}));

jest.mock('../../services/providers/scores', () => ({
  recordProviderResponse: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordProviderResponse } = require('../../services/providers/scores') as {
  recordProviderResponse: jest.Mock;
};

jest.mock('twilio', () => {
  const twiml = {
    VoiceResponse: jest.fn(),
    MessagingResponse: jest.fn(),
  };
  const factory = Object.assign(jest.fn().mockReturnValue({}), {
    twiml,
    validateRequest: jest.fn().mockReturnValue(true),
  });
  return { __esModule: true, default: factory };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const twilioMod = require('twilio').default as Record<string, jest.Mock & Record<string, jest.Mock>>;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ATTEMPT_ID = 'aaaaaaaa-1111-1111-1111-111111111111';
const PROVIDER_ID = 'bbbbbbbb-2222-2222-2222-222222222222';
const JOB_ID = 'cccccccc-3333-3333-3333-333333333333';

const MOCK_ATTEMPT = {
  id: ATTEMPT_ID,
  jobId: JOB_ID,
  providerId: PROVIDER_ID,
  channel: 'voice',
  status: 'pending',
  scriptUsed: 'Hi provider...',
  attemptedAt: new Date(),
};

// ─── Drizzle chain helpers ────────────────────────────────────────────────────

function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'and']) {
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

  recordProviderResponse.mockResolvedValue(undefined);

  // Re-establish Twilio mock implementations cleared by resetAllMocks
  twilioMod.validateRequest.mockReturnValue(true);
  twilioMod.twiml.VoiceResponse.mockImplementation(() => ({
    gather: jest.fn().mockReturnValue({ say: jest.fn() }),
    say: jest.fn(),
    toString: jest.fn().mockReturnValue('<Response/>'),
  }));
  twilioMod.twiml.MessagingResponse.mockImplementation(() => ({
    toString: jest.fn().mockReturnValue('<Response/>'),
  }));

  process.env.WEBHOOK_SECRET = 'testsecret';
  process.env.API_BASE_URL = 'https://api.homie.app';
});

// ─── POST /twilio/voice/gather ────────────────────────────────────────────────

describe('POST /api/v1/webhooks/twilio/voice/gather', () => {
  const url = `/api/v1/webhooks/twilio/voice/gather?attemptId=${ATTEMPT_ID}`;

  it('returns 400 for an invalid attemptId', async () => {
    const res = await request(app).post('/api/v1/webhooks/twilio/voice/gather?attemptId=bad').send();
    expect(res.status).toBe(400);
  });

  it('returns TwiML when attempt is not found', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    const res = await request(app).post(url).type('form').send({ Digits: '1' });
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/xml/);
  });

  it('digit 1 → marks attempt accepted and inserts provider_response', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_ATTEMPT]));
    db.update.mockReturnValueOnce(makeChain(undefined));
    db.insert.mockReturnValueOnce(makeChain(undefined));

    const res = await request(app).post(url).type('form').send({ Digits: '1' });

    expect(res.status).toBe(200);
    expect(res.type).toMatch(/xml/);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledTimes(1);

    const updateSetArg = (db.update.mock.results[0].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(updateSetArg).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
    expect(recordProviderResponse).toHaveBeenCalledWith(PROVIDER_ID, expect.any(Number));
  });

  it('digit 2 → marks attempt declined, does not insert provider_response', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_ATTEMPT]));
    db.update.mockReturnValueOnce(makeChain(undefined));

    const res = await request(app).post(url).type('form').send({ Digits: '2' });

    expect(res.status).toBe(200);
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.insert).not.toHaveBeenCalled();

    const updateSetArg = (db.update.mock.results[0].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(updateSetArg).toHaveBeenCalledWith(expect.objectContaining({ status: 'declined' }));
    expect(recordProviderResponse).toHaveBeenCalledWith(PROVIDER_ID, expect.any(Number));
  });

  it('unexpected digit → does not update attempt', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_ATTEMPT]));

    const res = await request(app).post(url).type('form').send({ Digits: '9' });
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ─── POST /twilio/voice/status ────────────────────────────────────────────────

describe('POST /api/v1/webhooks/twilio/voice/status', () => {
  const url = `/api/v1/webhooks/twilio/voice/status?attemptId=${ATTEMPT_ID}`;

  it('returns 400 for an invalid attemptId', async () => {
    const res = await request(app).post('/api/v1/webhooks/twilio/voice/status?attemptId=bad').send();
    expect(res.status).toBe(400);
  });

  it('no-answer → marks attempt no_answer', async () => {
    db.update.mockReturnValueOnce(makeChain(undefined));

    const res = await request(app).post(url).type('form').send({ CallStatus: 'no-answer', CallDuration: '0' });
    expect(res.status).toBe(204);

    const setArg = (db.update.mock.results[0].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(setArg).toHaveBeenCalledWith(expect.objectContaining({ status: 'no_answer' }));
  });

  it('busy → marks attempt no_answer', async () => {
    db.update.mockReturnValueOnce(makeChain(undefined));
    const res = await request(app).post(url).type('form').send({ CallStatus: 'busy' });
    expect(res.status).toBe(204);
    const setArg = (db.update.mock.results[0].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(setArg).toHaveBeenCalledWith(expect.objectContaining({ status: 'no_answer' }));
  });

  it('completed → returns 204 without updating (gather handles this)', async () => {
    const res = await request(app).post(url).type('form').send({ CallStatus: 'completed' });
    expect(res.status).toBe(204);
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ─── POST /twilio/sms ─────────────────────────────────────────────────────────

describe('POST /api/v1/webhooks/twilio/sms', () => {
  const url = '/api/v1/webhooks/twilio/sms';
  const smsMockAttempt = { ...MOCK_ATTEMPT, channel: 'sms' };

  it('ignores messages from unknown phone numbers', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    const res = await request(app).post(url).type('form').send({ From: '+19999999999', Body: 'Yes' });
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('positive reply (YES) → accepted + inserts provider_response', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ id: PROVIDER_ID }]))
      .mockReturnValueOnce(makeChain([smsMockAttempt]));
    db.update.mockReturnValueOnce(makeChain(undefined));
    db.insert.mockReturnValueOnce(makeChain(undefined));

    const res = await request(app).post(url).type('form').send({ From: '+15551234567', Body: 'YES' });
    expect(res.status).toBe(200);
    const setArg = (db.update.mock.results[0].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(setArg).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(recordProviderResponse).toHaveBeenCalledWith(PROVIDER_ID, expect.any(Number));
  });

  it('negative reply (NO) → declined, no provider_response', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ id: PROVIDER_ID }]))
      .mockReturnValueOnce(makeChain([smsMockAttempt]));
    db.update.mockReturnValueOnce(makeChain(undefined));

    const res = await request(app).post(url).type('form').send({ From: '+15551234567', Body: 'no' });
    expect(res.status).toBe(200);
    const setArg = (db.update.mock.results[0].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(setArg).toHaveBeenCalledWith(expect.objectContaining({ status: 'declined' }));
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('ambiguous reply → responded + inserts provider_response with message', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ id: PROVIDER_ID }]))
      .mockReturnValueOnce(makeChain([smsMockAttempt]));
    db.update.mockReturnValueOnce(makeChain(undefined));
    db.insert.mockReturnValueOnce(makeChain(undefined));

    const res = await request(app).post(url).type('form').send({ From: '+15551234567', Body: 'What time?' });
    expect(res.status).toBe(200);
    const setArg = (db.update.mock.results[0].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(setArg).toHaveBeenCalledWith(expect.objectContaining({ status: 'responded' }));
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it('returns 200 even when no pending attempt is found', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ id: PROVIDER_ID }]))
      .mockReturnValueOnce(makeChain([]));
    const res = await request(app).post(url).type('form').send({ From: '+15551234567', Body: 'YES' });
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ─── GET /web/respond ─────────────────────────────────────────────────────────

describe('GET /api/v1/webhooks/web/respond', () => {
  function makeUrl(action: 'accept' | 'decline', overrides: Record<string, string> = {}) {
    const token = buildWebhookToken(ATTEMPT_ID, action);
    const params = new URLSearchParams({ attemptId: ATTEMPT_ID, action, token, ...overrides });
    return `/api/v1/webhooks/web/respond?${params}`;
  }

  it('returns 400 when attemptId is missing', async () => {
    const res = await request(app).get('/api/v1/webhooks/web/respond?action=accept&token=bad');
    expect(res.status).toBe(400);
  });

  it('returns 400 for an invalid action', async () => {
    const token = buildWebhookToken(ATTEMPT_ID, 'accept');
    const res = await request(app).get(`/api/v1/webhooks/web/respond?attemptId=${ATTEMPT_ID}&action=spam&token=${token}`);
    expect(res.status).toBe(400);
  });

  it('returns 403 for an invalid token', async () => {
    const res = await request(app).get(makeUrl('accept', { token: 'deadbeef' }));
    expect(res.status).toBe(403);
  });

  it('returns 404 when the attempt does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    const res = await request(app).get(makeUrl('accept'));
    expect(res.status).toBe(404);
  });

  it('accept → marks attempt accepted, inserts provider_response, returns HTML', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_ATTEMPT]));
    db.update.mockReturnValueOnce(makeChain(undefined));
    db.insert.mockReturnValueOnce(makeChain(undefined));

    const res = await request(app).get(makeUrl('accept'));
    expect(res.status).toBe(200);
    expect(res.type).toMatch(/html/);
    expect(res.text).toContain('Accepted');

    const setArg = (db.update.mock.results[0].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(setArg).toHaveBeenCalledWith(expect.objectContaining({ status: 'accepted' }));
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(recordProviderResponse).toHaveBeenCalledWith(PROVIDER_ID, expect.any(Number));
  });

  it('decline → marks attempt declined, no provider_response, returns HTML', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_ATTEMPT]));
    db.update.mockReturnValueOnce(makeChain(undefined));

    const res = await request(app).get(makeUrl('decline'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Declined');

    const setArg = (db.update.mock.results[0].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(setArg).toHaveBeenCalledWith(expect.objectContaining({ status: 'declined' }));
    expect(db.insert).not.toHaveBeenCalled();
    expect(recordProviderResponse).toHaveBeenCalledWith(PROVIDER_ID, expect.any(Number));
  });
});
