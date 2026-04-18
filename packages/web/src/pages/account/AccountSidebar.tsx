import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const O = '#E8632B'; // Brand orange — primary accent across all 3 products
const G = '#1B9E77'; // Personal badge color (green for the consumer surface)
const D = '#2D2926';

export type AccountTab = 'dashboard' | 'quotes' | 'bookings' | 'home' | 'profile';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  tab?: AccountTab;
  href?: string;
  external?: boolean;
  divider?: boolean;
}

interface AccountSidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  activeTab: AccountTab;
  onNavigate: (tab: AccountTab) => void;
  onNewQuote: () => void;
  hasInspectReports: boolean;
  hasWorkspace: boolean;
  userName?: string;
  userInitials?: string;
  onNavigateCallback?: () => void;
}

function getNavItems(hasInspect: boolean, hasWorkspace: boolean): NavItem[] {
  const items: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', tab: 'dashboard' },
    { id: 'quotes', label: 'My Quotes', icon: 'quotes', tab: 'quotes' },
    { id: 'bookings', label: 'My Bookings', icon: 'bookings', tab: 'bookings' },
    { id: 'home', label: 'My Home', icon: 'home', tab: 'home' },
    { id: 'div1', label: '', icon: '', divider: true },
    { id: 'diagnostic', label: 'Free Diagnostic', icon: 'diagnostic', href: '/chat' },
  ];
  if (hasInspect) items.push({ id: 'inspect', label: 'Homie Inspect', icon: 'inspect', href: '/inspect-portal', external: true });
  if (hasWorkspace) items.push({ id: 'business', label: 'Homie Business', icon: 'business', href: '/business', external: true });
  items.push({ id: 'div2', label: '', icon: '', divider: true });
  items.push({ id: 'profile', label: 'Settings', icon: 'settings', tab: 'profile' });
  return items;
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const s = { width: size, height: size, display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const };
  const icons: Record<string, JSX.Element> = {
    dashboard: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="2" y="2" width="7" height="8" rx="2"/><rect x="11" y="2" width="7" height="5" rx="2"/><rect x="2" y="12" width="7" height="6" rx="2"/><rect x="11" y="9" width="7" height="9" rx="2"/></svg>,
    quotes: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 2v16M6 6c0-1.5 1.8-2.5 4-2.5s4 1 4 2.5-1.8 2.5-4 2.5S6 9.5 6 8"/><path d="M14 12c0 1.5-1.8 2.5-4 2.5S6 13.5 6 12"/></svg>,
    bookings: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="14" height="14" rx="2"/><path d="M3 8h14M7 2v4M13 2v4"/><path d="M7 12l2 2 4-4"/></svg>,
    home: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18V8l7-5.5L17 8v10"/><path d="M7 18v-5h6v5"/></svg>,
    diagnostic: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z"/></svg>,
    inspect: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="9" cy="9" r="5.5"/><path d="M13.5 13.5L17 17"/></svg>,
    business: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18V7l7-4 7 4v11"/><path d="M3 18h14M8 13v5M12 13v5M8 9h4"/></svg>,
    settings: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4"/></svg>,
    chevron: <svg style={{ ...s, width: 14, height: 14 }} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 3l4 4-4 4"/></svg>,
    collapse: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M13 4l-6 6 6 6"/></svg>,
    expand: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M7 4l6 6-6 6"/></svg>,
    plus: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M4 10h12"/></svg>,
    arrowOut: <svg style={{ ...s, width: 12, height: 12 }} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 9l6-6M5 3h4v4"/></svg>,
  };
  return icons[name] || null;
}

