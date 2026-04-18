import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { accountService, jobService, estimateService, businessService, type AccountProfile, type AccountJob, type AccountBooking, type ProviderResponseItem, type HomeData, type PropertyDetails, type PropertyScan, type CostEstimate } from '@/services/api';
import { inspectService } from '@/services/inspector-api';
import EstimateCard from '@/components/EstimateCard';
import EstimateBadge from '@/components/EstimateBadge';
import AccountLayout from './account/AccountLayout';
import AccountSidebar, { type AccountTab } from './account/AccountSidebar';
import DashboardSection from './account/DashboardSection';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

const TABS = ['dashboard', 'quotes', 'bookings', 'home', 'profile'] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: '#EFF6FF', text: '#2563EB' },
  dispatching: { bg: '#FFF7ED', text: '#C2410C' },
  collecting: { bg: '#F5F3FF', text: '#7C3AED' },
  completed: { bg: '#F0FDF4', text: '#16A34A' },
  expired: { bg: '#F5F5F5', text: '#9B9490' },
  refunded: { bg: '#FEF2F2', text: '#DC2626' },
  confirmed: { bg: '#F0FDF4', text: '#16A34A' },
};

/** Normalize price for display */
function cleanPrice(price: string): string {
  let p = price.replace(/^\$+/, '$');
  const bm = p.match(/between\s+\$?(\d+(?:\.\d+)?)\s*(?:and|to)\s*\$?(\d+(?:\.\d+)?)/i);
  if (bm) return `$${bm[1]}-$${bm[2]}`;
  const rm = p.match(/^(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)$/);
  if (rm) return `$${rm[1]}-$${rm[2]}`;
  const nm = p.match(/^(\d+(?:\.\d+)?)$/);
  if (nm) return `$${nm[1]}`;
  const em = p.match(/(?:is|are|be|charge|cost|runs?|pay)\s+(?:about|around)?\s*\$?(\d+(?:\.\d+)?)/i);
  if (em) return `$${em[1]}`;
  const lp = p.match(/^\$(\d+(?:\.\d+)?)\s+\w/);
  if (lp) return `$${lp[1]}`;
  const ln = p.match(/^(\d+(?:\.\d+)?)\s+(?:service|for|per|flat|call|visit|fee|charge|total)/i);
  if (ln) return `$${ln[1]}`;
  return p;
}

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
  const [title, setTitle] = useState('');
  const [notifyEmailQuotes, setNotifyEmailQuotes] = useState(true);
  const [notifySmsQuotes, setNotifySmsQuotes] = useState(true);
  const [notifyEmailBookings, setNotifyEmailBookings] = useState(true);
  const [notifySmsBookings, setNotifySmsBookings] = useState(true);
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
        setTitle(res.data.title || '');
        setNotifyEmailQuotes(res.data.notify_email_quotes);
        setNotifySmsQuotes(res.data.notify_sms_quotes);
        setNotifyEmailBookings(res.data.notify_email_bookings);
        setNotifySmsBookings(res.data.notify_sms_bookings);
      }
    });
  }, []);

  async function handleSave() {
    setMsg(null);
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      if (firstName !== (profile?.first_name || '')) updates.first_name = firstName;
      if (lastName !== (profile?.last_name || '')) updates.last_name = lastName;
      if (email !== profile?.email) updates.email = email;
      if (phone !== (profile?.phone || '')) updates.phone = phone;
      if (zip !== profile?.zip_code) updates.zip_code = zip;
      if (title !== (profile?.title || '')) updates.title = title;
      if (notifyEmailQuotes !== profile?.notify_email_quotes) updates.notify_email_quotes = notifyEmailQuotes;
      if (notifySmsQuotes !== profile?.notify_sms_quotes) updates.notify_sms_quotes = notifySmsQuotes;
      if (notifyEmailBookings !== profile?.notify_email_bookings) updates.notify_email_bookings = notifyEmailBookings;
      if (notifySmsBookings !== profile?.notify_sms_bookings) updates.notify_sms_bookings = notifySmsBookings;
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
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: D, marginBottom: 6, display: 'block' }}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Property Manager" style={inputStyle} />
        </div>

        <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 16, marginTop: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 12 }}>Notification Preferences</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {([
              { label: 'Email notifications for quotes', value: notifyEmailQuotes, set: setNotifyEmailQuotes },
              { label: 'SMS notifications for quotes', value: notifySmsQuotes, set: setNotifySmsQuotes },
              { label: 'Email notifications for bookings', value: notifyEmailBookings, set: setNotifyEmailBookings },
              { label: 'SMS notifications for bookings', value: notifySmsBookings, set: setNotifySmsBookings },
            ] as const).map((item, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: D }}>{item.label}</span>
                <button onClick={() => item.set(!item.value)} style={{
                  width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: item.value ? G : '#ccc', position: 'relative', transition: 'background 0.2s',
                  flexShrink: 0,
                }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', background: '#fff',
                    position: 'absolute', top: 2, left: item.value ? 18 : 2,
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>
            ))}
          </div>
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

