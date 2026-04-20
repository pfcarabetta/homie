import { Router, Request, Response } from 'express';
import logger from '../logger';
import { ApiResponse } from '../types/api';

const router = Router();

// ── GET /api/v1/geo/ip-zip ──────────────────────────────────────────────────
//
// Resolves the caller's IP to a best-effort US ZIP code so the /quote page
// can show a reasonable default location ("X pros available near 10001")
// before the user has entered their zip. Uses ipapi.co's no-auth lookup
// (1k requests/day — ample for current scale). Results cached in-memory
// for 24h per IP to stay well within the free tier.
//
// Returns null for private / localhost / unresolvable IPs; the frontend
// gracefully falls back to "near you" in those cases.

interface GeoResult {
  zip: string | null;
  city: string | null;
  region: string | null;
}

interface CacheEntry extends GeoResult {
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const MAX_CACHE_ENTRIES = 10_000; // ~ a couple MB in memory

function isPrivateOrLocalIp(ip: string): boolean {
  if (!ip) return true;
  // Strip IPv4-mapped IPv6 prefix first
  const clean = ip.replace(/^::ffff:/i, '');
  if (clean === '::1' || clean === '127.0.0.1') return true;
  if (clean.startsWith('10.')) return true;
  if (clean.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
  if (clean.startsWith('fd') || clean.startsWith('fe80:')) return true; // IPv6 ULA/link-local
  return false;
}

router.get('/ip-zip', async (req: Request, res: Response) => {
  // req.ip respects X-Forwarded-For once trust proxy is set in app.ts. Strip
  // the IPv4-mapped IPv6 prefix ("::ffff:1.2.3.4") so the cache + upstream
  // call both see a clean address.
  const raw = (req.ip || '').replace(/^::ffff:/i, '');

  if (isPrivateOrLocalIp(raw)) {
    const out: ApiResponse<GeoResult | null> = { data: null, error: null, meta: { reason: 'private_ip' } };
    res.json(out);
    return;
  }

  const cached = cache.get(raw);
  if (cached && cached.expiresAt > Date.now()) {
    const out: ApiResponse<GeoResult> = {
      data: { zip: cached.zip, city: cached.city, region: cached.region },
      error: null,
      meta: { cached: true },
    };
    res.json(out);
    return;
  }

  try {
    const r = await fetch(`https://ipapi.co/${encodeURIComponent(raw)}/json/`, {
      headers: { 'User-Agent': 'Homie/1.0 (+https://homiepro.ai)' },
      // Don't let a slow upstream hold up the page too long
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) {
      logger.warn({ ip: raw, status: r.status }, '[geo/ip-zip] upstream non-200');
      const out: ApiResponse<GeoResult | null> = { data: null, error: null, meta: { reason: 'upstream_error' } };
      res.json(out);
      return;
    }
    const json = (await r.json()) as {
      postal?: string;
      city?: string;
      region?: string;
      country_code?: string;
      error?: boolean;
    };
    if (json.error) {
      const out: ApiResponse<GeoResult | null> = { data: null, error: null, meta: { reason: 'no_data' } };
      res.json(out);
      return;
    }
    // Only accept 5-digit US zips — spares us from surfacing UK/CA/etc
    // postal codes that our downstream estimate API can't handle.
    const zip = /^\d{5}$/.test(json.postal || '') ? (json.postal ?? null) : null;
    const result: GeoResult = {
      zip,
      city: json.city || null,
      region: json.region || null,
    };
    // LRU-ish eviction — if we're at the cap, drop the oldest entry
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const first = cache.keys().next().value;
      if (first) cache.delete(first);
    }
    cache.set(raw, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
    const out: ApiResponse<GeoResult> = { data: result, error: null, meta: {} };
    res.json(out);
  } catch (err) {
    logger.warn({ err, ip: raw }, '[geo/ip-zip] lookup failed');
    const out: ApiResponse<GeoResult | null> = { data: null, error: null, meta: { reason: 'lookup_failed' } };
    res.json(out);
  }
});

export default router;
