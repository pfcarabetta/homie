/**
 * Inspector partner referral tracking — first-touch attribution.
 *
 * When a homeowner lands on /inspect?ref=<slug-or-id>, we stash the
 * referrer in BOTH localStorage and a cookie:
 *
 *   - localStorage survives the typical homeowner journey (browse →
 *     come back next day → upload) within the same browser
 *   - cookie acts as a backup if localStorage is cleared by privacy
 *     tools, and lets us read the referrer server-side on future
 *     payment events without a roundtrip through the client
 *
 * "First-touch" means we never overwrite an existing referrer — the
 * partner who got the homeowner here first owns the attribution.
 * Standard affiliate-marketing pattern. 60-day window matches typical
 * affiliate program defaults.
 */

const STORAGE_KEY = 'homie_referrer_partner';
const COOKIE_NAME = 'homie_ref';
const COOKIE_TTL_DAYS = 60;

/** Allow letters, digits, hyphens, underscores. Caps length. Anything
 *  else (path components, query separators, scripts) is rejected
 *  outright so we never persist garbage. */
function isValidRef(raw: string): boolean {
  if (raw.length === 0 || raw.length > 64) return false;
  return /^[A-Za-z0-9_-]+$/.test(raw);
}

/** Read the current ?ref= from the URL and stash it if (a) it's
 *  syntactically valid and (b) we don't already have a stored
 *  referrer. Idempotent — safe to call from a useEffect on every
 *  render. */
export function captureReferrerIfPresent(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get('ref')?.trim() ?? '';
  if (!raw || !isValidRef(raw)) return;
  // First-touch only — don't overwrite an existing attribution
  if (getStoredReferrer()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch { /* localStorage unavailable (private mode, etc) — cookie is the fallback */ }
  const expires = new Date(Date.now() + COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(raw)}; expires=${expires}; path=/; SameSite=Lax`;
}

/** Get the stored referrer, preferring localStorage and falling back
 *  to cookie. Returns null if neither has it. */
export function getStoredReferrer(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isValidRef(stored)) return stored;
  } catch { /* fall through to cookie */ }
  const match = document.cookie.split('; ').find(row => row.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
  return isValidRef(value) ? value : null;
}

/** Clear the stored referrer. Call this after a successful credited
 *  purchase so the same partner doesn't get credited a second time
 *  for an unrelated future purchase by the same homeowner. */
export function clearStoredReferrer(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* nothing to do */ }
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}
