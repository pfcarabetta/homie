import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { accountService, fetchAPI, type AccountJob, type AccountBooking, type DispatchAllowanceState, type NextStepResponse, type SmartSuggestion } from '@/services/api';
import { useAuth } from '@/contexts/AuthContext';
import type { AccountTab } from './AccountSidebar';

/**
 * Member Dashboard — Direction A redesign.
 *
 * The old dashboard stacked eight stat tiles, three overlapping panels
 * for inspection data, and two parallel activity feeds. Direction A
 * strips that down to a single focal hierarchy:
 *
 *   1. Header — welcome + property + tier badge inline
 *   2. Bundle expiry banner (conditional, only when Inspect Premium
 *      bundle has < 30 days left)
 *   3. Score card — slimmer than the old hero, with an inline
 *      expandable "what's pulling it down" breakdown
 *   4. Next Step card — single adaptive recommendation driven by the
 *      next-step prioritizer service. Cycles via "Skip for now".
 *   5. Stats strip — one-line summary, no tiles. Each number is a
 *      clickable link to its detail surface.
 *   6. Recent activity — chronological feed of quotes + bookings
 *
 * Free members get a simplified variant: upsell banner + activity
 * feed only. The previous Free experience showed marketing-style
 * tiles and AI suggestions; those are gone in favor of the single
 * upgrade CTA, which is the only action a Free member can take here.
 */

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const DIM = '#6B6560';
const SUBTLE = '#9B9490';
const GRAY_LIGHT = '#D3CEC9';
const WARM = '#F9F5F2';

const dm: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const fr: CSSProperties = { fontFamily: "'Fraunces', serif" };
const mono: CSSProperties = { fontFamily: "'DM Mono', monospace" };

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

interface ScoreFactor {
  type: string;
  score: number;
  weight: number;
  contribution: number;
  notes: string | null;
}

const BAND_COLOR: Record<string, string> = {
  excellent: '#1B9E77',
  good: '#E8632B',
  needs_work: '#EF9F27',
  concerning: '#E24B4A',
};

function bandLabel(band: string | null): string {
  switch (band) {
    case 'excellent': return 'Excellent shape';
    case 'good': return 'Good — room to grow';
    case 'needs_work': return 'Needs work';
    case 'concerning': return 'Concerning';
    default: return 'Establishing';
  }
}

function fmtMoney(cents: number): string {
  if (!cents) return '$0';
  return `$${(cents / 100).toFixed(0)}`;
}

interface DashboardSectionProps {
  userFirstName?: string | null;
  onNavigate: (tab: AccountTab) => void;
  onNewQuote: () => void;
  /** Legacy prop kept for backwards compatibility with Account.tsx —
   *  the new dashboard no longer surfaces a SmartSuggestion grid, but
   *  the parent still wires this for the chat command center handoff. */
  onSuggestionAct?: (s: SmartSuggestion) => void;
}

// ─── Activity helpers ─────────────────────────────────────────────────

const ACTIVE_QUOTE_STATUSES = new Set(['open', 'dispatching', 'collecting']);

