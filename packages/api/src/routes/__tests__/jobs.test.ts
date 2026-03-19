import request from 'supertest';
import app from '../../app';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const JOB_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const HOMEOWNER_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PROVIDER_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const RESPONSE_ID = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const BOOKING_ID = 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockJob = {
  id: JOB_ID,
  homeownerId: HOMEOWNER_ID,
  diagnosis: { category: 'plumbing', severity: 'high', summary: 'Leaky pipe', recommendedActions: ['Fix it'] },
  photoUrls: null,
  preferredTiming: 'asap',
  budget: '$500',
  tier: 'standard',
  status: 'dispatching',
  zipCode: '90210',
  expiresAt: new Date('2026-03-19T20:00:00Z'),
  createdAt: new Date('2026-03-18T20:00:00Z'),
};

const mockProvider = {
  id: PROVIDER_ID,
  name: 'Acme Plumbing',
  phone: '555-1234',
  email: 'acme@example.com',
  website: null,
  googlePlaceId: 'place-123',
  googleRating: '4.80',
  reviewCount: 42,
  categories: ['plumbing'],
  location: null,
  discoveredAt: new Date('2025-01-01T00:00:00Z'),
};

const mockResponse = {
  id: RESPONSE_ID,
  jobId: JOB_ID,
  providerId: PROVIDER_ID,
  outreachAttemptId: null,
  channel: 'voice',
  quotedPrice: '350.00',
  availability: 'Tomorrow 9am–12pm',
  message: 'Happy to help!',
  ratingAtTime: '4.80',
  createdAt: new Date('2026-03-18T21:00:00Z'),
};

// ─── DB mock ─────────────────────────────────────────────────────────────────

/**
 * Creates a thenable chain where every Drizzle builder method returns `this`.
 * Awaiting the chain at any point resolves to `resolveValue`.
 */
function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'innerJoin', 'orderBy', 'values', 'set', 'returning']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain['then'] = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(resolveValue).then(resolve, reject);
  chain['catch'] = (reject: (e: unknown) => unknown) => Promise.resolve(resolveValue).catch(reject);
  chain['finally'] = (cb: () => void) => Promise.resolve(resolveValue).finally(cb);
  return chain;
}

jest.mock('../../db', () => ({
  db: { select: jest.fn(), insert: jest.fn(), update: jest.fn() },
  // schema exports — values don't matter, they're passed as opaque args to mocked db methods
  jobs: {},
  outreachAttempts: {},
  providerResponses: {},
  providers: {},
}));

jest.mock('../../services/orchestration', () => ({
  dispatchJob: jest.fn().mockResolvedValue(undefined),
  sendBookingNotifications: jest.fn().mockResolvedValue(undefined),
}));

// Bypass auth middleware — inject HOMEOWNER_ID directly onto the request
jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: { homeownerId: string }, _res: unknown, next: () => void) => {
    req.homeownerId = HOMEOWNER_ID;
    next();
  },
  signToken: jest.fn().mockReturnValue('mock-token'),
}));

