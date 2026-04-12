import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      inspectorId: string;
    }
  }
}

export interface InspectorJwtPayload {
  sub: string;
  type: 'inspector';
}

export function signInspectorToken(inspectorId: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not set');
  return jwt.sign({ sub: inspectorId, type: 'inspector' }, secret, { expiresIn: '30d', algorithm: 'HS256' });
}

export function requireInspectorAuth(req: Request, res: Response, next: NextFunction): void {
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
    const payload = jwt.verify(token, secret, { algorithms: ['HS256'] }) as InspectorJwtPayload;
    if (payload.type !== 'inspector') {
      res.status(401).json({ data: null, error: 'Invalid token type', meta: {} });
      return;
    }
    req.inspectorId = payload.sub;
    next();
  } catch {
    res.status(401).json({ data: null, error: 'Invalid or expired token', meta: {} });
  }
}
