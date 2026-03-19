import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    res.status(503).json({ data: null, error: 'Admin access is not configured', meta: {} });
    return;
  }

  const key = req.headers['x-admin-key'];
  if (!key || typeof key !== 'string') {
    res.status(401).json({ data: null, error: 'Unauthorized', meta: {} });
    return;
  }

  const expected = Buffer.from(secret);
  const received = Buffer.from(key);
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    res.status(401).json({ data: null, error: 'Unauthorized', meta: {} });
    return;
  }

  next();
}
