import { useEffect, useState, useRef, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { clearAdminKey } from '@/services/admin-api';

/**
 * Admin portal sidebar. Mirrors the InspectorSidebar/BusinessSidebar
 * pattern: collapsible (64↔252px) with localStorage persistence,
 * tooltip on hover when collapsed, a small account block at the
 * bottom with a logout. No nested groups, no plan-locks — admin is
 * a flat 8-item nav.
 */

interface NavItem { id: string; label: string; path: string; icon: string; }

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',  label: 'Dashboard',  path: '/admin/dashboard',  icon: 'dashboard' },
  { id: 'users',      label: 'Users',      path: '/admin/users',      icon: 'people' },
  { id: 'jobs',       label: 'Jobs',       path: '/admin/jobs',       icon: 'jobs' },
  { id: 'inspect',    label: 'Inspect',    path: '/admin/inspect',    icon: 'inspect' },
  { id: 'providers',  label: 'Providers',  path: '/admin/providers',  icon: 'wrench' },
  { id: 'bookings',   label: 'Bookings',   path: '/admin/bookings',   icon: 'calendar' },
  { id: 'business',   label: 'Business',   path: '/admin/business',   icon: 'building' },
  { id: 'pricing',    label: 'Pricing',    path: '/admin/pricing',    icon: 'tag' },
];

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const s = { width: size, height: size, display: 'inline-flex' as const };
  const icons: Record<string, ReactNode> = {
    dashboard: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="2" y="2" width="7" height="8" rx="2"/><rect x="11" y="2" width="7" height="5" rx="2"/><rect x="2" y="12" width="7" height="6" rx="2"/><rect x="11" y="9" width="7" height="9" rx="2"/></svg>,
    people: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="3"/><path d="M2 17c0-3 2.5-5 5-5s5 2 5 5"/><circle cx="14.5" cy="6" r="2"/><path d="M18 15c0-2-1.5-3.5-3.5-3.5"/></svg>,
    jobs: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 5h16M2 10h16M2 15h10"/><circle cx="16" cy="15" r="2.5"/></svg>,
    inspect: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h8l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M12 2v4h4"/><path d="M7 10h6M7 13h4"/></svg>,
    wrench: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3a4 4 0 00-3.46 6L3 16.54a1 1 0 001.46 1.46L11.94 11A4 4 0 1014 3z"/></svg>,
    calendar: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/></svg>,
    building: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="3" y="3" width="14" height="14" rx="1"/><path d="M7 7h2M11 7h2M7 11h2M11 11h2M9 17v-3h2v3"/></svg>,
    tag: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2H3v7l9 9 7-7-9-9z"/><circle cx="6.5" cy="6.5" r="1"/></svg>,
    collapse: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M13 4l-6 6 6 6"/></svg>,
    expand: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M7 4l6 6-6 6"/></svg>,
    logout: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M13 4h3a1 1 0 011 1v10a1 1 0 01-1 1h-3"/><path d="M9 14l4-4-4-4M13 10H3"/></svg>,
  };
  return icons[name] ?? null;
}

function isActivePath(itemPath: string, currentPath: string): boolean {
  return currentPath === itemPath || currentPath.startsWith(itemPath + '/');
}

interface AdminSidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  /** Called after a nav item or logout fires — used by the mobile
   *  drawer to close itself. */
  onNavigateCallback?: () => void;
}

