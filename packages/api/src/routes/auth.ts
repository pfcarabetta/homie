import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { signToken } from '../middleware/auth';
import { ApiResponse } from '../types/api';

const router = Router();

const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RegisterBody {
  email?: unknown;
  password?: unknown;
  zip_code?: unknown;
  phone?: unknown;
}

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

interface AuthResponse {
  token: string;
  homeowner: {
    id: string;
    email: string;
    zip_code: string;
    membership_tier: string;
  };
}

// ── POST /api/v1/auth/register ────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response) => {
  const body = req.body as RegisterBody;

  if (!body.email || typeof body.email !== 'string' || !EMAIL_RE.test(body.email)) {
    const out: ApiResponse<null> = { data: null, error: 'email must be a valid email address', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!body.password || typeof body.password !== 'string' || body.password.length < 8) {
    const out: ApiResponse<null> = { data: null, error: 'password must be at least 8 characters', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!body.zip_code || typeof body.zip_code !== 'string' || !/^\d{5}$/.test(body.zip_code)) {
    const out: ApiResponse<null> = { data: null, error: 'zip_code must be a 5-digit US zip code', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(body.password, BCRYPT_ROUNDS);

    const [homeowner] = await db
      .insert(homeowners)
      .values({
        email: body.email.toLowerCase().trim(),
        passwordHash,
        zipCode: body.zip_code,
        phone: typeof body.phone === 'string' ? body.phone : null,
      })
      .returning();

    const token = signToken(homeowner.id);

    const out: ApiResponse<AuthResponse> = {
      data: {
        token,
        homeowner: {
          id: homeowner.id,
          email: homeowner.email,
          zip_code: homeowner.zipCode,
          membership_tier: homeowner.membershipTier,
        },
      },
      error: null,
      meta: {},
    };
    res.status(201).json(out);
  } catch (err: unknown) {
    // Unique constraint violation on email
    if (err instanceof Error && err.message.includes('unique')) {
      const out: ApiResponse<null> = { data: null, error: 'An account with that email already exists', meta: {} };
      res.status(409).json(out);
      return;
    }
    console.error('[POST /auth/register]', err);
    const out: ApiResponse<null> = { data: null, error: 'Registration failed', meta: {} };
    res.status(500).json(out);
  }
});

// ── POST /api/v1/auth/login ───────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response) => {
  const body = req.body as LoginBody;

  if (!body.email || typeof body.email !== 'string') {
    const out: ApiResponse<null> = { data: null, error: 'email is required', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!body.password || typeof body.password !== 'string') {
    const out: ApiResponse<null> = { data: null, error: 'password is required', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    const [homeowner] = await db
      .select()
      .from(homeowners)
      .where(eq(homeowners.email, body.email.toLowerCase().trim()))
      .limit(1);

    // Intentionally same error for missing account and wrong password (prevents enumeration)
    const INVALID = 'Invalid email or password';

    if (!homeowner) {
      const out: ApiResponse<null> = { data: null, error: INVALID, meta: {} };
      res.status(401).json(out);
      return;
    }

    const passwordMatch = await bcrypt.compare(body.password, homeowner.passwordHash);
    if (!passwordMatch) {
      const out: ApiResponse<null> = { data: null, error: INVALID, meta: {} };
      res.status(401).json(out);
      return;
    }

    const token = signToken(homeowner.id);

    const out: ApiResponse<AuthResponse> = {
      data: {
        token,
        homeowner: {
          id: homeowner.id,
          email: homeowner.email,
          zip_code: homeowner.zipCode,
          membership_tier: homeowner.membershipTier,
        },
      },
      error: null,
      meta: {},
    };
    res.json(out);
  } catch (err) {
    console.error('[POST /auth/login]', err);
    const out: ApiResponse<null> = { data: null, error: 'Login failed', meta: {} };
    res.status(500).json(out);
  }
});

// ── POST /api/v1/auth/reset-password ─────────────────────────────────────────

interface ResetPasswordBody {
  email?: unknown;
  new_password?: unknown;
}

router.post('/reset-password', async (req: Request, res: Response) => {
  const body = req.body as ResetPasswordBody;

  if (!body.email || typeof body.email !== 'string' || !EMAIL_RE.test(body.email)) {
    const out: ApiResponse<null> = { data: null, error: 'email must be a valid email address', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!body.new_password || typeof body.new_password !== 'string' || body.new_password.length < 8) {
    const out: ApiResponse<null> = { data: null, error: 'new_password must be at least 8 characters', meta: {} };
    res.status(400).json(out);
    return;
  }

  try {
    const [homeowner] = await db
      .select({ id: homeowners.id })
      .from(homeowners)
      .where(eq(homeowners.email, body.email.toLowerCase().trim()))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!homeowner) {
      const out: ApiResponse<{ reset: true }> = { data: { reset: true }, error: null, meta: {} };
      res.json(out);
      return;
    }

    const passwordHash = await bcrypt.hash(body.new_password, BCRYPT_ROUNDS);
    await db.update(homeowners).set({ passwordHash }).where(eq(homeowners.id, homeowner.id));

    const out: ApiResponse<{ reset: true }> = { data: { reset: true }, error: null, meta: {} };
    res.json(out);
  } catch (err) {
    console.error('[POST /auth/reset-password]', err);
    const out: ApiResponse<null> = { data: null, error: 'Password reset failed', meta: {} };
    res.status(500).json(out);
  }
});

export default router;
