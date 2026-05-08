import { useEffect, useState, type CSSProperties } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

/**
 * Vendor SMS confirmation landing page.
 *
 * Public URL: `/vendor-confirmation/:token`. No auth — vendors don't
 * have Homie accounts. The token (validated server-side against
 * `recurring_vendors.vendor_confirmation_token` + 7-day expiry) is
 * the sole authorization mechanism.
 *
 * Flow:
 *   1. Page loads → GET /api/v1/vendor-confirmation/:token reads
 *      vendor + member context (404 if invalid, 410 if expired)
 *   2. Vendor taps "Set up payments" → POST /:token/start-onboarding
 *      returns a Stripe-hosted onboarding URL; we redirect there
 *   3. Stripe finishes onboarding → redirects back to
 *      /vendor-confirmation/:token?onboarded=1
 *   4. We POST /:token/complete which polls our DB; the actual flip to
 *      'active' happens via the `account.updated` webhook (server-side).
 *      The page polls every couple seconds until status='active' or
 *      gives up after a timeout.
 */

const C = {
  orange: '#E8632B',
  dark: '#2D2926',
  darkMid: '#4A4543',
  gray: '#9B9490',
  warm: '#F9F5F2',
  green: '#1B9E77',
  greenLight: '#E1F5EE',
};

const dm: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const fr: CSSProperties = { fontFamily: 'Fraunces, serif' };

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

interface ConfirmationData {
  vendorName: string;
  serviceCategory: string;
  amountCents: number;
  schedulePattern: string;
  memberName: string;
  propertyAddress: string;
  status: string;
  hasConnectAccount: boolean;
}

const SERVICE_LABELS: Record<string, string> = {
  cleaning: 'Cleaning',
  landscaping: 'Landscaping',
  pool: 'Pool service',
  pest_control: 'Pest control',
  hvac: 'HVAC',
  window_cleaning: 'Window cleaning',
  trash_valet: 'Trash valet',
  handyman: 'Handyman',
  other: 'Service',
};

const SCHEDULE_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  biweekly_even: 'Every other week',
  biweekly_odd: 'Every other week',
  monthly_date: 'Monthly',
  monthly_nth_day: 'Monthly',
  quarterly: 'Quarterly',
  custom: 'On a custom schedule',
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

