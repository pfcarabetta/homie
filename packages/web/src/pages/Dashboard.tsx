import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAPI } from '@/services/api';
import SEO from '@/components/SEO';

/**
 * Member Dashboard — Membership Phase 1, Session 5.
 *
 * The home screen for Plus and Premier members. Free members get the
 * existing chat-led HomePage; tier-based redirect from /login lands
 * paying members here. Free members who navigate to /dashboard
 * directly see a "Plus only" upgrade prompt.
 *
 * Sections per CLAUDE-MEMBERSHIP.md "Frontend Integration Points":
 *   1. Header with tier badge + property banner
 *   2. Health Score hero (placeholder — Phase 3 ships the engine)
 *   3. Quick stat strip (active vendors, recent payments)
 *   4. "Your team" summary (links to /vendors)
 *   5. Recent activity placeholder (Phase 4+)
 *
 * Premier members get the same layout plus a Concierge inbox card at
 * the top (Phase 8); for Phase 1 the Premier slot is reserved but
 * empty. The Annual Tune-Up card is also Premier-only and Phase 6.
 */

const C = {
  orange: '#E8632B',
  dark: '#2D2926',
  darkMid: '#4A4543',
  gray: '#9B9490',
  grayLight: '#D3CEC9',
  warm: '#F9F5F2',
  green: '#1B9E77',
  greenLight: '#E1F5EE',
};

const dm: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const fr: CSSProperties = { fontFamily: 'Fraunces, serif' };

interface PortalProperty {
  id: string;
  isPrimary: boolean;
  nickname: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

interface PortalVendor {
  id: string;
  vendorName: string;
  serviceCategory: string;
  status: string;
  amountCents: number;
  totalPaidYtdCents: number;
}

interface HealthScoreCurrent {
  score: number | null;
  band: 'excellent' | 'good' | 'needs_work' | 'concerning' | null;
  deltaFromPrevMonth: number | null;
  periodMonth: string | null;
  message?: string;
}

const BAND_COLOR: Record<string, string> = {
  excellent: '#1B9E77',
  good: '#E8632B',
  needs_work: '#EF9F27',
  concerning: '#E24B4A',
};

const TIER_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  free: { label: 'Free', bg: '#E5E5E5', fg: C.dark },
  plus: { label: 'Plus', bg: '#F0997B', fg: '#5C2A14' }, // coral fill, coral-dark text per spec
  premier: { label: 'Premier', bg: C.dark, fg: '#fff' },
};

function fmtMoney(cents: number): string {
  if (!cents) return '$0';
  return `$${(cents / 100).toFixed(0)}`;
}