export default function AccountSidebar({
  collapsed, setCollapsed, activeTab, onNavigate, onNewQuote,
  hasInspectReports, hasWorkspace, userName, userInitials, onNavigateCallback,
}: AccountSidebarProps) {
  const [tooltip, setTooltip] = useState<{ label: string; top: number; left: number } | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountMenuPos, setAccountMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  const accountBtnRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { homeowner, logout } = useAuth();

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth < 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      const inBtn = accountBtnRef.current && accountBtnRef.current.contains(target);
      const inMenu = accountMenuRef.current && accountMenuRef.current.contains(target);
      if (!inBtn && !inMenu) setAccountOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggleAccountMenu() {
    if (!accountBtnRef.current) return;
    const rect = accountBtnRef.current.getBoundingClientRect();
    setAccountMenuPos({ top: rect.top - 8, left: rect.right + 8 });
    setAccountOpen(o => !o);
  }

  const accountMenuItemStyle: React.CSSProperties = {
    width: '100%', padding: '12px 16px', background: 'none', border: 'none',
    fontSize: 14, color: D, cursor: 'pointer', textAlign: 'left',
    fontFamily: "'DM Sans', sans-serif",
  };

  const mobileMenuItemStyle: React.CSSProperties = {
    width: '100%', padding: '16px 20px', background: 'none', border: 'none',
    fontSize: 16, color: D, cursor: 'pointer', textAlign: 'left',
    fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
    borderBottom: '1px solid #F5F0EB',
  };

  function showTooltip(e: React.MouseEvent, label: string) {
    if (!collapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  }

  function hideTooltip() { setTooltip(null); }

  const navItems = getNavItems(hasInspectReports, hasWorkspace);

  function isActive(item: NavItem): boolean {
    return !!item.tab && item.tab === activeTab;
  }

  function handleClick(item: NavItem) {
    if (item.tab) {
      onNavigate(item.tab);
      onNavigateCallback?.();
    } else if (item.href) {
      if (item.external) {
        navigate(item.href);
      } else {
        navigate(item.href);
      }
      onNavigateCallback?.();
    }
  }

  const w = collapsed ? 64 : 252;

  return (
    <div style={{
      width: w, minWidth: w, height: '100vh', background: 'var(--bp-card)',
      borderRight: '1px solid var(--bp-border)', display: 'flex', flexDirection: 'column',
      transition: 'width 0.25s cubic-bezier(.4,0,.2,1), min-width 0.25s cubic-bezier(.4,0,.2,1)',
      position: 'sticky', top: 0, zIndex: 10, overflow: collapsed ? 'visible' : 'hidden', flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{
        height: 64, display: 'flex', alignItems: 'center',
        padding: collapsed ? '0 16px' : '0 20px',
        borderBottom: '1px solid var(--bp-border)',
        justifyContent: collapsed ? 'center' : 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: collapsed ? 22 : 26, color: O }}>
            {collapsed ? 'h' : 'homie'}
          </span>
          {!collapsed && (
            <span style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#fff', fontWeight: 800,
              background: G, padding: '2px 6px', borderRadius: 4,
              letterSpacing: '0.08em', textTransform: 'uppercase', position: 'relative', bottom: 2,
            }}>Personal</span>
          )}
        </div>
        <button onClick={() => { onNavigateCallback ? onNavigateCallback() : setCollapsed(!collapsed); }} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bp-subtle)', padding: 4,
          display: collapsed ? 'none' : 'flex', alignItems: 'center',
        }} title="Close menu">
          <Icon name="collapse" size={18} />
        </button>
      </div>

      {/* New Quote CTA */}
      {!collapsed ? (
        <div style={{ padding: '12px 12px 4px' }}>
          <button onClick={() => { onNewQuote(); onNavigateCallback?.(); }} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 10, border: 'none',
            background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            <Icon name="plus" size={14} /> New Quote
          </button>
        </div>
      ) : (
        <div style={{ padding: '12px 8px 4px', display: 'flex', justifyContent: 'center' }}>
          <button onClick={() => { onNewQuote(); onNavigateCallback?.(); }}
            onMouseEnter={(e) => showTooltip(e, 'New Quote')}
            onMouseLeave={hideTooltip}
            style={{
              width: 40, height: 40, borderRadius: 10, border: 'none',
              background: O, color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <Icon name="plus" size={16} />
          </button>
        </div>
      )}

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px', overflowX: collapsed ? 'visible' : 'hidden' }}>
        {navItems.map(item => {
          if (item.divider) return <div key={item.id} style={{ height: 1, background: 'var(--bp-border)', margin: '8px 8px' }} />;

          const active = isActive(item);
          const isExternalLink = !!item.href;

          return (
            <button key={item.id} onClick={() => handleClick(item)}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bp-hover)'; showTooltip(e, item.label); }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; hideTooltip(); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '10px 0' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: active ? `${O}10` : 'transparent',
                color: active ? O : 'var(--bp-muted)',
                border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14,
                fontFamily: "'DM Sans',sans-serif", fontWeight: active ? 600 : 500,
                transition: 'all 0.15s', whiteSpace: 'nowrap', position: 'relative',
              }}
            >
              <span style={{ flexShrink: 0, display: 'flex' }}><Icon name={item.icon} /></span>
              {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>}
              {!collapsed && isExternalLink && (
                <span style={{ display: 'flex', color: 'var(--bp-subtle)' }}>
                  <Icon name="arrowOut" size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom user — opens account menu */}
      <button
        ref={accountBtnRef}
        onClick={toggleAccountMenu}
        onMouseEnter={(e) => collapsed && showTooltip(e, userName || 'Account')}
        onMouseLeave={hideTooltip}
        style={{
          borderTop: '1px solid var(--bp-border)', padding: collapsed ? '12px 8px' : '12px 16px',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          justifyContent: collapsed ? 'center' : 'flex-start',
          background: accountOpen ? 'var(--bp-hover)' : 'none', border: 'none',
          width: '100%', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          textAlign: 'left',
        }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: G, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: '#fff',
        }}>{userInitials || 'U'}</div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName || 'User'}</div>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', whiteSpace: 'nowrap' }}>Account</div>
          </div>
        )}
      </button>

      {/* Account menu */}
      {accountOpen && accountMenuPos && createPortal(
        isMobile ? (
          <>
            <style>{`@keyframes acct-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } } @keyframes acct-sheet-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
            <div onClick={() => setAccountOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 99998, animation: 'acct-sheet-fade 0.2s ease' }} />
            <div ref={accountMenuRef} style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, background: '#ffffff',
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              boxShadow: '0 -8px 32px rgba(0,0,0,0.18)', zIndex: 99999,
              fontFamily: "'DM Sans', sans-serif",
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
              animation: 'acct-sheet-up 0.25s ease',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E0DAD4' }} />
              </div>
              {homeowner && (
                <div style={{ padding: '8px 20px 16px', borderBottom: '1px solid #F5F0EB', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', background: G,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>{userInitials || 'U'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName || homeowner.email}</div>
                    <div style={{ fontSize: 13, color: '#9B9490', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{homeowner.email}</div>
                  </div>
                </div>
              )}
              <button onClick={() => { setAccountOpen(false); onNavigate('profile'); onNavigateCallback?.(); }} style={mobileMenuItemStyle}>Account settings</button>
              <button onClick={() => { setAccountOpen(false); onNavigate('profile'); onNavigateCallback?.(); }} style={mobileMenuItemStyle}>Notification preferences</button>
              <div style={{ borderTop: '1px solid #F5F0EB', marginTop: 8 }}>
                <button onClick={() => { setAccountOpen(false); logout(); window.location.href = '/'; }} style={{ ...mobileMenuItemStyle, color: '#E24B4A' }}>Sign out</button>
              </div>
            </div>
          </>
        ) : (
          <div ref={accountMenuRef} style={{
            position: 'fixed', bottom: `calc(100vh - ${accountMenuPos.top}px)`, left: accountMenuPos.left,
            background: '#ffffff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            border: '1px solid rgba(0,0,0,0.06)', minWidth: 220, overflow: 'hidden', zIndex: 99999,
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {homeowner && (
              <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: D }}>{userName || homeowner.email}</div>
                <div style={{ fontSize: 12, color: '#9B9490' }}>{homeowner.email}</div>
              </div>
            )}
            <button onClick={() => { setAccountOpen(false); onNavigate('profile'); }} style={accountMenuItemStyle}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>Account settings</button>
            <button onClick={() => { setAccountOpen(false); onNavigate('profile'); }} style={accountMenuItemStyle}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>Notification preferences</button>
            <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)', marginTop: 6 }}>
              <button onClick={() => { setAccountOpen(false); logout(); window.location.href = '/'; }} style={{ ...accountMenuItemStyle, color: '#E24B4A' }}
                onMouseEnter={e => e.currentTarget.style.background = '#FFF5F5'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}>Sign out</button>
            </div>
          </div>
        ),
        document.body
      )}

      {/* Expand button when collapsed */}
      {collapsed && (
        <button onClick={() => setCollapsed(false)} style={{
          position: 'absolute', top: 20, right: -12, width: 24, height: 24,
          borderRadius: '50%', background: 'var(--bp-card)', border: '1px solid var(--bp-border)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--bp-subtle)', boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        }}>
          <Icon name="expand" size={14} />
        </button>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: 'fixed', top: tooltip.top, left: tooltip.left, transform: 'translateY(-50%)',
          background: D, color: '#fff', fontFamily: "'DM Sans', sans-serif", fontSize: 12,
          fontWeight: 600, padding: '6px 12px', borderRadius: 6, whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 99999, boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          <div style={{ position: 'absolute', right: '100%', top: '50%', transform: 'translateY(-50%)', width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: `5px solid ${D}` }} />
          {tooltip.label}
        </div>
      )}
    </div>
  );
}
