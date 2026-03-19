import request from 'supertest';
import app from '../../app';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BOOKING_ID  = 'e0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const JOB_ID      = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const HOMEOWNER_ID = 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const PROVIDER_ID  = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const RESPONSE_ID  = 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const CONFIRMED_AT = new Date('2026-03-18T21:00:00Z');

const mockBooking = {
  id: BOOKING_ID,
  jobId: JOB_ID,
  homeownerId: HOMEOWNER_ID,
  providerId: PROVIDER_ID,
  responseId: RESPONSE_ID,
  status: 'confirmed',
  confirmedAt: CONFIRMED_AT,
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

const mockProviderResponse = {
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

// ─── DB mock ──────────────────────────────────────────────────────────────────

function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'innerJoin', 'leftJoin', 'orderBy', 'values', 'set', 'returning']) {
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
  bookings: {},
  providers: {},
  providerResponses: {},
}));

jest.mock('../../middleware/auth', () => ({
  requireAuth: (req: { homeownerId: string }, _res: unknown, next: () => void) => {
    req.homeownerId = HOMEOWNER_ID;
    next();
  },
  signToken: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: { select: jest.Mock } };

beforeEach(() => {
  jest.resetAllMocks();
});

// ─── GET /api/v1/bookings/:id ─────────────────────────────────────────────────

describe('GET /api/v1/bookings/:id', () => {
  it('400 on invalid UUID', async () => {
    const res = await request(app).get('/api/v1/bookings/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid booking ID');
  });

  it('404 when booking does not exist for this homeowner', async () => {
    db.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app).get(`/api/v1/bookings/${BOOKING_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Booking not found');
  });

  it('200 with full booking payload', async () => {
    db.select.mockReturnValueOnce(
      makeChain([{ booking: mockBooking, provider: mockProvider, response: mockProviderResponse }]),
    );

    const res = await request(app).get(`/api/v1/bookings/${BOOKING_ID}`);
    expect(res.status).toBe(200);

    const { data } = res.body;
    expect(data.id).toBe(BOOKING_ID);
    expect(data.job_id).toBe(JOB_ID);
    expect(data.status).toBe('confirmed');
    expect(data.confirmed_at).toBe(CONFIRMED_AT.toISOString());
    expect(data.quoted_price).toBe('350.00');
    expect(data.scheduled).toBe('Tomorrow 9am–12pm');
    expect(data.provider).toEqual({ id: PROVIDER_ID, name: 'Acme Plumbing', phone: '555-1234' });
  });

  it('200 with null quoted_price and scheduled when response is null', async () => {
    db.select.mockReturnValueOnce(
      makeChain([{ booking: mockBooking, provider: mockProvider, response: null }]),
    );

    const res = await request(app).get(`/api/v1/bookings/${BOOKING_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.data.quoted_price).toBeNull();
    expect(res.body.data.scheduled).toBeNull();
  });

  it('500 on db error', async () => {
    db.select.mockReturnValueOnce(makeChain(Promise.reject(new Error('db error'))));

    const res = await request(app).get(`/api/v1/bookings/${BOOKING_ID}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Failed to fetch booking');
  });
});
