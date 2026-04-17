import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { inspectService } from '@/services/inspector-api';
import { setToken } from '@/services/api';

const O = '#E8632B';
const D = '#2D2926';
const W = '#F9F5F2';

const HOMEOWNER_KEY = 'homie_homeowner';

export default function InspectClaim() {
  const [params] = useSearchParams();
  const claimToken = params.get('t') ?? '';
  const [status, setStatus] = useState<'verifying' | 'redirecting' | 'error'>('verifying');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!claimToken) {
      setStatus('error');
      setError('No claim token provided. Use the link from your email.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await inspectService.verifyClaim(claimToken);
        if (cancelled) return;
        if (!res.data) {
          setStatus('error');
          setError(res.error ?? 'Failed to verify the link.');
          return;
        }
        // Persist auth — same shape that AuthContext + authService use
        setToken(res.data.token);
        localStorage.setItem(HOMEOWNER_KEY, JSON.stringify(res.data.homeowner));
        setStatus('redirecting');
        // Redirect into the new portal at the report's detail view
        const dest = res.data.reportId
          ? `/inspect-portal?tab=reports&report=${res.data.reportId}`
          : `/inspect-portal?tab=reports`;
        // Hard navigation so the AuthProvider re-reads localStorage on mount
        setTimeout(() => { window.location.href = dest; }, 300);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError((err as Error).message ?? 'Something went wrong.');
      }
    })();
    return () => { cancelled = true; };
  }, [claimToken]);

  return (
    <div style={{ minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, marginBottom: 24 }}>
          <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 32, color: O }}>homie</span>
          <span style={{ fontSize: 14, color: '#9B9490', fontWeight: 500 }}>inspect</span>
        </div>
        {status === 'verifying' && (
          <>
            <div style={{ width: 40, height: 40, border: '3px solid #E0DAD4', borderTopColor: O, borderRadius: '50%', margin: '0 auto 20px', animation: 'homie-claim-spin 0.8s linear infinite' }} />
            <div style={{ fontSize: 17, fontWeight: 600, color: D, marginBottom: 6 }}>Unlocking your report{'\u2026'}</div>
            <div style={{ fontSize: 14, color: '#9B9490' }}>One moment.</div>
          </>
        )}
        {status === 'redirecting' && (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{'\u2713'}</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: D, marginBottom: 6 }}>You're in!</div>
            <div style={{ fontSize: 14, color: '#9B9490' }}>Taking you to your report{'\u2026'}</div>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>{'\u26A0\uFE0F'}</div>
            <div style={{ fontSize: 17, fontWeight: 600, color: D, marginBottom: 8 }}>Link issue</div>
            <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginBottom: 24 }}>{error}</div>
            <a href="/inspect" style={{ display: 'inline-block', padding: '12px 28px', borderRadius: 100, background: O, color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 600 }}>
              Back to Homie Inspect
            </a>
          </>
        )}
      </div>
      <style>{`@keyframes homie-claim-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
