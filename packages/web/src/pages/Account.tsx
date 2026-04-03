import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { accountService, jobService, estimateService, type AccountProfile, type AccountJob, type AccountBooking, type ProviderResponseItem, type HomeData, type PropertyDetails, type CostEstimate } from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';
import EstimateCard from '@/components/EstimateCard';
import EstimateBadge from '@/components/EstimateBadge';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

const TABS = ['profile', 'home', 'quotes', 'bookings'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = { profile: 'Profile', home: 'My Home', quotes: 'My Quotes', bookings: 'Bookings' };

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: '#EFF6FF', text: '#2563EB' },
  dispatching: { bg: '#FFF7ED', text: '#C2410C' },
  collecting: { bg: '#F5F3FF', text: '#7C3AED' },
  completed: { bg: '#F0FDF4', text: '#16A34A' },
  expired: { bg: '#F5F5F5', text: '#9B9490' },
  refunded: { bg: '#FEF2F2', text: '#DC2626' },
  confirmed: { bg: '#F0FDF4', text: '#16A34A' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/* -- Profile Tab -- */
function ProfileTab() {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [zip, setZip] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    accountService.getProfile().then(res => {
      if (res.data) {
        setProfile(res.data);
        setFirstName(res.data.first_name || '');
        setLastName(res.data.last_name || '');
        setEmail(res.data.email);
        setPhone(res.data.phone || '');
        setZip(res.data.zip_code);
      }
    });
  }, []);

  async function handleSave() {
    setMsg(null);
    setSaving(true);
    try {
      const updates: Record<string, string> = {};
      if (firstName !== (profile?.first_name || '')) updates.first_name = firstName;
      if (lastName !== (profile?.last_name || '')) updates.last_name = lastName;
      if (email !== profile?.email) updates.email = email;
      if (phone !== (profile?.phone || '')) updates.phone = phone;
      if (zip !== profile?.zip_code) updates.zip_code = zip;
      if (newPw) { updates.current_password = currentPw; updates.new_password = newPw; }

      if (Object.keys(updates).length === 0) { setMsg({ type: 'error', text: 'No changes to save' }); setSaving(false); return; }

      const res = await accountService.updateProfile(updates);
      if (res.data) {
        setProfile(res.data);
        setCurrentPw('');
        setNewPw('');
        setMsg({ type: 'success', text: 'Profile updated' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message || 'Update failed' });
    }
    setSaving(false);
  }

  if (!profile) return <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div>;

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: 12, fontSize: 15,
    border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: D,
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div>
      <div style={{ fontSize: 12, color: '#9B9490', marginBottom: 24 }}>Member since {new Date(profile.created_at).toLocaleDateString()}</div>

      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 14,
          background: msg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
          color: msg.type === 'success' ? '#16A34A' : '#DC2626',
          border: `1px solid ${msg.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
        }}>{msg.text}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: D, marginBottom: 6, display: 'block' }}>First Name</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First" style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: D, marginBottom: 6, display: 'block' }}>Last Name</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last" style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: D, marginBottom: 6, display: 'block' }}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: D, marginBottom: 6, display: 'block' }}>Phone</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: D, marginBottom: 6, display: 'block' }}>Zip Code</label>
          <input value={zip} onChange={e => setZip(e.target.value.replace(/\D/g, ''))} maxLength={5} style={inputStyle} />
        </div>

        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16, marginTop: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 12 }}>Change Password</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current password" style={inputStyle} />
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="New password (min 8 chars)" style={inputStyle} />
          </div>
        </div>

        <button onClick={handleSave} disabled={saving} style={{
          marginTop: 8, padding: '14px 0', borderRadius: 100, border: 'none', fontSize: 16, fontWeight: 600,
          background: O, color: 'white', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
          fontFamily: "'DM Sans', sans-serif",
        }}>{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>
    </div>
  );
}

/* -- Quotes Tab -- */
const QUOTE_STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  open: { color: '#2563EB', bg: '#EFF6FF', label: 'Open' },
  dispatching: { color: '#C2410C', bg: '#FFF7ED', label: 'Searching' },
  collecting: { color: '#7C3AED', bg: '#F5F3FF', label: 'Collecting' },
  completed: { color: '#16A34A', bg: '#F0FDF4', label: 'Complete' },
  expired: { color: '#9B9490', bg: '#F5F5F5', label: 'Expired' },
  refunded: { color: '#DC2626', bg: '#FEF2F2', label: 'Refunded' },
};

const PAYMENT_LABELS: Record<string, { text: string; color: string }> = {
  unpaid: { text: 'Not paid', color: '#9B9490' },
  authorized: { text: 'Authorized', color: '#2563EB' },
  pending: { text: 'Pending', color: '#C2410C' },
  paid: { text: 'Paid', color: '#16A34A' },
  refunded: { text: 'Refunded', color: '#DC2626' },
};

const QUOTE_CARD_STYLES = `
@keyframes qtc-spin-cw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes qtc-spin-ccw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(-360deg); }
}
@keyframes qtc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@media (prefers-reduced-motion: reduce) {
  .qtc-spin-cw, .qtc-spin-ccw { animation: none !important; }
}
`;

function QuotesTab() {
  const [jobs, setJobs] = useState<AccountJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, ProviderResponseItem[]>>({});
  const [loadingResponses, setLoadingResponses] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<Record<string, CostEstimate>>({});

  useEffect(() => {
    accountService.getJobs().then(res => {
      setJobs(res.data?.jobs || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function fetchEstimate(job: AccountJob) {
    if (estimates[job.id] || !job.diagnosis?.category || !job.zip_code) return;
    try {
      const cat = job.diagnosis.category;
      const sub = job.diagnosis.subcategory || cat;
      const res = await estimateService.generate({ category: cat, subcategory: sub, zip_code: job.zip_code });
      if (res.data) setEstimates(prev => ({ ...prev, [job.id]: res.data! }));
    } catch { /* ignore */ }
  }

  async function toggleExpand(jobId: string) {
    if (expandedId === jobId) { setExpandedId(null); return; }
    setExpandedId(jobId);
    const job = jobs.find(j => j.id === jobId);
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

  if (loading) return <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div>;
  if (jobs.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: '#9B9490' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>{'\uD83D\uDCCB'}</div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>No quotes yet</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>Your quote requests will appear here</div>
    </div>
  );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: QUOTE_CARD_STYLES }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {jobs.map(j => {
          const sc = QUOTE_STATUS_CONFIG[j.status] ?? QUOTE_STATUS_CONFIG.expired;
          const pm = PAYMENT_LABELS[j.payment_status] ?? PAYMENT_LABELS.unpaid;
          const isExpanded = expandedId === j.id;
          const jobResponses = responses[j.id] ?? [];
          const isActive = ['open', 'dispatching', 'collecting'].includes(j.status);
          const catLabel = j.diagnosis?.category ? j.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Quote';
          const responseCount = jobResponses.length;
          const ringSize = 44;

          return (
            <div key={j.id} onClick={() => toggleExpand(j.id)} style={{
              background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
              border: isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
              transition: 'all 0.2s',
              boxShadow: isExpanded ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
            }}>
              {/* ── Collapsed header ── */}
              <div style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Mini spinner for active, static icon for others */}
                  {isActive ? (
                    <div style={{ position: 'relative', width: ringSize, height: ringSize, flexShrink: 0 }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #F0EBE6' }} />
                      <div className="qtc-spin-cw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: O, animation: 'qtc-spin-cw 1.8s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                      <div className="qtc-spin-ccw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderBottomColor: G, animation: 'qtc-spin-ccw 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 20, color: O, lineHeight: 1 }}>h</div>
                    </div>
                  ) : (
                    <div style={{
                      width: ringSize, height: ringSize, borderRadius: '50%', flexShrink: 0,
                      background: responseCount > 0 ? `${G}12` : W,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `2px solid ${responseCount > 0 ? `${G}30` : '#F0EBE6'}`,
                    }}>
                      <span style={{ fontSize: 18 }}>{responseCount > 0 ? '✓' : j.status === 'expired' ? '⏰' : '✓'}</span>
                    </div>
                  )}

                  {/* Title + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 16, color: D }}>{catLabel}</span>
                      <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600 }}>{sc.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#9B9490', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>{j.zip_code}</span>
                      <span>{new Date(j.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span style={{ textTransform: 'capitalize' }}>{j.tier}</span>
                    </div>
                  </div>

                  {/* Right: quote count or searching */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {responseCount > 0 ? (
                      <>
                        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: G }}>{responseCount}</div>
                        <div style={{ fontSize: 10, color: '#9B9490' }}>quote{responseCount > 1 ? 's' : ''}</div>
                      </>
                    ) : isActive ? (
                      <div style={{ fontSize: 11, fontWeight: 600, color: O, animation: 'qtc-pulse 1.5s infinite' }}>Searching...</div>
                    ) : (
                      <span style={{ fontSize: 12, color: '#C0BBB6' }}>—</span>
                    )}
                  </div>

                  <span style={{ fontSize: 12, color: '#C0BBB6', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* ── Expanded detail ── */}
              {isExpanded && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>

                  {/* Active outreach animation */}
                  {isActive && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 16px' }}>
                      <div style={{ position: 'relative', width: 72, height: 72, marginBottom: 12 }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid #F0EBE6' }} />
                        <div className="qtc-spin-cw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: O, animation: 'qtc-spin-cw 1.8s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                        <div className="qtc-spin-ccw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderBottomColor: G, animation: 'qtc-spin-ccw 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 30, color: O, lineHeight: 1 }}>h</div>
                      </div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, textAlign: 'center' }}>Your Homie's on it</div>
                      <div style={{ fontSize: 12, color: '#9B9490', textAlign: 'center', marginTop: 2 }}>Contacting pros in {j.zip_code}</div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: O, marginTop: 8, animation: 'qtc-pulse 2s infinite' }}>
                        Calling around so you don't have to
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  {j.diagnosis?.summary && (
                    <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 14, paddingTop: isActive ? 0 : 12 }}>
                      {j.diagnosis.summary}
                    </div>
                  )}

                  {/* Details grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
                    {[
                      { label: 'Category', value: catLabel },
                      { label: 'Severity', value: (j.diagnosis?.severity ?? 'medium').replace(/^\w/, c => c.toUpperCase()), color: j.diagnosis?.severity === 'high' ? '#DC2626' : j.diagnosis?.severity === 'low' ? G : D },
                      { label: 'Timing', value: j.preferred_timing ?? 'Flexible' },
                      { label: 'Payment', value: pm.text, color: pm.color },
                    ].map((item, i) => (
                      <div key={i} style={{ background: W, borderRadius: 8, padding: '7px 10px' }}>
                        <div style={{ fontSize: 9, color: '#9B9490', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: item.color ?? D }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Expiry */}
                  {j.expires_at && isActive && (
                    <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 12 }}>
                      Expires: {new Date(j.expires_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}

                  {/* AI Cost Estimate */}
                  {estimates[j.id] && (
                    <div style={{ marginBottom: 14 }}>
                      <EstimateCard estimate={estimates[j.id]} />
                    </div>
                  )}

                  {/* Provider Quotes */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: D, marginBottom: 8, letterSpacing: '0.02em' }}>
                      {responseCount > 0 ? `Provider Quotes (${responseCount})` : 'Provider Quotes'}
                    </div>

                    {loadingResponses === j.id ? (
                      <div style={{ color: '#9B9490', fontSize: 13 }}>Loading quotes...</div>
                    ) : responseCount === 0 ? (
                      <div style={{
                        background: W, borderRadius: 10, padding: '16px 14px', textAlign: 'center',
                        border: '1px dashed rgba(0,0,0,0.08)',
                      }}>
                        {isActive ? (
                          <>
                            <div style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>Waiting for providers to respond...</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                              {[0, 1, 2].map(i => (
                                <div key={i} style={{
                                  width: 6, height: 6, borderRadius: '50%', background: O,
                                  animation: `qtc-pulse 1.2s ${i * 0.3}s infinite`,
                                }} />
                              ))}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 13, color: '#9B9490' }}>No providers responded</div>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {jobResponses.map(r => (
                          <div key={r.id} style={{
                            background: W, borderRadius: 10, padding: '12px 14px',
                            border: '1px solid rgba(0,0,0,0.04)',
                          }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <div>
                                <span style={{ fontWeight: 600, fontSize: 14, color: D }}>{r.provider.name}</span>
                                <span style={{ color: '#9B9490', fontSize: 11, marginLeft: 6 }}>★ {r.provider.google_rating ?? 'N/A'} ({r.provider.review_count})</span>
                              </div>
                              {r.quoted_price && (
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: O }}>{r.quoted_price}</span>
                                  {estimates[j.id] ? (
                                    <EstimateBadge quotedPrice={r.quoted_price} estimateLow={estimates[j.id].estimateLowCents} estimateHigh={estimates[j.id].estimateHighCents} />
                                  ) : (
                                    <div style={{ fontSize: 10, color: '#9B9490', fontWeight: 500 }}>quoted price</div>
                                  )}
                                </div>
                              )}
                            </div>
                            {r.availability && <div style={{ fontSize: 12, color: D, marginBottom: 3 }}>📅 {r.availability}</div>}
                            {r.message && <div style={{ fontSize: 12, color: '#6B6560', fontStyle: 'italic' }}>"{r.message}"</div>}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                              <span style={{ fontSize: 11, color: '#9B9490' }}>via {r.channel} · {timeAgo(r.responded_at)}</span>
                              {r.provider.phone && (
                                <a href={`tel:${r.provider.phone}`} style={{ fontSize: 12, color: G, textDecoration: 'none', fontWeight: 600 }}>📞 Call</a>
                              )}
                            </div>
                            {!j.has_booking && !['expired', 'refunded'].includes(j.status) && (
                              <div style={{ marginTop: 10 }}>
                                <input
                                  id={`address-${r.id}`}
                                  placeholder="Enter your service address"
                                  onClick={e => e.stopPropagation()}
                                  style={{
                                    width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 14,
                                    border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: D,
                                    fontFamily: "'DM Sans', sans-serif", marginBottom: 8, boxSizing: 'border-box' as const,
                                  }}
                                />
                                <button onClick={async (e) => {
                                  e.stopPropagation();
                                  const addressInput = document.getElementById(`address-${r.id}`) as HTMLInputElement;
                                  const address = addressInput?.value?.trim();
                                  if (!address) { alert('Please enter your service address'); return; }
                                  try {
                                    await jobService.bookProvider(j.id, r.id, r.provider.id, address);
                                    setJobs(prev => prev.map(job => job.id === j.id ? { ...job, has_booking: true } : job));
                                  } catch (err) {
                                    alert((err as Error).message || 'Booking failed');
                                  }
                                }} style={{
                                  width: '100%', padding: '10px 0', borderRadius: 100, border: 'none',
                                  background: O, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                                  fontFamily: "'DM Sans', sans-serif",
                                }}>Book {r.provider.name.split(' ')[0]}</button>
                              </div>
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
        })}
      </div>
    </>
  );
}

/* -- Bookings Tab -- */
function BookingsTab() {
  const [bookings, setBookings] = useState<AccountBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    accountService.getBookings().then(res => {
      setBookings(res.data?.bookings || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div>;
  if (bookings.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: '#9B9490' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>&#128197;</div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>No bookings yet</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>Booked providers will appear here</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bookings.map(b => {
        const sc = STATUS_COLORS[b.status] || STATUS_COLORS.confirmed;
        return (
          <div key={b.id} style={{
            background: 'white', borderRadius: 14, padding: '16px 18px',
            border: '1px solid rgba(0,0,0,0.06)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: D }}>{b.provider.name}</div>
              <span style={{ background: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{b.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#6B6560', flexWrap: 'wrap' }}>
              {b.quoted_price && <span style={{ fontWeight: 600, color: O }}>{b.quoted_price}</span>}
              {b.scheduled && <span>&#128197; {b.scheduled}</span>}
              {b.provider.phone && <a href={`tel:${b.provider.phone}`} style={{ color: G, textDecoration: 'none' }}>&#128222; {b.provider.phone}</a>}
            </div>
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>{timeAgo(b.confirmed_at)}</div>
          </div>
        );
      })}
    </div>
  );
}

/* -- My Home Tab -- */
function MyHomeTab() {
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [homeState, setHomeState] = useState('');
  const [bedrooms, setBedrooms] = useState('');
  const [bathrooms, setBathrooms] = useState('');
  const [sqft, setSqft] = useState('');
  const [details, setDetails] = useState<PropertyDetails>({});
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    accountService.getHome().then(res => {
      if (res.data) {
        setHomeData(res.data);
        setAddress(res.data.address || '');
        setCity(res.data.city || '');
        setHomeState(res.data.state || '');
        setBedrooms(res.data.bedrooms != null ? String(res.data.bedrooms) : '');
        setBathrooms(res.data.bathrooms || '');
        setSqft(res.data.sqft != null ? String(res.data.sqft) : '');
        setDetails(res.data.details || {});
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  function toggleSection(key: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function updateDetails<K extends keyof PropertyDetails>(section: K, field: string, value: string | boolean) {
    setDetails(prev => ({
      ...prev,
      [section]: { ...(prev[section] as Record<string, unknown> ?? {}), [field]: value },
    }));
  }

  function updateApplianceDetails(appliance: string, field: string, value: string) {
    setDetails(prev => ({
      ...prev,
      appliances: {
        ...(prev.appliances ?? {}),
        [appliance]: { ...((prev.appliances as Record<string, Record<string, string>> ?? {})[appliance] ?? {}), [field]: value },
      },
    }));
  }

  async function handleSave() {
    setMsg(null);
    setSaving(true);
    try {
      const res = await accountService.updateHome({
        address: address || null,
        city: city || null,
        state: homeState || null,
        bedrooms: bedrooms ? parseInt(bedrooms) : null,
        bathrooms: bathrooms || null,
        sqft: sqft ? parseInt(sqft) : null,
        details: Object.keys(details).length > 0 ? details : null,
      });
      if (res.data) {
        setHomeData(res.data);
        setMsg({ type: 'success', text: 'Home details saved' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: (err as Error).message || 'Failed to save' });
    }
    setSaving(false);
  }

  if (loading) return <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div>;

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 12, fontSize: 15,
    border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: D,
    fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' as const,
    marginBottom: 0,
  };
  const labelStyle = { display: 'block' as const, fontSize: 13, fontWeight: 600, color: D, marginBottom: 6 };
  const sectionBtnStyle = {
    display: 'flex' as const, alignItems: 'center' as const, gap: 8, width: '100%',
    padding: '10px 14px', background: '#FAFAF8', border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: 600, color: D, textAlign: 'left' as const,
  };

  return (
    <div>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 14,
          background: msg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
          color: msg.type === 'success' ? '#16A34A' : '#DC2626',
          border: `1px solid ${msg.type === 'success' ? '#BBF7D0' : '#FECACA'}`,
        }}>{msg.text}</div>
      )}

      <div style={{ fontSize: 14, color: '#6B6560', marginBottom: 16, lineHeight: 1.5 }}>
        Save your home details so Homie can give you better diagnostics and more accurate quotes.
      </div>

      {/* Basic home info */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={labelStyle}>Street Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>City</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="San Diego" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>State</label>
            <input value={homeState} onChange={e => setHomeState(e.target.value)} maxLength={2} placeholder="CA" style={inputStyle} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Bedrooms</label>
            <input type="number" min={0} value={bedrooms} onChange={e => setBedrooms(e.target.value)} placeholder="3" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Bathrooms</label>
            <select value={bathrooms} onChange={e => setBathrooms(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">--</option>
              {['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6'].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Sq Ft</label>
            <input type="number" min={0} value={sqft} onChange={e => setSqft(e.target.value)} placeholder="1500" style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Equipment & Systems */}
      <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: D, marginBottom: 12 }}>Equipment & Systems</div>

        {/* HVAC */}
        <div style={{ marginBottom: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('hvac')} style={sectionBtnStyle}>
            <span style={{ fontSize: 11 }}>{openSections.has('hvac') ? '\u25BC' : '\u25B6'}</span>
            <span>HVAC & Climate</span>
          </button>
          {openSections.has('hvac') && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={labelStyle}>AC Type</label><input value={details.hvac?.acType || ''} onChange={e => updateDetails('hvac', 'acType', e.target.value)} placeholder="Central, Mini-split..." style={inputStyle} /></div>
                <div><label style={labelStyle}>AC Brand</label><input value={details.hvac?.acBrand || ''} onChange={e => updateDetails('hvac', 'acBrand', e.target.value)} placeholder="Carrier, Trane..." style={inputStyle} /></div>
                <div><label style={labelStyle}>AC Model</label><input value={details.hvac?.acModel || ''} onChange={e => updateDetails('hvac', 'acModel', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>AC Age</label><input value={details.hvac?.acAge || ''} onChange={e => updateDetails('hvac', 'acAge', e.target.value)} placeholder="5 years" style={inputStyle} /></div>
                <div><label style={labelStyle}>Heating Type</label><input value={details.hvac?.heatingType || ''} onChange={e => updateDetails('hvac', 'heatingType', e.target.value)} placeholder="Forced air, Radiant..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Heating Brand</label><input value={details.hvac?.heatingBrand || ''} onChange={e => updateDetails('hvac', 'heatingBrand', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Heating Model</label><input value={details.hvac?.heatingModel || ''} onChange={e => updateDetails('hvac', 'heatingModel', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Thermostat Brand</label><input value={details.hvac?.thermostatBrand || ''} onChange={e => updateDetails('hvac', 'thermostatBrand', e.target.value)} placeholder="Nest, Ecobee..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Thermostat Model</label><input value={details.hvac?.thermostatModel || ''} onChange={e => updateDetails('hvac', 'thermostatModel', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Filter Size</label><input value={details.hvac?.filterSize || ''} onChange={e => updateDetails('hvac', 'filterSize', e.target.value)} placeholder="20x25x1" style={inputStyle} /></div>
              </div>
            </div>
          )}
        </div>

        {/* Water Heater */}
        <div style={{ marginBottom: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('waterHeater')} style={sectionBtnStyle}>
            <span style={{ fontSize: 11 }}>{openSections.has('waterHeater') ? '\u25BC' : '\u25B6'}</span>
            <span>Water Heater</span>
          </button>
          {openSections.has('waterHeater') && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={labelStyle}>Type</label><input value={details.waterHeater?.type || ''} onChange={e => updateDetails('waterHeater', 'type', e.target.value)} placeholder="Tankless, Tank..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Brand</label><input value={details.waterHeater?.brand || ''} onChange={e => updateDetails('waterHeater', 'brand', e.target.value)} placeholder="Rinnai, Rheem..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Model</label><input value={details.waterHeater?.model || ''} onChange={e => updateDetails('waterHeater', 'model', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Age</label><input value={details.waterHeater?.age || ''} onChange={e => updateDetails('waterHeater', 'age', e.target.value)} placeholder="3 years" style={inputStyle} /></div>
                <div><label style={labelStyle}>Fuel</label><input value={details.waterHeater?.fuel || ''} onChange={e => updateDetails('waterHeater', 'fuel', e.target.value)} placeholder="Gas, Electric..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Capacity</label><input value={details.waterHeater?.capacity || ''} onChange={e => updateDetails('waterHeater', 'capacity', e.target.value)} placeholder="50 gallons" style={inputStyle} /></div>
                <div><label style={labelStyle}>Location</label><input value={details.waterHeater?.location || ''} onChange={e => updateDetails('waterHeater', 'location', e.target.value)} placeholder="Garage, Utility closet..." style={inputStyle} /></div>
              </div>
            </div>
          )}
        </div>

        {/* Appliances */}
        <div style={{ marginBottom: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('appliances')} style={sectionBtnStyle}>
            <span style={{ fontSize: 11 }}>{openSections.has('appliances') ? '\u25BC' : '\u25B6'}</span>
            <span>Appliances</span>
          </button>
          {openSections.has('appliances') && (
            <div style={{ padding: '12px 14px' }}>
              {[
                { key: 'refrigerator', label: 'Refrigerator', fields: ['brand', 'model'] },
                { key: 'washer', label: 'Washer', fields: ['brand', 'model'] },
                { key: 'dryer', label: 'Dryer', fields: ['brand', 'model', 'fuel'] },
                { key: 'dishwasher', label: 'Dishwasher', fields: ['brand', 'model'] },
                { key: 'oven', label: 'Oven/Stove', fields: ['brand', 'model', 'fuel'] },
                { key: 'disposal', label: 'Disposal', fields: ['brand'] },
                { key: 'microwave', label: 'Microwave', fields: ['brand', 'type'] },
              ].map(app => (
                <div key={app.key} style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', marginBottom: 4 }}>{app.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: app.fields.length > 2 ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8 }}>
                    {app.fields.map(f => (
                      <div key={f}>
                        <label style={labelStyle}>{f.charAt(0).toUpperCase() + f.slice(1)}</label>
                        <input value={((details.appliances as Record<string, Record<string, string>> | undefined)?.[app.key]?.[f]) || ''} onChange={e => updateApplianceDetails(app.key, f, e.target.value)} style={inputStyle} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Plumbing */}
        <div style={{ marginBottom: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('plumbing')} style={sectionBtnStyle}>
            <span style={{ fontSize: 11 }}>{openSections.has('plumbing') ? '\u25BC' : '\u25B6'}</span>
            <span>Plumbing</span>
          </button>
          {openSections.has('plumbing') && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={labelStyle}>Kitchen Faucet Brand</label><input value={details.plumbing?.kitchenFaucetBrand || ''} onChange={e => updateDetails('plumbing', 'kitchenFaucetBrand', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Bathroom Faucet Brand</label><input value={details.plumbing?.bathroomFaucetBrand || ''} onChange={e => updateDetails('plumbing', 'bathroomFaucetBrand', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Toilet Brand</label><input value={details.plumbing?.toiletBrand || ''} onChange={e => updateDetails('plumbing', 'toiletBrand', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Water Softener</label><input value={details.plumbing?.waterSoftener || ''} onChange={e => updateDetails('plumbing', 'waterSoftener', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Septic or Sewer</label><input value={details.plumbing?.septicOrSewer || ''} onChange={e => updateDetails('plumbing', 'septicOrSewer', e.target.value)} placeholder="Septic, Municipal sewer" style={inputStyle} /></div>
                <div><label style={labelStyle}>Main Shutoff Location</label><input value={details.plumbing?.mainShutoffLocation || ''} onChange={e => updateDetails('plumbing', 'mainShutoffLocation', e.target.value)} style={inputStyle} /></div>
              </div>
            </div>
          )}
        </div>

        {/* Electrical */}
        <div style={{ marginBottom: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('electrical')} style={sectionBtnStyle}>
            <span style={{ fontSize: 11 }}>{openSections.has('electrical') ? '\u25BC' : '\u25B6'}</span>
            <span>Electrical</span>
          </button>
          {openSections.has('electrical') && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={labelStyle}>Breaker Box Location</label><input value={details.electrical?.breakerBoxLocation || ''} onChange={e => updateDetails('electrical', 'breakerBoxLocation', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Panel Amperage</label><input value={details.electrical?.panelAmperage || ''} onChange={e => updateDetails('electrical', 'panelAmperage', e.target.value)} placeholder="100A, 200A..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Generator Type</label><input value={details.electrical?.generatorType || ''} onChange={e => { updateDetails('electrical', 'generatorType', e.target.value); updateDetails('electrical', 'hasGenerator', e.target.value.length > 0); }} placeholder="Standby, Portable..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Solar System</label><input value={details.electrical?.solarSystem || ''} onChange={e => { updateDetails('electrical', 'solarSystem', e.target.value); updateDetails('electrical', 'hasSolar', e.target.value.length > 0); }} placeholder="Tesla, SunPower..." style={inputStyle} /></div>
                <div><label style={labelStyle}>EV Charger Brand</label><input value={details.electrical?.evChargerBrand || ''} onChange={e => { updateDetails('electrical', 'evChargerBrand', e.target.value); updateDetails('electrical', 'hasEvCharger', e.target.value.length > 0); }} placeholder="Tesla, ChargePoint..." style={inputStyle} /></div>
              </div>
            </div>
          )}
        </div>

        {/* Pool & Spa */}
        <div style={{ marginBottom: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('poolSpa')} style={sectionBtnStyle}>
            <span style={{ fontSize: 11 }}>{openSections.has('poolSpa') ? '\u25BC' : '\u25B6'}</span>
            <span>Pool & Spa</span>
          </button>
          {openSections.has('poolSpa') && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={labelStyle}>Pool Type</label><input value={details.poolSpa?.poolType || ''} onChange={e => updateDetails('poolSpa', 'poolType', e.target.value)} placeholder="In-ground, Above-ground..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Pool Heater Brand</label><input value={details.poolSpa?.poolHeaterBrand || ''} onChange={e => updateDetails('poolSpa', 'poolHeaterBrand', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Pool Pump Brand</label><input value={details.poolSpa?.poolPumpBrand || ''} onChange={e => updateDetails('poolSpa', 'poolPumpBrand', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Hot Tub Brand</label><input value={details.poolSpa?.hotTubBrand || ''} onChange={e => updateDetails('poolSpa', 'hotTubBrand', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Hot Tub Model</label><input value={details.poolSpa?.hotTubModel || ''} onChange={e => updateDetails('poolSpa', 'hotTubModel', e.target.value)} style={inputStyle} /></div>
              </div>
            </div>
          )}
        </div>

        {/* Exterior */}
        <div style={{ marginBottom: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('exterior')} style={sectionBtnStyle}>
            <span style={{ fontSize: 11 }}>{openSections.has('exterior') ? '\u25BC' : '\u25B6'}</span>
            <span>Exterior</span>
          </button>
          {openSections.has('exterior') && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={labelStyle}>Roof Type</label><input value={details.exterior?.roofType || ''} onChange={e => updateDetails('exterior', 'roofType', e.target.value)} placeholder="Shingle, Tile, Metal..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Roof Age</label><input value={details.exterior?.roofAge || ''} onChange={e => updateDetails('exterior', 'roofAge', e.target.value)} placeholder="10 years" style={inputStyle} /></div>
                <div><label style={labelStyle}>Siding Material</label><input value={details.exterior?.sidingMaterial || ''} onChange={e => updateDetails('exterior', 'sidingMaterial', e.target.value)} placeholder="Vinyl, Wood, Stucco..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Fence Material</label><input value={details.exterior?.fenceMaterial || ''} onChange={e => updateDetails('exterior', 'fenceMaterial', e.target.value)} placeholder="Wood, Vinyl, Iron..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Garage Door Brand</label><input value={details.exterior?.garageDoorBrand || ''} onChange={e => updateDetails('exterior', 'garageDoorBrand', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Irrigation Brand</label><input value={details.exterior?.irrigationBrand || ''} onChange={e => updateDetails('exterior', 'irrigationBrand', e.target.value)} placeholder="Rachio, Hunter..." style={inputStyle} /></div>
              </div>
            </div>
          )}
        </div>

        {/* Access & Security */}
        <div style={{ marginBottom: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('access')} style={sectionBtnStyle}>
            <span style={{ fontSize: 11 }}>{openSections.has('access') ? '\u25BC' : '\u25B6'}</span>
            <span>Access & Security</span>
          </button>
          {openSections.has('access') && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={labelStyle}>Lockbox Code</label><input value={details.access?.lockboxCode || ''} onChange={e => updateDetails('access', 'lockboxCode', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Gate Code</label><input value={details.access?.gateCode || ''} onChange={e => updateDetails('access', 'gateCode', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Alarm Brand</label><input value={details.access?.alarmBrand || ''} onChange={e => updateDetails('access', 'alarmBrand', e.target.value)} placeholder="ADT, Ring..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Alarm Code</label><input value={details.access?.alarmCode || ''} onChange={e => updateDetails('access', 'alarmCode', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>WiFi Network</label><input value={details.access?.wifiNetwork || ''} onChange={e => updateDetails('access', 'wifiNetwork', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>WiFi Password</label><input value={details.access?.wifiPassword || ''} onChange={e => updateDetails('access', 'wifiPassword', e.target.value)} style={inputStyle} /></div>
              </div>
            </div>
          )}
        </div>

        {/* General */}
        <div style={{ marginBottom: 8, border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, overflow: 'hidden' }}>
          <button onClick={() => toggleSection('general')} style={sectionBtnStyle}>
            <span style={{ fontSize: 11 }}>{openSections.has('general') ? '\u25BC' : '\u25B6'}</span>
            <span>General</span>
          </button>
          {openSections.has('general') && (
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div><label style={labelStyle}>Year Built</label><input value={details.general?.yearBuilt || ''} onChange={e => updateDetails('general', 'yearBuilt', e.target.value)} placeholder="2005" style={inputStyle} /></div>
                <div>
                  <label style={labelStyle}>HOA</label>
                  <select value={details.general?.hasHoa ? 'yes' : 'no'} onChange={e => updateDetails('general', 'hasHoa', e.target.value === 'yes')} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                <div><label style={labelStyle}>HOA Contact</label><input value={details.general?.hoaContact || ''} onChange={e => updateDetails('general', 'hoaContact', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Pest Control Provider</label><input value={details.general?.pestControlProvider || ''} onChange={e => updateDetails('general', 'pestControlProvider', e.target.value)} style={inputStyle} /></div>
                <div><label style={labelStyle}>Pest Control Frequency</label><input value={details.general?.pestControlFrequency || ''} onChange={e => updateDetails('general', 'pestControlFrequency', e.target.value)} placeholder="Monthly, Quarterly..." style={inputStyle} /></div>
                <div><label style={labelStyle}>Cleaning Notes</label><input value={details.general?.cleaningNotes || ''} onChange={e => updateDetails('general', 'cleaningNotes', e.target.value)} style={inputStyle} /></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} style={{
        marginTop: 8, padding: '14px 0', borderRadius: 100, border: 'none', fontSize: 16, fontWeight: 600,
        background: O, color: 'white', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1,
        fontFamily: "'DM Sans', sans-serif", width: '100%',
      }}>{saving ? 'Saving...' : 'Save Home Details'}</button>
    </div>
  );
}

/* -- Main Account Page -- */
export default function Account() {
  useDocumentTitle('My Account');
  const navigate = useNavigate();
  const { isAuthenticated, homeowner } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as Tab) || 'profile';

  useEffect(() => {
    if (!isAuthenticated) navigate('/login');
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
      {/* Header */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
        padding: '0 20px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}>
        <span onClick={() => navigate('/')} style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: O, cursor: 'pointer' }}>homie</span>
        <AvatarDropdown />
      </nav>

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 80px' }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: D, marginBottom: 24 }}>
          Welcome back{homeowner?.first_name ? `, ${homeowner.first_name}` : ''}!
        </h1>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, borderBottom: '1px solid rgba(0,0,0,0.06)', paddingBottom: 0 }}>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setSearchParams({ tab })} style={{
              padding: '10px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              background: 'none', border: 'none', borderBottom: activeTab === tab ? `2px solid ${O}` : '2px solid transparent',
              color: activeTab === tab ? O : '#9B9490', fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.15s', marginBottom: -1,
            }}>{TAB_LABELS[tab]}</button>
          ))}
        </div>

        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'home' && <MyHomeTab />}
        {activeTab === 'quotes' && <QuotesTab />}
        {activeTab === 'bookings' && <BookingsTab />}
      </div>
    </div>
  );
}
