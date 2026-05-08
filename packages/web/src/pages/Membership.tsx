import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAPI } from '@/services/api';
import SEO from '@/components/SEO';

/**
 * Membership page (Phase 1, Session 6).
 *
 * Shows the current tier, next renewal date, pending cancellation
 * state if any, and the three plan cards with upgrade/downgrade/cancel
 * actions. Plus and Premier members are routed here from the
 * Dashboard's "See plans" CTA. Free members hit it from /dashboard's
 * upgrade gate.
 *
 * UI state model — derives from `GET /account/subscriptions/current`:
 *   tier='free'                     → show "Choose a plan" call to action
 *   tier='plus' or 'premier'        → show "Manage" actions
 *   cancelAtPeriodEnd=true          → show "Cancellation pending" + Reactivate
 */

const C = {
  orange: '#E8632B',
  dark: '#2D2926',
  darkMid: '#4A4543',
  gray: '#9B9490',
  grayLight: '#D3CEC9',
  warm: '#F9F5F2',
  green: '#1B9E77',
};

const dm: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const fr: CSSProperties = { fontFamily: 'Fraunces, serif' };

interface Subscription {
  tier: 'free' | 'plus' | 'premier';
  stripeSubscriptionId: string | null;
  tierStartedAt: string | null;
  tierRenewsAt: string | null;
  tierCancelsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

const PLANS: Array<{
  tier: 'free' | 'plus' | 'premier';
  name: string;
  priceLabel: string;
  blurb: string;
  features: string[];
}> = [
  {
    tier: 'free',
    name: 'Free',
    priceLabel: '$0',
    blurb: 'Recurring vendor management + AI concierge basics.',
    features: [
      'Recurring vendors (1 max)',
      'AI concierge — 10 messages/mo',
      'Home IQ — up to 10 appliances',
      'Pay-per-dispatch ($9.99/quote)',
    ],
  },
  {
    tier: 'plus',
    name: 'Plus',
    priceLabel: '$29/mo',
    blurb: 'The flagship tier. Software-led, AI-mediated.',
    features: [
      'Everything in Free, no limits',
      'Home Health Score',
      'Recurring vendors (2 max)',
      'Seasonal walkthroughs (4/yr)',
      'Warranty automation',
      '3 free dispatches/mo',
    ],
  },
  {
    tier: 'premier',
    name: 'Premier',
    priceLabel: '$99/mo',
    blurb: 'Full-service. AI + human concierge + annual Tune-Up.',
    features: [
      'Everything in Plus, no limits',
      'Annual Homie Tune-Up',
      'Recurring vendors (unlimited)',
      'Human concierge',
      'Project management',
      '10 free dispatches/mo',
    ],
  },
];

export default function Membership() {
  const { homeowner } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const justUpgraded = searchParams.get('upgraded');
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!homeowner) {
      navigate('/login?redirect=/membership');
      return;
    }
    refresh();
  }, [homeowner]);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetchAPI<Subscription>('/api/v1/account/subscriptions/current');
      if (res.data) setSub(res.data);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load');
    }
    setLoading(false);
  }

  async function pickPlan(targetTier: 'plus' | 'premier') {
    if (acting) return;
    setActing(targetTier);
    setError(null);
    try {
      const res = await fetchAPI<{ mode: string; checkoutUrl?: string; subscriptionId?: string }>(
        '/api/v1/account/subscriptions/upgrade',
        { method: 'POST', body: JSON.stringify({ tier: targetTier }) },
      );
      if (res.data?.mode === 'checkout' && res.data.checkoutUrl) {
        // Free → paid: hand off to Stripe-hosted Checkout
        window.location.href = res.data.checkoutUrl;
      } else {
        // Plus ↔ Premier: tier change happened on the API directly. The
        // webhook updates membership_tier on the homeowner row asynchronously;
        // give it a moment then refresh.
        setTimeout(refresh, 1500);
      }
    } catch (err) {
      setError((err as Error).message ?? 'Upgrade failed');
      setActing(null);
    }
  }

  async function cancel() {
    if (!confirm('Cancel your membership? You\'ll keep access until your current period ends, then drop to Free.')) return;
    setActing('cancel');
    try {
      await fetchAPI('/api/v1/account/subscriptions/cancel', { method: 'POST', body: JSON.stringify({}) });
      refresh();
    } catch (err) {
      setError((err as Error).message ?? 'Cancel failed');
    } finally {
      setActing(null);
    }
  }

  async function reactivate() {
    setActing('reactivate');
    try {
      await fetchAPI('/api/v1/account/subscriptions/reactivate', { method: 'POST', body: JSON.stringify({}) });
      refresh();
    } catch (err) {
      setError((err as Error).message ?? 'Reactivate failed');
    } finally {
      setActing(null);
    }
  }

  if (!homeowner) return null;
  const currentTier = sub?.tier ?? 'free';

  return (
    <div style={{ ...dm, minHeight: '100vh', background: C.warm }}>
      <SEO title="Membership — Homie" description="Choose your Homie membership tier." canonical="/membership" noindex />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      <div style={{ background: '#fff', borderBottom: `1px solid ${C.grayLight}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...fr, fontWeight: 700, fontSize: 24, color: C.orange }}>homie</span>
          <a href="/dashboard" style={{ ...dm, fontSize: 14, color: C.darkMid, textDecoration: 'none' }}>← Dashboard</a>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px' }}>
        <h1 style={{ ...fr, fontSize: 36, fontWeight: 700, color: C.dark, margin: '0 0 8px' }}>Membership</h1>
        <p style={{ fontSize: 15, color: C.darkMid, margin: '0 0 24px', maxWidth: 600 }}>
          Pick the plan that fits your home. Upgrade, downgrade, or cancel anytime — no contracts.
        </p>

        {justUpgraded && (
          <div style={{ background: '#E1F5EE', color: '#085041', padding: '14px 16px', borderRadius: 12, marginBottom: 20, fontSize: 14 }}>
            🎉 You're now on <strong>{justUpgraded}</strong>. Welcome to the membership.
          </div>
        )}

        {!loading && sub && (
          <CurrentStateCard sub={sub} onCancel={cancel} onReactivate={reactivate} acting={acting} />
        )}

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 12 }}>
          {PLANS.map((p) => (
            <PlanCard
              key={p.tier}
              plan={p}
              currentTier={currentTier}
              loading={loading || acting === p.tier}
              onPick={() => p.tier !== 'free' && pickPlan(p.tier)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CurrentStateCard({
  sub,
  onCancel,
  onReactivate,
  acting,
}: {
  sub: Subscription;
  onCancel: () => void;
  onReactivate: () => void;
  acting: string | null;
}) {
  const renews = sub.tierRenewsAt ? new Date(sub.tierRenewsAt).toLocaleDateString() : null;
  const cancels = sub.tierCancelsAt ? new Date(sub.tierCancelsAt).toLocaleDateString() : null;
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        border: `1px solid ${C.grayLight}`,
        padding: 18,
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}
    >
      <div>
        <div style={{ ...dm, fontSize: 12, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Current plan
        </div>
        <div style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, margin: '6px 0 4px', textTransform: 'capitalize' }}>
          {sub.tier}
        </div>
        {sub.cancelAtPeriodEnd && cancels ? (
          <div style={{ ...dm, fontSize: 13, color: '#DC2626' }}>
            Cancellation pending — access ends {cancels}.
          </div>
        ) : renews ? (
          <div style={{ ...dm, fontSize: 13, color: C.darkMid }}>Renews {renews}</div>
        ) : null}
      </div>
      {sub.tier !== 'free' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {sub.cancelAtPeriodEnd ? (
            <button
              onClick={onReactivate}
              disabled={acting !== null}
              style={{
                ...dm,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 700,
                color: '#fff',
                background: C.green,
                border: 'none',
                borderRadius: 100,
                cursor: 'pointer',
              }}
            >
              {acting === 'reactivate' ? 'Reactivating…' : 'Reactivate'}
            </button>
          ) : (
            <button
              onClick={onCancel}
              disabled={acting !== null}
              style={{
                ...dm,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 600,
                color: '#DC2626',
                background: '#fff',
                border: `1px solid #DC262640`,
                borderRadius: 100,
                cursor: 'pointer',
              }}
            >
              {acting === 'cancel' ? 'Cancelling…' : 'Cancel membership'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PlanCard({
  plan,
  currentTier,
  loading,
  onPick,
}: {
  plan: (typeof PLANS)[number];
  currentTier: string;
  loading: boolean;
  onPick: () => void;
}) {
  const isCurrent = plan.tier === currentTier;
  const isFree = plan.tier === 'free';
  const isPremier = plan.tier === 'premier';
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        border: `1px solid ${isCurrent ? C.orange : C.grayLight}`,
        padding: 22,
        position: 'relative',
        boxShadow: isCurrent ? '0 0 0 3px rgba(232,99,43,0.15)' : 'none',
      }}
    >
      {isCurrent && (
        <span
          style={{
            position: 'absolute',
            top: -10,
            right: 16,
            background: C.orange,
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 100,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          Current
        </span>
      )}
      <div style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark }}>{plan.name}</div>
      <div style={{ ...fr, fontSize: 28, fontWeight: 700, color: isPremier ? C.orange : C.dark, margin: '6px 0 4px' }}>
        {plan.priceLabel}
      </div>
      <p style={{ ...dm, fontSize: 13, color: C.darkMid, lineHeight: 1.5, margin: '0 0 14px' }}>{plan.blurb}</p>
      <ul style={{ ...dm, fontSize: 13, color: C.dark, listStyle: 'none', padding: 0, margin: '0 0 18px', lineHeight: 1.7 }}>
        {plan.features.map((f) => (
          <li key={f} style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: C.green, flexShrink: 0 }}>✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {isFree ? (
        <div style={{ ...dm, fontSize: 12, color: C.gray, textAlign: 'center', padding: '10px 0' }}>
          {currentTier === 'free' ? 'Your current plan' : 'Cancel above to drop to Free'}
        </div>
      ) : (
        <button
          onClick={onPick}
          disabled={isCurrent || loading}
          style={{
            ...dm,
            width: '100%',
            padding: '12px 16px',
            fontSize: 14,
            fontWeight: 700,
            color: isCurrent ? C.gray : '#fff',
            background: isCurrent ? '#fff' : C.orange,
            border: isCurrent ? `1px solid ${C.grayLight}` : 'none',
            borderRadius: 100,
            cursor: isCurrent || loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {isCurrent
            ? 'Current plan'
            : loading
              ? 'Working…'
              : currentTier === 'free'
                ? `Go ${plan.name}`
                : `Switch to ${plan.name}`}
        </button>
      )}
    </div>
  );
}
