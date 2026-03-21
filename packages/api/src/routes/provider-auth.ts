import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { eq, or } from 'drizzle-orm';
import { db } from '../db';
import { providers } from '../db/schema/providers';
import { signProviderToken, type ProviderJwtPayload } from '../middleware/provider-auth';
import { sendSms, sendEmail } from '../services/notifications';

const router = Router();
const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

// POST /api/v1/provider-auth/magic-link
router.post('/magic-link', async (req: Request, res: Response) => {
  const { phone, email } = req.body as { phone?: string; email?: string };

  if (!phone && !email) {
    res.status(400).json({ data: null, error: 'phone or email is required', meta: {} });
    return;
  }

  try {
    const conditions = [];
    if (phone) conditions.push(eq(providers.phone, phone));
    if (email) conditions.push(eq(providers.email, email.toLowerCase().trim()));

    const [provider] = await db
      .select({ id: providers.id, name: providers.name, phone: providers.phone, email: providers.email })
      .from(providers)
      .where(conditions.length > 1 ? or(...conditions) : conditions[0])
      .limit(1);

    // Always return success to prevent enumeration
    if (!provider) {
      res.json({ data: { sent: true }, error: null, meta: {} });
      return;
    }

    const token = signProviderToken(provider.id);
    const link = `${APP_URL}/portal/login?token=${token}`;

    if (phone && provider.phone) {
      void sendSms(provider.phone, `Hey ${provider.name}! Access your Homie Pro portal: ${link}`);
    } else if (email && provider.email) {
      void sendEmail(
        provider.email,
        'Your Homie Pro Portal Login',
        `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
          <h1 style="color: #E8632B; font-size: 24px;">homie</h1>
          <p style="font-size: 16px; color: #2D2926;">Hey ${provider.name}!</p>
          <p style="font-size: 15px; color: #6B6560; line-height: 1.6;">Click below to access your Homie Pro portal:</p>
          <a href="${link}" style="display: inline-block; background: #E8632B; color: white; padding: 14px 32px; border-radius: 100px; text-decoration: none; font-weight: 600; font-size: 16px; margin-top: 16px;">Open Portal</a>
          <p style="font-size: 12px; color: #9B9490; margin-top: 24px;">This link expires in 30 days.</p>
        </div>`,
      );
    }

    res.json({ data: { sent: true }, error: null, meta: {} });
  } catch (err) {
    console.error('[POST /provider-auth/magic-link]', err);
    res.status(500).json({ data: null, error: 'Failed to send login link', meta: {} });
  }
});

// GET /api/v1/provider-auth/verify
router.get('/verify', async (req: Request, res: Response) => {
  const token = req.query.token as string;
  if (!token) {
    res.status(400).json({ data: null, error: 'token is required', meta: {} });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ data: null, error: 'Server misconfiguration', meta: {} });
      return;
    }

    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as ProviderJwtPayload;
    if (payload.type !== 'provider') {
      res.status(401).json({ data: null, error: 'Invalid token type', meta: {} });
      return;
    }

    const [provider] = await db
      .select({
        id: providers.id,
        name: providers.name,
        phone: providers.phone,
        email: providers.email,
        categories: providers.categories,
      })
      .from(providers)
      .where(eq(providers.id, payload.sub))
      .limit(1);

    if (!provider) {
      res.status(404).json({ data: null, error: 'Provider not found', meta: {} });
      return;
    }

    // Issue a fresh token
    const freshToken = signProviderToken(provider.id);

    res.json({
      data: {
        token: freshToken,
        provider: {
          id: provider.id,
          name: provider.name,
          phone: provider.phone,
          email: provider.email,
          categories: provider.categories,
        },
      },
      error: null,
      meta: {},
    });
  } catch {
    res.status(401).json({ data: null, error: 'Invalid or expired link', meta: {} });
  }
});

export default router;
