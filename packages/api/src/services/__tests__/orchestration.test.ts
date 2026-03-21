import { dispatchJob, sendBookingNotifications } from '../orchestration';
import { DiscoveryResult } from '../../types/providers';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db', () => ({
  db: {
    select: jest.fn(),
    update: jest.fn(),
    insert: jest.fn(),
  },
}));

jest.mock('../providers/discovery', () => ({
  discoverProviders: jest.fn(),
}));

jest.mock('../scripts/generation', () => ({
  generateScripts: jest.fn(),
}));

jest.mock('../outreach/voice', () => ({
  VoiceAdapter: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
}));
jest.mock('../outreach/sms', () => ({
  SmsAdapter: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
}));
jest.mock('../outreach/web', () => ({
  WebAdapter: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
}));
jest.mock('../notifications', () => ({
  sendSms: jest.fn().mockResolvedValue(undefined),
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { discoverProviders } = require('../providers/discovery') as {
  discoverProviders: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { generateScripts } = require('../scripts/generation') as {
  generateScripts: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { VoiceAdapter } = require('../outreach/voice') as { VoiceAdapter: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SmsAdapter } = require('../outreach/sms') as { SmsAdapter: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WebAdapter } = require('../outreach/web') as { WebAdapter: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendSms, sendEmail } = require('../notifications') as { sendSms: jest.Mock; sendEmail: jest.Mock };

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const JOB_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PROVIDER_ID = 'bbbbbbbb-0000-0000-0000-000000000001';
const ATTEMPT_ID = 'cccccccc-0000-0000-0000-000000000001';
const BOOKING_ID = 'dddddddd-0000-0000-0000-000000000001';
const HOMEOWNER_ID = 'eeeeeeee-0000-0000-0000-000000000001';

const MOCK_JOB = {
  id: JOB_ID,
  homeownerId: HOMEOWNER_ID,
  status: 'dispatching',
  tier: 'standard',
  zipCode: '90210',
  budget: '$200–$400',
  preferredTiming: 'asap',
  diagnosis: {
    category: 'plumbing',
    severity: 'high',
    summary: 'Burst pipe under sink',
    recommendedActions: ['Shut off water', 'Replace pipe'],
  },
};

const MOCK_HOMEOWNER_DB = {
  id: HOMEOWNER_ID,
  email: 'homeowner@test.com',
  passwordHash: 'hash',
  phone: '+15559998888',
  zipCode: '90210',
  membershipTier: 'free',
  stripeCustomerId: null,
  createdAt: new Date(),
};

const MOCK_PROVIDER_DB = {
  id: PROVIDER_ID,
  name: 'Acme Plumbing',
  phone: '+15551234567',
  email: 'info@acme.com',
  website: 'https://acme.com',
  googlePlaceId: 'place-123',
  googleRating: '4.8',
  reviewCount: 100,
  categories: ['plumbing'],
  location: null,
  discoveredAt: new Date(),
};

const MOCK_PROVIDER = {
  id: PROVIDER_ID,
  name: 'Acme Plumbing',
  phone: '+15551234567',
  email: 'info@acme.com',
  website: 'https://acme.com',
  google_place_id: 'place-123',
  google_rating: '4.8',
  review_count: 100,
  categories: ['plumbing'],
  distance_miles: 2.5,
  rank_score: 0.85,
  homie_score: { acceptance_rate: 0.9, completion_rate: 0.95, avg_homeowner_rating: 4.7, avg_response_sec: 300, total_jobs: 20 },
  channels_available: ['voice', 'sms', 'web'],
  suppressed: false,
  rate_limited: false,
  open_now: null,
  last_contacted: null,
};

const MOCK_DISCOVERY: DiscoveryResult = {
  providers: [MOCK_PROVIDER],
  total_found: 10,
  filtered_out: 2,
  sources: { google_maps: 8, internal: 2, yelp: 0 },
};

const MOCK_BUNDLE = {
  job_id: JOB_ID,
  provider_id: PROVIDER_ID,
  voice: 'Hi Acme Plumbing, this is Homie...',
  sms: 'Plumbing job in 90210, budget $200–$400. Accept: https://example.com/accept',
  web: 'Hello Acme Plumbing, we have a plumbing job...',
  generated_at: new Date().toISOString(),
};

// ─── Drizzle chain helpers ────────────────────────────────────────────────────

function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'set', 'values', 'onConflictDoUpdate', 'returning']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain['then'] = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(resolveValue).then(resolve, reject);
  chain['catch'] = (reject: (e: unknown) => unknown) => Promise.resolve(resolveValue).catch(reject);
  chain['finally'] = (cb: () => void) => Promise.resolve(resolveValue).finally(cb);
  return chain;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let mockVoiceSend: jest.Mock;
let mockSmsSend: jest.Mock;
let mockWebSend: jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();

  mockVoiceSend = jest.fn().mockResolvedValue({ status: 'pending' });
  mockSmsSend = jest.fn().mockResolvedValue({ status: 'pending' });
  mockWebSend = jest.fn().mockResolvedValue({ status: 'pending' });

  VoiceAdapter.mockImplementation(() => ({ send: mockVoiceSend }));
  SmsAdapter.mockImplementation(() => ({ send: mockSmsSend }));
  WebAdapter.mockImplementation(() => ({ send: mockWebSend }));

  sendSms.mockResolvedValue(undefined);
  sendEmail.mockResolvedValue(undefined);
});

// ─── dispatchJob ─────────────────────────────────────────────────────────────

describe('dispatchJob', () => {
  it('does nothing when the job does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    await dispatchJob(JOB_ID);
    expect(discoverProviders).not.toHaveBeenCalled();
  });

  it('does nothing when the job has no diagnosis', async () => {
    db.select.mockReturnValueOnce(makeChain([{ ...MOCK_JOB, diagnosis: null }]));
    await dispatchJob(JOB_ID);
    expect(discoverProviders).not.toHaveBeenCalled();
  });

  it('does not update status when no eligible providers are found', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_JOB]));
    discoverProviders.mockResolvedValueOnce({ ...MOCK_DISCOVERY, providers: [] });

    await dispatchJob(JOB_ID);

    expect(db.update).not.toHaveBeenCalled();
  });

  it('does not update status when discovery throws', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_JOB]));
    discoverProviders.mockRejectedValueOnce(new Error('API key missing'));

    await dispatchJob(JOB_ID);

    expect(db.update).not.toHaveBeenCalled();
  });

  it('filters out suppressed and rate-limited providers', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_JOB]));
    discoverProviders.mockResolvedValueOnce({
      ...MOCK_DISCOVERY,
      providers: [
        { ...MOCK_PROVIDER, id: 'prov-suppressed', suppressed: true },
        { ...MOCK_PROVIDER, id: 'prov-rate-limited', rate_limited: true },
      ],
    });

    await dispatchJob(JOB_ID);

    expect(db.update).not.toHaveBeenCalled();
    expect(generateScripts).not.toHaveBeenCalled();
  });

  it('transitions job status to collecting when providers are found', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_JOB]));
    discoverProviders.mockResolvedValueOnce(MOCK_DISCOVERY);
    generateScripts.mockResolvedValue(MOCK_BUNDLE);

    const updateChain = makeChain(undefined);
    const insertAttemptChain = makeChain([{ id: ATTEMPT_ID }]);
    const insertScoresChain = makeChain(undefined);

    db.update.mockReturnValueOnce(updateChain);
    db.insert
      .mockReturnValueOnce(insertAttemptChain)
      .mockReturnValueOnce(insertAttemptChain)
      .mockReturnValueOnce(insertAttemptChain)
      .mockReturnValueOnce(insertScoresChain);

    await dispatchJob(JOB_ID);

    expect(db.update).toHaveBeenCalledTimes(1);
    const setCall = (db.update.mock.results[0].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(setCall).toHaveBeenCalledWith({ status: 'collecting' });
  });

  it('calls generateScripts for each eligible provider', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_JOB]));
    discoverProviders.mockResolvedValueOnce(MOCK_DISCOVERY);
    generateScripts.mockResolvedValue(MOCK_BUNDLE);

    const updateChain = makeChain(undefined);
    const insertChain = makeChain([{ id: ATTEMPT_ID }]);
    const insertScoresChain = makeChain(undefined);

    db.update.mockReturnValue(updateChain);
    db.insert
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(insertScoresChain);

    await dispatchJob(JOB_ID);

    expect(generateScripts).toHaveBeenCalledTimes(1);
    expect(generateScripts).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: JOB_ID,
        providerId: PROVIDER_ID,
        category: 'plumbing',
        severity: 'high',
      }),
    );
  });

  it('inserts an outreach_attempt row for each channel the provider supports', async () => {
    // Provider supports voice, sms, web — expect 3 attempt inserts
    db.select.mockReturnValueOnce(makeChain([MOCK_JOB]));
    discoverProviders.mockResolvedValueOnce(MOCK_DISCOVERY);
    generateScripts.mockResolvedValue(MOCK_BUNDLE);

    const updateChain = makeChain(undefined);
    const insertAttemptChain = makeChain([{ id: ATTEMPT_ID }]);
    const insertScoresChain = makeChain(undefined);

    db.update.mockReturnValue(updateChain);
    // 3 attempt inserts + 1 scores insert
    db.insert
      .mockReturnValueOnce(insertAttemptChain)
      .mockReturnValueOnce(insertAttemptChain)
      .mockReturnValueOnce(insertAttemptChain)
      .mockReturnValueOnce(insertScoresChain);

    await dispatchJob(JOB_ID);

    // 4 total inserts: 3 attempts + 1 score upsert
    expect(db.insert).toHaveBeenCalledTimes(4);
  });

  it('calls voice, sms, and web adapters for a fully-equipped provider', async () => {
    db.select.mockReturnValueOnce(makeChain([MOCK_JOB]));
    discoverProviders.mockResolvedValueOnce(MOCK_DISCOVERY);
    generateScripts.mockResolvedValue(MOCK_BUNDLE);

    const updateChain = makeChain(undefined);
    const insertAttemptChain = makeChain([{ id: ATTEMPT_ID }]);
    const insertScoresChain = makeChain(undefined);

    db.update.mockReturnValue(updateChain);
    db.insert
      .mockReturnValueOnce(insertAttemptChain)
      .mockReturnValueOnce(insertAttemptChain)
      .mockReturnValueOnce(insertAttemptChain)
      .mockReturnValueOnce(insertScoresChain);

    await dispatchJob(JOB_ID);

    expect(mockVoiceSend).toHaveBeenCalledTimes(1);
    expect(mockSmsSend).toHaveBeenCalledTimes(1);
    expect(mockWebSend).toHaveBeenCalledTimes(1);
  });

  it('marks the attempt failed when an adapter returns status failed', async () => {
    db.select.mockReturnValueOnce(makeChain([{ ...MOCK_JOB }]));
    discoverProviders.mockResolvedValueOnce({
      ...MOCK_DISCOVERY,
      providers: [{ ...MOCK_PROVIDER, channels_available: ['voice'] }],
    });
    generateScripts.mockResolvedValue(MOCK_BUNDLE);

    mockVoiceSend.mockResolvedValueOnce({ status: 'failed', error: 'Twilio error' });

    const updateJobChain = makeChain(undefined);
    const insertAttemptChain = makeChain([{ id: ATTEMPT_ID }]);
    const updateAttemptChain = makeChain(undefined);
    const insertScoresChain = makeChain(undefined);

    db.update
      .mockReturnValueOnce(updateJobChain)   // status → collecting
      .mockReturnValueOnce(updateAttemptChain); // attempt → failed
    db.insert
      .mockReturnValueOnce(insertAttemptChain)
      .mockReturnValueOnce(insertScoresChain);

    await dispatchJob(JOB_ID);

    // The second update call should set the attempt to failed
    expect(db.update).toHaveBeenCalledTimes(2);
    const failedSetCall = (db.update.mock.results[1].value as ReturnType<typeof makeChain>).set as jest.Mock;
    expect(failedSetCall).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
  });

  it('respects the tier provider limit for standard jobs (max 5)', async () => {
    const providers = Array.from({ length: 10 }, (_, i) => ({
      ...MOCK_PROVIDER,
      id: `prov-${i}`,
      channels_available: ['sms'],
    }));

    db.select.mockReturnValueOnce(makeChain([{ ...MOCK_JOB, tier: 'standard' }]));
    discoverProviders.mockResolvedValueOnce({ ...MOCK_DISCOVERY, providers });
    generateScripts.mockResolvedValue(MOCK_BUNDLE);

    const updateChain = makeChain(undefined);
    const insertChain = makeChain([{ id: ATTEMPT_ID }]);
    db.update.mockReturnValue(updateChain);
    // 5 providers × 1 channel each = 5 attempt inserts + 1 score insert
    for (let i = 0; i < 6; i++) db.insert.mockReturnValueOnce(insertChain);

    await dispatchJob(JOB_ID);

    expect(generateScripts).toHaveBeenCalledTimes(5);
  });

  it('respects the tier provider limit for emergency jobs (max 10)', async () => {
    const providers = Array.from({ length: 15 }, (_, i) => ({
      ...MOCK_PROVIDER,
      id: `prov-${i}`,
      channels_available: ['sms'],
    }));

    db.select.mockReturnValueOnce(makeChain([{ ...MOCK_JOB, tier: 'emergency' }]));
    discoverProviders.mockResolvedValueOnce({ ...MOCK_DISCOVERY, providers });
    generateScripts.mockResolvedValue(MOCK_BUNDLE);

    const updateChain = makeChain(undefined);
    const insertChain = makeChain([{ id: ATTEMPT_ID }]);
    db.update.mockReturnValue(updateChain);
    for (let i = 0; i < 11; i++) db.insert.mockReturnValueOnce(insertChain);

    await dispatchJob(JOB_ID);

    expect(generateScripts).toHaveBeenCalledTimes(10);
  });

  it('skips channels not in the provider channel list', async () => {
    // Provider only has sms — no voice or web
    db.select.mockReturnValueOnce(makeChain([MOCK_JOB]));
    discoverProviders.mockResolvedValueOnce({
      ...MOCK_DISCOVERY,
      providers: [{ ...MOCK_PROVIDER, channels_available: ['sms'] }],
    });
    generateScripts.mockResolvedValue(MOCK_BUNDLE);

    const updateChain = makeChain(undefined);
    const insertAttemptChain = makeChain([{ id: ATTEMPT_ID }]);
    const insertScoresChain = makeChain(undefined);

    db.update.mockReturnValue(updateChain);
    db.insert.mockReturnValueOnce(insertAttemptChain).mockReturnValueOnce(insertScoresChain);

    await dispatchJob(JOB_ID);

    expect(mockVoiceSend).not.toHaveBeenCalled();
    expect(mockSmsSend).toHaveBeenCalledTimes(1);
    expect(mockWebSend).not.toHaveBeenCalled();
  });
});

