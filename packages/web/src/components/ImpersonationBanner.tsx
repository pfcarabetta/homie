/**
 * Sticky top banner shown on every portal (Homeowner, Inspector, Provider)
 * when the current tab is in admin "Login as" / "View as" mode. Reads its
 * state straight from sessionStorage (no context coupling) so it can be
 * dropped into any layout without wiring.
 *
 * Tap "Exit" → clears the impersonation sessionStorage entries and hard-
 * reloads the tab so every cached query in the portal re-fires under the
 * absence of an auth token.
 */

import { useEffect, useState } from 'react';

type Role = 'inspector' | 'homeowner' | 'provider';

const ROLE_KEYS: Record<Role, { token: string; profile: string; flag: string; label: string }> = {
  inspector: {
    token: 'homie_inspector_token',
    profile: 'homie_inspector',
    flag: 'homie_inspector_impersonation',
    label: 'inspector partner',
  },
  homeowner: {
    token: 'homie_token',
    profile: 'homie_homeowner',
    flag: 'homie_impersonation',
    label: 'homeowner',
  },
  provider: {
    token: 'homie_provider_token',
    profile: 'homie_provider',
    flag: 'homie_provider_impersonation',
    label: 'service provider',
  },
};

function detectActiveRole(): Role | null {
  for (const role of Object.keys(ROLE_KEYS) as Role[]) {
    const k = ROLE_KEYS[role];
    if (sessionStorage.getItem(k.flag) === '1' && sessionStorage.getItem(k.token)) {
      return role;
    }
  }
  return null;
}

function readDisplayName(role: Role): string {
  const raw = sessionStorage.getItem(ROLE_KEYS[role].profile);
  if (!raw) return '';
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.companyName === 'string' && obj.companyName) return obj.companyName;
    if (typeof obj.name === 'string' && obj.name) return obj.name;
    const first = typeof obj.first_name === 'string' ? obj.first_name : '';
    const last = typeof obj.last_name === 'string' ? obj.last_name : '';
    const full = [first, last].filter(Boolean).join(' ').trim();
    if (full) return full;
    if (typeof obj.email === 'string') return obj.email;
  } catch { /* ignore */ }
  return '';
}

export default function ImpersonationBanner() {
  const [role, setRole] = useState<Role | null>(detectActiveRole);
  const [displayName, setDisplayName] = useState<string>(() => {
    const r = detectActiveRole();
    return r ? readDisplayName(r) : '';
  });

  // Re-check on storage changes from other tabs (e.g. admin clears
  // sessionStorage manually). Storage events don't fire for the same
  // tab that wrote the change, but they do fire across tabs.
  useEffect(() => {
    function refresh() {
      const r = detectActiveRole();
      setRole(r);
      setDisplayName(r ? readDisplayName(r) : '');
    }
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  if (!role) return null;

  function exit() {
    if (!role) return;
    const k = ROLE_KEYS[role];
    sessionStorage.removeItem(k.token);
    sessionStorage.removeItem(k.profile);
    sessionStorage.removeItem(k.flag);
    // Hard reload — the auth context plus any in-memory caches need to
    // re-evaluate without the token. Easier than wiring a context-level
    // exit hook into all three portals.
    window.location.replace('/admin/users');
  }

  const label = ROLE_KEYS[role].label;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        background: '#FFE39A',
        color: '#5C3D00',
        borderBottom: '1px solid #E8B864',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 13,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontWeight: 600,
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span aria-hidden="true">⚠️</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Admin impersonation — viewing as {label}
          {displayName ? ` “${displayName}”` : ''}
        </span>
      </div>
      <button
        onClick={exit}
        style={{
          background: '#5C3D00',
          color: '#FFE39A',
          border: 'none',
          borderRadius: 6,
          padding: '4px 12px',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        Exit impersonation ↗
      </button>
    </div>
  );
}