const ENCOURAGEMENT_MSGS = [
  'Calling around so you don\u2019t have to',
  'Nobody got you like your Homie',
  'Sit tight \u2014 quotes incoming',
  'Making moves behind the scenes',
];

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
@keyframes qtc-rotate-msgs {
  0%, 22% { transform: translateY(0); }
  25%, 47% { transform: translateY(-25%); }
  50%, 72% { transform: translateY(-50%); }
  75%, 97% { transform: translateY(-75%); }
}
@media (prefers-reduced-motion: reduce) {
  .qtc-spin-cw, .qtc-spin-ccw, .qtc-msg-rotate { animation: none !important; }
}
`;

function QuotesTab() {
  const [jobs, setJobs] = useState<AccountJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, ProviderResponseItem[]>>({});
  const [loadingResponses, setLoadingResponses] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<Record<string, CostEstimate>>({});
  const [homeAddress, setHomeAddress] = useState('');

  useEffect(() => {
    accountService.getJobs().then(res => {
      setJobs(res.data?.jobs || []);
      setLoading(false);
    }).catch(() => setLoading(false));
    accountService.getHome().then(res => {
      if (res.data?.address) {
        const parts = [res.data.address, res.data.city, res.data.state].filter(Boolean);
        setHomeAddress(parts.join(', '));
      }
    }).catch(() => {});
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
                      <div style={{ height: 18, overflow: 'hidden', marginTop: 8, textAlign: 'center' }}>
                        <div className="qtc-msg-rotate" style={{ animation: 'qtc-rotate-msgs 10s ease-in-out infinite' }}>
                          {ENCOURAGEMENT_MSGS.map((msg, i) => (
                            <div key={i} style={{ height: 18, lineHeight: '18px', fontSize: 12, fontWeight: 500, color: O }}>{msg}</div>
                          ))}
                        </div>
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
                                {r.is_late && (
                                  <span title="Quote arrived after the dispatch auto-expired"
                                    style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#D4A437', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.04em', marginLeft: 6 }}>LATE</span>
                                )}
                                <span style={{ color: '#9B9490', fontSize: 11, marginLeft: 6 }}>★ {r.provider.google_rating ?? 'N/A'} ({r.provider.review_count})</span>
                                {r.provider.google_place_id && (
                                  <a href={`https://www.google.com/maps/place/?q=place_id:${r.provider.google_place_id}`} target="_blank" rel="noopener" onClick={e => e.stopPropagation()} style={{ fontSize: 10, color: '#2563EB', textDecoration: 'none', fontWeight: 600, marginLeft: 6 }}>Reviews</a>
                                )}
                              </div>
                              {r.quoted_price && (
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                                  <span style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: O }}>{cleanPrice(r.quoted_price)}</span>
                                  {estimates[j.id] ? (
                                    <EstimateBadge quotedPrice={cleanPrice(r.quoted_price)} estimateLow={estimates[j.id].estimateLowCents} estimateHigh={estimates[j.id].estimateHighCents} />
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
                            {!j.has_booking && !['archived', 'refunded'].includes(j.status) && (
                              <div style={{ marginTop: 10 }}>
                                <input
                                  id={`address-${r.id}`}
                                  defaultValue={homeAddress}
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
              {b.quoted_price && <span style={{ fontWeight: 600, color: O }}>{cleanPrice(b.quoted_price)}</span>}
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
/* ── Consumer AI Home Scan ──────────────────────────────────────────────── */

const ROOM_OPTIONS_CONSUMER = [
  'kitchen', 'dining_room', 'living_room',
  'master_bedroom', 'bedroom',
  'master_bathroom', 'bathroom', 'half_bathroom',
  'laundry', 'mechanical_room', 'garage',
  'office', 'hallway',
  'patio', 'pool_area', 'exterior_front', 'exterior_back',
  'other',
];

function prettifyItemType(type: string): string {
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function ConsumerScanCard({ onDetailsUpdated }: { onDetailsUpdated: () => void }) {
  const [history, setHistory] = useState<PropertyScan[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    accountService.getHomeScanHistory().then(res => {
      if (res.data) setHistory(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const latest = history.find(s => s.status === 'completed' || s.status === 'review_pending');

  async function handleStart() {
    setStarting(true);
    try {
      const res = await accountService.startHomeScan('full');
      if (res.data) setActiveScanId(res.data.id);
    } catch { alert('Failed to start scan'); }
    setStarting(false);
  }

  if (loading) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {!latest ? (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.08)',
          padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📱</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 600, color: D, marginBottom: 6 }}>
            Scan your home
          </div>
          <div style={{ fontSize: 13, color: '#6B6560', maxWidth: 420, margin: '0 auto 16px', lineHeight: 1.5 }}>
            Walk through your home with your camera. The AI catalogs appliances, systems, and features so Homie can give you better diagnostics and faster quotes.
          </div>
          <button onClick={handleStart} disabled={starting}
            style={{
              padding: '12px 28px', borderRadius: 100, border: 'none',
              background: O, color: '#fff', fontSize: 14, fontWeight: 600,
              cursor: starting ? 'default' : 'pointer', opacity: starting ? 0.6 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}>{starting ? 'Starting...' : 'Start home scan'}</button>
        </div>
      ) : (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.08)',
          padding: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 22 }}>📱</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 700, color: D }}>Home inventory</div>
              <div style={{ fontSize: 11, color: '#9B9490' }}>
                Last scanned {new Date(latest.completedAt || latest.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 14, fontSize: 12, color: '#6B6560' }}>
            <span><strong style={{ color: D }}>{latest.itemsCataloged}</strong> items</span>
            <span>·</span>
            <span><strong style={{ color: G }}>{latest.roomsScanned}</strong> rooms</span>
          </div>
          <button onClick={handleStart} disabled={starting}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: O, color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: starting ? 'default' : 'pointer', opacity: starting ? 0.6 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}>{starting ? 'Starting...' : 'Rescan home'}</button>
        </div>
      )}

      {activeScanId && (
        <ConsumerScanModal
          scanId={activeScanId}
          onClose={() => setActiveScanId(null)}
          onComplete={() => {
            setActiveScanId(null);
            onDetailsUpdated();
            accountService.getHomeScanHistory().then(res => {
              if (res.data) setHistory(res.data);
            }).catch(() => {});
          }}
        />
      )}
    </div>
  );
}

