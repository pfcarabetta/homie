import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { signToken } from '../middleware/auth';
import { ApiResponse } from '../types/api';
import { generateVerifyToken, sendVerificationEmail, verifyEmail } from '../services/email-verify';
import { sendEmail } from '../services/notifications';

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
  sms_opt_in?: boolean;
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
        smsOptIn: body.sms_opt_in === true,
        smsOptInAt: body.sms_opt_in === true ? new Date() : null,
        emailVerifyToken: verifyToken,
      })
      .returning();

    // Send verification email (fire-and-forget)
    void sendVerificationEmail(homeowner.id, homeowner.email, verifyToken, homeowner.firstName);

    // Send SMS opt-in confirmation if user consented and provided a phone number
    if (body.sms_opt_in && homeowner.phone) {
      try {
        const { sendSms } = await import('../services/notifications');
        void sendSms(
          homeowner.phone,
          'homie: SMS notifications active! You\'ll get booking confirmations, maintenance updates, and quote alerts. Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to opt out.',
        );
      } catch { /* non-fatal */ }
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

const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

// POST /api/v1/auth/reset-password — Request a password reset link
router.post('/reset-password', async (req: Request, res: Response) => {
  const { email } = req.body as { email?: unknown };

  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email)) {
    res.status(400).json({ data: null, error: 'email must be a valid email address', meta: {} });
    return;
  }

  try {
    const [homeowner] = await db
      .select({ id: homeowners.id, firstName: homeowners.firstName })
      .from(homeowners)
      .where(eq(homeowners.email, email.toLowerCase().trim()))
      .limit(1);

    // Always return success to prevent email enumeration
    if (!homeowner) {
      res.json({ data: { sent: true }, error: null, meta: {} });
      return;
    }

    // Generate a secure random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

    await db.update(homeowners).set({
      passwordResetToken: token,
      passwordResetExpiresAt: expiresAt,
    } as Record<string, unknown>).where(eq(homeowners.id, homeowner.id));

    const resetLink = `${APP_URL}/reset-password/confirm?token=${token}`;
    const name = homeowner.firstName || 'there';

    void sendEmail(
      email.toLowerCase().trim(),
      'Reset your Homie password',
      `<div style="font-family: 'DM Sans', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
        <h1 style="font-family: serif; color: #E8632B; font-size: 28px; margin: 0 0 24px;">homie</h1>
        <p style="font-size: 16px; color: #2D2926;">Hey ${name}!</p>
        <p style="font-size: 15px; color: #6B6560; line-height: 1.6;">We received a request to reset your password. Click the button below to choose a new one:</p>
        <a href="${resetLink}" style="display: inline-block; background: #E8632B; color: white; padding: 14px 32px; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 24px 0;">Reset Password</a>
        <p style="font-size: 13px; color: #9B9490; line-height: 1.6;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </div>`,
    );

    res.json({ data: { sent: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /auth/reset-password]');
    res.status(500).json({ data: null, error: 'Password reset failed', meta: {} });
  }
});

// POST /api/v1/auth/reset-password/confirm — Set new password with token
router.post('/reset-password/confirm', async (req: Request, res: Response) => {
  const { token, new_password } = req.body as { token?: unknown; new_password?: unknown };

  if (!token || typeof token !== 'string') {
    res.status(400).json({ data: null, error: 'Reset token is required', meta: {} });
    return;
  }
  if (!new_password || typeof new_password !== 'string' || new_password.length < 8) {
    res.status(400).json({ data: null, error: 'Password must be at least 8 characters', meta: {} });
    return;
  }

  try {
    const [homeowner] = await db
      .select({ id: homeowners.id, passwordResetExpiresAt: homeowners.passwordResetExpiresAt })
      .from(homeowners)
      .where(eq(homeowners.passwordResetToken, token))
      .limit(1);

    if (!homeowner) {
      res.status(400).json({ data: null, error: 'Invalid or expired reset link', meta: {} });
      return;
    }

    if (!homeowner.passwordResetExpiresAt || homeowner.passwordResetExpiresAt < new Date()) {
      res.status(400).json({ data: null, error: 'Reset link has expired. Please request a new one.', meta: {} });
      return;
    }

    const passwordHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await db.update(homeowners).set({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpiresAt: null,
    } as Record<string, unknown>).where(eq(homeowners.id, homeowner.id));

    res.json({ data: { reset: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /auth/reset-password/confirm]');
    res.status(500).json({ data: null, error: 'Password reset failed', meta: {} });
  }
});

export default router;
