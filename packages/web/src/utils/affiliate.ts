/**
 * Amazon Associates affiliate link utility.
 *
 * Generates search-URL affiliate links for DIY tool/supply recommendations.
 * Search URLs (as opposed to specific ASIN links) never 404, don't need
 * Product Advertising API approval, and still earn the 24-hour cookie
 * window commission on any purchase in the session.
 *
 * FTC requires an "earns commission" disclosure wherever these links
 * render. The DIY panel surfaces that inline.
 */

/** Env var override lets staging / preview envs use a different tag
 *  (or none) without touching source. Falls back to the prod ID. */
const AMAZON_TAG = (import.meta.env.VITE_AMAZON_AFFILIATE_TAG as string | undefined) || '03028471-20';

/** Build an Amazon search URL pre-tagged with the Homie affiliate ID. */
export function amazonSearchUrl(query: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(query.trim())}&tag=${AMAZON_TAG}`;
}

/** One spot to change later if we switch to a different attribution
 *  pattern (e.g. Skimlinks for non-Amazon merchants). */
export const AFFILIATE_LINK_ATTRS = {
  target: '_blank' as const,
  rel: 'sponsored noopener noreferrer' as const,
};

type AffiliateEvent =
  | 'diy_panel_shown'
  | 'diy_panel_expanded'
  | 'diy_affiliate_click'
  | 'diy_back_to_pro'
  | 'diy_fetch_failed';

/**
 * Log an affiliate event. Pipes to GA4 via the analytics module so the
 * existing GA dimensions (source, category) line up with conversion
 * tracking on inspect-derived vs. quote-chat-derived clicks. Console
 * fallback stays in dev for live debugging.
 */
export function logAffiliateEvent(event: AffiliateEvent, metadata: Record<string, unknown> = {}): void {
  // eslint-disable-next-line no-console
  if (import.meta.env.DEV) console.log('[diy-analytics]', event, metadata);

  // Forward to GA4. We keep the metadata shape loose at this layer so
  // call-sites don't have to know about the GA event taxonomy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = (typeof window !== 'undefined' ? (window as any) : null);
  if (w?.gtag) {
    w.gtag('event', event, metadata);
  }
}