export default function AdminSidebar({ collapsed, setCollapsed, onNavigateCallback }: AdminSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [tooltip, setTooltip] = useState<{ label: string; top: number; left: number } | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const logoutBtnRef = useRef<HTMLButtonElement>(null);

  function showTooltip(e: React.MouseEvent, label: string) {
    if (!collapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  }
  function hideTooltip() { setTooltip(null); }

  function handleNav(path: string) {
    navigate(path);
    onNavigateCallback?.();
  }

  function handleLogout() {
    if (!confirmingLogout) { setConfirmingLogout(true); setTimeout(() => setConfirmingLogout(false), 3000); return; }
    clearAdminKey();
    navigate('/admin');
    onNavigateCallback?.();
  }

  const w = collapsed ? 64 : 252;

  return (
    <div
      className="bg-ap-card border-r border-ap-border"
      style={{
        width: w, minWidth: w, height: '100vh', minHeight: '100dvh', maxHeight: '100dvh',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.25s cubic-bezier(.4,0,.2,1), min-width 0.25s cubic-bezier(.4,0,.2,1)',
        position: 'sticky', top: 0, zIndex: 10,
        overflow: collapsed ? 'visible' : 'hidden', flexShrink: 0,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {/* Logo */}
      <div
        className="border-b border-ap-border"
        style={{
          height: 64, display: 'flex', alignItems: 'center',
          padding: collapsed ? '0 16px' : '0 20px',
          justifyContent: collapsed ? 'center' : 'space-between', flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
          <span className="font-display font-bold text-orange-500" style={{ fontSize: collapsed ? 22 : 26 }}>
            {collapsed ? 'h' : 'homie'}
          </span>
          {!collapsed && (
            <span className="font-sans font-medium text-ap-subtle" style={{ fontSize: 12 }}>admin</span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="text-ap-subtle hover:text-ap-text"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
            title="Collapse menu"
          >
            <Icon name="collapse" size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', overflowX: collapsed ? 'visible' : 'hidden' }}>
        {NAV_ITEMS.map(item => {
          const active = isActivePath(item.path, location.pathname);
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.path)}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--ap-hover)'; showTooltip(e, item.label); }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; hideTooltip(); }}
              className="font-sans"
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '10px 0' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: active ? 'rgba(232,99,43,0.08)' : 'transparent',
                color: active ? '#E8632B' : 'var(--ap-muted)',
                border: 'none', borderRadius: 10, cursor: 'pointer',
                fontSize: 14, fontWeight: active ? 600 : 500,
                transition: 'all .15s', whiteSpace: 'nowrap', position: 'relative',
                marginBottom: 2,
              }}
            >
              <span style={{ flexShrink: 0, display: 'flex' }}><Icon name={item.icon} /></span>
              {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Bottom: admin badge + logout */}
      <div className="border-t border-ap-border" style={{ padding: collapsed ? '12px 8px' : '12px 16px', flexShrink: 0 }}>
        <button
          ref={logoutBtnRef}
          onClick={handleLogout}
          onMouseEnter={(e) => collapsed && showTooltip(e, confirmingLogout ? 'Click again to confirm' : 'Log out')}
          onMouseLeave={hideTooltip}
          className="font-sans"
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: confirmingLogout ? 'rgba(220,38,38,0.10)' : 'transparent',
            border: 'none', borderRadius: 10, cursor: 'pointer',
            padding: collapsed ? '10px 0' : '10px 12px',
            color: confirmingLogout ? '#DC2626' : 'var(--ap-muted)',
            fontSize: 14, fontWeight: 500, textAlign: 'left',
            transition: 'all .15s',
          }}
        >
          <span style={{ flexShrink: 0, display: 'flex' }}><Icon name="logout" /></span>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{confirmingLogout ? 'Click again to confirm' : 'Log out'}</div>
              <div className="text-ap-subtle" style={{ fontSize: 11, marginTop: 1 }}>Admin session</div>
            </div>
          )}
        </button>
      </div>

      {/* Expand chevron when collapsed */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          className="bg-ap-card border border-ap-border text-ap-subtle"
          style={{
            position: 'absolute', top: 20, right: -12, width: 24, height: 24,
            borderRadius: '50%', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}
          title="Expand menu"
        >
          <Icon name="expand" size={14} />
        </button>
      )}

      {/* Hover tooltip when collapsed */}
      {tooltip && (
        <div
          className="font-sans"
          style={{
            position: 'fixed', top: tooltip.top, left: tooltip.left,
            transform: 'translateY(-50%)',
            background: '#2D2926', color: '#fff',
            fontSize: 12, fontWeight: 600,
            padding: '6px 12px', borderRadius: 6, whiteSpace: 'nowrap',
            pointerEvents: 'none', zIndex: 99999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          <div
            style={{
              position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
              width: 0, height: 0,
              borderTop: '5px solid transparent', borderBottom: '5px solid transparent',
              borderRight: '5px solid #2D2926',
            }}
          />
          {tooltip.label}
        </div>
      )}
    </div>
  );
}