export default function VendorConfirmation() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const onboardedHint = searchParams.get('onboarded') === '1';

  const [data, setData] = useState<ConfirmationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // ── Initial fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/vendor-confirmation/${token}`);
        const body = (await res.json()) as { data?: ConfirmationData; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? 'This link is invalid or has expired.');
          setErrorCode(res.status === 410 ? 'expired' : 'not_found');
        } else if (body.data) {
          setData(body.data);
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ── Post-onboarding poll ─────────────────────────────────────────────────
  // After Stripe redirects back with ?onboarded=1, the actual flip to
  // status='active' happens via the account.updated webhook on the
  // server. Poll a few times to catch it without making the vendor wait.
  useEffect(() => {
    if (!onboardedHint || !token) return;
    if (data?.status === 'active') return;
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      try {
        const res = await fetch(`${API_BASE}/api/v1/vendor-confirmation/${token}/complete`, {
          method: 'POST',
        });
        const body = (await res.json()) as {
          data?: { status?: string; hasConnectAccount?: boolean };
        };
        const status = body.data?.status;
        if (status === 'active') {
          setData((d) => (d ? { ...d, status: 'active' } : d));
          return; // stop polling
        }
      } catch {
        // ignore — we'll try again
      }
      if (attempts < 8) setTimeout(tick, 1500);
    };
    tick();
  }, [onboardedHint, token, data?.status]);

  // ── "Set up payments" → Stripe onboarding ────────────────────────────────
  async function handleStartOnboarding() {
    if (!token || starting) return;
    setStarting(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/v1/vendor-confirmation/${token}/start-onboarding`,
        { method: 'POST' },
      );
      const body = (await res.json()) as { data?: { onboardingUrl: string }; error?: string };
      if (!res.ok || !body.data?.onboardingUrl) {
        setError(body.error ?? 'Could not start payment setup. Please try again.');
        setStarting(false);
        return;
      }
      window.location.href = body.data.onboardingUrl;
    } catch (err) {
      setError((err as Error).message ?? 'Network error');
      setStarting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return <Centered>Loading…</Centered>;
  }

  if (error) {
    return (
      <Centered>
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
          <div style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
            {errorCode === 'expired' ? 'This link has expired' : 'Link not found'}
          </div>
          <div style={{ ...dm, fontSize: 14, color: C.darkMid, lineHeight: 1.55 }}>
            {error} If you still want to receive payments through Homie, ask your client to send
            you a fresh link.
          </div>
        </div>
      </Centered>
    );
  }

  if (!data) return null;

  const isActive = data.status === 'active';
  const showOnboardedSpinner = onboardedHint && !isActive;

  return (
    <div style={{ minHeight: '100vh', background: C.warm, ...dm }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 20px 60px' }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{ ...fr, fontWeight: 700, fontSize: 32, color: C.orange }}>homie</span>
        </div>

        {/* Active state — onboarding done */}
        {isActive ? (
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              border: `1px solid ${C.greenLight}`,
              padding: '32px 28px',
              textAlign: 'center',
              boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
              You're all set
            </div>
            <p style={{ fontSize: 14, color: C.darkMid, lineHeight: 1.55, marginBottom: 16 }}>
              Payments to <strong>{data.vendorName}</strong> are active. You'll get an SMS the day
              before each visit and a tap-to-confirm reminder once it's done. After confirming,
              payment lands in your bank in ~1 business day.
            </p>
            <p style={{ fontSize: 12, color: C.gray }}>You can close this window.</p>
          </div>
        ) : showOnboardedSpinner ? (
          // Polling state — vendor returned from Stripe; wait for webhook
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              border: `1px solid ${C.warm}`,
              padding: '32px 28px',
              textAlign: 'center',
              boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 12 }}>⏳</div>
            <div style={{ ...fr, fontSize: 20, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
              Finishing up…
            </div>
            <p style={{ fontSize: 14, color: C.darkMid, lineHeight: 1.55 }}>
              Confirming with Stripe. This usually takes a couple seconds.
            </p>
          </div>
        ) : (
          // Initial pending state — show the offer + CTA
          <div
            style={{
              background: '#fff',
              borderRadius: 16,
              border: `1px solid ${C.warm}`,
              padding: '32px 28px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.04)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: C.gray,
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Payment confirmation
            </div>
            <h1
              style={{
                ...fr,
                fontSize: 24,
                fontWeight: 700,
                color: C.dark,
                lineHeight: 1.2,
                margin: '0 0 16px',
              }}
            >
              {data.memberName} would like to pay you through Homie
            </h1>
            <p style={{ fontSize: 14, color: C.darkMid, lineHeight: 1.6, margin: '0 0 24px' }}>
              {SCHEDULE_LABELS[data.schedulePattern] ?? 'Recurring'}{' '}
              {SERVICE_LABELS[data.serviceCategory]?.toLowerCase() ?? 'service'} at{' '}
              {data.propertyAddress} — <strong>{formatCents(data.amountCents)}</strong> per visit.
              Free for you to set up; you'll just enter how you'd like to be paid.
            </p>

            <div
              style={{
                background: C.warm,
                borderRadius: 12,
                padding: '14px 16px',
                marginBottom: 20,
                fontSize: 13,
                color: C.darkMid,
                lineHeight: 1.55,
              }}
            >
              <strong style={{ color: C.dark }}>What happens next:</strong>
              <ol style={{ margin: '8px 0 0 18px', padding: 0 }}>
                <li>You'll set up your bank account with Stripe (60 sec, secure)</li>
                <li>Each visit, you'll get an SMS reminder</li>
                <li>Tap the link after each visit to confirm completion</li>
                <li>Payment lands in your bank ~1 business day later</li>
              </ol>
            </div>

            <button
              onClick={handleStartOnboarding}
              disabled={starting}
              style={{
                width: '100%',
                padding: '14px 24px',
                fontSize: 15,
                fontWeight: 700,
                color: '#fff',
                background: C.orange,
                border: 'none',
                borderRadius: 100,
                cursor: starting ? 'wait' : 'pointer',
                opacity: starting ? 0.6 : 1,
                ...dm,
              }}
            >
              {starting ? 'Opening Stripe…' : 'Set up payments'}
            </button>

            <p
              style={{
                fontSize: 11,
                color: C.gray,
                textAlign: 'center',
                marginTop: 14,
                lineHeight: 1.5,
              }}
            >
              Powered by Stripe Connect. Homie never sees your bank details.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: C.warm,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...dm,
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}