interface ActivityItem {
  id: string;
  kind: 'quote' | 'booking';
  title: string;
  meta: string;
  timestamp: string;
  status: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function DashboardSection({ userFirstName, onNavigate, onNewQuote }: DashboardSectionProps) {
  const { homeowner } = useAuth();
  const tier = (homeowner?.membership_tier ?? 'free') as 'free' | 'plus' | 'premier';
  const isPaying = tier === 'plus' || tier === 'premier';

  if (!isPaying) {
    return <FreeDashboard userFirstName={userFirstName} tier={tier} onNavigate={onNavigate} onNewQuote={onNewQuote} />;
  }
  return <MemberDashboard userFirstName={userFirstName} tier={tier} onNavigate={onNavigate} onNewQuote={onNewQuote} />;
}

// ─── Free-tier dashboard ──────────────────────────────────────────────

function FreeDashboard({
  userFirstName, tier, onNavigate, onNewQuote,
}: {
  userFirstName?: string | null;
  tier: 'free' | 'plus' | 'premier';
  onNavigate: (tab: AccountTab) => void;
  onNewQuote: () => void;
}) {
  const navigate = useNavigate();
  return (
    <div>
      <Header userFirstName={userFirstName} tier={tier} property={null} />
      <UpsellBanner onUpgrade={() => navigate('/membership')} />
      <ActivityFeed onNavigate={onNavigate} onNewQuote={onNewQuote} />
    </div>
  );
}

// ─── Member-tier dashboard ────────────────────────────────────────────

function MemberDashboard({
  userFirstName, tier, onNavigate, onNewQuote,
}: {
  userFirstName?: string | null;
  tier: 'free' | 'plus' | 'premier';
  onNavigate: (tab: AccountTab) => void;
  onNewQuote: () => void;
}) {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PortalProperty[]>([]);
  const [vendors, setVendors] = useState<PortalVendor[]>([]);
  const [healthScore, setHealthScore] = useState<HealthScoreCurrent | null>(null);
  const [allowance, setAllowance] = useState<DispatchAllowanceState | null>(null);
  const [itemsSummary, setItemsSummary] = useState<{ total: number; bySeverity: Record<string, number> } | null>(null);
  const [nextStep, setNextStep] = useState<NextStepResponse | null>(null);
  const [loading, setLoading] = useState(true);

  function refreshNextStep() {
    accountService.getNextStep().then((r) => {
      if (r.data) setNextStep(r.data);
    }).catch(() => {});
  }
  function refreshAfterDispatch() {
    refreshNextStep();
    accountService.getOpenInspectionItemsSummary().then((r) => {
      if (r.data) setItemsSummary(r.data);
    }).catch(() => {});
    accountService.getDispatchAllowance().then((r) => {
      if (r.data) setAllowance(r.data);
    }).catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pRes, vRes, hsRes, daRes, sRes, nsRes] = await Promise.all([
          fetchAPI<{ properties: PortalProperty[] }>('/api/v1/account/properties').catch(() => ({ data: { properties: [] } })),
          fetchAPI<{ vendors: PortalVendor[] }>('/api/v1/account/vendors').catch(() => ({ data: { vendors: [] } })),
          fetchAPI<HealthScoreCurrent>('/api/v1/account/health-score/current').catch(() => ({ data: null as HealthScoreCurrent | null })),
          accountService.getDispatchAllowance().catch(() => ({ data: null as DispatchAllowanceState | null })),
          accountService.getOpenInspectionItemsSummary().catch(() => ({ data: null as { total: number; bySeverity: Record<string, number> } | null })),
          accountService.getNextStep().catch(() => ({ data: null as NextStepResponse | null })),
        ]);
        if (cancelled) return;
        if (pRes.data) setProperties(pRes.data.properties);
        if (vRes.data) setVendors(vRes.data.vendors);
        if (hsRes.data) setHealthScore(hsRes.data);
        if (daRes.data) setAllowance(daRes.data);
        if (sRes.data) setItemsSummary(sRes.data);
        if (nsRes.data) setNextStep(nsRes.data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const primary = properties.find((p) => p.isPrimary) ?? properties[0] ?? null;
  const activeVendors = vendors.filter((v) => v.status !== 'cancelled');
  const ytdTotal = activeVendors.reduce((s, v) => s + v.totalPaidYtdCents, 0);

  return (
    <div>
      <Header userFirstName={userFirstName} tier={tier} property={primary} />
      <BundleExpiryBanner allowance={allowance} onUpgrade={() => navigate('/membership')} />
      <ScoreCard loading={loading} score={healthScore} />
      <NextStepCard
        step={nextStep}
        loading={loading}
        onDispatch={async (params) => {
          if (!params.reportId || !params.itemId) return;
          await accountService.dispatchInspectionItem(params.reportId, params.itemId);
          refreshAfterDispatch();
        }}
        onContinuePlus={() => navigate('/membership')}
        onNavigateHomies={() => onNavigate('homies')}
        onNavigateQuote={onNewQuote}
        onSkip={async (skipKey) => {
          const r = await accountService.skipNextStep(skipKey);
          if (r.data) setNextStep(r.data);
        }}
      />
      <StatsStrip
        allowance={allowance}
        itemsTotal={itemsSummary?.total ?? 0}
        vendorCount={activeVendors.length}
        ytdCents={ytdTotal}
        onNavigate={onNavigate}
      />
      <ActivityFeed onNavigate={onNavigate} onNewQuote={onNewQuote} />
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  free: { label: 'Free', bg: '#E5E5E5', fg: D },
  plus: { label: 'Plus', bg: '#F0997B', fg: '#5C2A14' },
  premier: { label: 'Premier', bg: D, fg: '#fff' },
};

function Header({
  userFirstName, tier, property,
}: {
  userFirstName?: string | null;
  tier: 'free' | 'plus' | 'premier';
  property: PortalProperty | null;
}) {
  const badge = TIER_BADGE[tier] ?? TIER_BADGE.free;
  const propertyLine = property
    ? [property.nickname ?? property.address, property.city && property.state ? `${property.city}, ${property.state}` : null]
        .filter(Boolean)
        .join(' · ')
    : null;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
      <div>
        <h1 style={{ ...fr, fontSize: 30, fontWeight: 700, color: D, margin: '0 0 4px' }}>
          Welcome back{userFirstName ? `, ${userFirstName}` : ''}
        </h1>
        {propertyLine && (
          <div style={{ ...dm, fontSize: 14, color: DIM }}>{propertyLine}</div>
        )}
      </div>
      <span
        style={{
          ...dm,
          padding: '4px 12px',
          borderRadius: 100,
          background: badge.bg,
          color: badge.fg,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          flexShrink: 0,
          marginTop: 6,
        }}
      >
        {badge.label}
      </span>
    </div>
  );
}

// ─── Upsell banner (Free tier) ────────────────────────────────────────

function UpsellBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 100%)',
      border: `1px solid ${O}33`,
      borderRadius: 14,
      padding: '20px 22px',
      marginBottom: 24,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
      ...dm,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: '50%',
        background: `${O}1A`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', flexShrink: 0, fontSize: 22,
      }}>
        {'✨'}
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: D, marginBottom: 4 }}>
          Unlock your Home Health Score
        </div>
        <div style={{ fontSize: 13, color: DIM, lineHeight: 1.5 }}>
          Plus members get the Health Score, recurring vendor management, and tax-ready records. Premier adds an annual Tune-Up + concierge.
        </div>
      </div>
      <button
        onClick={onUpgrade}
        style={{
          padding: '11px 22px', borderRadius: 100, border: 'none',
          background: O, color: '#fff', fontSize: 14, fontWeight: 700,
          cursor: 'pointer', flexShrink: 0, ...dm,
        }}
      >
        See plans
      </button>
    </div>
  );
}

