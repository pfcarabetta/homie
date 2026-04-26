import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { inspectService, type PortalReport, type InspectionItem, type InspectStatusItem } from '@/services/inspector-api';
import { SEVERITY_COLORS, SEVERITY_LABELS, CATEGORY_ICONS, CATEGORY_LABELS, formatCurrency, timeAgo, paidReports, reportsWithTier } from './constants';
import type { Tab } from './constants';
import LockedTabPlaceholder from './LockedTabPlaceholder';

const ACCENT = '#2563EB';

interface QuotesTabProps {
  reports: PortalReport[];
  onNavigate: (tab: Tab) => void;
  onReportsChange: () => void;
}

interface ItemWithContext extends InspectionItem {
  _reportId: string;
  _reportAddress: string;
  _clientAccessToken: string;
  _dispatchedAt?: string;
}

type StatusFilter = 'all' | 'waiting' | 'quoted' | 'booked';

export default function QuotesTab({ reports, onNavigate, onReportsChange }: QuotesTabProps) {
  const visibleReports = useMemo(() => reportsWithTier(reports, 'professional'), [reports]);
  const hasUnderTierReport = paidReports(reports).length > visibleReports.length;
  const [fullItems, setFullItems] = useState<ItemWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  // Initial value can be seeded from sessionStorage by HomeIQTab's "Get
  // quotes for X items" CTA — one-shot handoff that clears immediately so
  // the filter doesn't stick across navigations.
  const [activeCategory, setActiveCategory] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = sessionStorage.getItem('hi_quotes_filter_category');
    if (stored) sessionStorage.removeItem('hi_quotes_filter_category');
    return stored;
  });
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [confirmBooking, setConfirmBooking] = useState<{ item: ItemWithContext; quote: { providerId: string; providerName: string; amountCents: number; availability: string | null } } | null>(null);
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load all items from all paid reports
  const loadItems = useCallback(async () => {
    const items: ItemWithContext[] = [];
    for (const report of visibleReports) {
      if (!report.clientAccessToken) continue;
      try {
        const res = await inspectService.getReport(report.clientAccessToken);
        if (res.data) {
          for (const item of res.data.items) {
            items.push({
              ...item,
              _reportId: report.id,
              _reportAddress: report.propertyAddress,
              _clientAccessToken: report.clientAccessToken,
            });
          }
        }
      } catch { /* skip */ }
    }
    // Only show items that have been dispatched or beyond
    const dispatched = items.filter(i => i.dispatchStatus && i.dispatchStatus !== 'pending');
    setFullItems(dispatched);
  }, [visibleReports]);

  useEffect(() => {
    loadItems().finally(() => setLoading(false));
  }, [loadItems]);

  // Poll status every 10s for items that aren't booked yet
  useEffect(() => {
    const needsPoll = fullItems.some(i => i.dispatchStatus === 'dispatched' || i.dispatchStatus === 'quotes_received' || i.dispatchStatus === 'quoted');
    if (!needsPoll) return;

    pollRef.current = setInterval(async () => {
      const tokens = new Set(fullItems.map(i => i._clientAccessToken));
      const updates = new Map<string, InspectStatusItem>();
      for (const token of tokens) {
        try {
          const res = await inspectService.getStatus(token);
          if (res.data) {
            for (const si of res.data.items) updates.set(si.id, si);
          }
        } catch { /* ignore */ }
      }
      setFullItems(prev => prev.map(item => {
        const si = updates.get(item.id);
        if (!si) return item;
        const matchingQuote = si.quoteAmountCents
          ? si.quotes.find(q => q.amountCents === si.quoteAmountCents)
          : null;
        return {
          ...item,
          dispatchStatus: si.dispatchStatus as InspectionItem['dispatchStatus'],
          quoteDetails: si.quoteAmountCents ? {
            providerName: si.providerName ?? '',
            providerRating: parseFloat(si.providerRating ?? '0'),
            price: si.quoteAmountCents / 100,
            availability: si.providerAvailability ?? '',
            ...(matchingQuote?.bundleSize && matchingQuote.bundleSize > 1
              ? { bundleSize: matchingQuote.bundleSize }
              : {}),
          } : item.quoteDetails,
          // Attach full quotes array to item for display
          ...(si.quotes ? { _quotes: si.quotes } as unknown as ItemWithContext : {}),
        };
      }));
    }, 10000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fullItems]);

  async function handleConfirmBooking() {
    if (!confirmBooking) return;
    setBooking(true);
    try {
      const res = await inspectService.bookQuote(confirmBooking.item._reportId, confirmBooking.item.id, confirmBooking.quote.providerId);
      if (res.data) {
        setBookingResult(`Booked with ${res.data.providerName}! We'll be in touch at ${res.data.providerPhone}.`);
        setConfirmBooking(null);
        await loadItems();
        onReportsChange();
      } else {
        setBookingResult(res.error ?? 'Booking failed');
      }
    } catch (err) {
      setBookingResult((err as Error).message ?? 'Booking failed');
    }
    setBooking(false);
  }

  // Apply filters
  const filteredItems = useMemo(() => {
    let items = fullItems;
    if (activeReportId) items = items.filter(i => i._reportId === activeReportId);
    if (activeCategory) items = items.filter(i => i.category === activeCategory);
    if (statusFilter === 'waiting') items = items.filter(i => i.dispatchStatus === 'dispatched' && !i.quoteDetails);
    if (statusFilter === 'quoted') items = items.filter(i => (i.dispatchStatus === 'quotes_received' || i.dispatchStatus === 'quoted') && !!i.quoteDetails);
    if (statusFilter === 'booked') items = items.filter(i => i.dispatchStatus === 'booked' || i.dispatchStatus === 'completed');
    return items;
  }, [fullItems, activeReportId, activeCategory, statusFilter]);

  // Derived stats
  const stats = useMemo(() => {
    const waiting = fullItems.filter(i => i.dispatchStatus === 'dispatched' && !i.quoteDetails).length;
    const quoted = fullItems.filter(i => i.quoteDetails).length;
    const booked = fullItems.filter(i => i.dispatchStatus === 'booked' || i.dispatchStatus === 'completed').length;
    const totalQuoteValue = fullItems
      .filter(i => i.quoteDetails)
      .reduce((sum, i) => sum + (i.quoteDetails?.price ?? 0), 0);
    return { waiting, quoted, booked, totalQuoteValue };
  }, [fullItems]);

  const reportOptions = useMemo(() => {
    const seen = new Map<string, { id: string; address: string; count: number }>();
    for (const item of fullItems) {
      const existing = seen.get(item._reportId);
      if (existing) existing.count++;
      else seen.set(item._reportId, { id: item._reportId, address: item._reportAddress, count: 1 });
    }
    return Array.from(seen.values());
  }, [fullItems]);

  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of fullItems) map.set(item.category, (map.get(item.category) ?? 0) + 1);
    return map;
  }, [fullItems]);

  if (visibleReports.length === 0) {
    return (
      <LockedTabPlaceholder
        tabName="Quotes"
        description="Compare provider quotes across your dispatched items"
        hasAnyReports={reports.length > 0}
        hasUnderTierReport={hasUnderTierReport}
        requiredTier="professional"
        onNavigate={onNavigate}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spinner />
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', marginTop: 16 }}>Loading quotes...</p>
      </div>
    );
  }

  if (fullItems.length === 0) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Quotes</h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Track dispatch status and compare quotes from providers</p>
        </div>
        <div style={{
          background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
          padding: '60px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCB0'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>No quotes yet</h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 20px', maxWidth: 400, marginInline: 'auto' }}>
            Select items from the Items tab and get quotes from our provider network. Compare prices, ratings, and availability side-by-side here.
          </p>
          <button onClick={() => onNavigate('items')} style={{
            padding: '12px 28px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
            cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          }}>Go to Items</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Quotes</h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>
            {stats.waiting > 0 && <>{stats.waiting} waiting &middot; </>}
            {stats.quoted} quote{stats.quoted !== 1 ? 's' : ''} received
            {stats.booked > 0 && <> &middot; {stats.booked} booked</>}
            {stats.totalQuoteValue > 0 && <> &middot; {formatCurrency(stats.totalQuoteValue)} total</>}
          </p>
        </div>
        <MockQuotesButton reports={reports} onSeeded={loadItems} />
      </div>

      {/* Booking result banner */}
      {bookingResult && (
        <div style={{
          background: '#10B98118', border: '1px solid #10B98130', borderRadius: 14,
          padding: '14px 20px', marginBottom: 16,
          fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: '#10B981', fontWeight: 600,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{bookingResult}</span>
          <button onClick={() => setBookingResult(null)} style={{ background: 'none', border: 'none', color: '#10B981', cursor: 'pointer', fontSize: 18 }}>{'\u2715'}</button>
        </div>
      )}

      {/* Status filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {([
          { id: 'all' as const, label: 'All', count: fullItems.length },
          { id: 'waiting' as const, label: 'Waiting', count: stats.waiting },
          { id: 'quoted' as const, label: 'Quoted', count: stats.quoted },
          { id: 'booked' as const, label: 'Booked', count: stats.booked },
        ]).map(s => (
          <button key={s.id} onClick={() => setStatusFilter(s.id)} style={{
            fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
            borderRadius: 20, border: `1px solid ${statusFilter === s.id ? ACCENT : 'var(--bp-border)'}`,
            background: statusFilter === s.id ? `${ACCENT}10` : 'transparent',
            color: statusFilter === s.id ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
          }}>{s.label} ({s.count})</button>
        ))}
      </div>

      {/* Report filter */}
      {reportOptions.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', padding: '5px 0', marginRight: 4 }}>Report:</span>
          <button onClick={() => setActiveReportId(null)} style={{
            fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
            borderRadius: 20, border: `1px solid ${!activeReportId ? ACCENT : 'var(--bp-border)'}`,
            background: !activeReportId ? `${ACCENT}10` : 'transparent',
            color: !activeReportId ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
          }}>All</button>
          {reportOptions.map(r => (
            <button key={r.id} onClick={() => setActiveReportId(activeReportId === r.id ? null : r.id)} style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
              borderRadius: 20, border: `1px solid ${activeReportId === r.id ? ACCENT : 'var(--bp-border)'}`,
              background: activeReportId === r.id ? `${ACCENT}10` : 'transparent',
              color: activeReportId === r.id ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
              maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{r.address} ({r.count})</button>
          ))}
        </div>
      )}

      {/* Category filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        <button onClick={() => setActiveCategory(null)} style={{
          fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
          borderRadius: 20, border: `1px solid ${!activeCategory ? ACCENT : 'var(--bp-border)'}`,
          background: !activeCategory ? `${ACCENT}10` : 'transparent',
          color: !activeCategory ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
        }}>All Categories</button>
        {Array.from(categories).map(([cat, cnt]) => (
          <button key={cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)} style={{
            fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, padding: '5px 12px',
            borderRadius: 20, border: `1px solid ${activeCategory === cat ? ACCENT : 'var(--bp-border)'}`,
            background: activeCategory === cat ? `${ACCENT}10` : 'transparent',
            color: activeCategory === cat ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
          }}>
            {CATEGORY_ICONS[cat] || ''} {CATEGORY_LABELS[cat] || cat} ({cnt})
          </button>
        ))}
      </div>

      {/* Item cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {filteredItems.length === 0 ? (
          <div style={{
            background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
            padding: 40, textAlign: 'center',
          }}>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: 0 }}>No items match the current filter</p>
          </div>
        ) : filteredItems.map(item => (
          <ItemQuoteCard
            key={item.id}
            item={item}
            onAcceptQuote={(quote) => setConfirmBooking({ item, quote })}
          />
        ))}
      </div>

      {/* Accept quote confirmation modal */}
      {confirmBooking && (
        <div
          onClick={() => !booking && setConfirmBooking(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bp-card)', borderRadius: 16, padding: '28px 24px',
            maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
              Accept this quote?
            </h3>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 16px' }}>
              You're booking <strong style={{ color: 'var(--bp-text)' }}>{confirmBooking.quote.providerName}</strong> for <strong style={{ color: 'var(--bp-text)' }}>{confirmBooking.item.title}</strong>.
            </p>
            <div style={{ background: 'var(--bp-bg)', borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 22, fontWeight: 700, color: ACCENT }}>
                {formatCurrency(confirmBooking.quote.amountCents / 100)}
              </div>
              {confirmBooking.quote.availability && (
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', marginTop: 2 }}>
                  Availability: {confirmBooking.quote.availability}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmBooking(null)} disabled={booking} style={{
                padding: '9px 18px', borderRadius: 8, border: '1px solid var(--bp-border)',
                background: 'transparent', color: 'var(--bp-text)', cursor: booking ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
              }}>Cancel</button>
              <button onClick={handleConfirmBooking} disabled={booking} style={{
                padding: '9px 18px', borderRadius: 8, border: 'none',
                background: ACCENT, color: '#fff', cursor: booking ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                opacity: booking ? 0.7 : 1,
              }}>{booking ? 'Booking...' : 'Confirm Booking'}</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}

// ── Item Quote Card ─────────────────────────────────────────────────────────

function ItemQuoteCard({ item, onAcceptQuote }: {
  item: ItemWithContext;
  onAcceptQuote: (quote: { providerId: string; providerName: string; amountCents: number; availability: string | null }) => void;
}) {
  const isBooked = item.dispatchStatus === 'booked' || item.dispatchStatus === 'completed';
  const isWaiting = item.dispatchStatus === 'dispatched' && !item.quoteDetails;

  // Extract quotes if attached to the item (via polling update)
  const quotes = ((item as unknown as { _quotes?: Array<{ providerId: string; providerName: string; providerRating: string | null; amountCents: number; availability: string | null; receivedAt: string }> })._quotes) ?? [];
  // If no quotes array attached but we have quoteDetails (initial load), synthesize single quote entry
  const displayQuotes = quotes.length > 0 ? quotes : (item.quoteDetails ? [{
    providerId: 'unknown',
    providerName: item.quoteDetails.providerName,
    providerRating: String(item.quoteDetails.providerRating),
    amountCents: Math.round(item.quoteDetails.price * 100),
    availability: item.quoteDetails.availability,
    receivedAt: new Date().toISOString(),
  }] : []);

  // Find best price and best rating for badges
  const lowestPrice = displayQuotes.length > 0 ? Math.min(...displayQuotes.map(q => q.amountCents)) : 0;
  const highestRating = displayQuotes.length > 0 ? Math.max(...displayQuotes.map(q => parseFloat(q.providerRating ?? '0'))) : 0;

  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
      padding: '18px 20px',
    }}>
      {/* Item header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 7px',
              borderRadius: 10, background: `${SEVERITY_COLORS[item.severity] ?? '#9B9490'}18`,
              color: SEVERITY_COLORS[item.severity] ?? '#9B9490',
            }}>
              {SEVERITY_LABELS[item.severity] ?? item.severity}
            </span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)' }}>
              {CATEGORY_ICONS[item.category] || ''} {CATEGORY_LABELS[item.category] || item.category}
            </span>
            {isBooked && (
              <span style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 7px',
                borderRadius: 10, background: '#10B98115', color: '#10B981',
              }}>Booked</span>
            )}
          </div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--bp-text)', margin: '0 0 2px' }}>
            {item.title}
          </h3>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)' }}>
            {item._reportAddress}
          </div>
        </div>
        {(item.costEstimateMin || item.costEstimateMax) && (
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Estimate</div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--bp-text)' }}>
              {formatCurrency(item.costEstimateMin ?? 0)}-{formatCurrency(item.costEstimateMax ?? 0)}
            </div>
          </div>
        )}
      </div>

      {/* Status content */}
      {isWaiting && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
          background: `${ACCENT}08`, border: `1px dashed ${ACCENT}40`, borderRadius: 10,
        }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: ACCENT, animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
          <div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--bp-text)' }}>
              Waiting for provider quotes...
            </div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', marginTop: 2 }}>
              Quotes usually arrive within a few hours. We'll notify you here automatically.
            </div>
          </div>
        </div>
      )}

      {isBooked && displayQuotes.length > 0 && (
        <div style={{
          padding: '14px 16px', borderRadius: 10,
          background: '#10B98110', border: '1px solid #10B98125',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>{'\u2705'}</span>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: '#10B981' }}>
              Booked with {item.quoteDetails?.providerName ?? displayQuotes[0].providerName}
            </div>
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)' }}>
            {formatCurrency((item.quoteDetails?.price ?? displayQuotes[0].amountCents / 100))}
            {item.quoteDetails?.availability && <> &middot; {item.quoteDetails.availability}</>}
          </div>
        </div>
      )}

      {!isWaiting && !isBooked && displayQuotes.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10,
        }}>
          {[...displayQuotes].sort((a, b) => a.amountCents - b.amountCents).map((q) => {
            const isBestPrice = q.amountCents === lowestPrice;
            const rating = parseFloat(q.providerRating ?? '0');
            const isTopRated = rating === highestRating && rating > 0;
            return (
              <div key={q.providerId + q.receivedAt} style={{
                border: `1px solid ${isBestPrice ? ACCENT : 'var(--bp-border)'}`,
                borderRadius: 12, padding: '14px 16px',
                background: isBestPrice ? `${ACCENT}06` : 'transparent',
                position: 'relative',
              }}>
                {/* Badges */}
                <div style={{ display: 'flex', gap: 4, position: 'absolute', top: -8, right: 10 }}>
                  {isBestPrice && (
                    <span style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 10, background: ACCENT, color: '#fff',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>Best Price</span>
                  )}
                  {isTopRated && !isBestPrice && (
                    <span style={{
                      fontFamily: "'DM Sans',sans-serif", fontSize: 9, fontWeight: 700,
                      padding: '2px 8px', borderRadius: 10, background: '#F59E0B', color: '#fff',
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>Top Rated</span>
                  )}
                </div>

                {/* Provider */}
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 2 }}>
                  {q.providerName || 'Provider'}
                </div>
                {rating > 0 && (
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', marginBottom: 8 }}>
                    {'\u2605'.repeat(Math.round(rating))}
                    <span style={{ opacity: 0.3 }}>{'\u2605'.repeat(5 - Math.round(rating))}</span>
                    <span style={{ marginLeft: 4 }}>{rating.toFixed(1)}</span>
                  </div>
                )}

                {/* Price */}
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--bp-text)', marginBottom: 4 }}>
                  {formatCurrency(q.amountCents / 100)}
                </div>

                {/* Availability */}
                {q.availability && (
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', marginBottom: 10 }}>
                    {q.availability}
                  </div>
                )}

                {/* Received timestamp */}
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 10, color: 'var(--bp-subtle)', opacity: 0.6, marginBottom: 10 }}>
                  Quoted {timeAgo(q.receivedAt)}
                </div>

                {/* Accept button */}
                {q.providerId !== 'unknown' && (
                  <button
                    onClick={() => onAcceptQuote({
                      providerId: q.providerId,
                      providerName: q.providerName,
                      amountCents: q.amountCents,
                      availability: q.availability,
                    })}
                    style={{
                      width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                      background: isBestPrice ? ACCENT : 'var(--bp-bg)',
                      color: isBestPrice ? '#fff' : 'var(--bp-text)',
                      cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600,
                    }}
                  >
                    Accept Quote
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 40, height: 40, border: '3px solid var(--bp-border)',
      borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      margin: '0 auto',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Mock Quotes Button (dev/testing) ────────────────────────────────────────

function MockQuotesButton({ reports, onSeeded }: { reports: PortalReport[]; onSeeded: () => void }) {
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const reportsWithDispatched = reports.filter(r => r.dispatchedCount > 0);
  if (reportsWithDispatched.length === 0) return null;

  async function handleSeed(reportId: string) {
    setLoading(true);
    setShowMenu(false);
    try {
      await inspectService.seedMockQuotes(reportId);
      await onSeeded();
    } catch { /* ignore */ }
    setLoading(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={loading}
        style={{
          padding: '8px 14px', borderRadius: 8, border: '1px dashed var(--bp-border)',
          background: 'transparent', color: 'var(--bp-subtle)',
          cursor: loading ? 'not-allowed' : 'pointer',
          fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          opacity: loading ? 0.5 : 0.8,
        }}
      >
        {loading ? 'Seeding...' : '\u2728 Generate Test Quotes'}
      </button>
      {showMenu && (
        <div
          onMouseLeave={() => setShowMenu(false)}
          style={{
            position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
            background: 'var(--bp-card)', borderRadius: 10, border: '1px solid var(--bp-border)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)', minWidth: 240, padding: 6,
          }}
        >
          <div style={{
            fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)',
            padding: '6px 10px', borderBottom: '1px solid var(--bp-border)', marginBottom: 4,
          }}>
            Generate mock quotes for:
          </div>
          {reportsWithDispatched.map(r => (
            <button
              key={r.id}
              onClick={() => handleSeed(r.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '8px 10px', borderRadius: 6, border: 'none', background: 'transparent',
                color: 'var(--bp-text)', cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif", fontSize: 13,
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'var(--bp-bg)')}
              onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.propertyAddress}
              </div>
              <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginTop: 2 }}>
                {r.dispatchedCount} dispatched item{r.dispatchedCount !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