// ─── sendBookingNotifications ─────────────────────────────────────────────────

function setupNotificationSelects() {
  db.select
    .mockReturnValueOnce(makeChain([MOCK_JOB]))           // job lookup
    .mockReturnValueOnce(makeChain([MOCK_HOMEOWNER_DB]))  // homeowner lookup
    .mockReturnValueOnce(makeChain([MOCK_PROVIDER_DB]));  // provider lookup
}

describe('sendBookingNotifications', () => {
  it('upserts provider scores incrementing totalAccepted', async () => {
    const insertChain = makeChain(undefined);
    db.insert.mockReturnValueOnce(insertChain);
    setupNotificationSelects();

    await sendBookingNotifications(JOB_ID, PROVIDER_ID, BOOKING_ID);

    expect(db.insert).toHaveBeenCalledTimes(1);
    const valuesCall = insertChain.values as jest.Mock;
    expect(valuesCall).toHaveBeenCalledWith(
      expect.objectContaining({ providerId: PROVIDER_ID, totalAccepted: 1 }),
    );
  });

  it('does not throw when the score upsert fails', async () => {
    const insertChain = makeChain(undefined);
    (insertChain.onConflictDoUpdate as jest.Mock).mockImplementationOnce(() => {
      throw new Error('DB error');
    });
    db.insert.mockReturnValueOnce(insertChain);
    setupNotificationSelects();

    await expect(
      sendBookingNotifications(JOB_ID, PROVIDER_ID, BOOKING_ID),
    ).resolves.not.toThrow();
  });

  it('sends SMS to homeowner when they have a phone number', async () => {
    db.insert.mockReturnValueOnce(makeChain(undefined));
    setupNotificationSelects();

    await sendBookingNotifications(JOB_ID, PROVIDER_ID, BOOKING_ID);

    expect(sendSms).toHaveBeenCalledWith(
      MOCK_HOMEOWNER_DB.phone,
      expect.stringContaining(BOOKING_ID),
    );
  });

  it('does not send homeowner SMS when they have no phone', async () => {
    db.insert.mockReturnValueOnce(makeChain(undefined));
    db.select
      .mockReturnValueOnce(makeChain([MOCK_JOB]))
      .mockReturnValueOnce(makeChain([{ ...MOCK_HOMEOWNER_DB, phone: null }]))
      .mockReturnValueOnce(makeChain([MOCK_PROVIDER_DB]));

    await sendBookingNotifications(JOB_ID, PROVIDER_ID, BOOKING_ID);

    // sendSms may still be called for the provider, but not for the homeowner
    const homeSmsCall = sendSms.mock.calls.find(([to]) => to === MOCK_HOMEOWNER_DB.phone);
    expect(homeSmsCall).toBeUndefined();
  });

  it('sends SMS to provider when they have a phone', async () => {
    db.insert.mockReturnValueOnce(makeChain(undefined));
    setupNotificationSelects();

    await sendBookingNotifications(JOB_ID, PROVIDER_ID, BOOKING_ID);

    expect(sendSms).toHaveBeenCalledWith(
      MOCK_PROVIDER_DB.phone,
      expect.stringContaining(BOOKING_ID),
    );
  });

  it('falls back to email when provider has no phone', async () => {
    db.insert.mockReturnValueOnce(makeChain(undefined));
    db.select
      .mockReturnValueOnce(makeChain([MOCK_JOB]))
      .mockReturnValueOnce(makeChain([MOCK_HOMEOWNER_DB]))
      .mockReturnValueOnce(makeChain([{ ...MOCK_PROVIDER_DB, phone: null }]));

    await sendBookingNotifications(JOB_ID, PROVIDER_ID, BOOKING_ID);

    expect(sendEmail).toHaveBeenCalledWith(
      MOCK_PROVIDER_DB.email,
      expect.any(String),
      expect.stringContaining(BOOKING_ID),
    );
  });

  it('does nothing when the job is not found', async () => {
    db.insert.mockReturnValueOnce(makeChain(undefined));
    db.select.mockReturnValueOnce(makeChain([])); // job lookup → empty

    await sendBookingNotifications(JOB_ID, PROVIDER_ID, BOOKING_ID);

    // Only 1 select call (for the job); no notifications sent
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(sendSms).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('does not throw when notification sending fails', async () => {
    db.insert.mockReturnValueOnce(makeChain(undefined));
    setupNotificationSelects();
    sendSms.mockRejectedValue(new Error('Twilio error'));

    await expect(
      sendBookingNotifications(JOB_ID, PROVIDER_ID, BOOKING_ID),
    ).resolves.not.toThrow();
  });
});
