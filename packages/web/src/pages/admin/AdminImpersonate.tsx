import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Admin → user portal handoff. The Users / Partners tabs open this route
 * in a new tab with ?as={inspector|homeowner|provider}&token=...  plus the
 * full identity blob in &profile=<base64-json>. We stuff the token + blob
 * into sessionStorage (tab-scoped — closing the tab ends impersonation
 * cleanly without polluting the admin's real localStorage on this device)
 * then redirect into the right portal.
 *
 * Each portal's auth context (AuthContext, InspectorAuthContext,
 * ProviderAuthContext) prefers sessionStorage over localStorage when
 * reading its token, so this tab sees the impersonated view while any
 * other tab on the same device keeps its own login intact.
 */

type UserRole = 'inspector' | 'homeowner' | 'provider';

interface RoleConfig {
  tokenKey: string;
  profileKey: string;
  flagKey: string;
  redirectPath: string;
  labelNoun: string;
}

const ROLE: Record<UserRole, RoleConfig> = {
  inspector: {
    tokenKey: 'homie_inspector_token',
    profileKey: 'homie_inspector',
    flagKey: 'homie_inspector_impersonation',
    redirectPath: '/inspector',
    labelNoun: 'partner',
  },
  homeowner: {
    tokenKey: 'homie_token',
    profileKey: 'homie_homeowner',
    flagKey: 'homie_impersonation',
    redirectPath: '/account',
    labelNoun: 'homeowner',
  },
  provider: {
    tokenKey: 'homie_provider_token',
    profileKey: 'homie_provider',
    flagKey: 'homie_provider_impersonation',
    redirectPath: '/portal',
    labelNoun: 'service provider',
  },
};

function decodeProfile(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(raw))));
  } catch {
    return null;
  }
}

export default function AdminImpersonate() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = params.get('token');
    const asParam = (params.get('as') ?? 'inspector') as UserRole;
    const cfg = ROLE[asParam];

    if (!token) { setError('Missing token'); return; }
    if (!cfg) { setError(`Unknown role: ${asParam}`); return; }

    sessionStorage.setItem(cfg.tokenKey, token);
    sessionStorage.setItem(cfg.flagKey, '1');

    // Profile blob is optional. When present, store it so the destination
    // portal renders immediately without an extra fetch. When absent
    // (legacy inspector flow), the destination context fetches the profile
    // itself.
    const profile = decodeProfile(params.get('profile'));
    if (profile) {
      sessionStorage.setItem(cfg.profileKey, JSON.stringify(profile));
    } else {
      sessionStorage.removeItem(cfg.profileKey);
    }

    navigate(cfg.redirectPath, { replace: true });
  }, [params, navigate]);

  const role = (params.get('as') ?? 'inspector') as UserRole;
  const noun = ROLE[role]?.labelNoun ?? 'user';

  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', color: '#2D2926' }}>
      {error ? (
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Impersonation failed</h1>
          <div style={{ color: '#C8531E' }}>{error}</div>
        </div>
      ) : (
        <div>Opening {noun} view…</div>
      )}
    </div>
  );
}
