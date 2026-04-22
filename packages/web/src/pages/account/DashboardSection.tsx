import { useEffect, useState } from 'react';
import { accountService, type AccountJob, type AccountBooking, type SmartSuggestion } from '@/services/api';
import type { AccountTab } from './AccountSidebar';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';

const CATEGORY_ICON: Record<string, string> = {
  hvac: '\u2744\uFE0F',
  plumbing: '\uD83D\uDCA7',
  landscaping: '\uD83C\uDF31',
  pest_control: '\uD83E\uDEB2',
  pool: '\uD83C\uDFCA',
  roofing: '\uD83C\uDFE0',
  electrical: '\u26A1',
  appliance: '\uD83C\uDF73',
  general: '\uD83D\uDD27',
  cleaning: '\u2728',
  safety: '\uD83D\uDEE1\uFE0F',
  exterior: '\uD83C\uDFD8\uFE0F',
};
const CATEGORY_LABEL: Record<string, string> = {
  hvac: 'HVAC',
  plumbing: 'Plumbing',
  landscaping: 'Landscaping',
  pest_control: 'Pest Control',
  pool: 'Pool & Spa',
  roofing: 'Roofing',
  electrical: 'Electrical',
  appliance: 'Appliance',
  general: 'General',
  cleaning: 'Cleaning',
  safety: 'Safety',
  exterior: 'Exterior',
};
const KIND_ACCENT: Record<string, { bg: string; text: string; label: string }> = {
  seasonal: { bg: '#FFF7ED', text: '#C2410C', label: 'Seasonal' },
  location: { bg: '#EFF6FF', text: '#2563EB', label: 'Local' },
  equipment: { bg: '#F5F3FF', text: '#7C3AED', label: 'Your Home' },
};
const PRIORITY_DOT: Record<string, string> = {
  high: '#DC2626',
  medium: '#F59E0B',
  low: '#9B9490',
};

const ACTIVE_QUOTE_STATUSES = new Set(['open', 'dispatching', 'collecting']);

interface DashboardSectionProps {
  userFirstName?: string | null;
  onNavigate: (tab: AccountTab) => void;
  onNewQuote: () => void;
  onDiagnostic: () => void;
  /** Optional — fires when a smart-suggestion tile's "Get a quote"
   *  button is tapped. Receives the full suggestion so the parent can
   *  navigate to /quote with prefill params instead of opening a blank
   *  chat. Falls back to onNewQuote if omitted. */
  onSuggestionAct?: (s: SmartSuggestion) => void;
}

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

function statusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'open': return { bg: '#EFF6FF', text: '#2563EB' };
    case 'dispatching': return { bg: '#FFF7ED', text: '#C2410C' };
    case 'collecting': return { bg: '#F5F3FF', text: '#7C3AED' };
    case 'completed': return { bg: '#F0FDF4', text: '#16A34A' };
    case 'confirmed': return { bg: '#F0FDF4', text: '#16A34A' };
    case 'expired': return { bg: '#F5F5F5', text: '#9B9490' };
    default: return { bg: '#F5F5F5', text: '#6B6560' };
  }
}

