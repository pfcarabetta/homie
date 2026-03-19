import request from 'supertest';
import app from '../../app';
import { DiscoveryResult } from '../../types/providers';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PROVIDER_ID = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const mockDiscoveryResult: DiscoveryResult = {
  providers: [
    {
      id: PROVIDER_ID,
      name: 'Acme Plumbing',
      phone: '+15551234567',
      email: 'info@acmeplumbing.com',
      website: 'https://acmeplumbing.com',
      google_place_id: 'place-abc',
      google_rating: '4.8',
      review_count: 120,
      categories: ['plumbing'],
      distance_miles: 3.2,
      rank_score: 0.812,
      homie_score: {
        acceptance_rate: 0.9,
        completion_rate: 0.95,
        avg_homeowner_rating: 4.7,
        avg_response_sec: 320,
        total_jobs: 18,
      },
      channels_available: ['voice', 'sms', 'web'],
      suppressed: false,
      rate_limited: false,
      last_contacted: null,
    },
  ],
  total_found: 12,
  filtered_out: 2,
  sources: { google_maps: 8, internal: 4, yelp: 0 },
};

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../services/providers/discovery', () => ({
  discoverProviders: jest.fn(),
}));

jest.mock('../../db', () => ({
  db: { select: jest.fn(), insert: jest.fn() },
  providers: {},
  suppressionList: {},
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { discoverProviders } = require('../../services/providers/discovery') as {
  discoverProviders: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };

function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'values', 'onConflictDoNothing', 'returning']) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain['then'] = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(resolveValue).then(resolve, reject);
  chain['catch'] = (reject: (e: unknown) => unknown) => Promise.resolve(resolveValue).catch(reject);
  chain['finally'] = (cb: () => void) => Promise.resolve(resolveValue).finally(cb);
  return chain;
}

beforeEach(() => jest.resetAllMocks());

// ─── GET /api/v1/providers/discover ──────────────────────────────────────────

describe('GET /api/v1/providers/discover', () => {
  const base = '/api/v1/providers/discover?category=plumbing&zip_code=90210';

  it('returns 400 when category is missing', async () => {
    const res = await request(app).get('/api/v1/providers/discover?zip_code=90210');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/);
  });

  it('returns 400 when zip_code is missing', async () => {
    const res = await request(app).get('/api/v1/providers/discover?category=plumbing');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/zip_code/);
  });

  it('returns 400 when zip_code is not a 5-digit zip', async () => {
    const res = await request(app).get('/api/v1/providers/discover?category=plumbing&zip_code=abc');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/zip_code/);
  });

  it('returns 400 when radius_miles is out of range', async () => {
    const res = await request(app).get(`${base}&radius_miles=999`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/radius_miles/);
  });

  it('returns 400 when min_rating is out of range', async () => {
    const res = await request(app).get(`${base}&min_rating=6`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/min_rating/);
  });

  it('returns 400 when limit is out of range', async () => {
    const res = await request(app).get(`${base}&limit=0`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/limit/);
  });

  it('returns 200 with discovery result using defaults', async () => {
    discoverProviders.mockResolvedValueOnce(mockDiscoveryResult);

    const res = await request(app).get(base);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();

    // Verify discoverProviders was called with correct defaults
    expect(discoverProviders).toHaveBeenCalledWith({
      category: 'plumbing',
      zipCode: '90210',
      radiusMiles: 15,
      minRating: 4.0,
      limit: 15,
    });

    const { data } = res.body;
    expect(data.total_found).toBe(12);
    expect(data.filtered_out).toBe(2);
    expect(data.sources).toEqual({ google_maps: 8, internal: 4, yelp: 0 });
    expect(data.providers).toHaveLength(1);

    const [p] = data.providers;
    expect(p.name).toBe('Acme Plumbing');
    expect(p.distance_miles).toBe(3.2);
    expect(p.rank_score).toBe(0.812);
    expect(p.channels_available).toEqual(['voice', 'sms', 'web']);
    expect(p.suppressed).toBe(false);
    expect(p.rate_limited).toBe(false);
    expect(p.homie_score.total_jobs).toBe(18);
  });

  it('passes custom query params to the discovery service', async () => {
    discoverProviders.mockResolvedValueOnce({ ...mockDiscoveryResult, providers: [] });

    await request(app).get(`${base}&radius_miles=10&min_rating=4.5&limit=5`);

    expect(discoverProviders).toHaveBeenCalledWith({
      category: 'plumbing',
      zipCode: '90210',
      radiusMiles: 10,
      minRating: 4.5,
      limit: 5,
    });
  });

  it('returns 502 when the discovery service throws', async () => {
    discoverProviders.mockRejectedValueOnce(new Error('GOOGLE_MAPS_API_KEY is not set'));

    const res = await request(app).get(base);

    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/GOOGLE_MAPS_API_KEY/);
  });
});

// ─── POST /api/v1/providers/:id/suppress ─────────────────────────────────────

describe('POST /api/v1/providers/:id/suppress', () => {
  const url = `/api/v1/providers/${PROVIDER_ID}/suppress`;
  const validBody = { reason: 'provider_requested' };

  it('returns 400 for a non-UUID provider id', async () => {
    const res = await request(app).post('/api/v1/providers/bad-id/suppress').send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid provider ID/);
  });

  it('returns 400 when reason is missing', async () => {
    db.select.mockReturnValueOnce(makeChain([{ id: PROVIDER_ID }]));
    const res = await request(app).post(url).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/);
  });

  it('returns 400 when reason is invalid', async () => {
    const res = await request(app).post(url).send({ reason: 'spam' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reason/);
  });

  it('returns 404 when provider does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app).post(url).send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Provider not found/);
  });

  it('returns 201 on successful suppression', async () => {
    db.select.mockReturnValueOnce(makeChain([{ id: PROVIDER_ID }]));
    db.insert.mockReturnValueOnce(makeChain([]));

    const res = await request(app).post(url).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data).toEqual({ provider_id: PROVIDER_ID, reason: 'provider_requested' });
  });

  it('accepts all valid suppression reasons', async () => {
    const reasons = ['provider_requested', 'rate_limited', 'permanently_unreachable'];
    for (const reason of reasons) {
      db.select.mockReturnValueOnce(makeChain([{ id: PROVIDER_ID }]));
      db.insert.mockReturnValueOnce(makeChain([]));
      const res = await request(app).post(url).send({ reason });
      expect(res.status).toBe(201);
    }
  });
});
