import { useState, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useInspectorAuth } from '@/contexts/InspectorAuthContext';

/**
 * Inspector portal sidebar. Visual + interaction parity with
 * BusinessSidebar — collapsible with localStorage persistence, tooltip
 * on hover when collapsed, account menu in a popover (or bottom sheet
 * on mobile). Pared back from Business: no workspace switching, no
 * locked features, no nested nav groups (single-level menu only).
 */

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/inspector', icon: 'dashboard' },
  { id: 'reports', label: 'Reports', path: '/inspector/reports', icon: 'reports' },
  { id: 'upload', label: 'Upload', path: '/inspector/reports/upload', icon: 'upload' },
  { id: 'leads', label: 'Leads', path: '/inspector/leads', icon: 'leads' },
  { id: 'earnings', label: 'Earnings', path: '/inspector/earnings', icon: 'earnings' },
  { id: 'marketing', label: 'Marketing', path: '/inspector/marketing', icon: 'marketing' },
  { id: 'settings', label: 'Settings', path: '/inspector/settings', icon: 'settings' },
];

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const s = { width: size, height: size, display: 'inline-flex' as const };
  const icons: Record<string, ReactNode> = {
    dashboard: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="2" y="2" width="7" height="8" rx="2"/><rect x="11" y="2" width="7" height="5" rx="2"/><rect x="2" y="12" width="7" height="6" rx="2"/><rect x="11" y="9" width="7" height="9" rx="2"/></svg>,
    reports: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2h8l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z"/><path d="M12 2v4h4"/><path d="M7 10h6M7 13h4"/></svg>,
    upload: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14V3"/><path d="M5 8l5-5 5 5"/><path d="M3 17h14"/></svg>,
    leads: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="3"/><path d="M2 17c0-3 2.5-5 5-5s5 2 5 5"/><path d="M14 8l2 2 3-3"/></svg>,
    earnings: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 2v16M6 6c0-1.5 1.8-2.5 4-2.5s4 1 4 2.5-1.8 2.5-4 2.5S6 9.5 6 8"/><path d="M14 12c0 1.5-1.8 2.5-4 2.5S6 13.5 6 12"/></svg>,
    marketing: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 3l-8 5-8-5"/><path d="M2 3v10a2 2 0 002 2h12a2 2 0 002-2V3"/></svg>,
    settings: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4"/></svg>,
    collapse: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M13 4l-6 6 6 6"/></svg>,
    expand: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M7 4l6 6-6 6"/></svg>,
  };
  return icons[name] ?? null;
}

function isActivePath(itemPath: string, currentPath: string): boolean {
  if (itemPath === '/inspector') return currentPath === '/inspector';
  // /inspector/reports/upload should activate Upload (specific match) not Reports.
  if (itemPath === '/inspector/reports') {
    return currentPath === '/inspector/reports' || (currentPath.startsWith('/inspector/reports/') && !currentPath.startsWith('/inspector/reports/upload'));
  }
  return currentPath === itemPath || currentPath.startsWith(itemPath + '/');
}

interface InspectorSidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  onNavigateCallback?: () => void;
}

