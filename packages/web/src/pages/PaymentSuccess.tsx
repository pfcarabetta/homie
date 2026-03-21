import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function PaymentSuccess() {
  useDocumentTitle('Payment Confirmed');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown <= 0) { navigate('/account?tab=bookings'); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, navigate]);

  return (
    <div style={{ minHeight: '100vh', background: '#F9F5F2', fontFamily: "'DM Sans', sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center', padding: '0 24px', maxWidth: 440 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(27,158,119,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1B9E77" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: '#2D2926', marginBottom: 8 }}>Payment confirmed!</h1>
        <p style={{ fontSize: 16, color: '#6B6560', lineHeight: 1.6, marginBottom: 8 }}>
          Your provider has been booked. They'll be in touch to confirm the details.
        </p>
        <p style={{ fontSize: 14, color: '#9B9490', marginBottom: 32 }}>
          Redirecting to your bookings in {countdown}s...
        </p>
        <button onClick={() => navigate('/account?tab=bookings')} style={{
          background: '#E8632B', color: 'white', border: 'none', borderRadius: 100,
          padding: '14px 32px', fontSize: 16, fontWeight: 600, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}>View My Bookings</button>
      </div>
    </div>
  );
}
