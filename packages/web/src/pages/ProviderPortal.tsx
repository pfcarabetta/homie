import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useProviderAuth } from '@/contexts/ProviderAuthContext';
import { portalService, type DashboardStats, type IncomingJob, type HistoryJob, type ProviderProfile, type ProviderSettings, type ProviderBooking } from '@/services/provider-api';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

const TABS = ['dashboard', 'jobs', 'bookings', 'history', 'profile', 'settings'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = { dashboard: 'Dashboard', jobs: 'Incoming', bookings: 'Bookings', history: 'History', profile: 'Profile', settings: 'Settings' };

const BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  'top-rated': { bg: '#FFF7ED', text: '#C2410C', label: 'Top Rated' },
  'fast-responder': { bg: '#F0FDF4', text: '#16A34A', label: 'Fast Responder' },
  'reliable': { bg: '#EFF6FF', text: '#2563EB', label: 'Reliable' },
  'veteran': { bg: '#F5F3FF', text: '#7C3AED', label: 'Veteran Pro' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: '#FFF7ED', text: '#C2410C' },
  accepted: { bg: '#F0FDF4', text: '#16A34A' },
  declined: { bg: '#FEF2F2', text: '#DC2626' },
  responded: { bg: '#EFF6FF', text: '#2563EB' },
};

function timeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 15,
  border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: D,
  fontFamily: "'DM Sans', sans-serif",
};

/* -- Dashboard Tab -- */
function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  useEffect(() => { portalService.getDashboard().then(r => setStats(r.data)); }, []);
  if (!stats) return <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div>;

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Jobs Received', val: stats.jobs_received, color: D },
          { label: 'Acceptance Rate', val: `${stats.acceptance_rate}%`, color: O },
          { label: 'Avg Rating', val: stats.avg_rating > 0 ? `${stats.avg_rating}` : '\u2014', color: '#EAB308' },
          { label: 'Completed', val: stats.completed_count, color: G },
        ].map((s, i) => (
          <div key={i} style={{ background: 'white', borderRadius: 14, padding: '20px 16px', border: '1px solid rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
      {stats.badges.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stats.badges.map(b => {
            const s = BADGE_STYLES[b] ?? { bg: '#F5F5F5', text: '#9B9490', label: b };
            return <span key={b} style={{ background: s.bg, color: s.text, padding: '5px 14px', borderRadius: 100, fontSize: 13, fontWeight: 600 }}>{s.label}</span>;
          })}
        </div>
      )}
    </div>
  );
}