jest.mock('../../services/providers/scores', () => ({
  recordHomeownerRating: jest.fn().mockResolvedValue(undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { recordHomeownerRating } = require('../../services/providers/scores') as {
  recordHomeownerRating: jest.Mock;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };

// resetAllMocks (not clearAllMocks) — clears mockReturnValueOnce queues so
// unused entries from one test don't bleed into the next.
beforeEach(() => {
  jest.resetAllMocks();
  recordHomeownerRating.mockResolvedValue(undefined);
});

// ─── POST /api/v1/jobs ────────────────────────────────────────────────────────

describe('POST /api/v1/jobs', () => {
  const validBody = {
    diagnosis: { category: 'plumbing', severity: 'high', summary: 'Leak', recommendedActions: ['Fix'] },
    timing: 'asap',
    budget: '$500',
    tier: 'standard',
    zip_code: '90210',
  };

  it('returns 400 when diagnosis is missing', async () => {
    const { diagnosis: _omit, ...body } = validBody;
    const res = await request(app).post('/api/v1/jobs').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/diagnosis/);
  });

  it('returns 400 when timing is invalid', async () => {
    const res = await request(app).post('/api/v1/jobs').send({ ...validBody, timing: 'yesterday' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/timing/);
  });

  it('returns 400 when tier is invalid', async () => {
    const res = await request(app).post('/api/v1/jobs').send({ ...validBody, tier: 'ultra' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tier/);
  });

  it('returns 400 when zip_code is missing', async () => {
    const { zip_code: _omit, ...body } = validBody;
    const res = await request(app).post('/api/v1/jobs').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/zip_code/);
  });

  it('returns 201 with correct job shape on success', async () => {
    db.insert.mockReturnValueOnce(makeChain([mockJob]));

    const res = await request(app).post('/api/v1/jobs').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();

    const { data } = res.body;
    expect(data.id).toBe(JOB_ID);
    expect(data.status).toBe('dispatching');
    expect(data.tier).toBe('standard');
    expect(data.providers_contacted).toBe(0);
    expect(typeof data.expires_at).toBe('string');
    expect(typeof data.estimated_results_at).toBe('string');

    // standard tier → 2-hour window
    const gap = new Date(data.estimated_results_at).getTime() - Date.now();
    expect(gap).toBeGreaterThan(100 * 60 * 1000);  // > 100 min
    expect(gap).toBeLessThan(125 * 60 * 1000);     // < 125 min
  });

  it('estimated_results_at is 15 min out for emergency tier', async () => {
    db.insert.mockReturnValueOnce(makeChain([{ ...mockJob, tier: 'emergency' }]));

    const res = await request(app)
      .post('/api/v1/jobs')
      .send({ ...validBody, tier: 'emergency' });

    expect(res.status).toBe(201);
    const gap = new Date(res.body.data.estimated_results_at).getTime() - Date.now();
    expect(gap).toBeLessThan(20 * 60 * 1000); // < 20 min
    expect(gap).toBeGreaterThan(10 * 60 * 1000); // > 10 min
  });

  it('estimated_results_at is 30 min out for priority tier', async () => {
    db.insert.mockReturnValueOnce(makeChain([{ ...mockJob, tier: 'priority' }]));

    const res = await request(app)
      .post('/api/v1/jobs')
      .send({ ...validBody, tier: 'priority' });

    expect(res.status).toBe(201);
    const gap = new Date(res.body.data.estimated_results_at).getTime() - Date.now();
    expect(gap).toBeLessThan(35 * 60 * 1000); // < 35 min
    expect(gap).toBeGreaterThan(25 * 60 * 1000); // > 25 min
  });
});

// ─── GET /api/v1/jobs/:id ─────────────────────────────────────────────────────

describe('GET /api/v1/jobs/:id', () => {
  it('returns 400 for a non-UUID id', async () => {
    const res = await request(app).get('/api/v1/jobs/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid job ID/);
  });

  it('returns 404 when job does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([])); // ownership check → empty

    const res = await request(app).get(`/api/v1/jobs/${JOB_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 200 with full job status', async () => {
    const attempt = { channel: 'voice', status: 'responded' };

    db.select
      .mockReturnValueOnce(makeChain([{ homeownerId: HOMEOWNER_ID }])) // ownership check
      .mockReturnValueOnce(makeChain([mockJob]))               // buildJobStatus: job
      .mockReturnValueOnce(makeChain([attempt]))               // buildJobStatus: attempts
      .mockReturnValueOnce(makeChain([{ value: 1 }]));         // buildJobStatus: accepted count

    const res = await request(app).get(`/api/v1/jobs/${JOB_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();

    const { data } = res.body;
    expect(data.id).toBe(JOB_ID);
    expect(data.status).toBe('dispatching');
    expect(data.providers_contacted).toBe(1);
    expect(data.providers_responded).toBe(1);
    expect(data.providers_accepted).toBe(1);
    expect(data.outreach_channels.voice).toEqual({ attempted: 1, connected: 1 });
    expect(data.outreach_channels.sms).toEqual({ attempted: 0, connected: 0 });
    expect(data.outreach_channels.web).toEqual({ attempted: 0, connected: 0 });
    expect(typeof data.expires_at).toBe('string');
    expect(typeof data.created_at).toBe('string');
  });
});

// ─── GET /api/v1/jobs/:id/responses ──────────────────────────────────────────

describe('GET /api/v1/jobs/:id/responses', () => {
  it('returns 400 for a non-UUID id', async () => {
    const res = await request(app).get('/api/v1/jobs/bad-id/responses');
    expect(res.status).toBe(400);
  });

  it('returns 404 when job does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([])); // job lookup → empty

    const res = await request(app).get(`/api/v1/jobs/${JOB_ID}/responses`);
    expect(res.status).toBe(404);
  });

  it('returns 200 with responses array, pending_count and more_expected', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ status: 'collecting', homeownerId: HOMEOWNER_ID }])) // job
      .mockReturnValueOnce(makeChain([{ response: mockResponse, provider: mockProvider }]))  // responses
      .mockReturnValueOnce(makeChain([{ value: 2 }]));                                       // pending count

    const res = await request(app).get(`/api/v1/jobs/${JOB_ID}/responses`);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();

    const { data } = res.body;
    expect(data.responses).toHaveLength(1);
    expect(data.pending_count).toBe(2);
    expect(data.more_expected).toBe(true);

    const [item] = data.responses;
    expect(item.id).toBe(RESPONSE_ID);
    expect(item.channel).toBe('voice');
    expect(item.quoted_price).toBe('350.00');
    expect(item.availability).toBe('Tomorrow 9am–12pm');
    expect(item.provider.name).toBe('Acme Plumbing');
    expect(item.provider.google_rating).toBe('4.80');
  });

  it('more_expected is false when job is in terminal status', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ status: 'completed', homeownerId: HOMEOWNER_ID }]))
      .mockReturnValueOnce(makeChain([]))
      .mockReturnValueOnce(makeChain([{ value: 3 }])); // pending_count > 0, but job is terminal

    const res = await request(app).get(`/api/v1/jobs/${JOB_ID}/responses`);

    expect(res.status).toBe(200);
    expect(res.body.data.more_expected).toBe(false);
  });
});