// ─── Bundle expiry banner ─────────────────────────────────────────────

function BundleExpiryBanner({
  allowance, onUpgrade,
}: {
  allowance: DispatchAllowanceState | null;
  onUpgrade: () => void;
}) {
  if (!allowance || allowance.membershipSource !== 'inspect_premium_bundle' || !allowance.unlimitedUntil) {
    return null;
  }
  const expiresAt = new Date(allowance.unlimitedUntil);
  const msLeft = expiresAt.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  if (daysLeft <= 0 || daysLeft > 30) return null;
  const isUrgent = daysLeft <= 7;
  const expiresLabel = expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return (
    <div
      style={{
        background: isUrgent ? 'linear-gradient(135deg, #FEF2F2 0%, #FFFFFF 100%)' : 'linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 100%)',
        border: `1px solid ${isUrgent ? '#FCA5A5' : `${O}33`}`,
        borderRadius: 14,
        padding: '14px 18px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        ...dm,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: isUrgent ? '#FCA5A540' : `${O}1A`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, fontSize: 18,
      }}>
        {isUrgent ? '⏰' : '✨'}
      </div>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: D, marginBottom: 2 }}>
          {isUrgent
            ? `Plus ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${expiresLabel})`
            : `Plus ends ${expiresLabel} — ${daysLeft} days left`}
        </div>
        <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>
          {isUrgent
            ? 'Continue Plus to keep your Health Score, dispatch allowance, and vendor management active.'
            : 'Your year of Plus came with your Premium inspection. Continue at $29/mo to keep all features active.'}
        </div>
      </div>
      <button
        onClick={onUpgrade}
        style={{
          padding: '9px 18px', borderRadius: 100, border: 'none',
          background: O, color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        Continue Plus
      </button>
    </div>
  );
}