/* -- Incoming Jobs Tab -- */
function IncomingJobsTab() {
  const [jobs, setJobs] = useState<IncomingJob[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [quote, setQuote] = useState('');
  const [avail, setAvail] = useState('');
  const [msg, setMsg] = useState('');
  const [responding, setResponding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { portalService.getIncomingJobs().then(r => { setJobs(r.data?.jobs ?? []); setLoading(false); }); }, []);

  async function respond(attemptId: string, action: 'accept' | 'decline') {
    setResponding(true);
    try {
      await portalService.respondToJob(attemptId, { action, quoted_price: quote ? `$${quote.replace(/^\$/, '')}` : undefined, availability: avail || undefined, message: msg || undefined });
      setJobs(j => j.filter(x => x.attempt_id !== attemptId));
      setExpanded(null);
      setQuote(''); setAvail(''); setMsg('');
    } catch { /* ignore */ }
    setResponding(false);
  }

  if (loading) return <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div>;
  if (jobs.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: '#9B9490' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{'\u2705'}</div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>No pending jobs</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>New requests will appear here</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {jobs.map(j => (
        <div key={j.attempt_id} style={{ background: 'white', borderRadius: 14, padding: '16px 18px', border: expanded === j.attempt_id ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)', cursor: 'pointer', transition: 'all 0.15s' }}
          onClick={() => setExpanded(expanded === j.attempt_id ? null : j.attempt_id)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: D, textTransform: 'capitalize' }}>{j.diagnosis?.category ?? 'Job Request'}</span>
            <span style={{ fontSize: 12, color: '#9B9490' }}>{new Date(j.attempted_at).toLocaleDateString()} {new Date(j.attempted_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ({timeAgo(j.attempted_at)})</span>
          </div>
          {j.diagnosis?.summary && <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.5, marginBottom: 6 }}>{renderBold(j.diagnosis.summary)}</div>}
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#9B9490' }}>
            <span>{j.zip_code}</span>
            <span>{j.tier} tier</span>
            {j.timing && <span>{j.timing}</span>}
            {j.budget && <span>{j.budget}</span>}
          </div>

          {expanded === j.attempt_id && (
            <div style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: D, display: 'block', marginBottom: 6 }}>Quoted Price — Estimate</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 16, top: 13, color: '#9B9490', fontSize: 15 }}>$</span>
                    <input value={quote} onChange={e => setQuote(e.target.value.replace(/[^0-9.,\-]/g, ''))} placeholder="150-200" inputMode="decimal"
                      style={{ ...inputStyle, paddingLeft: 30 }} />
                  </div>
                </div>
                <input value={avail} onChange={e => setAvail(e.target.value)} placeholder="Your availability (e.g. Tomorrow 9-11 AM)" style={inputStyle} />
                <textarea value={msg} onChange={e => setMsg(e.target.value)} placeholder="Message to homeowner (optional)" rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => respond(j.attempt_id, 'decline')} disabled={responding} style={{
                  padding: '12px 20px', borderRadius: 100, border: '2px solid #E24B4A', background: 'white',
                  color: '#E24B4A', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}>Decline</button>
                <button onClick={() => respond(j.attempt_id, 'accept')} disabled={responding} style={{
                  flex: 1, padding: '12px 20px', borderRadius: 100, border: 'none', background: G,
                  color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}>{responding ? 'Sending...' : 'Accept & Send Quote'}</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* -- Bookings Tab -- */
function BookingsTab() {
  const [bookingsList, setBookingsList] = useState<ProviderBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    portalService.getBookings().then(r => {
      setBookingsList(r.data?.bookings ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div>;
  if (bookingsList.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: '#9B9490' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>No bookings yet</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>When a homeowner books you, it will appear here</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {bookingsList.map(b => {
        const isExpanded = expandedId === b.id;
        const customerName = [b.homeownerFirstName, b.homeownerLastName].filter(Boolean).join(' ') || b.homeownerEmail;

        return (
          <div key={b.id} onClick={() => setExpandedId(isExpanded ? null : b.id)} style={{
            background: 'white', borderRadius: 14, padding: '16px 18px',
            border: isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: D }}>
                {b.diagnosis?.category ? b.diagnosis.category.charAt(0).toUpperCase() + b.diagnosis.category.slice(1) : 'Job'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600,
                  background: b.status === 'confirmed' ? '#F0FDF4' : b.status === 'completed' ? '#EFF6FF' : '#F5F5F5',
                  color: b.status === 'confirmed' ? '#16A34A' : b.status === 'completed' ? '#2563EB' : '#9B9490',
                  textTransform: 'capitalize',
                }}>{b.status}</span>
                <span style={{ fontSize: 12, color: '#9B9490' }}>{isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 4 }}>{customerName}</div>
            {b.diagnosis?.summary && <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.5, marginBottom: 6 }}>{renderBold(b.diagnosis.summary.slice(0, 120))}{b.diagnosis.summary.length > 120 ? '...' : ''}</div>}
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#9B9490', flexWrap: 'wrap' }}>
              {b.quotedPrice && <span>Quote: {b.quotedPrice}</span>}
              <span>{b.zipCode}</span>
              <span>Booked {timeAgo(b.confirmedAt)}</span>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ marginTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }} onClick={e => e.stopPropagation()}>

                {/* Action banner */}
                <div style={{
                  background: '#FFF7ED', borderRadius: 10, padding: '14px 16px', marginBottom: 16,
                  border: '1px solid rgba(232,99,43,0.15)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: O, marginBottom: 4 }}>Action Required</div>
                  <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6 }}>
                    Please reach out to the homeowner to coordinate the appointment. All payment for the work is between you and the homeowner directly.
                  </div>
                </div>

                {/* Customer contact */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: D, marginBottom: 8 }}>Customer Contact</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Name</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{customerName}</div>
                    </div>
                    <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Email</div>
                      <a href={`mailto:${b.homeownerEmail}`} style={{ fontSize: 14, fontWeight: 600, color: O, textDecoration: 'none' }}>{b.homeownerEmail}</a>
                    </div>
                    {b.homeownerPhone && (
                      <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Phone</div>
                        <a href={`tel:${b.homeownerPhone}`} style={{ fontSize: 14, fontWeight: 600, color: O, textDecoration: 'none' }}>{b.homeownerPhone}</a>
                      </div>
                    )}
                    {b.serviceAddress && (
                      <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                        <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Service Address</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{b.serviceAddress}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Job details */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: D, marginBottom: 8 }}>Job Details</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Category</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D, textTransform: 'capitalize' }}>{b.diagnosis?.category ?? 'General'}</div>
                    </div>
                    <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Severity</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D, textTransform: 'capitalize' }}>{b.diagnosis?.severity ?? 'Medium'}</div>
                    </div>
                    <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Timing</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{b.preferredTiming ?? 'ASAP'}</div>
                    </div>
                    <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Requested</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{new Date(b.jobCreatedAt).toLocaleDateString()} {new Date(b.jobCreatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
                    </div>
                  </div>
                </div>

                {/* Diagnosis summary */}
                {b.diagnosis?.summary && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: D, marginBottom: 8 }}>Description</div>
                    <div style={{ background: W, borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#6B6560', lineHeight: 1.6 }}>
                      {renderBold(b.diagnosis.summary)}
                    </div>
                  </div>
                )}

                {/* Your quote */}
                {(b.quotedPrice || b.availability || b.responseMessage) && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: D, marginBottom: 8 }}>Your Quote</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {b.quotedPrice && (
                        <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Price</div>
                          <div style={{ fontSize: 18, fontWeight: 700, color: O }}>{b.quotedPrice}</div>
                        </div>
                      )}
                      {b.availability && (
                        <div style={{ background: W, borderRadius: 10, padding: '10px 14px' }}>
                          <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Availability</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{b.availability}</div>
                        </div>
                      )}
                    </div>
                    {b.responseMessage && (
                      <div style={{ background: W, borderRadius: 10, padding: '10px 14px', marginTop: 8, fontSize: 13, color: '#6B6560', fontStyle: 'italic' }}>
                        "{b.responseMessage}"
                      </div>
                    )}
                  </div>
                )}

                {/* Payment note */}
                <div style={{
                  background: '#EFF6FF', borderRadius: 10, padding: '12px 16px',
                  border: '1px solid rgba(37,99,235,0.1)', fontSize: 13, color: '#6B6560', lineHeight: 1.6,
                }}>
                  <span style={{ fontWeight: 600, color: '#2563EB' }}>Payment note:</span> All payment for this job is between you and the homeowner. Homie does not process or collect payment on your behalf.
                </div>

                {/* Contact buttons */}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  {b.homeownerPhone && (
                    <a href={`tel:${b.homeownerPhone}`} style={{
                      flex: 1, padding: '12px 0', borderRadius: 100, border: 'none',
                      background: O, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                      textAlign: 'center', textDecoration: 'none', display: 'block',
                    }}>📞 Call {b.homeownerFirstName || 'Customer'}</a>
                  )}
                  <a href={`mailto:${b.homeownerEmail}`} style={{
                    flex: 1, padding: '12px 0', borderRadius: 100,
                    border: `2px solid ${O}`, background: 'white', color: O,
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    textAlign: 'center', textDecoration: 'none', display: 'block',
                  }}>✉️ Email {b.homeownerFirstName || 'Customer'}</a>
                </div>

                {/* Cancel booking */}
                {b.status === 'confirmed' && (
                  <div style={{ marginTop: 16, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16 }}>
                    {cancelConfirmId === b.id ? (
                      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 16 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 6 }}>Cancel this booking?</div>
                        <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 12 }}>
                          This can't be undone. The homeowner will be notified of the cancellation via text and email.
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={(e) => { e.stopPropagation(); setCancelConfirmId(null); }}
                            style={{ flex: 1, padding: '10px 0', borderRadius: 100, border: '1px solid #E0DAD4', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: D }}>
                            Keep Booking
                          </button>
                          <button disabled={cancelling} onClick={async (e) => {
                            e.stopPropagation();
                            setCancelling(true);
                            try {
                              await portalService.cancelBooking(b.id);
                              setBookingsList(prev => prev.map(bk => bk.id === b.id ? { ...bk, status: 'cancelled' } : bk));
                              setCancelConfirmId(null);
                            } catch (err) {
                              alert((err as Error).message || 'Failed to cancel');
                            }
                            setCancelling(false);
                          }}
                            style={{ flex: 1, padding: '10px 0', borderRadius: 100, border: 'none', background: '#DC2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: cancelling ? 0.6 : 1 }}>
                            {cancelling ? 'Cancelling...' : 'Yes, Cancel Booking'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setCancelConfirmId(b.id); }}
                        style={{ background: 'none', border: 'none', fontSize: 13, color: '#DC2626', fontWeight: 500, cursor: 'pointer', padding: 0 }}>
                        Cancel this booking
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -- History Tab -- */
function HistoryTab() {
  const [jobs, setJobs] = useState<HistoryJob[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    portalService.getHistory({ status: filter === 'all' ? undefined : filter }).then(r => { setJobs(r.data?.jobs ?? []); setLoading(false); });
  }, [filter]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {['all', 'accepted', 'declined'].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '7px 16px', borderRadius: 100, border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            background: filter === s ? D : 'rgba(0,0,0,0.04)', color: filter === s ? 'white' : '#9B9490',
            fontFamily: "'DM Sans', sans-serif", textTransform: 'capitalize',
          }}>{s}</button>
        ))}
      </div>

      {loading ? <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div> :
        jobs.length === 0 ? <div style={{ textAlign: 'center', padding: '40px 0', color: '#9B9490', fontSize: 14 }}>No jobs found</div> :
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {jobs.map(j => {
            const sc = STATUS_COLORS[j.status] ?? STATUS_COLORS.pending;
            return (
              <div key={j.attempt_id} style={{ background: 'white', borderRadius: 14, padding: '14px 18px', border: '1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: D, textTransform: 'capitalize' }}>{j.diagnosis?.category ?? 'Job'}</span>
                  <span style={{ background: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{j.status}</span>
                </div>
                {j.diagnosis?.summary && <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.4 }}>{renderBold(j.diagnosis.summary)}</div>}
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#9B9490', marginTop: 6 }}>
                  <span>{j.zip_code}</span>
                  <span>via {j.channel}</span>
                  <span>{new Date(j.attempted_at).toLocaleDateString()} {new Date(j.attempted_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} ({timeAgo(j.attempted_at)})</span>
                </div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
}

/* -- Profile Tab -- */
const ALL_CATEGORIES = [
  // Repair
  'Plumbing', 'Electrical', 'HVAC', 'Appliance Repair', 'Roofing', 'General Contractor',
  'Handyman', 'Garage Door',
  // Services
  'Cleaning', 'Landscaping', 'Pool', 'Hot Tub', 'Pest Control', 'Painting',
  'Locksmith', 'Pressure Washing', 'Moving', 'Flooring', 'Fencing',
  'Tree Trimming', 'Gutter Cleaning', 'Carpet Cleaning', 'Window Cleaning',
  'Steam Cleaning', 'Concrete', 'Masonry', 'Siding', 'Insulation', 'Solar',
  'Security Systems', 'Furniture Assembly', 'Concierge', 'Professional Photography',
];

const RADIUS_OPTIONS = [5, 10, 15, 25, 50];

/* -- Google Business Link -- */
function GoogleBusinessLink({ profile }: { profile: ProviderProfile | null }) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ placeId: string; name: string; rating: number; reviewCount: number; address: string }>>([]);
  const [linked, setLinked] = useState(false);
  const [linkedName, setLinkedName] = useState('');
  const [linkedRating, setLinkedRating] = useState(0);
  const [showSearch, setShowSearch] = useState(false);

  // Already linked via google_rating
  if (profile?.google_rating && !linked) {
    return (
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14, marginTop: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 8 }}>Google Business</div>
        <div style={{ background: '#E1F5EE', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: D }}>Linked to Google</div>
            <div style={{ fontSize: 13, color: '#9B9490' }}>★ {profile.google_rating} ({profile.review_count} reviews)</div>
          </div>
        </div>
      </div>
    );
  }

  if (linked) {
    return (
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14, marginTop: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 8 }}>Google Business</div>
        <div style={{ background: '#E1F5EE', borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{linkedName}</div>
            <div style={{ fontSize: 13, color: '#9B9490' }}>★ {linkedRating} — Successfully linked</div>
          </div>
        </div>
      </div>
    );
  }

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const zip = profile?.service_zips?.[0]?.split(':')?.[0] ?? '';
      const res = await portalService.searchGoogle(query.trim(), zip);
      setResults(res.data ?? []);
    } catch { setResults([]); }
    setSearching(false);
  }

  async function handleClaim(r: { placeId: string; name: string; rating: number; reviewCount: number }) {
    try {
      await portalService.claimGoogle({ place_id: r.placeId, name: r.name, rating: r.rating, review_count: r.reviewCount });
      setLinked(true);
      setLinkedName(r.name);
      setLinkedRating(r.rating);
      setShowSearch(false);
    } catch { /* ignore */ }
  }

  return (
    <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: D }}>Google Business</div>
        {!showSearch && (
          <button onClick={() => { setShowSearch(true); setQuery(profile?.name ?? ''); }} style={{
            fontSize: 13, fontWeight: 600, color: O, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}>Link your listing</button>
        )}
      </div>

      {!showSearch ? (
        <div style={{ background: 'rgba(0,0,0,0.02)', borderRadius: 12, padding: '16px', textAlign: 'center', color: '#9B9490', fontSize: 13 }}>
          Link your Google Business listing to display your rating and reviews to homeowners.
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your business name..."
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid rgba(0,0,0,0.08)', fontSize: 14, outline: 'none', color: D, fontFamily: "'DM Sans', sans-serif" }}
              onFocus={e => e.currentTarget.style.borderColor = O}
              onBlur={e => e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'}
            />
            <button onClick={handleSearch} disabled={searching} style={{
              padding: '10px 18px', borderRadius: 10, border: 'none', background: O, color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: searching ? 'default' : 'pointer', opacity: searching ? 0.6 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}>{searching ? '...' : 'Search'}</button>
          </div>

          {results.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
              {results.map(r => (
                <div key={r.placeId} style={{
                  background: W, borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(0,0,0,0.04)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: '#9B9490' }}>★ {r.rating} ({r.reviewCount}) · {r.address}</div>
                  </div>
                  <button onClick={() => handleClaim(r)} style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none', background: G, color: '#fff',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                  }}>This is me</button>
                </div>
              ))}
            </div>
          )}

          {results.length === 0 && !searching && query.length > 0 && (
            <div style={{ textAlign: 'center', padding: 16, color: '#9B9490', fontSize: 13 }}>No results found. Try a different name.</div>
          )}

          <button onClick={() => setShowSearch(false)} style={{
            marginTop: 8, fontSize: 13, color: '#9B9490', background: 'none', border: 'none', cursor: 'pointer',
          }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function ProfileTab() {
  const [profile, setProfile] = useState<ProviderProfile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [catSearch, setCatSearch] = useState('');
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const [serviceZip, setServiceZip] = useState('');
  const [serviceRadius, setServiceRadius] = useState(15);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    portalService.getProfile().then(r => {
      if (r.data) {
        setProfile(r.data);
        setName(r.data.name);
        setPhone(r.data.phone ?? '');
        setEmail(r.data.email ?? '');
        setSelectedCats(r.data.categories ?? []);
        // Parse service_zips: first entry is the zip, stored as "zip:radius" or just zips
        if (r.data.service_zips && r.data.service_zips.length > 0) {
          const first = r.data.service_zips[0];
          if (first.includes(':')) {
            const [z, rad] = first.split(':');
            setServiceZip(z);
            setServiceRadius(Number(rad) || 15);
          } else {
            setServiceZip(first);
          }
        }
      }
    });
  }, []);

  const filteredCats = ALL_CATEGORIES.filter(c =>
    c.toLowerCase().includes(catSearch.toLowerCase()) && !selectedCats.includes(c.toLowerCase())
  );

  function toggleCat(cat: string) {
    const lower = cat.toLowerCase();
    setSelectedCats(prev => prev.includes(lower) ? prev.filter(c => c !== lower) : [...prev, lower]);
    setCatSearch('');
  }

  function removeCat(cat: string) {
    setSelectedCats(prev => prev.filter(c => c !== cat));
  }

  async function save() {
    setMsg(null);
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (name !== profile?.name) updates.name = name;
      if (phone !== (profile?.phone ?? '')) updates.phone = phone;
      if (email !== (profile?.email ?? '')) updates.email = email;
      if (JSON.stringify(selectedCats) !== JSON.stringify(profile?.categories ?? [])) updates.categories = selectedCats;
      const zipData = serviceZip ? [`${serviceZip}:${serviceRadius}`] : [];
      if (JSON.stringify(zipData) !== JSON.stringify(profile?.service_zips ?? [])) updates.service_zips = zipData;

      if (Object.keys(updates).length === 0) { setMsg({ type: 'error', text: 'No changes' }); setSaving(false); return; }
      await portalService.updateProfile(updates as Parameters<typeof portalService.updateProfile>[0]);
      setMsg({ type: 'success', text: 'Profile updated' });
    } catch (err) { setMsg({ type: 'error', text: (err as Error).message }); }
    setSaving(false);
  }

  if (!profile) return <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div>;

  return (
    <div>
      {profile.google_rating && (
        <div style={{ background: 'white', borderRadius: 12, padding: '12px 16px', marginBottom: 16, border: '1px solid rgba(0,0,0,0.06)', display: 'flex', gap: 16, fontSize: 14, color: '#6B6560' }}>
          <span>{'\u2B50'} {profile.google_rating} ({profile.review_count} reviews)</span>
        </div>
      )}
      {msg && <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 14, background: msg.type === 'success' ? '#F0FDF4' : '#FEF2F2', color: msg.type === 'success' ? '#16A34A' : '#DC2626', border: `1px solid ${msg.type === 'success' ? '#BBF7D0' : '#FECACA'}` }}>{msg.text}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div><label style={{ fontSize: 13, fontWeight: 600, color: D, display: 'block', marginBottom: 6 }}>Business Name</label><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} /></div>
        <div><label style={{ fontSize: 13, fontWeight: 600, color: D, display: 'block', marginBottom: 6 }}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} /></div>
        <div><label style={{ fontSize: 13, fontWeight: 600, color: D, display: 'block', marginBottom: 6 }}>Email</label><input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></div>

        {/* Service Categories — searchable multi-select */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: D, display: 'block', marginBottom: 6 }}>Service Categories</label>
          {selectedCats.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {selectedCats.map(cat => (
                <span key={cat} style={{
                  background: 'rgba(232,99,43,0.08)', color: O, padding: '4px 10px', borderRadius: 100,
                  fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'capitalize',
                }}>
                  {cat}
                  <button onClick={() => removeCat(cat)} style={{ background: 'none', border: 'none', color: O, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>{'\u00D7'}</button>
                </span>
              ))}
            </div>
          )}
          <div style={{ position: 'relative' }}>
            <input
              value={catSearch}
              onChange={e => { setCatSearch(e.target.value); setCatDropdownOpen(true); }}
              onFocus={() => setCatDropdownOpen(true)}
              placeholder="Search categories..."
              style={inputStyle}
            />
            {catDropdownOpen && filteredCats.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, marginTop: 4,
                background: 'white', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.08)', maxHeight: 200, overflowY: 'auto',
              }}>
                {filteredCats.slice(0, 15).map(cat => (
                  <button key={cat} onClick={() => { toggleCat(cat); setCatDropdownOpen(false); }} style={{
                    display: 'block', width: '100%', padding: '10px 14px', background: 'none', border: 'none',
                    textAlign: 'left', fontSize: 14, color: D, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    borderBottom: '1px solid rgba(0,0,0,0.04)',
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = W}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                  >{cat}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Service Area — zip + radius */}
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: D, display: 'block', marginBottom: 6 }}>Service Area</label>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <input
                value={serviceZip}
                onChange={e => setServiceZip(e.target.value.replace(/\D/g, ''))}
                maxLength={5}
                placeholder="Zip code"
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <select
                value={serviceRadius}
                onChange={e => setServiceRadius(Number(e.target.value))}
                style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%239B9490\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center' }}
              >
                {RADIUS_OPTIONS.map(r => (
                  <option key={r} value={r}>{r} mile radius</option>
                ))}
              </select>
            </div>
          </div>
          {serviceZip && (
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>
              Serving {serviceRadius} miles around {serviceZip}
            </div>
          )}
        </div>

        <GoogleBusinessLink profile={profile} />

        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14, marginTop: 4 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 8 }}>Calendar Integration</div>
          <div style={{ background: 'rgba(0,0,0,0.02)', borderRadius: 12, padding: '16px', textAlign: 'center', color: '#9B9490', fontSize: 13 }}>Coming soon — sync your availability with Google Calendar or other tools</div>
        </div>
        <button onClick={save} disabled={saving} style={{ padding: '14px 0', borderRadius: 100, border: 'none', background: O, color: 'white', fontSize: 16, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily: "'DM Sans', sans-serif" }}>{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>
    </div>
  );
}

