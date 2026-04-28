/**
 * Google Analytics 4 wrapper.
 *
 * - No-ops when `VITE_GA_MEASUREMENT_ID` is unset (keeps local dev clean).
 * - Strict-typed event names + properties.
 * - Page-views are fired manually on every route change (`send_page_view: false`).
 * - Admin and demo routes are excluded.
 */

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

const DEFAULT_MEASUREMENT_ID = 'G-NT59ML48M1';

/**
 * Resolve which GA property to send to.
 * - Prod: env var if set, else the hardcoded default.
 * - Dev: only if explicitly set via env (so local development never pollutes prod stats).
 */
const MEASUREMENT_ID: string | undefined = import.meta.env.PROD
  ? (import.meta.env.VITE_GA_MEASUREMENT_ID ?? DEFAULT_MEASUREMENT_ID)
  : import.meta.env.VITE_GA_MEASUREMENT_ID;

let initialized = false;

/** Routes we deliberately don't track (internal admin + dev demos). */
const EXCLUDED_PREFIXES = ['/admin', '/demo'];

function isExcludedPath(path: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * @deprecated GA is now bootstrapped by the inline `<script>` in
 * `packages/web/index.html` — that fires before React boots so the
 * initial page_view is captured even if any React component throws.
 * This function is kept as a no-op for backward compatibility with
 * any callers we haven't migrated yet.
 */
export function initAnalytics(): void {
  initialized = true;
}

/** Fire a page_view. Called from useGoogleAnalyticsPageView hook. */
export function trackPageView(path: string, title?: string): void {
  if (!window.gtag || isExcludedPath(path)) return;
  window.gtag('event', 'page_view', {
    page_path: path,
    page_title: title ?? document.title,
    page_location: window.location.href,
  });
}

// ---------------------------------------------------------------------------
// Event taxonomy — discriminated union
// ---------------------------------------------------------------------------

type UserType = 'homeowner' | 'inspector' | 'pro' | 'business' | 'admin';
type UploadSource = 'consumer_landing' | 'inspector_portal' | 'homeowner_portal';
type PricingTier = 'essential' | 'professional' | 'premium';

/**
 * Allowed events. Add to this union to introduce new events — TS will then
 * require call-sites to pass the right shape.
 */
export type AnalyticsEvent =
  // Cross-cutting
  | { name: 'auth_signup_completed'; props: { user_type: UserType } }
  | { name: 'auth_login_completed'; props: { user_type: UserType } }
  | { name: 'payment_success'; props: { amount_cents?: number; tier?: PricingTier; flow?: string } }
  // Homeowner consumer
  | { name: 'quote_submit_started'; props: { source: 'homepage' | 'quote_page' } }
  | { name: 'quote_submit_completed'; props: { source: 'homepage' | 'quote_page'; category?: string } }
  | { name: 'quote_dispatch_paid'; props: { tier?: string; amount_cents?: number } }
  // Inspect (consumer)
  | { name: 'inspect_landing_cta_clicked'; props: { cta_location: string } }
  | { name: 'inspect_report_uploaded'; props: { source: UploadSource; report_id?: string; pricing_tier?: PricingTier; file_size_kb?: number } }
  | { name: 'inspect_upload_started'; props: { source: UploadSource } }
  | { name: 'inspect_upload_paid'; props: { source: UploadSource; pricing_tier?: PricingTier; amount_cents?: number } }
  | { name: 'inspect_upload_parsed'; props: { source: UploadSource; report_id?: string; time_to_parse_ms?: number } }
  | { name: 'inspect_upload_failed'; props: { source: UploadSource; reason?: string } }
  | { name: 'inspect_report_claimed'; props: { token?: string } }
  | { name: 'inspect_paywall_shown'; props: { feature: string } }
  | { name: 'inspect_paywall_upgrade_clicked'; props: { feature: string } }
  // Inspect (partner co-branded landing /inspect/p/:slug)
  | { name: 'inspect_partner_landing_viewed'; props: { partner_slug?: string } }
  | { name: 'inspect_partner_landing_cta_clicked'; props: { partner_slug?: string; cta_location: string } }
  | { name: 'inspect_partner_landing_pricing_clicked'; props: { partner_slug?: string; tier: PricingTier } }
  | { name: 'inspect_partner_landing_upload_started'; props: { partner_slug?: string } }
  // Inspector
  | { name: 'inspector_landing_cta_clicked'; props: { cta_location: string } }
  | { name: 'inspector_upload_started'; props: Record<string, never> }
  | { name: 'inspector_upload_tier_selected'; props: { pricing_tier: PricingTier } }
  | { name: 'inspector_upload_paid'; props: { pricing_tier: PricingTier; amount_cents?: number } }
  // Business
  | { name: 'business_landing_cta_clicked'; props: { cta_location: string } }
  // Provider
  | { name: 'provider_quote_submitted'; props: { job_id?: string } };

export type AnalyticsEventName = AnalyticsEvent['name'];

/** Send a typed event to GA. */
export function trackEvent<E extends AnalyticsEvent>(name: E['name'], props: E['props']): void {
  if (!window.gtag) return;
  window.gtag('event', name, props as Record<string, unknown>);
}

/** Set a long-lived user property (persists across events for this client). */
export function setUserType(userType: UserType): void {
  if (!window.gtag) return;
  window.gtag('set', 'user_properties', { user_type: userType });
}