// ─── POST /api/v1/jobs/:id/book ───────────────────────────────────────────────

describe('POST /api/v1/jobs/:id/book', () => {
  const validBody = { response_id: RESPONSE_ID, provider_id: PROVIDER_ID };

  it('returns 400 when response_id is not a UUID', async () => {
    const res = await request(app)
      .post(`/api/v1/jobs/${JOB_ID}/book`)
      .send({ ...validBody, response_id: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/response_id/);
  });

  it('returns 400 when provider_id is not a UUID', async () => {
    const res = await request(app)
      .post(`/api/v1/jobs/${JOB_ID}/book`)
      .send({ ...validBody, provider_id: 'bad' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/provider_id/);
  });

  it('returns 404 when job does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app)
      .post(`/api/v1/jobs/${JOB_ID}/book`)
      .send(validBody);
    expect(res.status).toBe(404);
  });

  it('returns 409 when job is already completed', async () => {
    db.select.mockReturnValueOnce(makeChain([{ status: 'completed', homeownerId: HOMEOWNER_ID }]));

    const res = await request(app)
      .post(`/api/v1/jobs/${JOB_ID}/book`)
      .send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already completed/);
  });

  it('returns 409 when job is expired', async () => {
    db.select.mockReturnValueOnce(makeChain([{ status: 'expired', homeownerId: HOMEOWNER_ID }]));

    const res = await request(app)
      .post(`/api/v1/jobs/${JOB_ID}/book`)
      .send(validBody);
    expect(res.status).toBe(409);
  });

  it('returns 404 when response_id does not match job+provider', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ status: 'collecting', homeownerId: HOMEOWNER_ID }])) // job exists
      .mockReturnValueOnce(makeChain([]));                                                    // no matching response

    const res = await request(app)
      .post(`/api/v1/jobs/${JOB_ID}/book`)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Response not found/);
  });

  it('returns 200 with booking confirmation', async () => {
    db.select
      .mockReturnValueOnce(makeChain([{ status: 'collecting', homeownerId: HOMEOWNER_ID }]))
      .mockReturnValueOnce(makeChain([{ response: mockResponse, provider: mockProvider }]));
    db.update.mockReturnValueOnce(makeChain([]));
    db.insert.mockReturnValueOnce(makeChain([{ id: BOOKING_ID }]));

    const res = await request(app)
      .post(`/api/v1/jobs/${JOB_ID}/book`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();

    const { data } = res.body;
    expect(data.booking_id).toBe(BOOKING_ID);
    expect(data.status).toBe('confirmed');
    expect(data.provider.name).toBe('Acme Plumbing');
    expect(data.provider.phone).toBe('555-1234');
    expect(data.scheduled).toBe('Tomorrow 9am–12pm');
    expect(data.quoted_price).toBe('350.00');
  });
});

// ─── POST /api/v1/jobs/:id/rate ───────────────────────────────────────────────

describe('POST /api/v1/jobs/:id/rate', () => {
  const url = `/api/v1/jobs/${JOB_ID}/rate`;
  const validBody = { provider_id: PROVIDER_ID, rating: 4 };

  it('returns 400 for a non-UUID job id', async () => {
    const res = await request(app).post('/api/v1/jobs/bad-id/rate').send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid job ID/);
  });

  it('returns 400 when provider_id is missing', async () => {
    const res = await request(app).post(url).send({ rating: 4 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/provider_id/);
  });

  it('returns 400 when provider_id is not a UUID', async () => {
    const res = await request(app).post(url).send({ provider_id: 'not-a-uuid', rating: 4 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/provider_id/);
  });

  it('returns 400 when rating is missing', async () => {
    const res = await request(app).post(url).send({ provider_id: PROVIDER_ID });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rating/);
  });

  it('returns 400 when rating is below 1', async () => {
    const res = await request(app).post(url).send({ ...validBody, rating: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rating/);
  });

  it('returns 400 when rating is above 5', async () => {
    const res = await request(app).post(url).send({ ...validBody, rating: 6 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/rating/);
  });

  it('returns 404 when job does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    const res = await request(app).post(url).send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Job not found/);
  });

  it('returns 409 when job is not completed', async () => {
    db.select.mockReturnValueOnce(makeChain([{ status: 'collecting', homeownerId: HOMEOWNER_ID }]));
    const res = await request(app).post(url).send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/completed/);
  });

  it('returns 201 and calls recordHomeownerRating on success', async () => {
    db.select.mockReturnValueOnce(makeChain([{ status: 'completed', homeownerId: HOMEOWNER_ID }]));

    const res = await request(app).post(url).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toEqual({ recorded: true });
    expect(recordHomeownerRating).toHaveBeenCalledWith(PROVIDER_ID, 4);
  });

  it('accepts decimal ratings', async () => {
    db.select.mockReturnValueOnce(makeChain([{ status: 'completed', homeownerId: HOMEOWNER_ID }]));

    const res = await request(app).post(url).send({ ...validBody, rating: 4.5 });

    expect(res.status).toBe(201);
    expect(recordHomeownerRating).toHaveBeenCalledWith(PROVIDER_ID, 4.5);
  });
});