/* -- Settings Tab -- */
function SetPasswordSection() {
  const [pw, setPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSet() {
    setMsg(null);
    if (pw.length < 8) { setMsg({ type: 'error', text: 'Password must be at least 8 characters' }); return; }
    if (pw !== confirmPw) { setMsg({ type: 'error', text: 'Passwords do not match' }); return; }
    setSaving(true);
    try {
      await portalService.setPassword(pw);
      setMsg({ type: 'success', text: 'Password set! You can now sign in with your email and password.' });
      setPw(''); setConfirmPw('');
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message || 'Failed to set password' });
    }
    setSaving(false);
  }

  return (
    <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 4 }}>Set a Password</div>
      <div style={{ fontSize: 13, color: '#9B9490', marginBottom: 12, lineHeight: 1.5 }}>Set a password so you can sign in directly with your email instead of using a magic link each time.</div>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 14,
          background: msg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
          color: msg.type === 'success' ? '#16A34A' : '#DC2626',
          border: `1px solid ${msg.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
        }}>{msg.text}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
        <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="New password (min 8 characters)"
          style={inputStyle} />
        <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm password"
          style={inputStyle} />
      </div>
      <button onClick={handleSet} disabled={saving || !pw || !confirmPw} style={{
        padding: '11px 24px', borderRadius: 100, border: 'none',
        background: pw && confirmPw && !saving ? O : 'rgba(0,0,0,0.08)',
        color: pw && confirmPw && !saving ? 'white' : '#9B9490',
        fontSize: 14, fontWeight: 600, cursor: pw && confirmPw && !saving ? 'pointer' : 'default',
        fontFamily: "'DM Sans', sans-serif",
      }}>{saving ? 'Saving...' : 'Set Password'}</button>
    </div>
  );
}

function SettingsTab() {
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [optingOut, setOptingOut] = useState(false);
  const [optedOut, setOptedOut] = useState(false);

  useEffect(() => { portalService.getSettings().then(r => setSettings(r.data)); }, []);

  async function updatePref(pref: string) {
    setSaving(true);
    await portalService.updateSettings({ notification_pref: pref });
    setSettings(s => s ? { ...s, notificationPref: pref } : s);
    setSaving(false);
  }

  async function toggleVacation() {
    if (!settings) return;
    setSaving(true);
    await portalService.updateSettings({ vacation_mode: !settings.vacationMode });
    setSettings(s => s ? { ...s, vacationMode: !s.vacationMode } : s);
    setSaving(false);
  }

  async function handleOptOut() {
    if (!confirm('Are you sure? You will stop receiving all Homie job requests.')) return;
    setOptingOut(true);
    await portalService.optOut();
    setOptedOut(true);
    setOptingOut(false);
  }

  if (!settings) return <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 10 }}>Notification Preferences</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['sms', 'email', 'both'].map(p => (
            <button key={p} onClick={() => updatePref(p)} disabled={saving} style={{
              flex: 1, padding: '12px', borderRadius: 12, border: settings.notificationPref === p ? `2px solid ${O}` : '2px solid rgba(0,0,0,0.06)',
              background: settings.notificationPref === p ? 'rgba(232,99,43,0.04)' : 'white', color: D, fontSize: 14, fontWeight: 500,
              cursor: 'pointer', textTransform: 'capitalize', fontFamily: "'DM Sans', sans-serif",
            }}>{p}</button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: D }}>Vacation Mode</div>
            <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>Pause all new job requests</div>
          </div>
          <button onClick={toggleVacation} disabled={saving} style={{
            width: 52, height: 28, borderRadius: 14, border: 'none', cursor: 'pointer', position: 'relative',
            background: settings.vacationMode ? O : 'rgba(0,0,0,0.12)', transition: 'background 0.2s',
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', background: 'white', position: 'absolute', top: 3,
              left: settings.vacationMode ? 27 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }} />
          </button>
        </div>
      </div>

      <SetPasswordSection />

      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 20 }}>
        {optedOut ? (
          <div style={{ background: '#FEF2F2', borderRadius: 12, padding: '16px', textAlign: 'center', color: '#DC2626', fontSize: 14 }}>
            You've been removed from Homie. You will no longer receive job requests.
          </div>
        ) : (
          <div style={{ border: '2px solid #FECACA', borderRadius: 14, padding: '16px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#DC2626', marginBottom: 4 }}>Remove from Homie</div>
            <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 12, lineHeight: 1.5 }}>Stop receiving all job requests from Homie permanently.</div>
            <button onClick={handleOptOut} disabled={optingOut} style={{
              padding: '10px 20px', borderRadius: 100, border: 'none', background: '#DC2626', color: 'white',
              fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}>{optingOut ? 'Processing...' : 'Opt Out'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* -- Main Portal Page -- */
export default function ProviderPortal() {
  const navigate = useNavigate();
  const { provider, isProviderAuthenticated, logout } = useProviderAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as Tab) || 'dashboard';
  const [incomingCount, setIncomingCount] = useState(0);
  const [bookingsCount, setBookingsCount] = useState(0);

  useEffect(() => {
    if (!isProviderAuthenticated) navigate('/portal/login');
  }, [isProviderAuthenticated, navigate]);

  // Fetch notification counts
  useEffect(() => {
    if (!isProviderAuthenticated) return;
    portalService.getIncomingJobs().then(r => {
      setIncomingCount(r.data?.jobs?.length ?? 0);
    }).catch(() => {});
    portalService.getBookings().then(r => {
      const confirmed = r.data?.bookings?.filter(b => b.status === 'confirmed') ?? [];
      setBookingsCount(confirmed.length);
    }).catch(() => {});
  }, [isProviderAuthenticated]);

  if (!isProviderAuthenticated || !provider) return null;

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50, background: D,
        padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link to="/" style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: O, textDecoration: 'none' }}>homie</Link>
          <span style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>PRO</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{provider.name}</span>
          <button onClick={() => { logout(); navigate('/'); }} style={{
            background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 100,
            padding: '6px 14px', fontSize: 12, color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>Sign out</button>
        </div>
      </nav>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px 80px' }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: D, marginBottom: 24 }}>
          Welcome, {provider.name}
        </h1>

        <div style={{ display: 'flex', gap: 2, marginBottom: 28, borderBottom: '1px solid rgba(0,0,0,0.06)', overflowX: 'auto' }}>
          {TABS.map(tab => {
            const badgeCount = tab === 'jobs' ? incomingCount : tab === 'bookings' ? bookingsCount : 0;
            return (
              <button key={tab} onClick={() => setSearchParams({ tab })} style={{
                padding: '10px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
                background: 'none', border: 'none', borderBottom: activeTab === tab ? `2px solid ${O}` : '2px solid transparent',
                color: activeTab === tab ? O : '#9B9490', fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.15s', marginBottom: -1, position: 'relative',
              }}>
                {TAB_LABELS[tab]}
                {badgeCount > 0 && activeTab !== tab && (
                  <span style={{
                    position: 'absolute', top: 4, right: 2,
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#DC2626',
                  }} />
                )}
              </button>
            );
          })}
        </div>

        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'jobs' && <IncomingJobsTab />}
        {activeTab === 'bookings' && <BookingsTab />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