export default function DashboardSection({ userFirstName, onNavigate, onNewQuote, onDiagnostic, onSuggestionAct }: DashboardSectionProps) {
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

  const activeQuotes = jobs.filter(j => ACTIVE_QUOTE_STATUSES.has(j.status));
  const openBookings = bookings.filter(b => b.status === 'confirmed');
  // Sort completed bookings by completed_at (the service-end timestamp), falling
  // back to confirmed_at for legacy rows that pre-date the column.
  const completedBookings = bookings
    .filter(b => b.status === 'completed')
    .sort((a, b) => {
      const ta = new Date(a.completed_at ?? a.confirmed_at).getTime();
      const tb = new Date(b.completed_at ?? b.confirmed_at).getTime();
      return tb - ta;
    });
  const lastService = completedBookings[0];
  const lastServiceWhen = lastService ? (lastService.completed_at ?? lastService.confirmed_at) : null;

  // Recent activity: combine + sort by timestamp, take 5 most recent
  const activity: ActivityItem[] = [
    ...jobs.map<ActivityItem>(j => ({
      id: j.id,
      kind: 'quote',
      title: j.diagnosis?.summary || j.diagnosis?.category || 'Quote request',
      meta: j.diagnosis?.category || 'General',
      timestamp: j.created_at,
      status: j.status,
    })),
    ...bookings.map<ActivityItem>(b => ({
      id: b.id,
      kind: 'booking',
      title: `Booked ${b.provider.name}`,
      meta: b.quoted_price || 'Confirmed',
      timestamp: b.confirmed_at,
      status: b.status,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 6);

  // Recommended action
  const recommended: { label: string; sub: string; onClick: () => void } = (() => {
    if (activeQuotes.length === 0 && openBookings.length === 0 && jobs.length === 0) {
      return {
        label: 'Try a free diagnostic',
        sub: 'Describe what\u2019s going on',
        onClick: onDiagnostic,
      };
    }
    if (activeQuotes.length > 0) {
      return {
        label: `${activeQuotes.length} quote${activeQuotes.length === 1 ? '' : 's'} awaiting`,
        sub: 'View provider responses',
        onClick: () => onNavigate('quotes'),
      };
    }
    return {
      label: 'Get a new quote',
      sub: 'For your next repair',
      onClick: onNewQuote,
    };
  })();

  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: D, marginBottom: 4 }}>
        Welcome back{userFirstName ? `, ${userFirstName}` : ''}
      </h1>
      <p style={{ fontSize: 14, color: '#6B6560', marginBottom: 24 }}>
        {'Here\u2019s what\u2019s happening with your home services.'}
      </p>

      {/* KPI tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Tile
          label="Active quotes"
          value={loading ? '…' : String(activeQuotes.length)}
          sub={activeQuotes.length === 0 ? 'No open requests' : 'Awaiting providers'}
          accent={O}
          onClick={() => onNavigate('quotes')}
        />
        <Tile
          label="Open bookings"
          value={loading ? '…' : String(openBookings.length)}
          sub={openBookings.length === 0 ? 'Nothing scheduled' : `Next: ${openBookings[0].provider.name}`}
          accent="#2563EB"
          onClick={() => onNavigate('bookings')}
        />
        <Tile
          label="Last service"
          value={lastServiceWhen ? timeAgo(lastServiceWhen) : '\u2014'}
          sub={lastService ? lastService.provider.name : 'No completed services'}
          accent={G}
          onClick={() => lastService && onNavigate('bookings')}
        />
        <Tile
          label="Recommended"
          value={recommended.label}
          sub={recommended.sub}
          accent="#7C3AED"
          onClick={recommended.onClick}
          fontSize={16}
        />
      </div>

      {/* Smart Suggestions — seasonal + location + equipment-aware */}
      <SmartSuggestions onNewQuote={onNewQuote} onNavigate={onNavigate} onSuggestionAct={onSuggestionAct} />

      {/* Recent activity */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: '1px solid rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: D, marginBottom: 14 }}>Recent activity</div>
        {loading ? (
          <div style={{ color: '#9B9490', fontSize: 14 }}>Loading\u2026</div>
        ) : activity.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 0', color: '#9B9490' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{'\uD83D\uDCED'}</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Nothing yet</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Your quote requests and bookings will appear here</div>
            <button onClick={onNewQuote} style={{
              marginTop: 14, padding: '9px 18px', borderRadius: 100, border: 'none',
              background: O, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}>+ Get your first quote</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {activity.map((a, i) => {
              const sc = statusColor(a.status);
              const onClick = () => onNavigate(a.kind === 'quote' ? 'quotes' : 'bookings');
              return (
                <div key={a.id} onClick={onClick} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                  borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.05)', cursor: 'pointer',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, background: a.kind === 'booking' ? '#F0FDF4' : `${O}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 14 }}>{a.kind === 'booking' ? '\u2713' : '\u23F1'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {a.title}
                    </div>
                    <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>
                      {a.meta} {'\u00B7'} {timeAgo(a.timestamp)}
                    </div>
                  </div>
                  <span style={{
                    background: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: 100,
                    fontSize: 11, fontWeight: 600, textTransform: 'capitalize', flexShrink: 0,
                  }}>{a.status}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, accent, onClick, fontSize = 22 }: {
  label: string;
  value: string;
  sub: string;
  accent: string;
  onClick?: () => void;
  fontSize?: number;
}) {
  return (
    <button onClick={onClick} style={{
      background: '#fff', borderRadius: 12, padding: '18px 18px',
      border: '1px solid rgba(0,0,0,0.06)', textAlign: 'left', cursor: onClick ? 'pointer' : 'default',
      fontFamily: "'DM Sans', sans-serif", display: 'flex', flexDirection: 'column', gap: 4,
      transition: 'transform 0.15s, box-shadow 0.15s',
    }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.06)'; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: '#9B9490', textTransform: 'uppercase', letterSpacing: 0.6 }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: fontSize, fontWeight: 700, color: D, fontFamily: "'Fraunces', serif", lineHeight: 1.1, marginTop: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#6B6560' }}>{sub}</div>
    </button>
  );
}

// ── Smart Suggestions ──────────────────────────────────────────────────────

function SmartSuggestions({ onNewQuote, onNavigate, onSuggestionAct }: {
  onNewQuote: () => void;
  onNavigate: (tab: AccountTab) => void;
  /** Optional: when a tile's "Get a quote" button is tapped with the
   *  full SmartSuggestion in hand. If set, parent uses it to navigate
   *  to /quote with prefill params; otherwise we fall back to the plain
   *  onNewQuote. */
  onSuggestionAct?: (s: SmartSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<SmartSuggestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasHomeData, setHasHomeData] = useState<boolean | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      return new Set(JSON.parse(window.localStorage.getItem('homieDismissedSuggestions') ?? '[]'));
    } catch { return new Set(); }
  });

  function load(force = false) {
    if (force) setRefreshing(true); else setLoading(true);
    setError(null);
    accountService.getSmartSuggestions(6, force)
      .then(res => {
        setSuggestions(res.data ?? []);
        setHasHomeData(res.meta?.hasHomeData !== false);
        setGeneratedAt((res.meta?.generatedAt as string | undefined) ?? null);
        setNextRefreshAt((res.meta?.nextRefreshAt as string | undefined) ?? null);
      })
      .catch(err => setError((err as Error).message ?? 'Could not load suggestions'))
      .finally(() => { setLoading(false); setRefreshing(false); });
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Build the freshness label: "Updated 2d ago · refreshes in 5d"
  const freshnessLabel = (() => {
    if (!generatedAt) return null;
    const ageMs = Date.now() - new Date(generatedAt).getTime();
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    const ageHrs = Math.floor(ageMs / (60 * 60 * 1000));
    const updatedStr = ageDays >= 1 ? `${ageDays}d ago` : ageHrs >= 1 ? `${ageHrs}h ago` : 'just now';
    if (!nextRefreshAt) return `Updated ${updatedStr}`;
    const remainingMs = new Date(nextRefreshAt).getTime() - Date.now();
    const remainingDays = Math.max(0, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)));
    return `Updated ${updatedStr} · refreshes in ${remainingDays}d`;
  })();

  function dismiss(key: string) {
    const next = new Set(dismissed);
    next.add(key);
    setDismissed(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('homieDismissedSuggestions', JSON.stringify([...next]));
    }
  }

  const visible = (suggestions ?? []).filter(s => !dismissed.has(s.title));

  return (
    <div style={{
      background: '#fff', borderRadius: 14, padding: '20px 22px',
      border: '1px solid rgba(0,0,0,0.06)', marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: D, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{'\u2728'}</span> Smart suggestions
          </div>
          <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>
            {hasHomeData === false
              ? 'Add your home details for personalized picks'
              : freshnessLabel ?? 'Tailored to your home, location, and the season'}
          </div>
        </div>
        <button
          onClick={() => load(true)}
          disabled={loading || refreshing}
          style={{
            background: 'rgba(0,0,0,0.04)', color: '#6B6560', border: 'none',
            borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
            cursor: loading || refreshing ? 'default' : 'pointer',
            fontFamily: "'DM Sans', sans-serif", opacity: loading || refreshing ? 0.5 : 1,
          }}
        >
          {refreshing ? 'Refreshing\u2026' : 'Refresh'}
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: '#DC2626', marginTop: 12 }}>{error}</div>}

      {loading ? (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginTop: 16,
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              height: 132, background: '#FAFAF8', borderRadius: 12,
              border: '1px solid rgba(0,0,0,0.04)',
              animation: `dash-pulse 1.4s ${i * 0.15}s ease-in-out infinite`,
            }} />
          ))}
          <style>{`@keyframes dash-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }`}</style>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '28px 0', color: '#9B9490' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{'\uD83D\uDCAB'}</div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>No suggestions right now</div>
          {hasHomeData === false && (
            <button onClick={() => onNavigate('home')} style={{
              marginTop: 12, padding: '8px 16px', borderRadius: 100, border: 'none',
              background: O, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}>Complete my home profile</button>
          )}
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 12, marginTop: 16,
        }}>
          {visible.map((s, i) => (
            <SuggestionTile
              key={`${s.title}-${i}`}
              suggestion={s}
              onAct={() => (onSuggestionAct ? onSuggestionAct(s) : onNewQuote())}
              onDismiss={() => dismiss(s.title)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionTile({ suggestion, onAct, onDismiss }: {
  suggestion: SmartSuggestion;
  onAct: () => void;
  onDismiss: () => void;
}) {
  const cat = suggestion.category?.toLowerCase() ?? 'general';
  const icon = CATEGORY_ICON[cat] ?? '\uD83D\uDD27';
  const catLabel = CATEGORY_LABEL[cat] ?? cat;
  const kindKey = (suggestion.kind ?? '').toLowerCase();
  const kind = KIND_ACCENT[kindKey];
  const dotColor = PRIORITY_DOT[suggestion.priority] ?? PRIORITY_DOT.medium;

  return (
    <div style={{
      position: 'relative', background: '#FAFAF8', borderRadius: 12, padding: '14px 14px 12px',
      border: '1px solid rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      {/* Top row: kind chip + dismiss */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {kind && (
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 100,
              background: kind.bg, color: kind.text,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              {kind.label}
            </span>
          )}
          <span style={{ fontSize: 11, color: '#6B6560', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>{icon}</span>{catLabel}
          </span>
          <span title={`${suggestion.priority} priority`} style={{
            width: 6, height: 6, borderRadius: '50%', background: dotColor, marginLeft: 2,
          }} />
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss suggestion"
          title="Not now"
          style={{
            background: 'transparent', border: 'none', color: '#C0BBB6', cursor: 'pointer',
            padding: 2, fontSize: 16, lineHeight: 1, fontWeight: 500,
          }}
        >&times;</button>
      </div>

      {/* Title */}
      <div style={{ fontSize: 14, fontWeight: 700, color: D, lineHeight: 1.3 }}>
        {suggestion.title}
      </div>

      {/* Description (clamped) */}
      <div style={{
        fontSize: 12, color: '#6B6560', lineHeight: 1.45,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const,
        overflow: 'hidden',
      }}>
        {suggestion.description}
      </div>

      {/* Reason — italic micro-copy */}
      {suggestion.reason && (
        <div style={{ fontSize: 11, color: '#9B9490', fontStyle: 'italic', marginTop: 2 }}>
          {suggestion.reason}
        </div>
      )}

      {/* Action */}
      <button
        onClick={onAct}
        style={{
          marginTop: 6, background: 'transparent', color: O, border: 'none',
          padding: 0, fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'left',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        Get a quote {'\u2192'}
      </button>
    </div>
  );
}
