import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { signToken } from '../middleware/auth';
import { ApiResponse } from '../types/api';
import { generateVerifyToken, sendVerificationEmail, verifyEmail } from '../services/email-verify';

const router = Router();

const BCRYPT_ROUNDS = 12;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface RegisterBody {
  first_name?: unknown;
  last_name?: unknown;
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
    first_name: string | null;
    last_name: string | null;
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
    const verifyToken = generateVerifyToken();

    const [homeowner] = await db
      .insert(homeowners)
      .values({
        firstName: typeof body.first_name === 'string' ? body.first_name.trim() : null,
        lastName: typeof body.last_name === 'string' ? body.last_name.trim() : null,
        email: body.email.toLowerCase().trim(),
        passwordHash,
        zipCode: body.zip_code,
        phone: typeof body.phone === 'string' ? body.phone : null,
        emailVerifyToken: verifyToken,
      })
      .returning();

    // Send verification email (fire-and-forget)
    void sendVerificationEmail(homeowner.id, homeowner.email, verifyToken, homeowner.firstName);

    const token = signToken(homeowner.id);

    const out: ApiResponse<AuthResponse> = {
      data: {
        token,
        homeowner: {
          id: homeowner.id,
          first_name: homeowner.firstName,
          last_name: homeowner.lastName,
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
    logger.error({ err }, '[POST /auth/register]');
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
          first_name: homeowner.firstName,
          last_name: homeowner.lastName,
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
    logger.error({ err }, '[POST /auth/login]');
    const out: ApiResponse<null> = { data: null, error: 'Login failed', meta: {} };
    res.status(500).json(out);
  }
});

// ── GET /api/v1/auth/verify-email ─────────────────────────────────────────────

router.get('/verify-email', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).json({ data: null, error: 'token is required', meta: {} });
    return;
  }

  try {
    const verified = await verifyEmail(token);
    if (!verified) {
      res.status(400).json({ data: null, error: 'Invalid or expired verification link', meta: {} });
      return;
    }
    res.json({ data: { verified: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /auth/verify-email]');
    res.status(500).json({ data: null, error: 'Verification failed', meta: {} });
  }
});

// ── POST /api/v1/auth/resend-verification ────────────────────────────────────

router.post('/resend-verification', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email || typeof email !== 'string') {
    res.status(400).json({ data: null, error: 'email is required', meta: {} });
    return;
  }

  try {
    const [homeowner] = await db
      .select({ id: homeowners.id, firstName: homeowners.firstName, emailVerified: homeowners.emailVerified })
      .from(homeowners)
      .where(eq(homeowners.email, email.toLowerCase().trim()))
      .limit(1);

    // Always return success to prevent enumeration
    if (!homeowner || homeowner.emailVerified) {
      res.json({ data: { sent: true }, error: null, meta: {} });
      return;
    }

    const newToken = generateVerifyToken();
    await db.update(homeowners).set({ emailVerifyToken: newToken }).where(eq(homeowners.id, homeowner.id));
    void sendVerificationEmail(homeowner.id, email.toLowerCase().trim(), newToken, homeowner.firstName);

    res.json({ data: { sent: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /auth/resend-verification]');
    res.status(500).json({ data: null, error: 'Failed to resend', meta: {} });
  }
});

// ── POST /api/v1/auth/reset-password ─────────────────────────────────────────

interface ResetPasswordBody {
  email?: unknown;
  current_password?: unknown;
  new_password?: unknown;
}

router.post('/reset-password', async (req: Request, res: Response) => {
  const body = req.body as ResetPasswordBody;

  if (!body.email || typeof body.email !== 'string' || !EMAIL_RE.test(body.email)) {
    const out: ApiResponse<null> = { data: null, error: 'email must be a valid email address', meta: {} };
    res.status(400).json(out);
    return;
  }
  if (!body.current_password || typeof body.current_password !== 'string') {
    const out: ApiResponse<null> = { data: null, error: 'current_password is required', meta: {} };
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
      .select({ id: homeowners.id, passwordHash: homeowners.passwordHash })
      .from(homeowners)
      .where(eq(homeowners.email, body.email.toLowerCase().trim()))
      .limit(1);

    // Always return generic error to prevent email enumeration
    if (!homeowner) {
      const out: ApiResponse<null> = { data: null, error: 'Invalid email or password', meta: {} };
      res.status(401).json(out);
      return;
    }

    // Verify current password before allowing reset
    const valid = await bcrypt.compare(body.current_password, homeowner.passwordHash);
    if (!valid) {
      const out: ApiResponse<null> = { data: null, error: 'Invalid email or password', meta: {} };
      res.status(401).json(out);
      return;
    }

    const passwordHash = await bcrypt.hash(body.new_password, BCRYPT_ROUNDS);
    await db.update(homeowners).set({ passwordHash }).where(eq(homeowners.id, homeowner.id));

    const out: ApiResponse<{ reset: true }> = { data: { reset: true }, error: null, meta: {} };
    res.json(out);
  } catch (err) {
    logger.error({ err }, '[POST /auth/reset-password]');
    const out: ApiResponse<null> = { data: null, error: 'Password reset failed', meta: {} };
    res.status(500).json(out);
  }
});

export default router;
