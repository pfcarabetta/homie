import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      providerId: string;
    }
  }
}

export interface ProviderJwtPayload {
  sub: string;
  type: 'provider';
}

export function signProviderToken(providerId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign({ sub: providerId, type: 'provider' }, secret, { expiresIn: '7d', algorithm: 'HS256' });
}

export function requireProviderAuth(req: Request, res: Response, next: NextFunction): void {
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
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as ProviderJwtPayload;
    if (payload.type !== 'provider') {
      res.status(401).json({ data: null, error: 'Invalid token type', meta: {} });
      return;
    }
    req.providerId = payload.sub;
    next();
  } catch {
    res.status(401).json({ data: null, error: 'Invalid or expired token', meta: {} });
  }
}