function ConsumerScanModal({ scanId, onClose, onComplete }: { scanId: string; onClose: () => void; onComplete: () => void }) {
  const [currentRoom, setCurrentRoom] = useState<string>('kitchen');
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [detected, setDetected] = useState<Array<{ id: string; itemType: string; brand: string | null; confidence: number }>>([]);
  const [coaching, setCoaching] = useState<string>("Let's start in the kitchen. Slowly pan your camera and capture the appliances.");
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [flash, setFlash] = useState<{ items: string[]; key: number } | null>(null);
  const [roomProgress, setRoomProgress] = useState<{ expected: string[]; captured: string[]; remaining: string[] } | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Camera setup
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setCameraError('Camera not available'); return; }
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
        });
        if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
        setStream(s);
      } catch (err) { setCameraError((err as Error).message || 'Camera denied'); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!stream || !videoRef.current) return;
    const v = videoRef.current;
    v.srcObject = stream;
    const tryPlay = () => v.play().then(() => setCameraReady(true)).catch(() => {
      setTimeout(() => v.play().then(() => setCameraReady(true)).catch(() => {}), 200);
    });
    if (v.readyState >= 2) tryPlay(); else v.onloadedmetadata = tryPlay;
    return () => { v.onloadedmetadata = null; };
  }, [stream]);

  useEffect(() => () => { stream?.getTracks().forEach(t => t.stop()); }, [stream]);

  // Fetch coaching on room change
  useEffect(() => {
    let c = false;
    accountService.getHomeScanCoaching(scanId, { current_room: currentRoom, last_detected_items: [] })
      .then(res => { if (!c && res.data?.message) setCoaching(res.data.message); if (!c && res.data?.roomProgress) setRoomProgress(res.data.roomProgress); }).catch(() => {});
    return () => { c = true; };
  }, [scanId, currentRoom]);

  function showFlash(items: string[]) {
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    setFlash({ items, key: Date.now() });
    flashTimerRef.current = window.setTimeout(() => setFlash(null), 1800);
  }

  async function captureAndProcess() {
    if (uploading || !cameraReady || !videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    let dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    if (dataUrl.length > 4_000_000) {
      const img = new Image();
      await new Promise<void>((resolve) => { img.onload = () => resolve(); img.src = dataUrl; });
      const c2 = document.createElement('canvas');
      const ratio = Math.min(1600 / img.width, 1600 / img.height, 1);
      c2.width = Math.round(img.width * ratio); c2.height = Math.round(img.height * ratio);
      c2.getContext('2d')!.drawImage(img, 0, 0, c2.width, c2.height);
      dataUrl = c2.toDataURL('image/jpeg', 0.85);
    }
    setUploading(true); setError(null);
    try {
      const res = await accountService.uploadHomeScanPhoto(scanId, { image_data_url: dataUrl, room_hint: currentRoom });
      if (res.data) {
        const newItems = res.data.itemsDetected;
        for (const item of newItems) setDetected(prev => [...prev, { id: item.id, itemType: item.itemType, brand: item.brand, confidence: item.confidence }]);
        if (newItems.length > 0) showFlash(newItems.map(i => `${i.brand || ''} ${prettifyItemType(i.itemType)}`.trim()));
        try {
          const cr = await accountService.getHomeScanCoaching(scanId, { current_room: currentRoom, last_detected_items: newItems.map(i => ({ itemType: i.itemType, brand: i.brand, confidence: i.confidence })) });
          if (cr.data?.message) setCoaching(cr.data.message);
          if (cr.data?.roomProgress) setRoomProgress(cr.data.roomProgress);
        } catch { /* ignore */ }
      }
    } catch (err) { setError((err as Error).message || 'Failed to process'); }
    setUploading(false);
  }

  async function handleComplete() {
    setCompleting(true);
    try { await accountService.completeHomeScan(scanId); onComplete(); }
    catch (err) { setError((err as Error).message || 'Failed to complete'); }
    setCompleting(false);
  }

  const nextRoomIdx = ROOM_OPTIONS_CONSUMER.indexOf(currentRoom);
  const nextRoom = ROOM_OPTIONS_CONSUMER[(nextRoomIdx + 1) % ROOM_OPTIONS_CONSUMER.length];

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', sans-serif", color: '#fff' }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: cameraReady ? 1 : 0 }} />
        {!cameraReady && !cameraError && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9B9490', fontSize: 13 }}>Requesting camera...</div>}
        {cameraError && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
            <div style={{ fontSize: 14, marginBottom: 8 }}>{cameraError}</div>
            <button onClick={() => fileInputRef.current?.click()} style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: O, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Upload photos instead</button>
          </div>
        )}
        {/* Top header */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 100%)', padding: '14px 16px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', width: 34, height: 34, borderRadius: 17, fontSize: 16, cursor: 'pointer' }}>×</button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Home scan</div>
              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 2 }}>{detected.length} item{detected.length === 1 ? '' : 's'} found · {prettifyItemType(currentRoom)}</div>
            </div>
            <button onClick={handleComplete} disabled={completing} style={{ background: G, border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: completing ? 'default' : 'pointer', opacity: completing ? 0.5 : 1 }}>{completing ? 'Ending…' : 'End scan'}</button>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '10px 14px', fontSize: 13, lineHeight: 1.45, border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 16, marginRight: 6 }}>🤖</span>{coaching}
          </div>
          {roomProgress && roomProgress.expected.length > 0 && (
            <div style={{ marginTop: 8, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '10px 14px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Checklist</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: roomProgress.remaining.length === 0 ? '#5DDB9D' : '#fff' }}>{roomProgress.captured.length} of {roomProgress.expected.length}</span>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {roomProgress.expected.map(t => {
                  const done = roomProgress.captured.includes(t);
                  return <span key={t} style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 100, background: done ? 'rgba(93,219,157,0.22)' : 'rgba(255,255,255,0.08)', color: done ? '#5DDB9D' : 'rgba(255,255,255,0.7)', border: `1px solid ${done ? 'rgba(93,219,157,0.4)' : 'rgba(255,255,255,0.15)'}`, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{done ? '✓ ' : ''}{prettifyItemType(t)}</span>;
                })}
              </div>
            </div>
          )}
        </div>
        {/* Flash */}
        {flash && (
          <div key={flash.key} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, pointerEvents: 'none', zIndex: 5, animation: 'csFlash 1.8s ease forwards' }}>
            <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'rgba(27,158,119,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', border: '3px solid rgba(255,255,255,0.55)' }}>
              <svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', padding: '10px 18px', borderRadius: 14, fontSize: 13, fontWeight: 700, color: '#fff', maxWidth: 280, textAlign: 'center', lineHeight: 1.4, border: '1px solid rgba(255,255,255,0.18)' }}>
              {flash.items.slice(0, 3).join(', ')}{flash.items.length > 3 && ` +${flash.items.length - 3} more`}
            </div>
          </div>
        )}
        <style>{`@keyframes csFlash { 0% { opacity:0; transform:translate(-50%,-50%) scale(0.55); } 18% { opacity:1; transform:translate(-50%,-50%) scale(1.08); } 30% { transform:translate(-50%,-50%) scale(1); } 78% { opacity:1; } 100% { opacity:0; } }`}</style>
        {error && <div style={{ position: 'absolute', bottom: 200, left: 16, right: 16, background: '#FEF2F2', color: '#991B1B', padding: 10, borderRadius: 8, fontSize: 12, textAlign: 'center' }}>{error}</div>}
      </div>
      {/* Bottom bar */}
      <div style={{ background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(12px)', padding: '14px 16px 24px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ marginBottom: 12 }}>
          <select value={currentRoom} onChange={e => setCurrentRoom(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
            {ROOM_OPTIONS_CONSUMER.map(r => <option key={r} value={r} style={{ color: '#000' }}>{prettifyItemType(r)}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <button onClick={() => { const next = ROOM_OPTIONS_CONSUMER[(ROOM_OPTIONS_CONSUMER.indexOf(currentRoom) + 1) % ROOM_OPTIONS_CONSUMER.length]; setCurrentRoom(next); setRoomProgress(null); }}
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '10px 14px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Next: {prettifyItemType(nextRoom)} ›
          </button>
          <button onClick={captureAndProcess} disabled={uploading || !cameraReady} aria-label="Capture" style={{ width: 72, height: 72, borderRadius: '50%', background: '#fff', border: '4px solid rgba(255,255,255,0.4)', cursor: uploading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: uploading ? 0.6 : 1 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: uploading ? '#9B9490' : O }} />
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={async (e) => {
            const files = Array.from(e.target.files || []); e.target.value = '';
            for (const file of files) {
              if (file.size > 8 * 1024 * 1024) continue;
              const dataUrl = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(file); });
              setUploading(true);
              try {
                const result = await accountService.uploadHomeScanPhoto(scanId, { image_data_url: dataUrl, room_hint: currentRoom });
                if (result.data) {
                  for (const item of result.data.itemsDetected) setDetected(prev => [...prev, { id: item.id, itemType: item.itemType, brand: item.brand, confidence: item.confidence }]);
                  if (result.data.itemsDetected.length > 0) showFlash(result.data.itemsDetected.map(i => `${i.brand || ''} ${prettifyItemType(i.itemType)}`.trim()));
                }
              } catch { /* ignore */ }
              setUploading(false);
            }
          }} />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '10px 16px', borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Upload</button>
        </div>
      </div>
    </div>
  );
}

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

      {/* AI Home Scan */}
      <ConsumerScanCard
        onDetailsUpdated={() => {
          // Refresh home data after scan fills in details
          accountService.getHome().then(res => {
            if (res.data) {
              setHomeData(res.data);
              setDetails(res.data.details || {});
            }
          }).catch(() => {});
        }}
      />

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
  const rawTab = searchParams.get('tab');
  const activeTab: AccountTab = (TABS as readonly string[]).includes(rawTab ?? '')
    ? (rawTab as AccountTab)
    : 'dashboard';

  const [hasWorkspace, setHasWorkspace] = useState(false);
  const [hasInspectReports, setHasInspectReports] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('homieAccountSidebarCollapsed') === '1';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleSidebarCollapse(v: boolean) {
    setSidebarCollapsed(v);
    if (typeof window !== 'undefined') window.localStorage.setItem('homieAccountSidebarCollapsed', v ? '1' : '0');
  }

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    businessService.listWorkspaces().then(res => {
      if (res.data && res.data.length > 0) setHasWorkspace(true);
    }).catch(() => {});
    inspectService.getMyReports().then(res => {
      if (res.data?.reports && res.data.reports.length > 0) setHasInspectReports(true);
    }).catch(() => {});
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  function handleNavigate(tab: AccountTab) {
    if (tab === 'dashboard') {
      // Keep URL clean for the default tab
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab });
    }
  }

  const userName = homeowner?.first_name && homeowner?.last_name
    ? `${homeowner.first_name} ${homeowner.last_name}`
    : homeowner?.first_name || homeowner?.email?.split('@')[0] || 'Account';
  const userInitials = (() => {
    const fn = homeowner?.first_name?.[0] ?? '';
    const ln = homeowner?.last_name?.[0] ?? '';
    const fallback = homeowner?.email?.[0]?.toUpperCase() ?? 'U';
    return ((fn + ln) || fallback).toUpperCase();
  })();

  const sidebar = (
    <AccountSidebar
      collapsed={sidebarCollapsed}
      setCollapsed={handleSidebarCollapse}
      activeTab={activeTab}
      onNavigate={handleNavigate}
      onNewQuote={() => navigate('/quote')}
      hasInspectReports={hasInspectReports}
      hasWorkspace={hasWorkspace}
      userName={userName}
      userInitials={userInitials}
    />
  );

  const sidebarMobile = (
    <AccountSidebar
      collapsed={false}
      setCollapsed={() => {}}
      activeTab={activeTab}
      onNavigate={handleNavigate}
      onNewQuote={() => navigate('/quote')}
      hasInspectReports={hasInspectReports}
      hasWorkspace={hasWorkspace}
      userName={userName}
      userInitials={userInitials}
      onNavigateCallback={() => setMobileOpen(false)}
    />
  );

  return (
    <AccountLayout
      sidebar={sidebar}
      sidebarMobile={sidebarMobile}
      mobileOpen={mobileOpen}
      setMobileOpen={setMobileOpen}
    >
      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
      {activeTab === 'dashboard' && (
        <DashboardSection
          userFirstName={homeowner?.first_name ?? null}
          onNavigate={handleNavigate}
          onNewQuote={() => navigate('/quote')}
          onDiagnostic={() => navigate('/chat')}
        />
      )}
      {activeTab === 'profile' && <ProfileTab />}
      {activeTab === 'home' && <MyHomeTab />}
      {activeTab === 'quotes' && <QuotesTab />}
      {activeTab === 'bookings' && <BookingsTab />}
    </AccountLayout>
  );
}