export default function Dashboard() {
  const { homeowner } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<PortalProperty[]>([]);
  const [vendors, setVendors] = useState<PortalVendor[]>([]);
  const [healthScore, setHealthScore] = useState<HealthScoreCurrent | null>(null);

  useEffect(() => {
    if (!homeowner) {
      navigate('/login?redirect=/dashboard');
      return;
    }
    (async () => {
      try {
        const [pRes, vRes, hsRes] = await Promise.all([
          fetchAPI<{ properties: PortalProperty[] }>('/api/v1/account/properties'),
          fetchAPI<{ vendors: PortalVendor[] }>('/api/v1/account/vendors'),
          fetchAPI<HealthScoreCurrent>('/api/v1/account/health-score/current'),
        ]);
        if (pRes.data) setProperties(pRes.data.properties);
        if (vRes.data) setVendors(vRes.data.vendors);
        if (hsRes.data) setHealthScore(hsRes.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [homeowner, navigate]);

  if (!homeowner) return null;

  const tier = homeowner.membership_tier ?? 'free';
  const isFree = tier === 'free';
  const tierBadge = TIER_BADGE[tier] ?? TIER_BADGE.free;
  const primary = properties.find((p) => p.isPrimary) ?? properties[0] ?? null;
  const activeVendors = vendors.filter((v) => v.status !== 'cancelled');
  const ytdTotal = activeVendors.reduce((s, v) => s + v.totalPaidYtdCents, 0);

  // Free members hitting /dashboard directly: show an upgrade gate rather
  // than the dashboard. Plus/Premier are auto-redirected here from /login.
  if (isFree) {
    return (
      <FreeUpgradeGate onBack={() => navigate('/')} />
    );
  }

  return (
    <div style={{ ...dm, minHeight: '100vh', background: C.warm }}>
      <SEO title="Dashboard — Homie" description="Your home, your team, your scores — all in one place." canonical="/dashboard" noindex />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap"
        rel="stylesheet"
      />

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${C.grayLight}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ ...fr, fontWeight: 700, fontSize: 24, color: C.orange }}>homie</span>
            <span style={{ ...dm, fontSize: 14, color: C.gray }}>membership</span>
            <span
              style={{
                ...dm,
                marginLeft: 8,
                padding: '3px 10px',
                borderRadius: 100,
                background: tierBadge.bg,
                color: tierBadge.fg,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {tierBadge.label}
            </span>
          </div>
          <nav style={{ display: 'flex', gap: 16, ...dm, fontSize: 14, color: C.darkMid }}>
            <a href="/dashboard" style={{ color: C.dark, textDecoration: 'none', fontWeight: 600 }}>Home</a>
            <a href="/vendors" style={{ color: C.darkMid, textDecoration: 'none' }}>Vendors</a>
            <a href="/account" style={{ color: C.darkMid, textDecoration: 'none' }}>Account</a>
          </nav>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 80px' }}>
        {/* Property banner */}
        {primary && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ ...dm, fontSize: 12, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Your home
            </div>
            <h1 style={{ ...fr, fontSize: 32, fontWeight: 700, color: C.dark, margin: '6px 0 4px' }}>
              {primary.nickname ?? primary.address ?? 'Your home'}
            </h1>
            {primary.city && primary.state && (
              <div style={{ ...dm, fontSize: 14, color: C.darkMid }}>
                {primary.city}, {primary.state}
              </div>
            )}
          </div>
        )}

        {/* Health Score hero */}
        <HealthScoreHero loading={loading} score={healthScore} />

        {/* Quick stat strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
          <StatCard
            label="Active vendors"
            value={String(activeVendors.length)}
            sub={activeVendors.length === 0 ? 'Add your first' : 'See your team'}
            href="/vendors"
          />
          <StatCard
            label="Paid this year"
            value={fmtMoney(ytdTotal)}
            sub="Tax-ready breakdown"
            href="/vendors"
          />
          <StatCard
            label="Open warranty claims"
            value="—"
            sub="Coming soon"
            disabled
          />
          <StatCard
            label="Active recalls"
            value="—"
            sub="Coming soon"
            disabled
          />
        </div>

        {/* Your team summary */}
        <Section
          title="Your team"
          subtitle={
            activeVendors.length > 0
              ? "Vendors Homie pays on a recurring schedule for you."
              : 'Add your cleaner, gardener, pool service, or any pro you pay regularly.'
          }
          cta={{ label: activeVendors.length > 0 ? 'Manage vendors →' : '+ Add vendor', href: '/vendors' }}
        >
          {loading ? (
            <div style={{ color: C.gray, fontSize: 13, padding: 16 }}>Loading…</div>
          ) : activeVendors.length === 0 ? (
            <div style={{ color: C.gray, fontSize: 13, padding: '12px 0' }}>
              No vendors yet. Tap <strong style={{ color: C.dark }}>+ Add vendor</strong> to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeVendors.slice(0, 4).map((v) => (
                <div
                  key={v.id}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: C.warm }}
                >
                  <div>
                    <div style={{ ...dm, fontSize: 14, fontWeight: 600, color: C.dark }}>{v.vendorName}</div>
                    <div style={{ ...dm, fontSize: 12, color: C.gray, marginTop: 2 }}>
                      {v.serviceCategory.replace(/_/g, ' ')} · {fmtMoney(v.amountCents)}/visit
                    </div>
                  </div>
                  <div style={{ ...dm, fontSize: 12, color: C.darkMid }}>
                    YTD <strong style={{ color: C.dark }}>{fmtMoney(v.totalPaidYtdCents)}</strong>
                  </div>
                </div>
              ))}
              {activeVendors.length > 4 && (
                <a href="/vendors" style={{ ...dm, fontSize: 13, color: C.orange, textDecoration: 'none', alignSelf: 'flex-start', padding: 4 }}>
                  + {activeVendors.length - 4} more →
                </a>
              )}
            </div>
          )}
        </Section>

        {/* Recent activity — placeholder for Phase 4+ */}
        <Section title="Recent activity" subtitle="Vendor visits, payments, and warranty events as they happen.">
          <div style={{ color: C.gray, fontSize: 13, padding: '12px 0' }}>
            Activity will show up here once your vendors complete visits.
          </div>
        </Section>
      </div>
    </div>
  );
}

function HealthScoreHero({ loading, score }: { loading: boolean; score: HealthScoreCurrent | null }) {
  const hasScore = score?.score != null;
  const band = score?.band ?? null;
  const bandColor = band ? BAND_COLOR[band] : C.gray;
  const delta = score?.deltaFromPrevMonth ?? null;
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 16,
        border: `1px solid ${C.grayLight}`,
        padding: 28,
        marginBottom: 24,
        display: 'flex',
        alignItems: 'center',
        gap: 24,
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          width: 120,
          height: 120,
          borderRadius: '50%',
          background: hasScore ? `linear-gradient(135deg, ${bandColor}1A, #fff)` : `linear-gradient(135deg, ${C.greenLight}, #fff)`,
          border: `4px solid ${hasScore ? `${bandColor}66` : C.greenLight}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ ...fr, fontSize: 44, fontWeight: 700, color: hasScore ? bandColor : C.gray }}>
          {hasScore ? score!.score : '—'}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ ...dm, fontSize: 12, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Home Health Score
        </div>
        <div style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, margin: '8px 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {loading ? 'Loading…' : hasScore ? bandLabel(band) : (score?.message ?? 'Establishing your score')}
          {delta !== null && delta !== 0 && (
            <span
              style={{
                ...dm,
                fontSize: 13,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 100,
                background: delta > 0 ? '#E1F5EE' : '#FEE2E2',
                color: delta > 0 ? '#085041' : '#991B1B',
              }}
            >
              {delta > 0 ? '+' : ''}{delta} this month
            </span>
          )}
        </div>
        <p style={{ ...dm, fontSize: 13, color: C.darkMid, lineHeight: 1.55, margin: 0 }}>
          {hasScore
            ? 'Updated nightly across maintenance compliance, open items, asset age, inspection recency, and warranty coverage.'
            : 'We need a few more days of data before your score is meaningful. Upload an inspection report, add a few recurring vendors, or complete a seasonal walkthrough — your score builds from there.'}
        </p>
      </div>
    </div>
  );
}

function bandLabel(band: string | null): string {
  switch (band) {
    case 'excellent': return 'Excellent shape';
    case 'good': return 'Good — room to grow';
    case 'needs_work': return 'Needs work';
    case 'concerning': return 'Concerning';
    default: return 'Establishing';
  }
}

function Section({
  title,
  subtitle,
  cta,
  children,
}: {
  title: string;
  subtitle?: string;
  cta?: { label: string; href: string };
  children: React.ReactNode;
}) {
  return (
    <section style={{ background: '#fff', borderRadius: 14, border: `1px solid ${C.grayLight}`, padding: 20, marginBottom: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ ...fr, fontSize: 18, fontWeight: 700, color: C.dark }}>{title}</div>
          {subtitle && <div style={{ ...dm, fontSize: 13, color: C.darkMid, marginTop: 4 }}>{subtitle}</div>}
        </div>
        {cta && (
          <a
            href={cta.href}
            style={{
              ...dm,
              fontSize: 13,
              fontWeight: 600,
              color: C.orange,
              textDecoration: 'none',
              padding: '6px 12px',
              borderRadius: 100,
              border: `1px solid ${C.orange}30`,
              whiteSpace: 'nowrap',
            }}
          >
            {cta.label}
          </a>
        )}
      </header>
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
  disabled,
}: {
  label: string;
  value: string;
  sub: string;
  href?: string;
  disabled?: boolean;
}) {
  const inner = (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        border: `1px solid ${C.grayLight}`,
        padding: 18,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{ ...dm, fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6 }}>
        {label}
      </div>
      <div style={{ ...fr, fontSize: 28, fontWeight: 700, color: C.dark, margin: '6px 0 4px' }}>{value}</div>
      <div style={{ ...dm, fontSize: 12, color: disabled ? C.gray : C.darkMid }}>{sub}</div>
    </div>
  );
  if (href && !disabled) {
    return (
      <a href={href} style={{ textDecoration: 'none' }}>
        {inner}
      </a>
    );
  }
  return inner;
}

function FreeUpgradeGate({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ ...dm, minHeight: '100vh', background: C.warm, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '40px 32px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 8px 30px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>✨</div>
        <h1 style={{ ...fr, fontSize: 26, fontWeight: 700, color: C.dark, margin: '0 0 8px' }}>The Member Dashboard is for Plus + Premier</h1>
        <p style={{ fontSize: 14, color: C.darkMid, lineHeight: 1.6, margin: '0 0 24px' }}>
          Plus unlocks the Home Health Score, unlimited Home IQ, seasonal walkthroughs, warranty
          automation, and tax export. Premier adds an annual Tune-Up + human concierge.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button
            onClick={onBack}
            style={{
              padding: '12px 22px',
              fontSize: 14,
              fontWeight: 600,
              color: C.dark,
              background: '#fff',
              border: `1px solid ${C.grayLight}`,
              borderRadius: 100,
              cursor: 'pointer',
              ...dm,
            }}
          >
            Back to home
          </button>
          {/* Subscription upgrade flow lives in a later session — link
              would route to /account#membership or similar. */}
          <a
            href="/membership"
            style={{
              padding: '12px 22px',
              fontSize: 14,
              fontWeight: 700,
              color: '#fff',
              background: C.orange,
              border: 'none',
              borderRadius: 100,
              textDecoration: 'none',
              ...dm,
            }}
          >
            See plans
          </a>
        </div>
      </div>
    </div>
  );
}
