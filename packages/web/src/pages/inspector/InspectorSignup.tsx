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

export default function InspectorSignup() {
  const { signup } = useInspectorAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [website, setWebsite] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [certifications, setCertifications] = useState('');
  const [serviceZipCodes, setServiceZipCodes] = useState('');
  const [inspectionSoftware, setInspectionSoftware] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const err = await signup({
      companyName,
      email,
      phone,
      password,
      website: website || undefined,
      licenseNumber: licenseNumber || undefined,
      certifications: certifications ? certifications.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      serviceZipCodes: serviceZipCodes ? serviceZipCodes.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      inspectionSoftware: inspectionSoftware || undefined,
    });

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
        width: '100%', maxWidth: 520, background: '#ffffff', borderRadius: 14,
        border: '1px solid #E0DAD4', padding: 32,
      }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 32, color: O }}>homie</span>
            <span style={{ fontSize: 14, color: '#9B9490', fontWeight: 500 }}>partner</span>
          </div>
          <p style={{ fontSize: 14, color: '#6B6560', margin: 0 }}>
            Create your inspector partner account
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Company Name *</label>
              <input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} style={inputStyle} placeholder="Your inspection company" required />
            </div>

            <div>
              <label style={labelStyle}>Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} placeholder="you@company.com" required />
            </div>

            <div>
              <label style={labelStyle}>Phone *</label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="(555) 123-4567" required />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} placeholder="Create a password (8+ chars)" required minLength={8} />
            </div>

            <div>
              <label style={labelStyle}>Website</label>
              <input type="url" value={website} onChange={e => setWebsite(e.target.value)} style={inputStyle} placeholder="https://..." />
            </div>

            <div>
              <label style={labelStyle}>License Number</label>
              <input type="text" value={licenseNumber} onChange={e => setLicenseNumber(e.target.value)} style={inputStyle} placeholder="State license #" />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Certifications</label>
              <input type="text" value={certifications} onChange={e => setCertifications(e.target.value)} style={inputStyle} placeholder="ASHI, InterNACHI, etc. (comma-separated)" />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Service Zip Codes</label>
              <input type="text" value={serviceZipCodes} onChange={e => setServiceZipCodes(e.target.value)} style={inputStyle} placeholder="10001, 10002, 10003 (comma-separated)" />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Inspection Software</label>
              <input type="text" value={inspectionSoftware} onChange={e => setInspectionSoftware(e.target.value)} style={inputStyle} placeholder="e.g., Spectora, HomeGauge, ISN" />
            </div>
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
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <span style={{ fontSize: 13, color: '#9B9490' }}>
            Already have an account?{' '}
            <Link to="/inspector/login" style={{ color: O, fontWeight: 600, textDecoration: 'none' }}>
              Sign in
            </Link>
          </span>
        </div>
      </div>
    </div>
  );
}
