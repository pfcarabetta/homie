import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useProviderAuth } from '@/contexts/ProviderAuthContext';
import { fetchAPI } from '@/services/api';

const O = '#E8632B', D = '#2D2926', W = '#F9F5F2';

export default function ProviderLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isProviderAuthenticated, loginWithToken, requestMagicLink } = useProviderAuth();

  const [mode, setMode] = useState<'password' | 'magic'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [magicInput, setMagicInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const token = searchParams.get('token');

  // Handle magic link token
  useEffect(() => {
    if (token) {
      setVerifying(true);
      loginWithToken(token).then(err => {
        if (err) { setError(err); setVerifying(false); }
        else navigate('/portal');
      });
    }
  }, [token, loginWithToken, navigate]);

  useEffect(() => {
    if (isProviderAuthenticated && !token) navigate('/portal');
  }, [isProviderAuthenticated, navigate, token]);

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetchAPI<{ token: string; provider: { id: string; name: string; phone: string | null; email: string | null; categories: string[] | null } }>(
        '/api/v1/provider-auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) }
      );
      if (res.data) {
        localStorage.setItem('homie_provider_token', res.data.token);
        localStorage.setItem('homie_provider', JSON.stringify(res.data.provider));
        window.location.href = '/portal';
      }
    } catch (err) {
      setError((err as Error).message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    if (!magicInput.trim()) return;
    setError(null);
    setLoading(true);
    const err = await requestMagicLink(magicInput.trim());
    setLoading(false);
    if (err) setError(err);
    else setSent(true);
  }

  if (verifying) {
    return (
      <div style={{ minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 48, height: 48, border: `4px solid rgba(232,99,43,0.2)`, borderTopColor: O, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 20px' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ fontSize: 16, color: D, fontWeight: 500 }}>Verifying your link...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
      <header style={{ padding: '32px 0', textAlign: 'center' }}>
        <Link to="/" style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: O, textDecoration: 'none' }}>homie</Link>
        <span style={{ display: 'inline-block', background: D, color: 'white', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6, marginLeft: 8, verticalAlign: 'super' }}>PRO</span>
      </header>

      <div style={{ maxWidth: 400, margin: '0 auto', padding: '0 24px' }}>
        {sent ? (
          <div style={{ textAlign: 'center', paddingTop: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{magicInput.includes('@') ? '✉️' : '📱'}</div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: D, marginBottom: 8 }}>Check your {magicInput.includes('@') ? 'email' : 'phone'}</h1>
            <p style={{ fontSize: 15, color: '#6B6560', lineHeight: 1.6 }}>
              We sent a login link to <strong style={{ color: D }}>{magicInput}</strong>. Click it to access your portal.
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: D, textAlign: 'center', marginBottom: 8 }}>Pro Portal Login</h1>

            {/* Mode toggle */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.08)' }}>
              <button onClick={() => { setMode('password'); setError(null); }} style={{
                flex: 1, padding: '10px 0', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: mode === 'password' ? O : '#fff', color: mode === 'password' ? '#fff' : '#9B9490',
                fontFamily: "'DM Sans', sans-serif",
              }}>Email & Password</button>
              <button onClick={() => { setMode('magic'); setError(null); }} style={{
                flex: 1, padding: '10px 0', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: mode === 'magic' ? O : '#fff', color: mode === 'magic' ? '#fff' : '#9B9490',
                fontFamily: "'DM Sans', sans-serif",
              }}>Magic Link</button>
            </div>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 12, padding: '10px 14px', fontSize: 14, marginBottom: 16 }}>{error}</div>
            )}

            {mode === 'password' ? (
              <form onSubmit={handlePasswordLogin}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: D, marginBottom: 6 }}>Email</label>
                  <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="you@company.com"
                    style={{ width: '100%', padding: '14px 18px', borderRadius: 12, fontSize: 16, border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: D, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = O} onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'} />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: D, marginBottom: 6 }}>Password</label>
                  <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Your password"
                    style={{ width: '100%', padding: '14px 18px', borderRadius: 12, fontSize: 16, border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: D, fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' }}
                    onFocus={e => e.target.style.borderColor = O} onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'} />
                </div>
                <button type="submit" disabled={loading || !email.trim() || !password} style={{
                  width: '100%', padding: '14px 0', borderRadius: 100, border: 'none',
                  background: email.trim() && password && !loading ? O : 'rgba(0,0,0,0.08)',
                  color: email.trim() && password && !loading ? 'white' : '#9B9490',
                  fontSize: 16, fontWeight: 600, cursor: email.trim() && password && !loading ? 'pointer' : 'default',
                  fontFamily: "'DM Sans', sans-serif",
                }}>{loading ? 'Signing in...' : 'Sign In'}</button>
                <p style={{ fontSize: 13, color: '#9B9490', textAlign: 'center', marginTop: 12 }}>
                  No password yet? Use the <button onClick={() => setMode('magic')} style={{ background: 'none', border: 'none', color: O, fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: 0 }}>Magic Link</button> to log in, then set one in Settings.
                </p>
              </form>
            ) : (
              <form onSubmit={handleMagicLink}>
                <p style={{ fontSize: 14, color: '#9B9490', textAlign: 'center', marginBottom: 20 }}>Enter your phone number or email to get a login link</p>
                <input value={magicInput} onChange={e => setMagicInput(e.target.value)} placeholder="Phone number or email"
                  style={{ width: '100%', padding: '14px 18px', borderRadius: 12, fontSize: 16, border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: D, fontFamily: "'DM Sans', sans-serif", marginBottom: 16, boxSizing: 'border-box' }}
                  onFocus={e => e.target.style.borderColor = O} onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'} />
                <button type="submit" disabled={loading || !magicInput.trim()} style={{
                  width: '100%', padding: '14px 0', borderRadius: 100, border: 'none',
                  background: magicInput.trim() && !loading ? O : 'rgba(0,0,0,0.08)',
                  color: magicInput.trim() && !loading ? 'white' : '#9B9490',
                  fontSize: 16, fontWeight: 600, cursor: magicInput.trim() && !loading ? 'pointer' : 'default',
                  fontFamily: "'DM Sans', sans-serif",
                }}>{loading ? 'Sending...' : 'Send Login Link'}</button>
              </form>
            )}

            <p style={{ fontSize: 14, color: '#9B9490', textAlign: 'center', marginTop: 24 }}>
              Not a Homie Pro? <Link to="/portal/signup" style={{ color: O, fontWeight: 600, textDecoration: 'none' }}>Join free</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
