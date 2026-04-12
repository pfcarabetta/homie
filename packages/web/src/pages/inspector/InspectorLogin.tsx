import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useInspectorAuth } from '@/contexts/InspectorAuthContext';

const O = '#E8632B';
const D = '#2D2926';
const W = '#F9F5F2';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  border: '1px solid #E0DAD4',
  borderRadius: 10,
  background: '#ffffff',
  color: D,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: D,
  marginBottom: 6,
  fontFamily: "'DM Sans', sans-serif",
};

export default function InspectorLogin() {
  const { login } = useInspectorAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await login(email, password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate('/inspector');
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: W, fontFamily: "'DM Sans', sans-serif", padding: 16,
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{
        width: '100%', maxWidth: 420, background: '#ffffff', borderRadius: 14,
        border: '1px solid #E0DAD4', padding: 32,
      }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 32, color: O }}>homie</span>
            <span style={{ fontSize: 14, color: '#9B9490', fontWeight: 500 }}>partner</span>
          </div>
          <p style={{ fontSize: 14, color: '#6B6560', margin: 0 }}>
            Sign in to your inspector portal
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="you@company.com"
              required
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
              placeholder="Enter your password"
              required
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, background: '#FFF5F5', border: '1px solid #FED7D7',
              color: '#E24B4A', fontSize: 13, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", background: O, color: '#fff',
              border: 'none', borderRadius: 10, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <span style={{ fontSize: 13, color: '#9B9490' }}>
            Don't have an account?{' '}
            <Link to="/inspector/signup" style={{ color: O, fontWeight: 600, textDecoration: 'none' }}>
              Sign up
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
