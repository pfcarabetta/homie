import request from 'supertest';
import app from '../../app';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const HOMEOWNER_ID = 'aaaaaaaa-1111-1111-1111-111111111111';

const mockHomeowner = {
  id: HOMEOWNER_ID,
  email: 'alice@example.com',
  passwordHash: '$2a$12$hashedpassword',
  phone: null,
  zipCode: '90210',
  membershipTier: 'free',
  stripeCustomerId: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../db', () => ({
  db: { select: jest.fn(), insert: jest.fn() },
  homeowners: {},
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$hashedpassword'),
  compare: jest.fn(),
}));

jest.mock('../../middleware/auth', () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
  signToken: jest.fn().mockReturnValue('mock.jwt.token'),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../../db') as { db: Record<string, jest.Mock> };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const bcrypt = require('bcryptjs') as Record<string, jest.Mock>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { signToken } = require('../../middleware/auth') as { signToken: jest.Mock };

function makeChain(resolveValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'limit', 'values', 'returning']) {
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
  signToken.mockReturnValue('mock.jwt.token');
  bcrypt.hash.mockResolvedValue('$2a$12$hashedpassword');
  bcrypt.compare.mockResolvedValue(false); // safe default
});

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  const url = '/api/v1/auth/register';
  const validBody = { email: 'alice@example.com', password: 'password123', zip_code: '90210' };

  it('returns 400 when email is missing', async () => {
    const res = await request(app).post(url).send({ password: 'password123', zip_code: '90210' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/);
  });

  it('returns 400 when email is invalid', async () => {
    const res = await request(app).post(url).send({ ...validBody, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/);
  });

  it('returns 400 when password is too short', async () => {
    const res = await request(app).post(url).send({ ...validBody, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/);
  });

  it('returns 400 when zip_code is not 5 digits', async () => {
    const res = await request(app).post(url).send({ ...validBody, zip_code: 'abcde' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/zip_code/);
  });

  it('returns 409 when email is already taken', async () => {
    const uniqueError = new Error('duplicate key value violates unique constraint on email');
    db.insert.mockReturnValueOnce({
      values: jest.fn().mockReturnThis(),
      returning: jest.fn().mockRejectedValue(uniqueError),
    });

    const res = await request(app).post(url).send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/);
  });

  it('returns 201 with token and homeowner on success', async () => {
    db.insert.mockReturnValueOnce(makeChain([mockHomeowner]));

    const res = await request(app).post(url).send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.error).toBeNull();
    expect(res.body.data.token).toBe('mock.jwt.token');
    expect(res.body.data.homeowner.id).toBe(HOMEOWNER_ID);
    expect(res.body.data.homeowner.email).toBe('alice@example.com');
    expect(res.body.data.homeowner.zip_code).toBe('90210');
    expect(res.body.data.homeowner.membership_tier).toBe('free');
    // passwordHash must never appear in the response
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('password_hash');
  });
});

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  const url = '/api/v1/auth/login';
  const validBody = { email: 'alice@example.com', password: 'password123' };

  it('returns 400 when email is missing', async () => {
    const res = await request(app).post(url).send({ password: 'password123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app).post(url).send({ email: 'alice@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/);
  });

  it('returns 401 when account does not exist', async () => {
    db.select.mockReturnValueOnce(makeChain([]));

    const res = await request(app).post(url).send(validBody);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid email or password/);
  });

  it('returns 401 when password is wrong', async () => {
    db.select.mockReturnValueOnce(makeChain([mockHomeowner]));
    bcrypt.compare.mockResolvedValueOnce(false);

    const res = await request(app).post(url).send(validBody);
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/Invalid email or password/);
  });

  it('uses the same error message for missing account and wrong password (prevents enumeration)', async () => {
    db.select.mockReturnValueOnce(makeChain([]));
    const noAccount = await request(app).post(url).send(validBody);

    db.select.mockReturnValueOnce(makeChain([mockHomeowner]));
    bcrypt.compare.mockResolvedValueOnce(false);
    const wrongPassword = await request(app).post(url).send(validBody);

    expect(noAccount.body.error).toBe(wrongPassword.body.error);
  });

  it('returns 200 with token and homeowner on success', async () => {
    db.select.mockReturnValueOnce(makeChain([mockHomeowner]));
    bcrypt.compare.mockResolvedValueOnce(true);

    const res = await request(app).post(url).send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.error).toBeNull();
    expect(res.body.data.token).toBe('mock.jwt.token');
    expect(res.body.data.homeowner.id).toBe(HOMEOWNER_ID);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });
});
