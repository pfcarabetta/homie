import { useState, useEffect } from 'react';
import { businessService, type WorkspaceBooking } from '@/services/api';
import { O, G, D, W, renderBold } from './constants';
import BookingChat from '@/components/BookingChat';

export default function BookingsTab({ workspaceId, focusJobId, onFocusHandled }: { workspaceId: string; focusJobId?: string | null; onFocusHandled?: () => void }) {
  const [bookingsList, setBookingsList] = useState<WorkspaceBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addedToPreferred, setAddedToPreferred] = useState<Set<string>>(new Set());
  const [addingProvider, setAddingProvider] = useState<string | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null);
  const [showCancelBooking, setShowCancelBooking] = useState<string | null>(null);
  const [chatBooking, setChatBooking] = useState<WorkspaceBooking | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProperty, setFilterProperty] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    businessService.listBookings(workspaceId).then(res => {
      const bList = res.data?.bookings ?? [];
      setBookingsList(bList);
      setLoading(false);

      // Auto-expand focused booking after data loads
      if (focusJobId) {
        const match = bList.find(b => b.jobId === focusJobId);
        if (match) {
          setExpandedId(match.id);
          requestAnimationFrame(() => {
            setTimeout(() => {
              const el = document.getElementById(`booking-${match.id}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              onFocusHandled?.();
            }, 100);
          });
        } else {
          onFocusHandled?.();
        }
      }
    }).catch(() => setLoading(false));
  }, [workspaceId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading bookings...</div>;

  if (bookingsList.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
      <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No bookings yet</div>
      <div style={{ fontSize: 14, color: '#9B9490' }}>When you book a provider from a dispatch, it will appear here.</div>
    </div>
  );

  const filteredBookings = bookingsList.filter(b => {
    if (filterStatus && b.status !== filterStatus) return false;
    if (filterCategory && (b.diagnosis?.category ?? '').toLowerCase() !== filterCategory) return false;
    if (filterProperty && b.propertyId !== filterProperty) return false;
    if (filterSeverity && (b.diagnosis?.severity ?? '').toLowerCase() !== filterSeverity) return false;
    if (filterDateFrom && new Date(b.confirmedAt) < new Date(filterDateFrom)) return false;
    if (filterDateTo) { const to = new Date(filterDateTo); to.setHours(23, 59, 59, 999); if (new Date(b.confirmedAt) > to) return false; }
    return true;
  });

  const uniqueCategories = [...new Set(bookingsList.map(b => b.diagnosis?.category).filter(Boolean))] as string[];
  const uniqueProperties = [...new Map(bookingsList.filter(b => b.propertyId && b.propertyName).map(b => [b.propertyId, b.propertyName])).entries()].map(([id, name]) => ({ id: id as string, name: name as string }));

  const selectStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 12, color: D, cursor: 'pointer', background: '#fff' };
  const hasFilters = !!(filterStatus || filterCategory || filterProperty || filterSeverity || filterDateFrom || filterDateTo);

  return (
    <div>
      <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: '0 0 14px' }}>Bookings</h3>

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
          {uniqueCategories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>)}
        </select>
        <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)} style={selectStyle}>
          <option value="">All Properties</option>
          {uniqueProperties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={selectStyle}>
          <option value="">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={selectStyle} title="From date" />
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={selectStyle} title="To date" />
        {hasFilters && (
          <button onClick={() => { setFilterStatus(''); setFilterCategory(''); setFilterProperty(''); setFilterSeverity(''); setFilterDateFrom(''); setFilterDateTo(''); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: '#F5F5F5', color: '#9B9490', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Clear filters
          </button>
        )}
        <span style={{ fontSize: 12, color: '#9B9490', marginLeft: 'auto' }}>{filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredBookings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9B9490', fontSize: 14 }}>No bookings match the selected filters</div>
        ) : null}
        {(() => {
          let lastDateLabel = '';
          return filteredBookings.map(b => {
            const dateObj = new Date(b.confirmedAt);
            const today = new Date();
            const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
            const isToday = dateObj.toDateString() === today.toDateString();
            const isYesterday = dateObj.toDateString() === yesterday.toDateString();
            const dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: dateObj.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
            const showHeader = dateLabel !== lastDateLabel;
            lastDateLabel = dateLabel;

        return (<div key={b.id}>
          {showHeader && (
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9B9490', padding: '14px 0 6px', letterSpacing: '0.03em' }}>
              {dateLabel}
            </div>
          )}
          {(() => {
          const isExpanded = expandedId === b.id;
          const catLabel = b.diagnosis?.category ? b.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Service';
          const sc = b.status === 'confirmed' ? { bg: '#F0FDF4', text: '#16A34A' } : b.status === 'completed' ? { bg: '#EFF6FF', text: '#2563EB' } : { bg: '#F5F5F5', text: '#9B9490' };

          return (
            <div key={b.id} id={`booking-${b.id}`} onClick={() => setExpandedId(isExpanded ? null : b.id)} style={{
              background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
              border: isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
              transition: 'all 0.2s',
              boxShadow: isExpanded ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
            }}>
              {/* ── Collapsed header ── */}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: b.status === 'confirmed' ? `${G}12` : b.status === 'completed' ? '#EFF6FF' : W, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${b.status === 'confirmed' ? `${G}30` : b.status === 'completed' ? '#93C5FD' : '#F0EBE6'}` }}>
                    <span style={{ fontSize: 16 }}>{b.status === 'confirmed' ? '✓' : b.status === 'completed' ? '✓' : '✕'}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{catLabel}</span>
                      <span style={{ background: sc.bg, color: sc.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0, textTransform: 'capitalize' }}>{b.status}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#9B9490', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 500 }}>{b.providerName}</span>
                      {b.propertyName && <span>🏠 {b.propertyName}</span>}
                      <span>{new Date(b.confirmedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 50 }}>
                    {b.quotedPrice ? (
                      <>
                        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: O }}>{b.quotedPrice}</div>
                        <div style={{ fontSize: 9, color: '#9B9490' }}>quoted</div>
                      </>
                    ) : (
                      <div style={{ fontSize: 10, fontWeight: 600, color: G }}>Booked</div>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#C0BBB6', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* ── Expanded detail ── */}
              {isExpanded && (
                <div style={{ padding: '0 14px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>

                  {/* Summary */}
                  {b.diagnosis?.summary && (
                    <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 14, paddingTop: 12 }}>
                      {renderBold(b.diagnosis.summary)}
                    </div>
                  )}

                  {/* Details grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, marginBottom: 14 }}>
                    {[
                      { label: 'Provider', value: b.providerName },
                      { label: 'Category', value: catLabel },
                      ...(b.propertyName ? [{ label: 'Property', value: b.propertyName }] : []),
                      ...(b.quotedPrice ? [{ label: 'Quoted Price', value: b.quotedPrice, color: O }] : []),
                      ...(b.availability ? [{ label: 'Availability', value: b.availability }] : []),
                      ...(b.serviceAddress ? [{ label: 'Service Address', value: b.serviceAddress }] : []),
                      { label: 'Booked', value: new Date(b.confirmedAt).toLocaleString() },
                      { label: 'Timing', value: b.preferredTiming ?? 'ASAP' },
                    ].map((item, i) => (
                      <div key={i} style={{ background: W, borderRadius: 8, padding: '7px 10px' }}>
                        <div style={{ fontSize: 9, color: '#9B9490', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: (item as { color?: string }).color ?? D }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Provider contact */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    {b.providerPhone && (
                      <a href={`tel:${b.providerPhone}`} style={{
                        flex: 1, minWidth: 0, padding: '10px 0', borderRadius: 100, border: 'none',
                        background: O, color: 'white', fontSize: 14, fontWeight: 600,
                        textAlign: 'center', textDecoration: 'none', display: 'block',
                        boxShadow: `0 4px 16px ${O}40`,
                      }}>📞 Call {b.providerName.split(' ')[0]}</a>
                    )}
                    {b.providerEmail && (
                      <a href={`mailto:${b.providerEmail}`} style={{
                        flex: 1, minWidth: 0, padding: '10px 0', borderRadius: 100,
                        border: `2px solid ${O}`, background: 'white', color: O,
                        fontSize: 14, fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'block',
                      }}>✉️ Email</a>
                    )}
                    {/* Message button — only for SMS bookings with a phone number */}
                    {b.channel === 'sms' && b.providerPhone && b.status !== 'cancelled' && (
                      <button onClick={e => { e.stopPropagation(); setChatBooking(b); }} style={{
                        flex: 1, minWidth: 0, padding: '10px 0', borderRadius: 100,
                        border: `2px solid ${G}`, background: 'white', color: G,
                        fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      }}>💬 Message</button>
                    )}
                  </div>

                  {/* Add to preferred providers */}
                  {addedToPreferred.has(b.providerId) ? (
                    <div style={{
                      padding: '10px 0', borderRadius: 100, textAlign: 'center',
                      background: `${G}10`, border: `1px solid ${G}30`,
                      fontSize: 13, fontWeight: 600, color: G,
                    }}>✅ Added to preferred providers</div>
                  ) : (
                    <button onClick={async () => {
                      setAddingProvider(b.providerId);
                      try {
                        const categories = b.diagnosis?.category ? [b.diagnosis.category] : undefined;
                        await businessService.addVendor(workspaceId, {
                          provider_id: b.providerId,
                          property_id: b.propertyId,
                          categories,
                          priority: 1,
                        });
                        setAddedToPreferred(prev => new Set(prev).add(b.providerId));
                      } catch { /* ignore if already added */
                        setAddedToPreferred(prev => new Set(prev).add(b.providerId));
                      }
                      setAddingProvider(null);
                    }} disabled={addingProvider === b.providerId} style={{
                      width: '100%', padding: '10px 0', borderRadius: 100,
                      border: `1px solid ${G}`, background: 'white', color: G,
                      fontSize: 13, fontWeight: 600, cursor: addingProvider === b.providerId ? 'default' : 'pointer',
                      opacity: addingProvider === b.providerId ? 0.6 : 1,
                      transition: 'all 0.2s',
                    }}>{addingProvider === b.providerId ? 'Adding...' : `⭐ Add ${b.providerName.split(' ')[0]} to Preferred Providers`}</button>
                  )}

                  {/* Cancel booking */}
                  {b.status === 'confirmed' && (
                    <div style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 14 }}>
                      <button onClick={() => setShowCancelBooking(b.id)} disabled={cancellingBooking === b.id} style={{
                        width: '100%', padding: '10px 0', borderRadius: 100,
                        border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626',
                        fontSize: 13, fontWeight: 600, cursor: cancellingBooking === b.id ? 'default' : 'pointer',
                        opacity: cancellingBooking === b.id ? 0.6 : 1,
                      }}>{cancellingBooking === b.id ? 'Cancelling...' : 'Cancel Booking'}</button>
                    </div>
                  )}
                  {b.status === 'cancelled' && (
                    <div style={{ marginTop: 10, textAlign: 'center', fontSize: 13, color: '#DC2626', fontWeight: 500 }}>Booking cancelled</div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
        </div>);
          });
        })()}
      </div>

      {/* Cancel booking confirmation modal */}
      {showCancelBooking && (() => {
        const booking = bookingsList.find(b => b.id === showCancelBooking);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowCancelBooking(null)}>
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
              <div style={{ textAlign: 'center', marginBottom: 20 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                  <span style={{ fontSize: 22 }}>⚠️</span>
                </div>
                <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, margin: '0 0 8px' }}>Cancel this booking?</h3>
                <p style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, margin: 0 }}>
                  {booking?.providerName} will be notified of the cancellation via SMS and email.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setShowCancelBooking(null)} style={{
                  flex: 1, padding: '12px 0', borderRadius: 100, border: '1px solid #E0DAD4',
                  background: '#fff', color: D, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>Keep booking</button>
                <button onClick={async () => {
                  const bookingId = showCancelBooking;
                  setShowCancelBooking(null);
                  setCancellingBooking(bookingId);
                  try {
                    const res = await businessService.cancelBooking(workspaceId, bookingId);
                    setBookingsList(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'cancelled' } : b));
                    alert(`Booking cancelled. ${res.data?.provider_notified} was notified.`);
                  } catch (err) {
                    alert((err as Error).message || 'Failed to cancel');
                  }
                  setCancellingBooking(null);
                }} style={{
                  flex: 1, padding: '12px 0', borderRadius: 100, border: 'none',
                  background: '#DC2626', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>Yes, cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Booking chat panel */}
      {chatBooking && (
        <BookingChat
          booking={chatBooking}
          workspaceId={workspaceId}
          onClose={() => setChatBooking(null)}
        />
      )}
    </div>
  );
}
