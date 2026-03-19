import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth, signToken } from '../auth';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HOMEOWNER_ID = 'aaaaaaaa-1111-1111-1111-111111111111';
const SECRET = 'test-secret-32-chars-long-enough!';

function makeReq(authHeader?: string): Partial<Request> {
  return { headers: { authorization: authHeader } } as Partial<Request>;
}

function makeRes(): { status: jest.Mock; json: jest.Mock } {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const ENV_BACKUP = process.env;

beforeEach(() => {
  process.env = { ...ENV_BACKUP, JWT_SECRET: SECRET };
});

afterAll(() => {
  process.env = ENV_BACKUP;
});

// ─── requireAuth ──────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('calls next() and sets req.homeownerId for a valid token', () => {
    const token = jwt.sign({ sub: HOMEOWNER_ID }, SECRET, { algorithm: 'HS256' });
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = jest.fn();

    requireAuth(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as Request).homeownerId).toBe(HOMEOWNER_ID);
  });

  it('returns 401 when Authorization header is missing', () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    requireAuth(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Authorization') }));
  });

  it('returns 401 when token is missing the Bearer prefix', () => {
    const token = jwt.sign({ sub: HOMEOWNER_ID }, SECRET);
    const req = makeReq(token); // no "Bearer " prefix
    const res = makeRes();
    const next = jest.fn();

    requireAuth(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for an expired token', () => {
    const token = jwt.sign({ sub: HOMEOWNER_ID }, SECRET, { expiresIn: -1 });
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = jest.fn();

    requireAuth(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('expired') }));
  });

  it('returns 401 for a token signed with a different secret', () => {
    const token = jwt.sign({ sub: HOMEOWNER_ID }, 'wrong-secret');
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = jest.fn();

    requireAuth(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for a tampered token', () => {
    const token = jwt.sign({ sub: HOMEOWNER_ID }, SECRET);
    const tampered = token.slice(0, -3) + 'xxx';
    const req = makeReq(`Bearer ${tampered}`);
    const res = makeRes();
    const next = jest.fn();

    requireAuth(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 500 when JWT_SECRET env var is not set', () => {
    delete process.env.JWT_SECRET;
    const token = jwt.sign({ sub: HOMEOWNER_ID }, SECRET);
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = jest.fn();

    requireAuth(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── signToken ────────────────────────────────────────────────────────────────

describe('signToken', () => {
  it('produces a token that requireAuth accepts', () => {
    const token = signToken(HOMEOWNER_ID);
    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = jest.fn();

    requireAuth(req as Request, res as unknown as Response, next as NextFunction);

    expect(next).toHaveBeenCalledTimes(1);
    expect((req as Request).homeownerId).toBe(HOMEOWNER_ID);
  });

  it('throws when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;
    expect(() => signToken(HOMEOWNER_ID)).toThrow('JWT_SECRET');
  });

  it('encodes the homeowner id in the sub claim', () => {
    const token = signToken(HOMEOWNER_ID);
    const decoded = jwt.decode(token) as { sub: string };
    expect(decoded.sub).toBe(HOMEOWNER_ID);
  });
});
