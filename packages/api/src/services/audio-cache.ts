import crypto from 'crypto';

/**
 * In-process audio cache. Holds MP3 buffers (e.g. ElevenLabs TTS output)
 * just long enough for Twilio to fetch them via the /api/v1/audio route
 * for a `<Play>` verb. Replaces the previous Cloudinary upload path —
 * Cloudinary's lower tiers don't allow video/audio uploads, which broke
 * outreach voice calls and forced fallback to Twilio Polly.
 *
 * Single-instance assumption: this cache is per-process. If the API ever
 * runs multiple replicas, Twilio could fetch from a different instance
 * than the one that put the entry, causing a 404 and a fallback to Polly
 * for that line. Move to Redis if/when we scale horizontally.
 */

interface CacheEntry {
  buffer: Buffer;
  contentType: string;
  expiresAt: number | null; // null = sticky (no expiry)
}

const store = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour — well past any call duration

export interface PutOptions {
  sticky?: boolean;
  contentType?: string;
}

export function putAudio(buffer: Buffer, opts: PutOptions = {}): string {
  const id = crypto.randomUUID();
  store.set(id, {
    buffer,
    contentType: opts.contentType ?? 'audio/mpeg',
    expiresAt: opts.sticky ? null : Date.now() + DEFAULT_TTL_MS,
  });
  return id;
}

export function getAudio(id: string): { buffer: Buffer; contentType: string } | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
    store.delete(id);
    return null;
  }
  return { buffer: entry.buffer, contentType: entry.contentType };
}

// Periodic eviction so expired entries don't sit in memory until next access.
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of store.entries()) {
    if (entry.expiresAt !== null && entry.expiresAt < now) {
      store.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();
