import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }
}, 5 * 60 * 1000);

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

export function rateLimit(opts: { windowMs: number; max: number; name: string }) {
  const store = new Map<string, RateLimitEntry>();
  stores.set(opts.name, store);

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + opts.windowMs });
      next();
      return;
    }

    entry.count++;

    if (entry.count > opts.max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        data: null,
        error: 'Too many requests. Please try again later.',
        meta: { retry_after: retryAfter },
      });
      return;
    }

    next();
  };
}

// Pre-configured limiters
export const authLimiter = rateLimit({ name: 'auth', windowMs: 60_000, max: 10 });
export const diagnosticLimiter = rateLimit({ name: 'diagnostic', windowMs: 60_000, max: 20 });
export const apiLimiter = rateLimit({ name: 'api', windowMs: 60_000, max: 100 });
