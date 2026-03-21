import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useProviderAuth } from '@/contexts/ProviderAuthContext';
import { portalService, type DashboardStats, type IncomingJob, type HistoryJob, type ProviderProfile, type ProviderSettings } from '@/services/provider-api';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

const TABS = ['dashboard', 'jobs', 'history', 'profile', 'settings'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = { dashboard: 'Dashboard', jobs: 'Incoming', history: 'History', profile: 'Profile', settings: 'Settings' };

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
      await portalService.respondToJob(attemptId, { action, quoted_price: quote || undefined, availability: avail || undefined, message: msg || undefined });
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
          {j.diagnosis?.summary && <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.5, marginBottom: 6 }}>{j.diagnosis.summary}</div>}
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: '#9B9490' }}>
            <span>{j.zip_code}</span>
            <span>{j.tier} tier</span>
            {j.timing && <span>{j.timing}</span>}
            {j.budget && <span>{j.budget}</span>}
          </div>

          {expanded === j.attempt_id && (
            <div style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.06)', paddingTop: 14 }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                <input value={quote} onChange={e => setQuote(e.target.value)} placeholder="Your price estimate (e.g. $150-200)" style={inputStyle} />
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
                {j.diagnosis?.summary && <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.4 }}>{j.diagnosis.summary}</div>}
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
  'Plumbing', 'Electrical', 'HVAC', 'Appliance Repair', 'Roofing', 'Garage Door',
  'Drywall Repair', 'Window Repair', 'Door Repair', 'Foundation Repair',
  // Services
  'House Cleaning', 'Landscaping', 'Pool Service', 'Pest Control', 'Painting',
  'Pressure Washing', 'Locksmith', 'Moving', 'Tree Trimming', 'Gutter Cleaning',
  'Carpet Cleaning', 'Window Cleaning', 'Fence Install/Repair', 'Deck/Patio',
  'Flooring', 'Tile Work', 'Concrete', 'Masonry', 'Siding',
  // Specialty
  'Handyman', 'Home Inspection', 'Insulation', 'Water Damage', 'Mold Remediation',
  'Security Systems', 'Smart Home', 'Solar Panel', 'EV Charger Install',
  'Furniture Assembly', 'Junk Removal', 'Snow Removal',
];

const RADIUS_OPTIONS = [5, 10, 15, 25, 50];

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

  useEffect(() => {
    if (!isProviderAuthenticated) navigate('/portal/login');
  }, [isProviderAuthenticated, navigate]);

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
          {TABS.map(tab => (
            <button key={tab} onClick={() => setSearchParams({ tab })} style={{
              padding: '10px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
              background: 'none', border: 'none', borderBottom: activeTab === tab ? `2px solid ${O}` : '2px solid transparent',
              color: activeTab === tab ? O : '#9B9490', fontFamily: "'DM Sans', sans-serif",
              transition: 'all 0.15s', marginBottom: -1,
            }}>{TAB_LABELS[tab]}</button>
          ))}
        </div>

        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'jobs' && <IncomingJobsTab />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'profile' && <ProfileTab />}
        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </div>
  );
}
