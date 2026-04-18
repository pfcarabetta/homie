/**
 * Pure utility helpers shared across web + mobile clients.
 *
 * Constraints:
 * - No DOM access (window, document, localStorage)
 * - No React imports
 * - No platform-specific APIs
 * - Pure functions only — same input → same output
 *
 * Anything that touches storage, env vars, or React belongs in the
 * platform-specific package (packages/web/src/services or
 * apps/homie-mobile/services).
 */

// ── Price helpers ──────────────────────────────────────────────────────────

/** Normalize a freeform price string to a tidy display form.
 *  e.g. "between 200 and 300" → "$200-$300", "is about 150" → "$150". */
export function cleanPrice(price: string): string {
  let p = price.replace(/^\$+/, '$');
  const bm = p.match(/between\s+\$?(\d+(?:\.\d+)?)\s*(?:and|to)\s*\$?(\d+(?:\.\d+)?)/i);
  if (bm) return `$${bm[1]}-$${bm[2]}`;
  const rm = p.match(/^(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)$/);
  if (rm) return `$${rm[1]}-$${rm[2]}`;
  const nm = p.match(/^(\d+(?:\.\d+)?)$/);
  if (nm) return `$${nm[1]}`;
  const em = p.match(/(?:is|are|be|charge|cost|runs?|pay)\s+(?:about|around)?\s*\$?(\d+(?:\.\d+)?)/i);
  if (em) return `$${em[1]}`;
  const lp = p.match(/^\$(\d+(?:\.\d+)?)\s+\w/);
  if (lp) return `$${lp[1]}`;
  const ln = p.match(/^(\d+(?:\.\d+)?)\s+(?:service|for|per|flat|call|visit|fee|charge|total)/i);
  if (ln) return `$${ln[1]}`;
  return p;
}

/** Extract the lowest-bound dollar amount from a price string for sorting/comparison.
 *  e.g. "$210" → 21000, "$210-$280" → 21000, "$1,500 flat fee" → 150000.
 *  Returns null if no number was found. Cents are used for integer comparisons. */
export function priceToCents(price: string | null | undefined): number | null {
  if (!price) return null;
  const match = price.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Math.round(parseFloat(match[1]) * 100);
}

// ── Time helpers ───────────────────────────────────────────────────────────

/** Convert ISO timestamp to "Xm/h/d/w ago" or fallback to local date string.
 *  e.g. now+30s → "just now", 5min → "5m ago", 26h → "1d ago", 60d → date. */
export function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 8) return `${week}w ago`;
  return new Date(dateStr).toLocaleDateString();
}
