import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { accountService, type AccountProfile, type AccountJob, type AccountBooking } from '@/services/api';
import AvatarDropdown from '@/components/AvatarDropdown';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

const TABS = ['profile', 'quotes', 'bookings', 'payment'] as const;
type Tab = typeof TABS[number];
const TAB_LABELS: Record<Tab, string> = { profile: 'Profile', quotes: 'My Quotes', bookings: 'Bookings', payment: 'Payment' };

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
function QuotesTab() {
  const [jobs, setJobs] = useState<AccountJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    accountService.getJobs().then(res => {
      setJobs(res.data?.jobs || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ color: '#9B9490', padding: 20 }}>Loading...</div>;
  if (jobs.length === 0) return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: '#9B9490' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>&#128203;</div>
      <div style={{ fontSize: 15, fontWeight: 500 }}>No quotes yet</div>
      <div style={{ fontSize: 13, marginTop: 4 }}>Your quote requests will appear here</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {jobs.map(j => {
        const sc = STATUS_COLORS[j.status] || STATUS_COLORS.expired;
        return (
          <div key={j.id} style={{
            background: 'white', borderRadius: 14, padding: '16px 18px',
            border: '1px solid rgba(0,0,0,0.06)', transition: 'all 0.15s',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: D }}>
                {j.diagnosis?.category ? j.diagnosis.category.charAt(0).toUpperCase() + j.diagnosis.category.slice(1) : 'Quote'}
              </div>
              <span style={{ background: sc.bg, color: sc.text, padding: '3px 10px', borderRadius: 100, fontSize: 12, fontWeight: 600, textTransform: 'capitalize' }}>{j.status}</span>
            </div>
            {j.diagnosis?.summary && <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.5, marginBottom: 8 }}>{j.diagnosis.summary}</div>}
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#9B9490' }}>
              <span>{j.tier} tier</span>
              <span>{j.zip_code}</span>
              <span>{timeAgo(j.created_at)}</span>
            </div>
          </div>
        );
      })}
    </div>
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

/* -- Payment Tab -- */
function PaymentTab() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 0', color: '#9B9490' }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>&#128179;</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: D }}>Payment details coming soon</div>
      <div style={{ fontSize: 13, marginTop: 4, maxWidth: 300, margin: '4px auto 0', lineHeight: 1.5 }}>
        You'll be able to add payment methods and view your billing history here.
      </div>
    </div>
  );
}

/* -- Main Account Page -- */
export default function Account() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') as Tab) || 'profile';

  useEffect(() => {
    if (!isAuthenticated) navigate('/login');
  }, [isAuthenticated, navigate]);

  if (!isAuthenticated) return null;

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
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
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: D, marginBottom: 24 }}>My Account</h1>

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
        {activeTab === 'quotes' && <QuotesTab />}
        {activeTab === 'bookings' && <BookingsTab />}
        {activeTab === 'payment' && <PaymentTab />}
      </div>
    </div>
  );
}
