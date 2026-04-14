import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// ── Type augmentation ─────────────────────────────────────────────────────────
// Adds homeownerId to every authenticated Express request.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      homeownerId: string;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string; // homeowner UUID
}

export function signToken(homeownerId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign({ sub: homeownerId }, secret, { expiresIn: '7d', algorithm: 'HS256' });
}

// ── Middleware ────────────────────────────────────────────────────────────────

/**
 * Validates `Authorization: Bearer <token>` and attaches `req.homeownerId`.
 * Returns 401 if the token is missing, malformed, or expired.
 */
/**
 * Like requireAuth but non-blocking — attaches `req.homeownerId` if a valid
 * token is present, otherwise silently continues. Used for endpoints that
 * work with or without authentication (e.g. homeowner self-upload).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) { next(); return; }
  const secret = process.env.JWT_SECRET;
  if (!secret) { next(); return; }
  try {
    const payload = jwt.verify(header.slice(7), secret, { algorithms: ['HS256'] }) as JwtPayload;
    req.homeownerId = payload.sub;
  } catch { /* ignore invalid tokens */ }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ data: null, error: 'Server misconfiguration', meta: {} });
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ data: null, error: 'Missing or invalid Authorization header', meta: {} });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload;
    req.homeownerId = payload.sub;
    next();
  } catch {
    res.status(401).json({ data: null, error: 'Invalid or expired token', meta: {} });
  }
}