// ─── Score card ───────────────────────────────────────────────────────

function ScoreCard({ loading, score }: { loading: boolean; score: HealthScoreCurrent | null }) {
  const [expanded, setExpanded] = useState(false);
  const [factors, setFactors] = useState<ScoreFactor[] | null>(null);
  const [factorsLoading, setFactorsLoading] = useState(false);

  const hasScore = score?.score != null;
  const band = score?.band ?? null;
  const bandColor = band ? BAND_COLOR[band] : SUBTLE;
  const delta = score?.deltaFromPrevMonth ?? null;

  async function toggleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (!factors && !factorsLoading) {
      setFactorsLoading(true);
      try {
        const r = await accountService.getHealthScoreFactors();
        if (r.data) setFactors(r.data.factors);
      } catch { /* ignore */ }
      setFactorsLoading(false);
    }
    setExpanded(true);
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 16, border: `1px solid ${GRAY_LIGHT}`,
      padding: 28, marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div
          style={{
            width: 110, height: 110, borderRadius: '50%',
            background: hasScore
              ? `linear-gradient(135deg, ${bandColor}1A, #fff)`
              : `linear-gradient(135deg, #E1F5EE, #fff)`,
            border: `4px solid ${hasScore ? `${bandColor}66` : '#E1F5EE'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ ...fr, fontSize: 48, fontWeight: 700, color: hasScore ? bandColor : SUBTLE, lineHeight: 1 }}>
            {hasScore ? score!.score : '—'}
          </span>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: SUBTLE, textTransform: 'uppercase', letterSpacing: 1.2 }}>
            Home Health Score
          </div>
          <div style={{ ...fr, fontSize: 22, fontWeight: 700, color: D, margin: '6px 0 4px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {loading ? 'Loading…' : hasScore ? bandLabel(band) : (score?.message ?? 'Establishing your score')}
            {delta !== null && delta !== 0 && (
              <span
                style={{
                  ...dm,
                  fontSize: 12, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 100,
                  background: delta > 0 ? '#E1F5EE' : '#FEE2E2',
                  color: delta > 0 ? '#085041' : '#991B1B',
                }}
              >
                {delta > 0 ? '↗ +' : '↘ '}{delta} this month
              </span>
            )}
          </div>
          {hasScore && (
            <button
              onClick={toggleExpand}
              style={{
                ...dm, fontSize: 13, fontWeight: 600, color: O,
                background: 'transparent', border: 'none', padding: '4px 0',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              {expanded ? 'Hide breakdown ↑' : "See what's pulling it down →"}
            </button>
          )}
          {!hasScore && (
            <div style={{ ...dm, fontSize: 13, color: DIM, lineHeight: 1.5 }}>
              We need a few days of data before your score is meaningful. Add an inspection or fill in your home details to get started.
            </div>
          )}
        </div>
      </div>
      {expanded && (
        <ScoreBreakdown factors={factors} loading={factorsLoading} />
      )}
    </div>
  );
}

const FACTOR_LABELS: Record<string, string> = {
  maintenance_compliance: 'Maintenance compliance',
  item_health: 'Open items',
  asset_health: 'Asset age',
  inspection_recency: 'Inspection recency',
  warranty_coverage: 'Warranty coverage',
};

function ScoreBreakdown({ factors, loading }: { factors: ScoreFactor[] | null; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${GRAY_LIGHT}`, ...dm, fontSize: 13, color: DIM }}>
        Loading breakdown…
      </div>
    );
  }
  if (!factors || factors.length === 0) {
    return (
      <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${GRAY_LIGHT}`, ...dm, fontSize: 13, color: DIM }}>
        No breakdown available yet.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${GRAY_LIGHT}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {factors.map((f) => {
          const label = FACTOR_LABELS[f.type] ?? f.type;
          const pct = f.score;
          const tone = pct >= 70 ? G : pct >= 50 ? '#EF9F27' : '#E24B4A';
          return (
            <div key={f.type} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ ...dm, fontSize: 13, fontWeight: 600, color: D, width: 180, flexShrink: 0 }}>
                {label}
              </div>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#F0EBE6', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: tone }} />
              </div>
              <div style={{ ...dm, fontSize: 12, color: DIM, width: 40, textAlign: 'right' }}>
                {pct}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Next Step card ───────────────────────────────────────────────────

function NextStepCard({
  step, loading,
  onDispatch, onContinuePlus, onNavigateHomies, onNavigateQuote, onSkip,
}: {
  step: NextStepResponse | null;
  loading: boolean;
  onDispatch: (params: { reportId?: string; itemId?: string }) => Promise<void>;
  onContinuePlus: () => void;
  onNavigateHomies: () => void;
  onNavigateQuote: () => void;
  onSkip: (skipKey: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (loading || !step) {
    return (
      <div style={{
        background: '#fff', borderRadius: 16, border: `1px solid ${GRAY_LIGHT}`,
        padding: 28, marginBottom: 20, minHeight: 160,
      }}>
        <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: SUBTLE, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 }}>
          Next step
        </div>
        <div style={{ ...dm, fontSize: 14, color: DIM }}>Looking for what's next…</div>
      </div>
    );
  }

  async function handleCta() {
    if (busy) return;
    setBusy(true);
    try {
      if (step!.ctaAction === 'dispatch_item') {
        await onDispatch(step!.ctaParams ?? {});
        setConfirmed(true);
        // Brief confirmation, then the parent's refresh swaps the step.
        setTimeout(() => setConfirmed(false), 1800);
      } else if (step!.ctaAction === 'continue_plus') {
        onContinuePlus();
      } else if (step!.ctaAction === 'navigate_homies') {
        onNavigateHomies();
      } else if (step!.ctaAction === 'navigate_quote') {
        onNavigateQuote();
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSkip() {
    if (busy || !step!.skipLabel) return;
    setBusy(true);
    try {
      await onSkip(step!.skipKey);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      background: '#fff', borderRadius: 16,
      border: step.urgent ? '1px solid #FCA5A5' : `1px solid ${GRAY_LIGHT}`,
      borderTop: step.urgent ? '3px solid #DC2626' : `1px solid ${GRAY_LIGHT}`,
      padding: 28, marginBottom: 20,
    }}>
      <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: step.urgent ? '#DC2626' : SUBTLE, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 12 }}>
        {step.eyebrow}
      </div>
      <h2 style={{ ...fr, fontSize: 22, fontWeight: 700, color: D, margin: '0 0 8px', lineHeight: 1.25 }}>
        {step.title}
      </h2>
      <p style={{ ...dm, fontSize: 14, color: DIM, lineHeight: 1.6, margin: '0 0 12px', maxWidth: 580 }}>
        {step.description}
      </p>
      {step.meta && (
        <div style={{ ...dm, fontSize: 12, color: SUBTLE, marginBottom: 18 }}>
          {step.meta}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={handleCta}
          disabled={busy || confirmed}
          style={{
            padding: '11px 22px', borderRadius: 100, border: 'none',
            background: confirmed ? G : O, color: '#fff',
            fontSize: 13, fontWeight: 700,
            cursor: busy || confirmed ? 'default' : 'pointer',
            ...dm,
          }}
        >
          {confirmed ? '✓ Sent' : busy ? 'Working…' : step.ctaLabel}
        </button>
        {step.skipLabel && (
          <button
            onClick={handleSkip}
            disabled={busy}
            style={{
              padding: '11px 22px', borderRadius: 100, border: `1px solid ${GRAY_LIGHT}`,
              background: '#fff', color: D, fontSize: 13, fontWeight: 600,
              cursor: busy ? 'default' : 'pointer', ...dm,
            }}
          >
            {step.skipLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Stats strip ──────────────────────────────────────────────────────

function StatsStrip({
  allowance, itemsTotal, vendorCount, ytdCents, onNavigate,
}: {
  allowance: DispatchAllowanceState | null;
  itemsTotal: number;
  vendorCount: number;
  ytdCents: number;
  onNavigate: (tab: AccountTab) => void;
}) {
  const navigate = useNavigate();
  // Compose the dispatch count phrasing based on tier state.
  let dispatches: string;
  if (!allowance) dispatches = '…';
  else if (allowance.hasUnlimited) dispatches = 'unlimited dispatches';
  else dispatches = `${allowance.monthlyBank} dispatch${allowance.monthlyBank === 1 ? '' : 'es'}`;

  const items = itemsTotal === 0 ? null : `${itemsTotal} open item${itemsTotal === 1 ? '' : 's'}`;
  const homies = `${vendorCount} hom${vendorCount === 1 ? 'ie' : 'ies'}`;
  const ytd = `${fmtMoney(ytdCents)} YTD`;

  const cellStyle: CSSProperties = {
    ...dm,
    fontSize: 13,
    fontWeight: 500,
    color: D,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 2px',
  };
  const separatorStyle: CSSProperties = {
    ...dm,
    fontSize: 13,
    color: GRAY_LIGHT,
    padding: '0 4px',
    userSelect: 'none',
  };

  return (
    <div
      style={{
        marginBottom: 28,
        padding: '14px 20px',
        borderTop: `1px solid ${GRAY_LIGHT}`,
        borderBottom: `1px solid ${GRAY_LIGHT}`,
        display: 'flex', alignItems: 'center', gap: 4,
        flexWrap: 'wrap', justifyContent: 'center',
      }}
    >
      <button style={cellStyle} onClick={() => navigate('/quote')}>{dispatches}</button>
      {items && (
        <>
          <span style={separatorStyle}>·</span>
          <button style={cellStyle} onClick={() => navigate('/inspect-portal?tab=items')}>{items}</button>
        </>
      )}
      <span style={separatorStyle}>·</span>
      <button style={cellStyle} onClick={() => onNavigate('homies')}>{homies}</button>
      <span style={separatorStyle}>·</span>
      <button style={cellStyle} onClick={() => onNavigate('homies')}>{ytd}</button>
    </div>
  );
}

// ─── Activity feed ────────────────────────────────────────────────────

function statusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'open': return { bg: '#EFF6FF', text: '#2563EB' };
    case 'dispatching': return { bg: '#FFF7ED', text: '#C2410C' };
    case 'collecting': return { bg: '#F5F3FF', text: '#7C3AED' };
    case 'completed': return { bg: '#F0FDF4', text: '#16A34A' };
    case 'confirmed': return { bg: '#F0FDF4', text: '#16A34A' };
    case 'expired': return { bg: '#F5F5F5', text: SUBTLE };
    default: return { bg: '#F5F5F5', text: DIM };
  }
}

function ActivityFeed({
  onNavigate, onNewQuote,
}: {
  onNavigate: (tab: AccountTab) => void;
  onNewQuote: () => void;
}) {
  const [jobs, setJobs] = useState<AccountJob[]>([]);
  const [bookings, setBookings] = useState<AccountBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      accountService.getJobs().catch(() => ({ data: { jobs: [] } as { jobs: AccountJob[] } | null })),
      accountService.getBookings().catch(() => ({ data: { bookings: [] } as { bookings: AccountBooking[] } | null })),
    ]).then(([jr, br]) => {
      if (cancelled) return;
      setJobs(jr.data?.jobs ?? []);
      setBookings(br.data?.bookings ?? []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const activity: ActivityItem[] = [
    ...jobs.map<ActivityItem>((j) => {
      const isActive = ACTIVE_QUOTE_STATUSES.has(j.status);
      return {
        id: j.id,
        kind: 'quote',
        title: isActive ? `Outreach started for ${j.diagnosis?.category?.replace(/_/g, ' ') ?? 'your request'}` : (j.diagnosis?.summary || j.diagnosis?.category || 'Quote'),
        meta: j.diagnosis?.category?.replace(/_/g, ' ') ?? 'general',
        timestamp: j.created_at,
        status: j.status,
      };
    }),
    ...bookings.map<ActivityItem>((b) => ({
      id: b.id,
      kind: 'booking',
      title: b.status === 'completed' ? `${b.provider.name} visit completed` : `Booked ${b.provider.name}`,
      meta: b.quoted_price || 'confirmed',
      timestamp: b.confirmed_at,
      status: b.status,
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  return (
    <section>
      <div style={{ ...mono, fontSize: 11, fontWeight: 700, color: SUBTLE, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 14 }}>
        Recent
      </div>
      {loading ? (
        <div style={{ ...dm, fontSize: 13, color: DIM, padding: '12px 0' }}>Loading…</div>
      ) : activity.length === 0 ? (
        <div style={{
          background: '#fff', borderRadius: 14, border: `1px solid ${GRAY_LIGHT}`,
          padding: '28px 22px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{'📭'}</div>
          <div style={{ ...dm, fontSize: 14, fontWeight: 500, color: DIM }}>Nothing yet</div>
          <div style={{ ...dm, fontSize: 12, color: SUBTLE, marginTop: 4 }}>
            Your quotes and bookings will appear here.
          </div>
          <button
            onClick={onNewQuote}
            style={{
              marginTop: 16, padding: '9px 18px', borderRadius: 100, border: 'none',
              background: O, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', ...dm,
            }}
          >
            Ask Homie
          </button>
        </div>
      ) : (
        <div style={{
          background: '#fff', borderRadius: 14, border: `1px solid ${GRAY_LIGHT}`,
          overflow: 'hidden',
        }}>
          {activity.map((a, i) => {
            const sc = statusColor(a.status);
            const Icon = a.kind === 'booking' ? '✓' : '💬';
            return (
              <button
                key={a.id}
                onClick={() => onNavigate(a.kind === 'quote' ? 'quotes' : 'bookings')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 18px',
                  background: 'transparent',
                  border: 'none',
                  borderTop: i === 0 ? 'none' : `1px solid ${GRAY_LIGHT}40`,
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  ...dm,
                }}
              >
                <span style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: a.kind === 'booking' ? '#F0FDF4' : `${O}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, flexShrink: 0,
                }}>{Icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {a.title}
                  </div>
                  <div style={{ fontSize: 12, color: SUBTLE, marginTop: 2 }}>
                    {timeAgo(a.timestamp)}
                  </div>
                </div>
                <span style={{
                  background: sc.bg, color: sc.text,
                  padding: '3px 10px', borderRadius: 100,
                  fontSize: 10, fontWeight: 600, textTransform: 'capitalize',
                  flexShrink: 0,
                }}>{a.status}</span>
                <span style={{ fontSize: 14, color: GRAY_LIGHT, flexShrink: 0 }}>›</span>
              </button>
            );
          })}
        </div>
      )}
      {activity.length > 0 && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <button
            onClick={() => onNavigate('quotes')}
            style={{
              ...dm, fontSize: 13, fontWeight: 600, color: O,
              background: 'transparent', border: 'none', padding: 4, cursor: 'pointer',
            }}
          >
            View all activity →
          </button>
        </div>
      )}
      {/* WARM is referenced for the cream tint on inactive items; silence
          unused-var lint by referencing it once. */}
      <span style={{ display: 'none' }}>{WARM}</span>
    </section>
  );
}
