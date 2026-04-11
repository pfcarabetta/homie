import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { businessService, type WorkspaceDetail, type DashboardData, type SeasonalSuggestion, type Property, type DashboardReservation, type DashboardReservationRun } from '@/services/api';
import { trendArrow, renderBold, O, G, D, W, type Tab } from './constants';

function ReservationsWidget({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<{ occupied: DashboardReservation[]; checkouts: DashboardReservation[]; checkins: DashboardReservation[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<'occupied' | 'checkout' | 'checkin' | null>(null);

  useEffect(() => {
    setLoading(true);
    businessService.getDashboardReservations(workspaceId).then(res => {
      if (res.data) setData(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [workspaceId]);

  if (loading) return null;
  if (!data) return null;

  const totalCount = data.occupied.length + data.checkouts.length + data.checkins.length;
  if (totalCount === 0) return null;

  // SVG icons matching the style of dispatchIcon / calendarIcon below
  const iconStyle = { width: 22, height: 22, display: 'block' as const };
  const homeIcon = (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-9z" />
    </svg>
  );
  const checkoutIcon = (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
  const checkinIcon = (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: D, margin: 0 }}>Reservations this week</h4>
        <span style={{ fontSize: 11, color: '#9B9490' }}>{totalCount} active</span>
      </div>
      <div className="bp-res-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <style>{`@media (max-width: 1100px) { .bp-res-grid { grid-template-columns: 1fr !important; } }`}</style>
        <ReservationKpiCard
          label="Currently occupied"
          icon={homeIcon}
          color={G}
          items={data.occupied}
          variant="occupied"
          isOpen={expanded === 'occupied'}
          onToggle={() => setExpanded(e => (e === 'occupied' ? null : 'occupied'))}
        />
        <ReservationKpiCard
          label="Check-outs"
          icon={checkoutIcon}
          color="#3B82F6"
          items={data.checkouts}
          variant="checkout"
          isOpen={expanded === 'checkout'}
          onToggle={() => setExpanded(e => (e === 'checkout' ? null : 'checkout'))}
        />
        <ReservationKpiCard
          label="Check-ins"
          icon={checkinIcon}
          color={O}
          items={data.checkins}
          variant="checkin"
          isOpen={expanded === 'checkin'}
          onToggle={() => setExpanded(e => (e === 'checkin' ? null : 'checkin'))}
        />
      </div>
    </div>
  );
}

function ReservationKpiCard({ label, icon, color, items, variant, isOpen, onToggle }: {
  label: string;
  icon: JSX.Element;
  color: string;
  items: DashboardReservation[];
  variant: 'occupied' | 'checkout' | 'checkin';
  isOpen: boolean;
  onToggle: () => void;
}) {
  function fmtDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (d.toDateString() === now.toDateString()) {
      return `Today ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    if (d.toDateString() === tomorrow.toDateString()) {
      return `Tmrw ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function fmtGuestName(name: string | null): string {
    if (!name) return 'Guest';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
  }

  function runHref(run: DashboardReservationRun): string {
    if (run.jobId) return `/business?tab=dispatches&job=${run.jobId}`;
    return `/business?tab=schedules`;
  }

  function runColor(status: string): string {
    if (status === 'completed' || status === 'dispatched') return G;
    if (status === 'failed') return '#DC2626';
    return '#9B9490';
  }

  function relevantDateLabel(item: DashboardReservation): string {
    if (variant === 'occupied') return `Until ${fmtDate(item.checkOut)}`;
    if (variant === 'checkout') return fmtDate(item.checkOut);
    return fmtDate(item.checkIn);
  }

  const canExpand = items.length > 0;

  return (
    <div
      style={{
        background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4',
        fontFamily: "'DM Sans', sans-serif",
        overflow: 'hidden', transition: 'border-color 0.15s, box-shadow 0.15s',
        ...(isOpen ? { borderColor: color, boxShadow: `0 4px 16px ${color}1A` } : {}),
      }}
    >
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        disabled={!canExpand}
        style={{
          width: '100%', padding: '18px 20px', background: 'transparent', border: 'none',
          textAlign: 'left', cursor: canExpand ? 'pointer' : 'default',
          fontFamily: 'inherit', display: 'block',
        }}
        onMouseEnter={canExpand ? (e) => {
          if (!isOpen) {
            (e.currentTarget.parentElement as HTMLElement).style.borderColor = color;
            (e.currentTarget.parentElement as HTMLElement).style.transform = 'translateY(-2px)';
            (e.currentTarget.parentElement as HTMLElement).style.boxShadow = `0 4px 16px ${color}1A`;
          }
        } : undefined}
        onMouseLeave={canExpand ? (e) => {
          if (!isOpen) {
            (e.currentTarget.parentElement as HTMLElement).style.borderColor = '#E0DAD4';
            (e.currentTarget.parentElement as HTMLElement).style.transform = 'translateY(0)';
            (e.currentTarget.parentElement as HTMLElement).style.boxShadow = 'none';
          }
        } : undefined}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>{label}</span>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${color}15`, color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {icon}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: D }}>{items.length}</div>
          {canExpand && (
            <span style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', display: 'flex', alignItems: 'center', gap: 4 }}>
              {isOpen ? 'Hide' : 'View'}
              <svg width={12} height={12} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                <polyline points="6 8 10 12 14 8" />
              </svg>
            </span>
          )}
        </div>
      </button>

      {/* Expandable drawer */}
      {isOpen && items.length > 0 && (
        <div style={{
          borderTop: '1px solid #F0EDE9', padding: '14px 20px 18px',
          background: '#FAFAF8',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map(item => (
              <div key={item.reservationId} style={{
                padding: '10px 12px', borderRadius: 10,
                background: '#fff', border: '1px solid rgba(0,0,0,0.06)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.propertyName}
                </div>
                <div style={{ fontSize: 11, color: '#6B6560', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span>{fmtGuestName(item.guestName)}</span>
                  {item.guestCount && (
                    <>
                      <span>·</span>
                      <span>{item.guestCount} guest{item.guestCount === 1 ? '' : 's'}</span>
                    </>
                  )}
                  <span>·</span>
                  <span style={{ color, fontWeight: 600 }}>{relevantDateLabel(item)}</span>
                </div>
                {item.runs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {item.runs.map(run => (
                      <a
                        key={run.id}
                        href={runHref(run)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          background: '#FAFAF8', borderRadius: 100,
                          padding: '3px 9px', fontSize: 10, color: D,
                          textDecoration: 'none',
                          border: '1px solid rgba(0,0,0,0.06)',
                          width: 'fit-content',
                        }}
                      >
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: runColor(run.status), flexShrink: 0 }} />
                        <span style={{ fontWeight: 600 }}>{run.scheduleTitle}</span>
                        <span style={{ color: '#9B9490' }}>· {run.jobId ? 'View dispatch' : 'View schedule'}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardTab({ workspace, onNavigate }: { workspace: WorkspaceDetail; onNavigate: (tab: Tab, jobId?: string) => void }) {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [suggestions, setSuggestions] = useState<SeasonalSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [suggestionsGeneratedAt, setSuggestionsGeneratedAt] = useState<string | null>(null);
  const [dispatchSuggestion, setDispatchSuggestion] = useState<SeasonalSuggestion | null>(null);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(false);
  const [allProperties, setAllProperties] = useState<Property[]>([]);

  useEffect(() => {
    businessService.listProperties(workspace.id).then(res => {
      if (res.data) setAllProperties(res.data.filter(p => p.active).sort((a, b) => a.name.localeCompare(b.name)));
    }).catch(() => {});
  }, [workspace.id]);

  useEffect(() => {
    businessService.getDashboard(workspace.id).then(res => {
      if (res.data) setData(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspace.id]);

  function loadSuggestions(force = false) {
    // Check localStorage cache (24-hour TTL)
    const cacheKey = `homie_seasonal_${workspace.id}`;
    if (!force) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const { suggestions: cachedSuggestions, generatedAt } = JSON.parse(cached) as { suggestions: SeasonalSuggestion[]; generatedAt: string };
          const age = Date.now() - new Date(generatedAt).getTime();
          if (age < 24 * 60 * 60 * 1000 && cachedSuggestions.length > 0) {
            setSuggestions(cachedSuggestions);
            setSuggestionsGeneratedAt(generatedAt);
            return;
          }
        }
      } catch { /* ignore bad cache */ }
    }

    setLoadingSuggestions(true);
    businessService.getSeasonalSuggestions(workspace.id).then(res => {
      if (res.data && res.data.length > 0) {
        setSuggestions(res.data);
        const now = new Date().toISOString();
        setSuggestionsGeneratedAt(now);
        try { localStorage.setItem(cacheKey, JSON.stringify({ suggestions: res.data, generatedAt: now })); } catch { /* ignore */ }
      }
    }).catch(() => {}).finally(() => setLoadingSuggestions(false));
  }

  useEffect(() => { loadSuggestions(); }, [workspace.id]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading dashboard...</div>;
  if (!data) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Failed to load dashboard</div>;

  const dispatchTrend = trendArrow(data.dispatches_this_month, data.dispatches_last_month);
  const bookingTrend = trendArrow(data.bookings_this_month, data.bookings_last_month);

  const CAT_COLORS: Record<string, string> = {
    plumbing: '#3B82F6', electrical: '#F59E0B', hvac: '#8B5CF6', appliance: '#EC4899',
    roofing: '#6366F1', cleaning: '#14B8A6', pool: '#06B6D4', landscaping: '#22C55E',
    pest_control: '#EF4444', painting: '#F97316', general: '#6B7280',
  };

  const maxCatCount = Math.max(...data.dispatches_by_category.map(c => c.count), 1);

  const iconStyle = { width: 22, height: 22, display: 'block' as const };
  const dispatchIcon = (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h13l3 4v6h-3" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /><path d="M5 18H4V6" /><path d="M9 18h6" />
    </svg>
  );
  const checkIcon = (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M8 12l3 3 5-6" />
    </svg>
  );
  const calendarIcon = (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18" /><path d="M8 3v4M16 3v4" />
    </svg>
  );
  const boltIcon = (
    <svg style={iconStyle} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );

  const kpis: { label: string; value: number | string; icon: JSX.Element; color: string; sub: { text: string; color: string } | null; onClick?: () => void }[] = [
    { label: 'Active Dispatches', value: data.active_dispatches, icon: dispatchIcon, color: O, sub: null, onClick: () => onNavigate('dispatches') },
    { label: 'Completed This Month', value: data.completed_this_month, icon: checkIcon, color: G, sub: dispatchTrend },
    { label: 'Total Bookings', value: data.total_bookings, icon: calendarIcon, color: '#3B82F6', sub: bookingTrend, onClick: () => onNavigate('bookings') },
    { label: 'Avg Response Time', value: data.avg_response_minutes != null ? `${data.avg_response_minutes}m` : '—', icon: boltIcon, color: '#8B5CF6', sub: null },
  ];

  return (
    <div>
      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        {kpis.map(kpi => {
          const Tag: 'button' | 'div' = kpi.onClick ? 'button' : 'div';
          return (
            <Tag
              key={kpi.label}
              onClick={kpi.onClick}
              style={{
                background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: '18px 20px',
                fontFamily: "'DM Sans', sans-serif", textAlign: 'left',
                cursor: kpi.onClick ? 'pointer' : 'default',
                transition: 'border-color 0.15s, transform 0.15s, box-shadow 0.15s',
                width: '100%',
              }}
              onMouseEnter={kpi.onClick ? (e) => {
                (e.currentTarget as HTMLElement).style.borderColor = kpi.color;
                (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
                (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px ${kpi.color}1A`;
              } : undefined}
              onMouseLeave={kpi.onClick ? (e) => {
                (e.currentTarget as HTMLElement).style.borderColor = '#E0DAD4';
                (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              } : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>{kpi.label}</span>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${kpi.color}15`, color: kpi.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {kpi.icon}
                </div>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: D }}>{kpi.value}</div>
              {kpi.sub && (
                <div style={{ fontSize: 12, fontWeight: 600, color: kpi.sub.color, marginTop: 4 }}>
                  {kpi.sub.text} vs last month
                </div>
              )}
            </Tag>
          );
        })}
      </div>

      {/* ── Reservations this week ── */}
      <ReservationsWidget workspaceId={workspace.id} />

      {/* ── Middle row: Category breakdown + Top vendors ── */}
      <div className="bp-dashboard-mid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        {/* Category breakdown */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: D, margin: '0 0 14px' }}>Dispatches by Category</h4>
          {data.dispatches_by_category.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9B9490', padding: '20px 0', textAlign: 'center' }}>No dispatches yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.dispatches_by_category.slice(0, 8).map(cat => (
                <div key={cat.category}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#6B6560', textTransform: 'capitalize' }}>{cat.category.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: D }}>{cat.count}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: '#F0EDE9' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: CAT_COLORS[cat.category] ?? O, width: `${(cat.count / maxCatCount) * 100}%`, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top vendors */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20 }}>
          <h4 style={{ fontSize: 14, fontWeight: 700, color: D, margin: '0 0 14px' }}>Top Providers</h4>
          {data.top_vendors.length === 0 ? (
            <div style={{ fontSize: 13, color: '#9B9490', padding: '20px 0', textAlign: 'center' }}>No bookings yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.top_vendors.map((v, i) => (
                <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', background: `${O}15`, color: O,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                    <div style={{ fontSize: 11, color: '#9B9490' }}>
                      {v.booking_count} booking{v.booking_count !== 1 ? 's' : ''}{v.avg_rating ? ` · ★ ${v.avg_rating}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20, marginBottom: 24 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: D, margin: '0 0 14px' }}>Recent Activity</h4>
        {data.recent_activity.length === 0 ? (
          <div style={{ fontSize: 13, color: '#9B9490', padding: '20px 0', textAlign: 'center' }}>No recent activity</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {data.recent_activity.map((a, i) => {
              const icon = a.type === 'dispatch' ? '📡' : a.type === 'quote' ? '💬' : a.type === 'booking' ? '✅' : '❌';
              const typeColor = a.type === 'dispatch' ? O : a.type === 'quote' ? '#3B82F6' : a.type === 'booking' ? G : '#DC2626';
              return (
                <div key={i} onClick={() => {
                  if (a.type === 'booking') onNavigate('bookings', a.job_id);
                  else onNavigate('dispatches', a.job_id);
                }} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < data.recent_activity.length - 1 ? '1px solid #F0EDE9' : 'none', cursor: 'pointer', borderRadius: 6, transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FAFAF8'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 2 }}>{icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: D }}>{a.title}</div>
                    <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>
                      {a.property_name && <span>{a.property_name}</span>}
                      {a.provider_name && <span> · {a.provider_name}</span>}
                      <span> · {new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: typeColor, textTransform: 'uppercase', flexShrink: 0, marginTop: 2 }}>
                    {a.type}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Seasonal Prep Suggestions ── */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 700, color: D, margin: 0 }}>Seasonal Prep Suggestions</h4>
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>AI-generated based on your properties, locations, and time of year</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {suggestionsGeneratedAt && (
              <span style={{ fontSize: 11, color: '#9B9490' }}>
                Generated {new Date(suggestionsGeneratedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            )}
            <button onClick={() => loadSuggestions(true)} disabled={loadingSuggestions}
              style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', fontSize: 12, fontWeight: 600, color: '#6B6560', cursor: 'pointer', opacity: loadingSuggestions ? 0.5 : 1 }}>
              {loadingSuggestions ? 'Generating...' : '🔄 Regenerate'}
            </button>
          </div>
        </div>

        {loadingSuggestions && suggestions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <div style={{ width: 24, height: 24, border: `3px solid ${O}30`, borderTopColor: O, borderRadius: '50%', margin: '0 auto 10px', animation: 'spin 0.7s linear infinite' }} />
            <div style={{ fontSize: 13, color: '#9B9490' }}>Analyzing your properties and generating suggestions...</div>
          </div>
        )}

        {suggestions.length > 0 && (() => {
          const visibleSuggestions = suggestionsExpanded ? suggestions : suggestions.slice(0, 2);
          const hasMore = suggestions.length > 2;
          return (
            <>
              <div className="bp-suggestions-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {visibleSuggestions.map((s, i) => {
                  const priorityColor = s.priority === 'high' ? '#DC2626' : s.priority === 'medium' ? '#D4A017' : G;
                  return (
                    <div key={i} style={{ background: W, borderRadius: 12, padding: 16, border: '1px solid #E0DAD4' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: D, lineHeight: 1.3 }}>{s.title}</div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: priorityColor, background: `${priorityColor}15`, padding: '2px 8px', borderRadius: 100, flexShrink: 0, marginLeft: 8, textTransform: 'capitalize' }}>{s.priority}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6B6560', lineHeight: 1.5, marginBottom: 8 }}>{s.description}</div>
                      <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 10 }}>
                        <span style={{ textTransform: 'capitalize' }}>{s.category.replace(/_/g, ' ')}</span>
                        {s.properties.length > 0 && <span> · {s.properties.slice(0, 3).join(', ')}{s.properties.length > 3 ? ` +${s.properties.length - 3} more` : ''}</span>}
                      </div>
                      <div style={{ fontSize: 11, color: O, fontStyle: 'italic', marginBottom: 10 }}>{s.reason}</div>
                      <button onClick={() => setDispatchSuggestion(s)}
                        style={{
                          width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                          background: O, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>
                        Dispatch
                      </button>
                    </div>
                  );
                })}
              </div>
              {hasMore && (
                <button onClick={() => setSuggestionsExpanded(!suggestionsExpanded)}
                  style={{
                    display: 'block', width: '100%', marginTop: 12, padding: '10px 0', borderRadius: 10,
                    border: '1px solid #E0DAD4', background: '#fff', color: '#6B6560',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                  }}>
                  {suggestionsExpanded ? `Show less` : `Show ${suggestions.length - 2} more suggestions`}
                </button>
              )}
            </>
          );
        })()}

        {!loadingSuggestions && suggestions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 0', color: '#9B9490', fontSize: 13 }}>
            No seasonal suggestions available. Add properties to get AI-driven maintenance recommendations.
          </div>
        )}
      </div>

      {/* Property picker for suggestion dispatch */}
      {dispatchSuggestion && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
          onClick={() => setDispatchSuggestion(null)}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440, maxHeight: '80vh', overflow: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.15)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, color: D, margin: '0 0 4px' }}>Select Property to Dispatch</h3>
            <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 16 }}>
              <strong>{dispatchSuggestion.title}</strong> — {dispatchSuggestion.description}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 350, overflowY: 'auto' }}>
              {allProperties
                .sort((a, b) => {
                  const aMatch = dispatchSuggestion!.properties.some(n => a.name.includes(n) || n.includes(a.name));
                  const bMatch = dispatchSuggestion!.properties.some(n => b.name.includes(n) || n.includes(b.name));
                  if (aMatch && !bMatch) return -1;
                  if (!aMatch && bMatch) return 1;
                  return a.name.localeCompare(b.name);
                })
                .map(p => {
                  const isRecommended = dispatchSuggestion!.properties.some(n => p.name.includes(n) || n.includes(p.name));
                  return (
                    <button key={p.id} onClick={() => {
                      const params = new URLSearchParams({
                        tab: 'dispatch-chat',
                        workspace: workspace.id,
                        property: p.id,
                        category: dispatchSuggestion!.category,
                        prefill: dispatchSuggestion!.title,
                        description: dispatchSuggestion!.description,
                      });
                      setDispatchSuggestion(null);
                      navigate(`/business?${params.toString()}`);
                    }} style={{
                      display: 'flex', alignItems: 'center', padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                      border: isRecommended ? `2px solid ${O}` : '1px solid #E0DAD4',
                      background: isRecommended ? `${O}04` : '#fff', textAlign: 'left',
                      fontFamily: "'DM Sans', sans-serif", transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { if (!isRecommended) e.currentTarget.style.borderColor = O; }}
                      onMouseLeave={e => { if (!isRecommended) e.currentTarget.style.borderColor = '#E0DAD4'; }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{p.name}</div>
                        {p.city && <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>{p.city}{p.state ? `, ${p.state}` : ''}</div>}
                      </div>
                      {isRecommended && <span style={{ fontSize: 10, fontWeight: 600, color: O, background: `${O}12`, padding: '2px 8px', borderRadius: 100, flexShrink: 0 }}>Suggested</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
