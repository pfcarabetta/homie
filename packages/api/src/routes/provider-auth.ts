import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { eq, or } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { providers } from '../db/schema/providers';
import { signProviderToken, requireProviderAuth, type ProviderJwtPayload } from '../middleware/provider-auth';
import { sendSms, sendEmail } from '../services/notifications';
import { geocodeZip } from '../services/providers/google-maps';

const BCRYPT_ROUNDS = 12;

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
    logger.error({ err }, '[POST /provider-auth/magic-link]');
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

// POST /api/v1/provider-auth/signup — Create new provider with Google Places auto-match
router.post('/signup', async (req: Request, res: Response) => {
  const body = req.body as {
    name?: string;
    business?: string;
    phone?: string;
    email?: string;
    zip?: string;
    categories?: string[];
  };

  if (!body.name || !body.business || !body.phone || !body.email || !body.zip) {
    res.status(400).json({ data: null, error: 'name, business, phone, email, and zip are required', meta: {} });
    return;
  }

  try {
    // Check if provider already exists by phone or email
    const [existing] = await db
      .select({ id: providers.id })
      .from(providers)
      .where(or(eq(providers.phone, body.phone), eq(providers.email, body.email.toLowerCase().trim())))
      .limit(1);

    if (existing) {
      // Provider exists — send them a login link instead
      const token = signProviderToken(existing.id);
      res.json({
        data: {
          token,
          provider_id: existing.id,
          existing: true,
          google_match: null,
        },
        error: null,
        meta: {},
      });
      return;
    }

    // Try to auto-match with Google Places
    let googleMatch: { placeId: string; name: string; rating: number; reviewCount: number; address: string } | null = null;

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      try {
        const { lat, lng } = await geocodeZip(body.zip);
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(body.business)}&location=${lat},${lng}&radius=16000&key=${apiKey}`;
        const searchRes = await fetch(searchUrl);
        const searchData = await searchRes.json() as { status: string; results: Array<{ place_id: string; name: string; rating?: number; user_ratings_total?: number; formatted_address?: string }> };

        if (searchData.status === 'OK' && searchData.results.length > 0) {
          // Check name similarity — basic matching
          const topResult = searchData.results[0];
          const inputName = body.business.toLowerCase().replace(/[^a-z0-9]/g, '');
          const resultName = topResult.name.toLowerCase().replace(/[^a-z0-9]/g, '');

          // Match if the input contains the result or vice versa, or they share > 60% characters
          const isMatch = inputName.includes(resultName) || resultName.includes(inputName) ||
            inputName.length > 3 && resultName.length > 3;

          if (isMatch) {
            googleMatch = {
              placeId: topResult.place_id,
              name: topResult.name,
              rating: topResult.rating ?? 0,
              reviewCount: topResult.user_ratings_total ?? 0,
              address: topResult.formatted_address ?? '',
            };
          }
        }
      } catch (err) {
        logger.warn({ err }, '[provider-auth/signup] Google Places match failed, continuing without');
      }
    }

    // Create the provider
    const [provider] = await db
      .insert(providers)
      .values({
        name: body.business.trim(),
        phone: body.phone,
        email: body.email.toLowerCase().trim(),
        categories: body.categories ?? null,
        serviceZips: [`${body.zip}:25`],
        googlePlaceId: googleMatch?.placeId ?? null,
        googleRating: googleMatch ? String(googleMatch.rating) : null,
        reviewCount: googleMatch?.reviewCount ?? 0,
      })
      .returning();

    const token = signProviderToken(provider.id);

    res.status(201).json({
      data: {
        token,
        provider_id: provider.id,
        existing: false,
        google_match: googleMatch,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /provider-auth/signup]');
    res.status(500).json({ data: null, error: 'Failed to create provider account', meta: {} });
  }
});

// POST /api/v1/provider-auth/login — Password login for providers
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ data: null, error: 'email and password are required', meta: {} });
    return;
  }

  try {
    const [provider] = await db
      .select({ id: providers.id, name: providers.name, phone: providers.phone, email: providers.email, categories: providers.categories, passwordHash: providers.passwordHash })
      .from(providers)
      .where(eq(providers.email, email.toLowerCase().trim()))
      .limit(1);

    if (!provider || !provider.passwordHash) {
      res.status(401).json({ data: null, error: 'Invalid email or password', meta: {} });
      return;
    }

    const valid = await bcrypt.compare(password, provider.passwordHash);
    if (!valid) {
      res.status(401).json({ data: null, error: 'Invalid email or password', meta: {} });
      return;
    }

    const token = signProviderToken(provider.id);
    res.json({
      data: {
        token,
        provider: { id: provider.id, name: provider.name, phone: provider.phone, email: provider.email, categories: provider.categories },
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /provider-auth/login]');
    res.status(500).json({ data: null, error: 'Login failed', meta: {} });
  }
});

// POST /api/v1/provider-auth/set-password — Set password (requires auth)
router.post('/set-password', requireProviderAuth, async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };

  if (!password || password.length < 8) {
    res.status(400).json({ data: null, error: 'Password must be at least 8 characters', meta: {} });
    return;
  }

  try {
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await db.update(providers).set({ passwordHash: hash } as Record<string, unknown>).where(eq(providers.id, req.providerId));
    res.json({ data: { set: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /provider-auth/set-password]');
    res.status(500).json({ data: null, error: 'Failed to set password', meta: {} });
  }
});

export default router;
