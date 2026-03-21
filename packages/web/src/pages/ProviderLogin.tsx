import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useProviderAuth } from '@/contexts/ProviderAuthContext';

const O = '#E8632B', D = '#2D2926', W = '#F9F5F2';

export default function ProviderLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isProviderAuthenticated, loginWithToken, requestMagicLink } = useProviderAuth();
  const [input, setInput] = useState('');
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setError(null);
    setLoading(true);
    const err = await requestMagicLink(input.trim());
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
            <div style={{ fontSize: 48, marginBottom: 16 }}>{input.includes('@') ? '\u2709\uFE0F' : '\uD83D\uDCF1'}</div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: D, marginBottom: 8 }}>Check your {input.includes('@') ? 'email' : 'phone'}</h1>
            <p style={{ fontSize: 15, color: '#6B6560', lineHeight: 1.6 }}>
              We sent a login link to <strong style={{ color: D }}>{input}</strong>. Click it to access your portal.
            </p>
          </div>
        ) : (
          <>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: D, textAlign: 'center', marginBottom: 8 }}>Pro Portal Login</h1>
            <p style={{ fontSize: 15, color: '#9B9490', textAlign: 'center', marginBottom: 32 }}>Enter your phone number or email to get a login link</p>

            {error && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 12, padding: '10px 14px', fontSize: 14, marginBottom: 16 }}>{error}</div>
            )}

            <form onSubmit={handleSubmit}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Phone number or email"
                style={{
                  width: '100%', padding: '14px 18px', borderRadius: 12, fontSize: 16,
                  border: '2px solid rgba(0,0,0,0.08)', outline: 'none', color: D,
                  fontFamily: "'DM Sans', sans-serif", marginBottom: 16,
                }}
                onFocus={e => e.target.style.borderColor = O}
                onBlur={e => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
              />
              <button type="submit" disabled={loading || !input.trim()} style={{
                width: '100%', padding: '14px 0', borderRadius: 100, border: 'none',
                background: input.trim() && !loading ? O : 'rgba(0,0,0,0.08)',
                color: input.trim() && !loading ? 'white' : '#9B9490',
                fontSize: 16, fontWeight: 600, cursor: input.trim() && !loading ? 'pointer' : 'default',
                fontFamily: "'DM Sans', sans-serif",
              }}>{loading ? 'Sending...' : 'Send Login Link'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
