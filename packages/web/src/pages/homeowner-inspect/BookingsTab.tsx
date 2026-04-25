import { useState, useEffect, useMemo } from 'react';
import { inspectService, type PortalReport, type HomeownerBooking } from '@/services/inspector-api';
import { paidReports, reportsWithTier } from './constants';
import type { Tab } from './constants';
import LockedTabPlaceholder from './LockedTabPlaceholder';

const ACCENT = '#2563EB';
const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';

interface BookingsTabProps {
  reports: PortalReport[];
  onNavigate: (tab: Tab) => void;
}

/**
 * Bookings tab — shows all bookings derived from inspection reports for this
 * homeowner. Mirrors the design of `business/BookingsTab.tsx` but homeowner-
 * scoped (no workspace, no preferred-provider add, no cancel).
 *
 * Data source: `GET /api/v1/account/bookings`, filtered client-side to only
 * entries where `source === 'inspection_report'`. The same response is reused
 * for the consumer /account bookings view, so any field added here also
 * appears there.
 */
export default function BookingsTab({ reports, onNavigate }: BookingsTabProps) {
  const visibleReports = useMemo(() => reportsWithTier(reports, 'professional'), [reports]);
  const hasUnderTierReport = paidReports(reports).length > visibleReports.length;
  const [bookings, setBookings] = useState<HomeownerBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterReport, setFilterReport] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    if (visibleReports.length === 0) { setLoading(false); return; }
    inspectService.listBookings()
      .then(res => {
        const all = res.data?.bookings ?? [];
        // Inspect tab only — drop consumer /quote bookings.
        setBookings(all.filter(b => b.source === 'inspection_report'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [visibleReports.length]);

  const filteredBookings = useMemo(() => bookings.filter(b => {
    if (filterStatus && b.status !== filterStatus) return false;
    if (filterCategory && (b.job_category ?? '').toLowerCase() !== filterCategory) return false;
    if (filterReport && b.inspection_report_id !== filterReport) return false;
    if (filterDateFrom && new Date(b.confirmed_at) < new Date(filterDateFrom)) return false;
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      if (new Date(b.confirmed_at) > to) return false;
    }
    return true;
  }), [bookings, filterStatus, filterCategory, filterReport, filterDateFrom, filterDateTo]);

  const uniqueCategories = useMemo(
    () => [...new Set(bookings.map(b => b.job_category).filter(Boolean))] as string[],
    [bookings],
  );

  const reportOptions = useMemo(() => {
    const seen = new Map<string, { id: string; address: string }>();
    for (const b of bookings) {
      if (!b.inspection_report_id) continue;
      const matchingReport = visibleReports.find(r => r.id === b.inspection_report_id);
      const address = matchingReport
        ? `${matchingReport.propertyAddress ?? ''}${matchingReport.propertyCity ? ', ' + matchingReport.propertyCity : ''}`.trim()
        : 'Inspection report';
      if (!seen.has(b.inspection_report_id)) seen.set(b.inspection_report_id, { id: b.inspection_report_id, address });
    }
    return Array.from(seen.values());
  }, [bookings, visibleReports]);

  // ── Tier gate ─────────────────────────────────────────────────────────────
  if (visibleReports.length === 0) {
    return (
      <LockedTabPlaceholder
        tabName="Bookings"
        description="Track providers you've booked from your inspection report quotes"
        hasAnyReports={reports.length > 0}
        hasUnderTierReport={hasUnderTierReport}
        requiredTier="professional"
        onNavigate={onNavigate}
      />
    );
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: 'var(--bp-subtle)' }}>Loading bookings...</div>;
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (bookings.length === 0) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Bookings</h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>
            Providers you've booked from inspection report quotes
          </p>
        </div>
        <div style={{
          background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
          padding: '60px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCCB'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
            No bookings yet
          </h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 20px', maxWidth: 400, marginInline: 'auto' }}>
            When you accept a quote on the Quotes tab, the booking will appear here with the provider's contact details, availability, and price.
          </p>
          <button onClick={() => onNavigate('quotes')} style={{
            padding: '12px 28px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
            cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          }}>Go to Quotes</button>
        </div>
      </div>
    );
  }

  const selectStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bp-border)',
    fontSize: 12, color: D, cursor: 'pointer', background: 'var(--bp-card)',
  };
  const hasFilters = !!(filterStatus || filterCategory || filterReport || filterDateFrom || filterDateTo);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Bookings</h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>
          {bookings.length} booking{bookings.length !== 1 ? 's' : ''} across your inspection reports
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
          <option value="">All Categories</option>
          {uniqueCategories.map(c => (
            <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>
          ))}
        </select>
        {reportOptions.length > 1 && (
          <select value={filterReport} onChange={e => setFilterReport(e.target.value)} style={selectStyle}>
            <option value="">All Reports</option>
            {reportOptions.map(r => <option key={r.id} value={r.id}>{r.address}</option>)}
          </select>
        )}
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={selectStyle} title="From date" />
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={selectStyle} title="To date" />
        {hasFilters && (
          <button
            onClick={() => { setFilterStatus(''); setFilterCategory(''); setFilterReport(''); setFilterDateFrom(''); setFilterDateTo(''); }}
            style={{
              padding: '6px 10px', borderRadius: 8, border: 'none', background: '#F5F5F5',
              color: 'var(--bp-subtle)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Clear filters
          </button>
        )}
        <span style={{ fontSize: 12, color: 'var(--bp-subtle)', marginLeft: 'auto' }}>
          {filteredBookings.length} match{filteredBookings.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Bookings list, grouped by date */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredBookings.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--bp-subtle)', fontSize: 14 }}>
            No bookings match the selected filters
          </div>
        )}
        {(() => {
          let lastDateLabel = '';
          return filteredBookings.map(b => {
            const dateObj = new Date(b.confirmed_at);
            const today = new Date();
            const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
            const isToday = dateObj.toDateString() === today.toDateString();
            const isYesterday = dateObj.toDateString() === yesterday.toDateString();
            const dateLabel = isToday ? 'Today'
              : isYesterday ? 'Yesterday'
              : dateObj.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: dateObj.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
                });
            const showHeader = dateLabel !== lastDateLabel;
            lastDateLabel = dateLabel;

            return (
              <div key={b.id}>
                {showHeader && (
                  <div style={{
                    fontSize: 12, fontWeight: 700, color: 'var(--bp-subtle)',
                    padding: '14px 0 6px', letterSpacing: '0.03em',
                  }}>
                    {dateLabel}
                  </div>
                )}
                <BookingCard
                  booking={b}
                  reports={visibleReports}
                  expanded={expandedId === b.id}
                  onToggle={() => setExpandedId(expandedId === b.id ? null : b.id)}
                  onViewReport={(reportId) => { onNavigate('reports'); setTimeout(() => {
                    // Tabs don't accept query params from inside, so we route via URL
                    // for the deep-linked report view. ReportsTab reads ?report on mount.
                    const params = new URLSearchParams(window.location.search);
                    params.set('tab', 'reports');
                    params.set('report', reportId);
                    window.history.replaceState({}, '', `?${params.toString()}`);
                  }, 0); }}
                />
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

interface BookingCardProps {
  booking: HomeownerBooking;
  reports: PortalReport[];
  expanded: boolean;
  onToggle: () => void;
  onViewReport: (reportId: string) => void;
}

function BookingCard({ booking: b, reports, expanded, onToggle, onViewReport }: BookingCardProps) {
  const catLabel = b.job_category
    ? b.job_category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : 'Service';
  const sc = b.status === 'confirmed' ? { bg: '#F0FDF4', text: '#16A34A' }
    : b.status === 'completed' ? { bg: '#EFF6FF', text: '#2563EB' }
    : { bg: '#F5F5F5', text: '#9B9490' };

  const matchingReport = b.inspection_report_id
    ? reports.find(r => r.id === b.inspection_report_id)
    : null;
  const reportAddress = matchingReport
    ? `${matchingReport.propertyAddress ?? ''}${matchingReport.propertyCity ? ', ' + matchingReport.propertyCity : ''}`.trim()
    : null;

  return (
    <div
      id={`booking-${b.id}`}
      onClick={onToggle}
      style={{
        background: 'var(--bp-card)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
        border: expanded ? `2px solid ${ACCENT}` : '1px solid rgba(0,0,0,0.06)',
        transition: 'all 0.2s',
        boxShadow: expanded ? `0 4px 20px ${ACCENT}10` : '0 1px 4px rgba(0,0,0,0.03)',
      }}
    >
      {/* ── Collapsed header ── */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            background: b.status === 'confirmed' ? `${G}12` : b.status === 'completed' ? '#EFF6FF' : W,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${b.status === 'confirmed' ? `${G}30` : b.status === 'completed' ? '#93C5FD' : '#F0EBE6'}`,
          }}>
            <span style={{ fontSize: 16 }}>{b.status === 'cancelled' ? '\u2715' : '\u2713'}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{
                fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: 'var(--bp-text)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{catLabel}</span>
              <span style={{
                background: sc.bg, color: sc.text, padding: '2px 7px', borderRadius: 100,
                fontSize: 9, fontWeight: 600, flexShrink: 0, textTransform: 'capitalize',
              }}>{b.status}</span>
              <span style={{
                background: '#EFF6FF', color: '#2563EB', padding: '2px 7px', borderRadius: 100,
                fontSize: 9, fontWeight: 600, flexShrink: 0,
              }}>Inspect</span>
            </div>
            <div style={{
              fontSize: 11, color: 'var(--bp-subtle)',
              display: 'flex', gap: 8, flexWrap: 'wrap',
            }}>
              <span style={{ fontWeight: 500 }}>{b.provider.name}</span>
              {reportAddress && <span>{'\uD83C\uDFE0'} {reportAddress}</span>}
              <span>{new Date(b.confirmed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 50 }}>
            {b.quoted_price ? (
              <>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: O }}>{b.quoted_price}</div>
                <div style={{ fontSize: 9, color: 'var(--bp-subtle)' }}>quoted</div>
              </>
            ) : (
              <div style={{ fontSize: 10, fontWeight: 600, color: G }}>Booked</div>
            )}
          </div>
          <span style={{ fontSize: 11, color: '#C0BBB6', flexShrink: 0 }}>{expanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div
          style={{ padding: '0 14px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Summary */}
          {b.job_summary && (
            <div style={{ fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.6, marginBottom: 14, paddingTop: 12 }}>
              {renderBold(b.job_summary)}
            </div>
          )}

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, marginBottom: 14 }}>
            {[
              { label: 'Provider', value: b.provider.name },
              { label: 'Category', value: catLabel },
              ...(b.provider.rating ? [{ label: 'Rating', value: `${b.provider.rating}★ (${b.provider.review_count})` }] : []),
              ...(b.quoted_price ? [{ label: 'Quoted Price', value: b.quoted_price, color: O }] : []),
              ...(b.scheduled ? [{ label: 'Availability', value: b.scheduled }] : []),
              ...(b.service_address ? [{ label: 'Service Address', value: b.service_address }] : []),
              ...(b.zip_code ? [{ label: 'Zip Code', value: b.zip_code }] : []),
              { label: 'Booked', value: new Date(b.confirmed_at).toLocaleString() },
              ...(b.preferred_timing ? [{ label: 'Timing', value: b.preferred_timing.replace(/_/g, ' ') }] : []),
              ...(b.completed_at ? [{ label: 'Completed', value: new Date(b.completed_at).toLocaleDateString() }] : []),
            ].map((item, i) => (
              <div key={i} style={{ background: 'var(--bp-bg)', borderRadius: 8, padding: '7px 10px' }}>
                <div style={{
                  fontSize: 9, color: 'var(--bp-subtle)', fontWeight: 500,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>{item.label}</div>
                <div style={{
                  fontSize: 12, fontWeight: 600,
                  color: (item as { color?: string }).color ?? 'var(--bp-text)',
                }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Provider response message */}
          {b.response_message && (
            <div style={{
              background: 'var(--bp-bg)', borderRadius: 10, padding: '10px 12px', marginBottom: 14,
              fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.5,
            }}>
              <div style={{
                fontSize: 9, color: 'var(--bp-subtle)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4,
              }}>Provider Note</div>
              {b.response_message}
            </div>
          )}

          {/* Contact buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {b.provider.phone && (
              <a href={`tel:${b.provider.phone}`} style={{
                flex: 1, minWidth: 0, padding: '10px 0', borderRadius: 100, border: 'none',
                background: O, color: 'white', fontSize: 14, fontWeight: 600,
                textAlign: 'center', textDecoration: 'none', display: 'block',
                boxShadow: `0 4px 16px ${O}40`,
              }}>{'\uD83D\uDCDE'} Call {b.provider.name.split(' ')[0]}</a>
            )}
            {b.provider.email && (
              <a href={`mailto:${b.provider.email}`} style={{
                flex: 1, minWidth: 0, padding: '10px 0', borderRadius: 100,
                border: `2px solid ${O}`, background: 'var(--bp-card)', color: O,
                fontSize: 14, fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'block',
              }}>{'\u2709\uFE0F'} Email</a>
            )}
          </div>

          {/* Deep link back to the report */}
          {b.inspection_report_id && (
            <button
              onClick={() => onViewReport(b.inspection_report_id!)}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 100,
                border: `1px solid ${ACCENT}`, background: 'var(--bp-card)', color: ACCENT,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {'\uD83D\uDCCB'} View Inspection Report
            </button>
          )}

          {b.status === 'cancelled' && (
            <div style={{ marginTop: 10, textAlign: 'center', fontSize: 13, color: '#DC2626', fontWeight: 500 }}>
              Booking cancelled
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Local helper — same shape as `business/constants.tsx`'s renderBold.
function renderBold(text: string): React.ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}
