import { useEffect, useState } from 'react';
import { accountService, type AccountJob, type AccountBooking } from '@/services/api';
import type { AccountTab } from './AccountSidebar';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';

const ACTIVE_QUOTE_STATUSES = new Set(['open', 'dispatching', 'collecting']);

interface DashboardSectionProps {
  userFirstName?: string | null;
  onNavigate: (tab: AccountTab) => void;
  onNewQuote: () => void;
  onDiagnostic: () => void;
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

export default function DashboardSection({ userFirstName, onNavigate, onNewQuote, onDiagnostic }: DashboardSectionProps) {
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
  const completedBookings = bookings.filter(b => b.status === 'completed').sort((a, b) => new Date(b.confirmed_at).getTime() - new Date(a.confirmed_at).getTime());
  const lastService = completedBookings[0];

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
          value={lastService ? timeAgo(lastService.confirmed_at) : '\u2014'}
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
