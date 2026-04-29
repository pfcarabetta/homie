import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Admin → Inspector portal handoff. The Partners tab calls
 * /admin/inspect/partners/:id/impersonate, then opens this route in a
 * new tab with ?token=...&inspectorId=...  We stash the token in
 * sessionStorage (tab-scoped — closing the tab ends the impersonation
 * automatically without polluting the admin's real localStorage) and
 * redirect into the inspector portal.
 *
 * The inspector portal (InspectorAuthContext + inspector-api) prefers
 * sessionStorage over localStorage when reading the token, so this tab
 * sees the partner's view while a regular inspector tab elsewhere on the
 * device keeps its own login.
 */
export default function AdminImpersonate() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setError('Missing token');
      return;
    }

    sessionStorage.setItem('homie_inspector_token', token);
    sessionStorage.setItem('homie_inspector_impersonation', '1');
    // Force a fresh profile load on the inspector side.
    sessionStorage.removeItem('homie_inspector');

    navigate('/inspector', { replace: true });
  }, [params, navigate]);

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', color: '#2D2926' }}>
      {error ? (
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Impersonation failed</h1>
          <div style={{ color: '#C8531E' }}>{error}</div>
        </div>
      ) : (
        <div>Opening partner view…</div>
      )}
    </div>
  );
}
