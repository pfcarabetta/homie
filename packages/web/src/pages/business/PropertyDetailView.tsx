import { useState, useEffect } from 'react';
import { businessService, jobService, estimateService, type Property, type WorkspaceDispatch, type WorkspaceBooking, type PreferredVendor, type Reservation, type ProviderResponseItem, type CostEstimate } from '@/services/api';
import { O, G, D, W, PROPERTY_TYPES, VENDOR_CATEGORIES, MiniCalendar, cleanPrice, renderBold, timeAgo } from './constants';
import { EditPropertyModal } from './PropertiesTab';
import EstimateCard from '@/components/EstimateCard';
import EstimateBadge from '@/components/EstimateBadge';

/* ── Types ──────────────────────────────────────────────────────────────── */

type SubPage = 'activity' | 'jobs' | 'bookings' | 'calendar' | 'providers' | 'settings';

interface PropertyDetailViewProps {
  workspaceId: string;
  property: Property;
  plan: string;
  onBack: () => void;
}

/* ── Icons ──────────────────────────────────────────────────────────────── */

function BackArrow() {
  return (
    <svg width={18} height={18} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 10H5" /><path d="M10 5l-5 5 5 5" />
    </svg>
  );
}

function NavIcon({ name }: { name: SubPage }) {
  const s = { width: 18, height: 18, display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const };
  const icons: Record<SubPage, JSX.Element> = {
    activity: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 10h3l2-5 4 10 2-5h3" /></svg>,
    jobs: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 5h16M2 10h16M2 15h10" /><circle cx="16" cy="15" r="2.5" /></svg>,
    bookings: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="7" /><path d="M7 10l2 2 4-4" /></svg>,
    calendar: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="4" width="14" height="14" rx="2" /><path d="M3 8h14M7 2v4M13 2v4" /></svg>,
    providers: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="3" /><path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" /><circle cx="14.5" cy="6" r="2" /><path d="M18 15c0-2-1.5-3.5-3.5-3.5" /></svg>,
    settings: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="3" /><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4" /></svg>,
  };
  return icons[name] || null;
}

/* ── Nav Items ──────────────────────────────────────────────────────────── */

const NAV_ITEMS: { id: SubPage; label: string }[] = [
  { id: 'activity', label: 'Activity' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'providers', label: 'Providers' },
  { id: 'settings', label: 'Property Settings' },
];

/* ── Status badge helper ────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: '#2563EB', dispatching: '#C2410C', collecting: '#7C3AED',
    completed: '#16A34A', expired: '#9B9490', archived: '#9B9490',
    confirmed: '#16A34A', active: '#16A34A', cancelled: '#DC2626', pending: '#D97706',
  };
  const c = colors[status] ?? '#9B9490';
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: c, background: `${c}15`,
      padding: '2px 8px', borderRadius: 100, textTransform: 'capitalize',
    }}>
      {status}
    </span>
  );
}

/* ── Dispatch card constants (mirrored from DispatchesTab) ─────────────── */

const DISPATCH_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: '#EFF6FF', text: '#2563EB' },
  dispatching: { bg: '#FFF7ED', text: '#C2410C' },
  collecting: { bg: '#F5F3FF', text: '#7C3AED' },
  completed: { bg: '#F0FDF4', text: '#16A34A' },
  expired: { bg: '#F5F5F5', text: '#9B9490' },
  refunded: { bg: '#FEF2F2', text: '#DC2626' },
};

const PDV_CARD_STYLES = `
@keyframes pdv-spin-cw { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes pdv-spin-ccw { 0% { transform: rotate(0deg); } 100% { transform: rotate(-360deg); } }
@keyframes pdv-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
`;

/* ── Shared dispatch card renderer ─────────────────────────────────────── */