export default function InspectorSidebar({ collapsed, setCollapsed, onNavigateCallback }: InspectorSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { inspector, logout } = useInspectorAuth();
  const { homeowner } = useAuth();
  const [tooltip, setTooltip] = useState<{ label: string; top: number; left: number } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMenuPos, setAccountMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const accountBtnRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inBtn = accountBtnRef.current?.contains(target);
      const inMenu = accountMenuRef.current?.contains(target);
      if (!inBtn && !inMenu) setAccountOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function showTooltip(e: React.MouseEvent, label: string) {
    if (!collapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  }
  function hideTooltip() { setTooltip(null); }

  function toggleAccountMenu() {
    if (!accountBtnRef.current) return;
    const rect = accountBtnRef.current.getBoundingClientRect();
    setAccountMenuPos({ top: rect.top - 8, left: rect.right + 8 });
    setAccountOpen(o => !o);
  }

  function handleNav(path: string) {
    navigate(path);
    onNavigateCallback?.();
  }

  function handleLogout() {
    logout();
    navigate('/inspector/login');
  }

  const initials = inspector?.companyName
    ? inspector.companyName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'IP';

  const w = collapsed ? 64 : 252;

  const accountMenuItemStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', background: 'none', border: 'none',
    fontSize: 14, color: 'var(--ip-text)', cursor: 'pointer', textAlign: 'left',
    fontFamily: "'DM Sans', sans-serif",
  };

  const mobileMenuItemStyle: React.CSSProperties = {
    width: '100%', padding: '16px 20px', background: 'none', border: 'none',
    fontSize: 16, color: 'var(--ip-text)', cursor: 'pointer', textAlign: 'left',
    fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
    borderBottom: '1px solid var(--ip-border)',
  };

  return (
    <div style={{
      width: w, minWidth: w,
      height: '100vh', minHeight: '100dvh', maxHeight: '100dvh',
      background: 'var(--ip-card)',
      borderRight: '1px solid var(--ip-border)',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.25s cubic-bezier(.4,0,.2,1), min-width 0.25s cubic-bezier(.4,0,.2,1)',
      position: 'sticky', top: 0, zIndex: 10,
      overflow: collapsed ? 'visible' : 'hidden', flexShrink: 0,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {/* Logo */}
      <div style={{
        height: 64, display: 'flex', alignItems: 'center',
        padding: collapsed ? '0 16px' : '0 20px',
        borderBottom: '1px solid var(--ip-border)',
        justifyContent: collapsed ? 'center' : 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: collapsed ? 22 : 26, color: '#E8632B' }}>
            {collapsed ? 'h' : 'homie'}
          </span>
          {!collapsed && <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--ip-subtle)', fontWeight: 500 }}>partner</span>}
        </div>
        <button onClick={() => { onNavigateCallback ? onNavigateCallback() : setCollapsed(!collapsed); }} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ip-subtle)', padding: 4,
          display: collapsed ? 'none' : 'flex', alignItems: 'center',
        }} title="Close menu">
          <Icon name="collapse" size={18} />
        </button>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', overflowX: collapsed ? 'visible' : 'hidden' }}>
        {NAV_ITEMS.map(item => {
          const active = isActivePath(item.path, location.pathname);
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.path)}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--ip-hover)'; showTooltip(e, item.label); }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; hideTooltip(); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '10px 0' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: active ? '#E8632B10' : 'transparent',
                color: active ? '#E8632B' : 'var(--ip-muted)',
                border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14,
                fontFamily: "'DM Sans',sans-serif", fontWeight: active ? 600 : 500,
                transition: 'all 0.15s', whiteSpace: 'nowrap', position: 'relative',
                marginBottom: 2,
              }}
            >
              <span style={{ flexShrink: 0, display: 'flex' }}><Icon name={item.icon} /></span>
              {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Bottom user — opens account menu */}
      <button
        ref={accountBtnRef}
        onClick={toggleAccountMenu}
        onMouseEnter={(e) => collapsed && showTooltip(e, inspector?.companyName || 'Account')}
        onMouseLeave={hideTooltip}
        style={{
          borderTop: '1px solid var(--ip-border)',
          padding: collapsed ? '12px 8px' : '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: accountOpen ? 'var(--ip-hover)' : 'none', border: 'none',
          width: '100%', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: '#E8632B', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: '#fff',
        }}>{initials}</div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--ip-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {inspector?.companyName || 'Inspector'}
            </div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--ip-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {inspector?.email}
            </div>
          </div>
        )}
      </button>

      {/* Account menu — bottom sheet on mobile, popover on desktop */}
      {accountOpen && accountMenuPos && createPortal(
        isMobile ? (
          <>
            <style>{`@keyframes ip-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } } @keyframes ip-sheet-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
            <div onClick={() => setAccountOpen(false)} style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
              zIndex: 99998, animation: 'ip-sheet-fade 0.2s ease',
            }} />
            <div ref={accountMenuRef} style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'var(--ip-card)',
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
              zIndex: 99999, fontFamily: "'DM Sans', sans-serif",
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
              animation: 'ip-sheet-up 0.25s ease',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--ip-border)' }} />
              </div>
              {inspector && (
                <div style={{ padding: '8px 20px 16px', borderBottom: '1px solid var(--ip-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#E8632B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ip-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inspector.companyName}</div>
                    <div style={{ fontSize: 13, color: 'var(--ip-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inspector.email}</div>
                  </div>
                </div>
              )}
              <button onClick={() => { setAccountOpen(false); handleNav('/inspector/settings'); }} style={mobileMenuItemStyle}>Settings</button>
              <button onClick={() => { setAccountOpen(false); handleNav('/inspector/marketing'); }} style={mobileMenuItemStyle}>Marketing materials</button>
              {homeowner && (
                <div style={{ padding: '14px 16px 4px' }}>
                  <button onClick={() => { setAccountOpen(false); navigate('/account'); }} style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #FFF3E8 0%, #FFE8D6 100%)',
                    border: '1px solid #F5C9A8', borderRadius: 12,
                    padding: '14px 16px', cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif", textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--ip-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{'🏠'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ip-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'Fraunces, serif', fontSize: 14, color: '#E8632B' }}>homie</span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: '#1B9E77', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Personal</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ip-muted)', marginTop: 2 }}>Home services for your own home</div>
                    </div>
                    <span style={{ color: '#E8632B', fontSize: 18, flexShrink: 0 }}>{'→'}</span>
                  </button>
                </div>
              )}
              <div style={{ borderTop: '1px solid var(--ip-border)', marginTop: 8 }}>
                <button onClick={() => { setAccountOpen(false); handleLogout(); }} style={{ ...mobileMenuItemStyle, color: '#E24B4A' }}>Sign out</button>
              </div>
            </div>
          </>
        ) : (
          <div ref={accountMenuRef} style={{
            position: 'fixed',
            bottom: `calc(100vh - ${accountMenuPos.top}px)`,
            left: accountMenuPos.left,
            background: 'var(--ip-card)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            border: '1px solid var(--ip-border)',
            minWidth: 220, overflow: 'hidden', zIndex: 99999,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {inspector && (
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--ip-border)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ip-text)' }}>{inspector.companyName}</div>
                <div style={{ fontSize: 12, color: 'var(--ip-subtle)' }}>{inspector.email}</div>
              </div>
            )}
            <button onClick={() => { setAccountOpen(false); handleNav('/inspector/settings'); }} style={accountMenuItemStyle}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--ip-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>Settings</button>
            <button onClick={() => { setAccountOpen(false); handleNav('/inspector/marketing'); }} style={accountMenuItemStyle}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--ip-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>Marketing materials</button>
            {homeowner && (
              <div style={{ padding: '12px 12px 4px' }}>
                <button onClick={() => { setAccountOpen(false); navigate('/account'); }} style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #FFF3E8 0%, #FFE8D6 100%)',
                  border: '1px solid #F5C9A8', borderRadius: 10,
                  padding: '10px 12px', cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--ip-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{'🏠'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ip-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'Fraunces, serif', fontSize: 13, color: '#E8632B' }}>homie</span>
                      <span style={{ fontSize: 8, fontWeight: 800, color: '#fff', background: '#1B9E77', padding: '1.5px 5px', borderRadius: 3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Personal</span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ip-muted)', marginTop: 1 }}>Home services for your own home</div>
                  </div>
                  <span style={{ color: '#E8632B', fontSize: 15, flexShrink: 0 }}>{'→'}</span>
                </button>
              </div>
            )}
            <div style={{ borderTop: '1px solid var(--ip-border)', marginTop: 6 }}>
              <button onClick={() => { setAccountOpen(false); handleLogout(); }} style={{ ...accountMenuItemStyle, color: '#E24B4A' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FFF5F5'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>Sign out</button>
            </div>
          </div>
        ),
        document.body,
      )}

      {/* Expand button when collapsed */}
      {collapsed && (
        <button onClick={() => setCollapsed(false)} style={{
          position: 'absolute', top: 20, right: -12, width: 24, height: 24,
          borderRadius: '50%', background: 'var(--ip-card)', border: '1px solid var(--ip-border)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--ip-subtle)', boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        }}>
          <Icon name="expand" size={14} />
        </button>
      )}

      {/* Tooltip rendered as fixed overlay */}
      {tooltip && (
        <div style={{
          position: 'fixed', top: tooltip.top, left: tooltip.left, transform: 'translateY(-50%)',
          background: '#2D2926', color: '#fff',
          fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
          padding: '6px 12px', borderRadius: 6, whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 99999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          <div style={{
            position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)',
            width: 0, height: 0,
            borderTop: '5px solid transparent', borderBottom: '5px solid transparent',
            borderRight: '5px solid #2D2926',
          }} />
          {tooltip.label}
        </div>
      )}
    </div>
  );
}
