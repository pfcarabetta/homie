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

/** Log an affiliate click. Phase 1 is console-only so we can ship fast;
 *  swap the implementation for a real /api/v1/events endpoint later
 *  without touching call sites. */
export function logAffiliateEvent(
  event: 'diy_panel_shown' | 'diy_panel_expanded' | 'diy_affiliate_click' | 'diy_back_to_pro' | 'diy_fetch_failed',
  metadata: Record<string, unknown> = {},
): void {
  // eslint-disable-next-line no-console
  console.log('[diy-analytics]', event, metadata);
}