function DispatchCard({ j, isExpanded, onToggle, responses, loadingResponses, estimates, workspaceId }: {
  j: WorkspaceDispatch;
  isExpanded: boolean;
  onToggle: () => void;
  responses: ProviderResponseItem[];
  loadingResponses: boolean;
  estimates: Record<string, CostEstimate>;
  workspaceId: string;
}) {
  const sc = DISPATCH_STATUS_COLORS[j.status] || DISPATCH_STATUS_COLORS.expired;
  const isActive = ['open', 'dispatching', 'collecting'].includes(j.status);
  const catLabel = j.diagnosis?.category ? j.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Dispatch';
  const responseCount = j.responseCount;

  return (
    <div id={`pdv-dispatch-${j.id}`} onClick={onToggle} style={{
      background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
      border: isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
      transition: 'all 0.2s',
      boxShadow: isExpanded ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
    }}>
      {/* Collapsed header */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {isActive ? (
            <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #F0EBE6' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: O, animation: 'pdv-spin-cw 1.8s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderBottomColor: G, animation: 'pdv-spin-ccw 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 17, color: O, lineHeight: 1 }}>h</div>
            </div>
          ) : (
            <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: responseCount > 0 ? `${G}12` : W, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${responseCount > 0 ? `${G}30` : '#F0EBE6'}` }}>
              <span style={{ fontSize: 16 }}>{responseCount > 0 ? '\u2713' : j.status === 'expired' ? '\u23F0' : '\u2713'}</span>
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{catLabel}</span>
              <span style={{ background: sc.bg, color: sc.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>{j.status.charAt(0).toUpperCase() + j.status.slice(1)}</span>
            </div>
            <div style={{ fontSize: 11, color: '#9B9490', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span>{new Date(j.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span>{j.zipCode}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 50 }}>
            {responseCount > 0 ? (
              <>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: G }}>{responseCount}</div>
                <div style={{ fontSize: 9, color: '#9B9490' }}>quote{responseCount > 1 ? 's' : ''}</div>
              </>
            ) : isActive ? (
              <div style={{ fontSize: 10, fontWeight: 600, color: O, animation: 'pdv-pulse 1.5s infinite' }}>Searching</div>
            ) : (
              <span style={{ fontSize: 12, color: '#C0BBB6' }}>{'\u2014'}</span>
            )}
          </div>
          <span style={{ fontSize: 11, color: '#C0BBB6', flexShrink: 0 }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div style={{ padding: '0 14px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>
          {/* Summary */}
          {j.diagnosis?.summary && (
            <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 14, paddingTop: 12 }}>
              {renderBold(j.diagnosis.summary)}
            </div>
          )}

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, marginBottom: 14 }}>
            {[
              { label: 'Category', value: catLabel },
              { label: 'Severity', value: (j.diagnosis?.severity ?? 'medium').replace(/^\w/, c => c.toUpperCase()), color: j.diagnosis?.severity === 'high' ? '#DC2626' : j.diagnosis?.severity === 'low' ? G : D },
              { label: 'Timing', value: j.preferredTiming ?? 'ASAP' },
            ].map((item, i) => (
              <div key={i} style={{ background: W, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 9, color: '#9B9490', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: (item as { color?: string }).color ?? D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* AI Cost Estimate */}
          {estimates[j.id] && (
            <div style={{ marginBottom: 14 }}>
              <EstimateCard estimate={estimates[j.id]} />
            </div>
          )}

          {/* Provider Responses */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: D, marginBottom: 8, letterSpacing: '0.02em' }}>
              {responseCount > 0 ? `Provider Responses (${responseCount})` : 'Provider Responses'}
            </div>

            {loadingResponses ? (
              <div style={{ color: '#9B9490', fontSize: 13 }}>Loading responses...</div>
            ) : responses.length === 0 ? (
              <div style={{ background: W, borderRadius: 10, padding: '16px 14px', textAlign: 'center', border: '1px dashed rgba(0,0,0,0.08)' }}>
                {isActive ? (
                  <>
                    <div style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>Waiting for providers to respond...</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: O, animation: `pdv-pulse 1.2s ${i * 0.3}s infinite` }} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: '#9B9490' }}>No providers responded</div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {responses.map(r => (
                  <div key={r.id} style={{ background: W, borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: D }}>{r.provider.name}</span>
                        </div>
                        <div style={{ color: '#9B9490', fontSize: 10, marginTop: 1 }}>
                          {'\u2605'} {r.provider.google_rating ?? 'N/A'} ({r.provider.review_count})
                          {r.provider.google_place_id && (
                            <a href={`https://www.google.com/maps/place/?q=place_id:${r.provider.google_place_id}`} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 600, marginLeft: 4 }}>Reviews</a>
                          )}
                        </div>
                      </div>
                      {r.quoted_price && (
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700, color: O }}>{cleanPrice(r.quoted_price)}</span>
                          {estimates[j.id] ? (
                            <EstimateBadge quotedPrice={cleanPrice(r.quoted_price)} estimateLow={estimates[j.id].estimateLowCents} estimateHigh={estimates[j.id].estimateHighCents} />
                          ) : (
                            <div style={{ fontSize: 10, color: '#9B9490', fontWeight: 500 }}>quoted price</div>
                          )}
                        </div>
                      )}
                    </div>
                    {r.availability && <div style={{ fontSize: 12, color: D, marginBottom: 3 }}>{'\uD83D\uDCC5'} {r.availability}</div>}
                    {r.message && <div style={{ fontSize: 12, color: '#6B6560', fontStyle: 'italic' }}>"{r.message}"</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: '#9B9490' }}>via {r.channel} {'\u00B7'} {timeAgo(r.responded_at)}</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {r.provider.phone && (
                          <a href={`tel:${r.provider.phone}`} onClick={e => e.stopPropagation()} style={{ fontSize: 12, color: G, textDecoration: 'none', fontWeight: 600 }}>{'\uD83D\uDCDE'} Call</a>
                        )}
                      </div>
                    </div>
                    {j.status !== 'expired' && j.status !== 'refunded' && j.status !== 'completed' && (
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const propertyAddr = j.propertyName || undefined;
                          await jobService.bookProvider(j.id, r.id, r.provider.id, propertyAddr);
                          // Note: parent state will refresh on next data load
                          alert(`Booked ${r.provider.name}!`);
                        } catch (err) {
                          alert((err as Error).message || 'Booking failed');
                        }
                      }} style={{ width: '100%', padding: '10px 0', borderRadius: 100, border: 'none', marginTop: 10, background: O, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${O}40` }}>
                        Book {r.provider.name.split(' ')[0]}
                      </button>
                    )}
                    {j.status === 'completed' && (
                      <div style={{ width: '100%', padding: '10px 0', borderRadius: 100, marginTop: 10, background: '#E0DAD4', color: '#9B9490', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", textAlign: 'center' }}>Booked</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Shared booking card renderer ──────────────────────────────────────── */

function BookingCard({ b, isExpanded, onToggle, workspaceId, addedToPreferred, onAddedPreferred, addingProvider, onSetAddingProvider }: {
  b: WorkspaceBooking;
  isExpanded: boolean;
  onToggle: () => void;
  workspaceId: string;
  addedToPreferred: Set<string>;
  onAddedPreferred: (providerId: string) => void;
  addingProvider: string | null;
  onSetAddingProvider: (id: string | null) => void;
}) {
  const catLabel = b.diagnosis?.category ? b.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Service';
  const sc = b.status === 'confirmed' ? { bg: '#F0FDF4', text: '#16A34A' } : b.status === 'completed' ? { bg: '#EFF6FF', text: '#2563EB' } : { bg: '#F5F5F5', text: '#9B9490' };

  return (
    <div id={`pdv-booking-${b.id}`} onClick={onToggle} style={{
      background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
      border: isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
      transition: 'all 0.2s',
      boxShadow: isExpanded ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
    }}>
      {/* Collapsed header */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: b.status === 'confirmed' ? `${G}12` : b.status === 'completed' ? '#EFF6FF' : W, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${b.status === 'confirmed' ? `${G}30` : b.status === 'completed' ? '#93C5FD' : '#F0EBE6'}` }}>
            <span style={{ fontSize: 16 }}>{b.status === 'confirmed' ? '\u2713' : b.status === 'completed' ? '\u2713' : '\u2715'}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{catLabel}</span>
              <span style={{ background: sc.bg, color: sc.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0, textTransform: 'capitalize' }}>{b.status}</span>
            </div>
            <div style={{ fontSize: 11, color: '#9B9490', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 500 }}>{b.providerName}</span>
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
          <span style={{ fontSize: 11, color: '#C0BBB6', flexShrink: 0 }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
        </div>
      </div>

      {/* Expanded detail */}
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
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {b.providerPhone && (
              <a href={`tel:${b.providerPhone}`} style={{
                flex: 1, padding: '10px 0', borderRadius: 100, border: 'none',
                background: O, color: 'white', fontSize: 14, fontWeight: 600,
                textAlign: 'center', textDecoration: 'none', display: 'block',
                boxShadow: `0 4px 16px ${O}40`,
              }}>{'\uD83D\uDCDE'} Call {b.providerName.split(' ')[0]}</a>
            )}
            {b.providerEmail && (
              <a href={`mailto:${b.providerEmail}`} style={{
                flex: 1, padding: '10px 0', borderRadius: 100,
                border: `2px solid ${O}`, background: 'white', color: O,
                fontSize: 14, fontWeight: 600, textAlign: 'center', textDecoration: 'none', display: 'block',
              }}>{'\u2709\uFE0F'} Email</a>
            )}
          </div>

          {/* Add to preferred providers */}
          {addedToPreferred.has(b.providerId) ? (
            <div style={{
              padding: '10px 0', borderRadius: 100, textAlign: 'center',
              background: `${G}10`, border: `1px solid ${G}30`,
              fontSize: 13, fontWeight: 600, color: G,
            }}>{'\u2705'} Added to preferred providers</div>
          ) : (
            <button onClick={async () => {
              onSetAddingProvider(b.providerId);
              try {
                const categories = b.diagnosis?.category ? [b.diagnosis.category] : undefined;
                await businessService.addVendor(workspaceId, {
                  provider_id: b.providerId,
                  property_id: b.propertyId,
                  categories,
                  priority: 1,
                });
                onAddedPreferred(b.providerId);
              } catch {
                onAddedPreferred(b.providerId);
              }
              onSetAddingProvider(null);
            }} disabled={addingProvider === b.providerId} style={{
              width: '100%', padding: '10px 0', borderRadius: 100,
              border: `1px solid ${G}`, background: 'white', color: G,
              fontSize: 13, fontWeight: 600, cursor: addingProvider === b.providerId ? 'default' : 'pointer',
              opacity: addingProvider === b.providerId ? 0.6 : 1,
              transition: 'all 0.2s',
            }}>{addingProvider === b.providerId ? 'Adding...' : `\u2B50 Add ${b.providerName.split(' ')[0]} to Preferred Providers`}</button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Helper: date group header ─────────────────────────────────────────── */

function getDateLabel(dateStr: string): string {
  const dateObj = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (dateObj.toDateString() === today.toDateString()) return 'Today';
  if (dateObj.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: dateObj.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
}

/* ── Sub-page: Activity (merged timeline with expandable cards) ────────── */

function ActivitySubPage({ dispatches, bookings, loading, workspaceId }: { dispatches: WorkspaceDispatch[]; bookings: WorkspaceBooking[]; loading: boolean; workspaceId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, ProviderResponseItem[]>>({});
  const [loadingResponses, setLoadingResponses] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<Record<string, CostEstimate>>({});
  const [addedToPreferred, setAddedToPreferred] = useState<Set<string>>(new Set());
  const [addingProvider, setAddingProvider] = useState<string | null>(null);

  async function fetchEstimate(job: WorkspaceDispatch) {
    if (estimates[job.id] || !job.diagnosis?.category || !job.zipCode) return;
    try {
      const cat = job.diagnosis.category;
      const sub = job.diagnosis.subcategory || cat;
      const res = await estimateService.generate({ category: cat, subcategory: sub, zip_code: job.zipCode, workspace_id: workspaceId });
      if (res.data) setEstimates(prev => ({ ...prev, [job.id]: res.data! }));
    } catch { /* ignore */ }
  }

  async function toggleDispatch(jobId: string) {
    if (expandedId === jobId) { setExpandedId(null); return; }
    setExpandedId(jobId);
    const job = dispatches.find(d => d.id === jobId);
    if (job) fetchEstimate(job);
    if (!responses[jobId]) {
      setLoadingResponses(jobId);
      try {
        const res = await jobService.getResponses(jobId);
        setResponses(prev => ({ ...prev, [jobId]: res.data?.responses ?? [] }));
      } catch { setResponses(prev => ({ ...prev, [jobId]: [] })); }
      setLoadingResponses(null);
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9B9490', fontSize: 13 }}>Loading activity...</div>;

  type TimelineItem = { date: string; type: 'dispatch' | 'booking'; data: WorkspaceDispatch | WorkspaceBooking };
  const items: TimelineItem[] = [
    ...dispatches.map(d => ({ date: d.createdAt, type: 'dispatch' as const, data: d })),
    ...bookings.map(b => ({ date: b.confirmedAt, type: 'booking' as const, data: b })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (items.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{'\uD83D\uDCCB'}</div>
        <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No activity yet</div>
        <div style={{ fontSize: 14, color: '#9B9490' }}>Dispatches and bookings for this property will appear here.</div>
      </div>
    );
  }

  let lastDateLabel = '';
  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: PDV_CARD_STYLES }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map(item => {
          const dateLabel = getDateLabel(item.date);
          const showHeader = dateLabel !== lastDateLabel;
          lastDateLabel = dateLabel;
          return (
            <div key={`${item.type}-${item.type === 'dispatch' ? (item.data as WorkspaceDispatch).id : (item.data as WorkspaceBooking).id}`}>
              {showHeader && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9B9490', padding: '14px 0 6px', letterSpacing: '0.03em' }}>{dateLabel}</div>
              )}
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: item.type === 'dispatch' ? '#C2410C' : '#16A34A', marginBottom: 4 }}>
                {item.type === 'dispatch' ? '📋 Dispatch' : '✅ Booking'}
              </div>
              {item.type === 'dispatch' ? (
                <DispatchCard
                  j={item.data as WorkspaceDispatch}
                  isExpanded={expandedId === (item.data as WorkspaceDispatch).id}
                  onToggle={() => toggleDispatch((item.data as WorkspaceDispatch).id)}
                  responses={responses[(item.data as WorkspaceDispatch).id] ?? []}
                  loadingResponses={loadingResponses === (item.data as WorkspaceDispatch).id}
                  estimates={estimates}
                  workspaceId={workspaceId}
                />
              ) : (
                <BookingCard
                  b={item.data as WorkspaceBooking}
                  isExpanded={expandedId === (item.data as WorkspaceBooking).id}
                  onToggle={() => setExpandedId(expandedId === (item.data as WorkspaceBooking).id ? null : (item.data as WorkspaceBooking).id)}
                  workspaceId={workspaceId}
                  addedToPreferred={addedToPreferred}
                  onAddedPreferred={id => setAddedToPreferred(prev => new Set(prev).add(id))}
                  addingProvider={addingProvider}
                  onSetAddingProvider={setAddingProvider}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sub-page: Jobs (expandable dispatch cards) ────────────────────────── */

function JobsSubPage({ dispatches, loading, workspaceId }: { dispatches: WorkspaceDispatch[]; loading: boolean; workspaceId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, ProviderResponseItem[]>>({});
  const [loadingResponses, setLoadingResponses] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<Record<string, CostEstimate>>({});

  async function fetchEstimate(job: WorkspaceDispatch) {
    if (estimates[job.id] || !job.diagnosis?.category || !job.zipCode) return;
    try {
      const cat = job.diagnosis.category;
      const sub = job.diagnosis.subcategory || cat;
      const res = await estimateService.generate({ category: cat, subcategory: sub, zip_code: job.zipCode, workspace_id: workspaceId });
      if (res.data) setEstimates(prev => ({ ...prev, [job.id]: res.data! }));
    } catch { /* ignore */ }
  }

  async function toggleExpand(jobId: string) {
    if (expandedId === jobId) { setExpandedId(null); return; }
    setExpandedId(jobId);
    const job = dispatches.find(d => d.id === jobId);
    if (job) fetchEstimate(job);
    if (!responses[jobId]) {
      setLoadingResponses(jobId);
      try {
        const res = await jobService.getResponses(jobId);
        setResponses(prev => ({ ...prev, [jobId]: res.data?.responses ?? [] }));
      } catch { setResponses(prev => ({ ...prev, [jobId]: [] })); }
      setLoadingResponses(null);
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9B9490', fontSize: 13 }}>Loading jobs...</div>;

  if (dispatches.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{'\uD83D\uDCCB'}</div>
        <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No jobs</div>
        <div style={{ fontSize: 14, color: '#9B9490' }}>No dispatches have been created for this property yet.</div>
      </div>
    );
  }

  let lastDateLabel = '';
  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: PDV_CARD_STYLES }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {dispatches.map(j => {
          const dateLabel = getDateLabel(j.createdAt);
          const showHeader = dateLabel !== lastDateLabel;
          lastDateLabel = dateLabel;
          return (
            <div key={j.id}>
              {showHeader && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9B9490', padding: '14px 0 6px', letterSpacing: '0.03em' }}>{dateLabel}</div>
              )}
              <DispatchCard
                j={j}
                isExpanded={expandedId === j.id}
                onToggle={() => toggleExpand(j.id)}
                responses={responses[j.id] ?? []}
                loadingResponses={loadingResponses === j.id}
                estimates={estimates}
                workspaceId={workspaceId}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sub-page: Bookings (expandable booking cards) ─────────────────────── */

function BookingsSubPage({ bookings, loading, workspaceId }: { bookings: WorkspaceBooking[]; loading: boolean; workspaceId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addedToPreferred, setAddedToPreferred] = useState<Set<string>>(new Set());
  const [addingProvider, setAddingProvider] = useState<string | null>(null);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9B9490', fontSize: 13 }}>Loading bookings...</div>;

  if (bookings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>{'\u2705'}</div>
        <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No bookings</div>
        <div style={{ fontSize: 14, color: '#9B9490' }}>No bookings have been confirmed for this property yet.</div>
      </div>
    );
  }

  let lastDateLabel = '';
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {bookings.map(b => {
          const dateLabel = getDateLabel(b.confirmedAt);
          const showHeader = dateLabel !== lastDateLabel;
          lastDateLabel = dateLabel;
          return (
            <div key={b.id}>
              {showHeader && (
                <div style={{ fontSize: 12, fontWeight: 700, color: '#9B9490', padding: '14px 0 6px', letterSpacing: '0.03em' }}>{dateLabel}</div>
              )}
              <BookingCard
                b={b}
                isExpanded={expandedId === b.id}
                onToggle={() => setExpandedId(expandedId === b.id ? null : b.id)}
                workspaceId={workspaceId}
                addedToPreferred={addedToPreferred}
                onAddedPreferred={id => setAddedToPreferred(prev => new Set(prev).add(id))}
                addingProvider={addingProvider}
                onSetAddingProvider={setAddingProvider}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Sub-page: Calendar ─────────────────────────────────────────────────── */

function CalendarSubPage({ workspaceId, propertyId }: { workspaceId: string; propertyId: string }) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const futureDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const to = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(futureDate.getDate()).padStart(2, '0')}`;
    businessService.getPropertyReservations(workspaceId, propertyId, from, to)
      .then(res => { if (res.data) setReservations(res.data.reservations); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId, propertyId]);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bp-subtle)', fontSize: 13 }}>Loading calendar...</div>;

  return (
    <div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 16 }}>
        Reservations
      </div>
      {reservations.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: 'var(--bp-hover)', borderRadius: 10, color: 'var(--bp-subtle)', fontSize: 13 }}>
          No upcoming reservations
        </div>
      ) : (
        <MiniCalendar reservations={reservations} />
      )}
      {reservations.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 10 }}>Upcoming</div>
          {reservations
            .filter(r => new Date(r.checkIn) >= new Date())
            .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime())
            .slice(0, 10)
            .map(r => (
              <div key={r.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid var(--bp-border)', fontSize: 13,
              }}>
                <div>
                  <div style={{ fontWeight: 500, color: 'var(--bp-text)' }}>{r.guestName || 'Guest'}</div>
                  <div style={{ color: 'var(--bp-subtle)', fontSize: 12, marginTop: 2 }}>
                    {new Date(r.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(r.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ── Sub-page: Providers ────────────────────────────────────────────────── */

function ProvidersSubPage({ vendors, loading }: { vendors: PreferredVendor[]; loading: boolean }) {
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--bp-subtle)', fontSize: 13 }}>Loading providers...</div>;

  if (vendors.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--bp-subtle)' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>&#128100;</div>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No providers assigned</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Preferred providers for this property will appear here.</div>
      </div>
    );
  }

  function categoryLabel(val: string): string {
    return VENDOR_CATEGORIES.find(c => c.value === val)?.label ?? val;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {vendors.map(v => (
        <div key={v.id} style={{
          background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>{v.providerName}</div>
              {v.providerPhone && <div style={{ fontSize: 12, color: 'var(--bp-muted)', marginTop: 2 }}>{v.providerPhone}</div>}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
              background: v.active ? '#F0FDF4' : '#F5F5F5',
              color: v.active ? '#16A34A' : '#9B9490',
            }}>
              {v.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          {v.categories && v.categories.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {v.categories.map(cat => (
                <span key={cat} style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 100,
                  background: '#EFF6FF', color: '#2563EB', fontWeight: 500,
                }}>
                  {categoryLabel(cat)}
                </span>
              ))}
            </div>
          )}
          {v.notes && <div style={{ fontSize: 12, color: 'var(--bp-subtle)', marginTop: 6, fontStyle: 'italic' }}>{v.notes}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── Sub-page: Settings ─────────────────────────────────────────────────── */

function SettingsSubPage({ property, workspaceId, onPropertyUpdated }: { property: Property; workspaceId: string; onPropertyUpdated?: (p: Property) => void }) {
  const [editing, setEditing] = useState(false);
  const infoRow = (label: string, value: string | number | null | undefined) => {
    if (value == null || value === '' || value === 0) return null;
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--bp-border)' }}>
        <span style={{ fontSize: 13, color: 'var(--bp-subtle)' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--bp-text)', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
      </div>
    );
  };

  const sectionHeader = (title: string, icon: string) => (
    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--bp-text)', marginBottom: 10, marginTop: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
      <span>{icon}</span> {title}
    </div>
  );

  const card = (children: React.ReactNode) => (
    <div style={{ background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10, padding: '4px 16px' }}>
      {children}
    </div>
  );

  const d = property.details;
  const dx = d as Record<string, unknown> | null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, color: 'var(--bp-text)' }}>
          Property Details
        </div>
        <button onClick={() => setEditing(true)} style={{
          padding: '6px 16px', borderRadius: 8, border: '1px solid var(--bp-border)',
          background: 'var(--bp-card)', color: 'var(--bp-text)', cursor: 'pointer',
          fontSize: 13, fontWeight: 500,
        }}>
          Edit
        </button>
      </div>

      {/* General */}
      {card(<>
        {infoRow('Property Type', PROPERTY_TYPES[property.propertyType] || property.propertyType)}
        {infoRow('Address', [property.address, property.city, property.state, property.zipCode].filter(Boolean).join(', '))}
        {infoRow('Bedrooms', property.bedrooms)}
        {infoRow('Bathrooms', property.bathrooms)}
        {infoRow('Square Feet', property.sqft ? property.sqft.toLocaleString() : null)}
        {infoRow('Unit Count', property.unitCount > 1 ? property.unitCount : null)}
        {infoRow('Status', property.active ? 'Active' : 'Inactive')}
      </>)}

      {/* Bed Configuration */}
      {property.beds && property.beds.length > 0 && (<>
        {sectionHeader('Bed Configuration', '🛏️')}
        {card(<>
          {property.beds.map((b, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < property.beds!.length - 1 ? '1px solid var(--bp-border)' : 'none' }}>
              <span style={{ fontSize: 13, color: 'var(--bp-subtle)', textTransform: 'capitalize' }}>{b.type.replace('_', ' ')}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--bp-text)' }}>x{b.count}</span>
            </div>
          ))}
        </>)}
      </>)}

      {/* HVAC */}
      {d?.hvac && Object.values(d.hvac).some(Boolean) && (<>
        {sectionHeader('HVAC / Climate', '🌡️')}
        {card(<>
          {infoRow('AC Type', d.hvac.acType)}
          {infoRow('AC Brand', d.hvac.acBrand)}
          {infoRow('AC Model', d.hvac.acModel)}
          {infoRow('AC Age', d.hvac.acAge)}
          {infoRow('Heating Type', d.hvac.heatingType)}
          {infoRow('Heating Brand', d.hvac.heatingBrand)}
          {infoRow('Heating Model', d.hvac.heatingModel)}
          {infoRow('Thermostat Brand', d.hvac.thermostatBrand)}
          {infoRow('Thermostat Model', d.hvac.thermostatModel)}
          {infoRow('Filter Size', d.hvac.filterSize)}
        </>)}
      </>)}

      {/* Water Heater */}
      {d?.waterHeater && Object.values(d.waterHeater).some(v => !!v) && (<>
        {sectionHeader('Water Heater', '🔥')}
        {card(<>
          {infoRow('Type', d.waterHeater.type)}
          {infoRow('Brand', d.waterHeater.brand)}
          {infoRow('Model', d.waterHeater.model)}
          {infoRow('Age', d.waterHeater.age)}
          {infoRow('Fuel', d.waterHeater.fuel)}
          {infoRow('Capacity', d.waterHeater.capacity)}
          {infoRow('Location', d.waterHeater.location)}
        </>)}
      </>)}

      {/* Appliances */}
      {d?.appliances && Object.values(d.appliances).some(Boolean) && (<>
        {sectionHeader('Appliances', '🍳')}
        {card(<>
          {d.appliances.refrigerator && (d.appliances.refrigerator.brand || d.appliances.refrigerator.model) && infoRow('Refrigerator', [d.appliances.refrigerator.brand, d.appliances.refrigerator.model].filter(Boolean).join(' — '))}
          {d.appliances.washer && (d.appliances.washer.brand || d.appliances.washer.model) && infoRow('Washer', [d.appliances.washer.brand, d.appliances.washer.model].filter(Boolean).join(' — '))}
          {d.appliances.dryer && (d.appliances.dryer.brand || d.appliances.dryer.model) && infoRow('Dryer', [d.appliances.dryer.brand, d.appliances.dryer.model, d.appliances.dryer.fuel].filter(Boolean).join(' — '))}
          {d.appliances.dishwasher && (d.appliances.dishwasher.brand || d.appliances.dishwasher.model) && infoRow('Dishwasher', [d.appliances.dishwasher.brand, d.appliances.dishwasher.model].filter(Boolean).join(' — '))}
          {d.appliances.oven && (d.appliances.oven.brand || d.appliances.oven.model) && infoRow('Oven', [d.appliances.oven.brand, d.appliances.oven.model, d.appliances.oven.fuel].filter(Boolean).join(' — '))}
          {d.appliances.disposal?.brand && infoRow('Disposal', d.appliances.disposal.brand)}
          {d.appliances.microwave && (d.appliances.microwave.brand || d.appliances.microwave.type) && infoRow('Microwave', [d.appliances.microwave.brand, d.appliances.microwave.type].filter(Boolean).join(' — '))}
        </>)}
      </>)}

      {/* Plumbing */}
      {d?.plumbing && Object.values(d.plumbing).some(Boolean) && (<>
        {sectionHeader('Plumbing', '🚿')}
        {card(<>
          {infoRow('Kitchen Faucet', d.plumbing.kitchenFaucetBrand)}
          {infoRow('Bathroom Faucet', d.plumbing.bathroomFaucetBrand)}
          {infoRow('Toilet Brand', d.plumbing.toiletBrand)}
          {infoRow('Water Softener', d.plumbing.waterSoftener)}
          {infoRow('Septic / Sewer', d.plumbing.septicOrSewer)}
          {infoRow('Main Shutoff', d.plumbing.mainShutoffLocation)}
        </>)}
      </>)}

      {/* Electrical */}
      {d?.electrical && Object.values(d.electrical).some(Boolean) && (<>
        {sectionHeader('Electrical', '💡')}
        {card(<>
          {infoRow('Breaker Box', d.electrical.breakerBoxLocation)}
          {infoRow('Panel Amperage', d.electrical.panelAmperage)}
          {infoRow('Generator', d.electrical.hasGenerator ? (d.electrical.generatorType || 'Yes') : null)}
          {infoRow('Solar', d.electrical.hasSolar ? (d.electrical.solarSystem || 'Yes') : null)}
          {infoRow('EV Charger', d.electrical.hasEvCharger ? (d.electrical.evChargerBrand || 'Yes') : null)}
        </>)}
      </>)}

      {/* Pool / Spa */}
      {(() => { const pool = dx?.pool as Record<string, string> | undefined; return pool && Object.values(pool).some(Boolean) ? (<>
        {sectionHeader('Pool / Spa', '🏊')}
        {card(<>
          {infoRow('Pool Type', pool.type)}
          {infoRow('Heating', pool.heating)}
          {infoRow('Equipment', pool.equipment)}
        </>)}
      </>) : null; })()}

      {/* Exterior */}
      {(() => { const ext = dx?.exterior as Record<string, string> | undefined; return ext && Object.values(ext).some(Boolean) ? (<>
        {sectionHeader('Exterior', '🏡')}
        {card(<>
          {infoRow('Roof Type', ext.roofType)}
          {infoRow('Siding', ext.siding)}
          {infoRow('Fence', ext.fence)}
          {infoRow('Garage Door', ext.garageDoor)}
          {infoRow('Irrigation', ext.irrigation)}
        </>)}
      </>) : null; })()}

      {/* Access */}
      {(() => { const acc = dx?.access as Record<string, string> | undefined; return acc && Object.values(acc).some(Boolean) ? (<>
        {sectionHeader('Access', '🔑')}
        {card(<>
          {infoRow('Lockbox', acc.lockbox)}
          {infoRow('Gate Code', acc.gate)}
          {infoRow('Alarm Code', acc.alarm)}
          {infoRow('WiFi', acc.wifi)}
        </>)}
      </>) : null; })()}

      {/* Notes */}
      {property.notes && (<>
        {sectionHeader('Notes', '📝')}
        <div style={{
          background: 'var(--bp-card)', border: '1px solid var(--bp-border)', borderRadius: 10,
          padding: 16, fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.6, whiteSpace: 'pre-wrap',
        }}>
          {property.notes}
        </div>
      </>)}

      {editing && (
        <EditPropertyModal
          workspaceId={workspaceId}
          property={property}
          onClose={() => setEditing(false)}
          onUpdated={(updated) => { setEditing(false); onPropertyUpdated?.(updated); }}
          onDeleted={() => { setEditing(false); }}
        />
      )}
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */

export default function PropertyDetailView({ workspaceId, property, plan: _plan, onBack }: PropertyDetailViewProps) {
  const [activePage, setActivePage] = useState<SubPage>('activity');
  const [currentProperty, setCurrentProperty] = useState<Property>(property);
  const [dispatches, setDispatches] = useState<WorkspaceDispatch[]>([]);
  const [bookings, setBookings] = useState<WorkspaceBooking[]>([]);
  const [vendors, setVendors] = useState<PreferredVendor[]>([]);
  const [loadingDispatches, setLoadingDispatches] = useState(true);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [loadingVendors, setLoadingVendors] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Fetch dispatches filtered to this property
  useEffect(() => {
    setLoadingDispatches(true);
    businessService.listDispatches(workspaceId)
      .then(res => {
        if (res.data) {
          setDispatches(res.data.filter(d => d.propertyId === property.id));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingDispatches(false));
  }, [workspaceId, property.id]);

  // Fetch bookings filtered to this property
  useEffect(() => {
    setLoadingBookings(true);
    businessService.listBookings(workspaceId)
      .then(res => {
        if (res.data) {
          setBookings(res.data.bookings.filter(b => b.propertyId === property.id));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingBookings(false));
  }, [workspaceId, property.id]);

  // Fetch vendors filtered to this property
  useEffect(() => {
    setLoadingVendors(true);
    businessService.listVendors(workspaceId)
      .then(res => {
        if (res.data) {
          setVendors(res.data.filter(v => v.propertyId === property.id || v.propertyId === null));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, [workspaceId, property.id]);

  const addressLine = [currentProperty.address, currentProperty.city, currentProperty.state].filter(Boolean).join(', ');
  const hasPhoto = currentProperty.photoUrls && currentProperty.photoUrls.length > 0;

  function renderContent() {
    switch (activePage) {
      case 'activity':
        return <ActivitySubPage dispatches={dispatches} bookings={bookings} loading={loadingDispatches || loadingBookings} workspaceId={workspaceId} />;
      case 'jobs':
        return <JobsSubPage dispatches={dispatches} loading={loadingDispatches} workspaceId={workspaceId} />;
      case 'bookings':
        return <BookingsSubPage bookings={bookings} loading={loadingBookings} workspaceId={workspaceId} />;
      case 'calendar':
        return <CalendarSubPage workspaceId={workspaceId} propertyId={property.id} />;
      case 'providers':
        return <ProvidersSubPage vendors={vendors} loading={loadingVendors} />;
      case 'settings':
        return <SettingsSubPage property={currentProperty} workspaceId={workspaceId} onPropertyUpdated={(updated) => { setCurrentProperty(updated); }} />;
    }
  }

  /* ── Drawer content (shared between desktop and mobile) ─── */

  const drawerContent = (
    <>
      {/* Back button */}
      <div style={{
        height: 48, display: 'flex', alignItems: 'center', padding: '0 16px',
        borderBottom: '1px solid var(--bp-border)', flexShrink: 0,
      }}>
        <button onClick={() => { setMobileDrawerOpen(false); onBack(); }} style={{
          display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--bp-muted)', fontSize: 13, fontWeight: 500,
          fontFamily: "'DM Sans',sans-serif", padding: '4px 8px', borderRadius: 6,
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bp-hover)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        >
          <BackArrow /> Back to Properties
        </button>
      </div>

      {/* Property photo */}
      <div style={{
        width: '100%', height: 140, flexShrink: 0, overflow: 'hidden',
        background: hasPhoto ? 'transparent' : `linear-gradient(135deg, ${O}30, ${G}20)`,
      }}>
        {hasPhoto ? (
          <img
            src={currentProperty.photoUrls![0]}
            alt={currentProperty.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, opacity: 0.5,
          }}>
            &#127968;
          </div>
        )}
      </div>

      {/* Property info */}
      <div style={{ padding: '16px 20px 12px', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: 'var(--bp-text)', lineHeight: 1.3 }}>
          {currentProperty.name}
        </div>
        {addressLine && (
          <div style={{ fontSize: 12, color: 'var(--bp-subtle)', marginTop: 4, lineHeight: 1.4 }}>
            {addressLine}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--bp-border)', margin: '0 16px', flexShrink: 0 }} />

      {/* Nav menu */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        {NAV_ITEMS.map(item => {
          const isActive = activePage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { setActivePage(item.id); setMobileDrawerOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 12px', background: isActive ? `${O}10` : 'transparent',
                color: isActive ? O : 'var(--bp-muted)', border: 'none', borderRadius: 10,
                cursor: 'pointer', fontSize: 14, fontFamily: "'DM Sans',sans-serif",
                fontWeight: isActive ? 600 : 500, transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bp-hover)'; }}
              onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ flexShrink: 0, display: 'flex' }}><NavIcon name={item.id} /></span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      <style>{`
        .bp-pdv-drawer-desktop { display: flex; }
        .bp-pdv-mobile-overlay { display: none; }
        .bp-pdv-hamburger { display: none; }
        @media (max-width: 768px) {
          .bp-pdv-drawer-desktop { display: none !important; }
          .bp-pdv-mobile-overlay { display: flex; }
          .bp-pdv-hamburger { display: flex !important; }
        }
      `}</style>

      {/* Desktop drawer */}
      <div className="bp-pdv-drawer-desktop" style={{
        width: 252, minWidth: 252, height: '100%', background: 'var(--bp-card)',
        borderRight: '1px solid var(--bp-border)', display: 'flex', flexDirection: 'column',
        flexShrink: 0, overflow: 'hidden',
      }}>
        {drawerContent}
      </div>

      {/* Mobile drawer overlay */}
      <div className="bp-pdv-mobile-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 100,
        pointerEvents: mobileDrawerOpen ? 'auto' : 'none',
      }}>
        <div
          onClick={() => setMobileDrawerOpen(false)}
          style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
            opacity: mobileDrawerOpen ? 1 : 0, transition: 'opacity 0.3s',
          }}
        />
        <div style={{
          position: 'relative', transform: mobileDrawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease', height: '100%', zIndex: 1, width: 280,
          background: 'var(--bp-card)', display: 'flex', flexDirection: 'column',
        }}>
          {drawerContent}
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {/* Mobile header with hamburger */}
        <div className="bp-pdv-hamburger" style={{
          display: 'none', alignItems: 'center', gap: 12, padding: '12px 16px',
          borderBottom: '1px solid var(--bp-border)', background: 'var(--bp-card)',
        }}>
          <button onClick={() => setMobileDrawerOpen(true)} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bp-text)',
            padding: 4, display: 'flex', alignItems: 'center',
          }}>
            <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M3 5h14" /><path d="M3 10h14" /><path d="M3 15h14" />
            </svg>
          </button>
          <span style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 600, color: 'var(--bp-text)' }}>
            {property.name}
          </span>
        </div>

        {/* Sub-page heading + content */}
        <div style={{ padding: '24px 32px', maxWidth: 900 }} className="bp-content-padding">
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: 'var(--bp-text)', margin: '0 0 20px' }}>
            {NAV_ITEMS.find(n => n.id === activePage)?.label ?? 'Activity'}
          </h3>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
