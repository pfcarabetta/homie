import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { Tab } from './constants';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  tab?: Tab;
  action?: 'new-dispatch';
  locked?: boolean;
  adminOnly?: boolean;
  children?: NavChild[];
  divider?: boolean;
}

interface NavChild {
  id: string;
  label: string;
  icon: string;
  tab?: Tab;
  action?: 'new-dispatch';
  locked?: boolean;
}

function getNavItems(plan: string, role: string): NavItem[] {
  const isPro = ['professional', 'business', 'enterprise'].includes(plan);
  const isAdmin = role === 'admin';

  return [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', tab: 'dashboard' },
    { id: 'properties', label: 'Properties', icon: 'properties', tab: 'properties' },
    {
      id: 'dispatch-group', label: 'Dispatch', icon: 'dispatch', children: [
        { id: 'dispatch-new', label: 'New Dispatch', icon: 'plus', action: 'new-dispatch' },
        { id: 'dispatches', label: 'Active Jobs', icon: 'dispatch', tab: 'dispatches' },
        { id: 'bookings', label: 'Bookings', icon: 'approvals', tab: 'bookings' },
        { id: 'schedules', label: 'Auto-Dispatch', icon: 'history', tab: 'schedules', locked: !isPro },
      ],
    },
    {
      id: 'guest-group', label: 'Guest Requests', icon: 'reported', locked: !isPro, children: [
        { id: 'guest-issues', label: 'Requests', icon: 'reported', tab: 'guest-issues' },
        { id: 'guest-auto-dispatch', label: 'Auto-Dispatch', icon: 'history', tab: 'guest-auto-dispatch' },
        { id: 'guest-settings', label: 'Settings', icon: 'settings', tab: 'guest-settings' },
        { id: 'guest-qr-codes', label: 'QR Codes', icon: 'search', tab: 'guest-qr-codes' },
      ],
    },
    { id: 'div1', label: '', icon: '', divider: true },
    {
      id: 'vendors-group', label: 'Providers', icon: 'vendors', children: [
        { id: 'vendors', label: 'Preferred', icon: 'vendors', tab: 'vendors' },
        { id: 'reports-scorecards', label: 'Scorecards', icon: 'scorecards', tab: 'scorecards', locked: !isPro },
      ],
    },
    { id: 'reports', label: 'Reports', icon: 'costs', tab: 'reports', locked: !isPro },
    { id: 'team', label: 'Team', icon: 'team', tab: 'team' },
    { id: 'div2', label: '', icon: '', divider: true },
    { id: 'settings', label: 'Settings', icon: 'settings', tab: 'settings', adminOnly: true },
    { id: 'billing', label: 'Billing', icon: 'pms', tab: 'billing', adminOnly: true },
  ];
}

// SVG icons adapted from reference design
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const s = { width: size, height: size, display: 'inline-flex' as const, alignItems: 'center' as const, justifyContent: 'center' as const };
  const icons: Record<string, JSX.Element> = {
    dashboard: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="2" y="2" width="7" height="8" rx="2"/><rect x="11" y="2" width="7" height="5" rx="2"/><rect x="2" y="12" width="7" height="6" rx="2"/><rect x="11" y="9" width="7" height="9" rx="2"/></svg>,
    properties: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18V8l7-5.5L17 8v10"/><path d="M7 18v-5h6v5"/></svg>,
    dispatch: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M2 5h16M2 10h16M2 15h10"/><circle cx="16" cy="15" r="2.5"/></svg>,
    vendors: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="7" cy="7" r="3"/><path d="M2 17c0-3 2.5-5 5-5s5 2 5 5"/><circle cx="14.5" cy="6" r="2"/><path d="M18 15c0-2-1.5-3.5-3.5-3.5"/></svg>,
    costs: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 2v16M6 6c0-1.5 1.8-2.5 4-2.5s4 1 4 2.5-1.8 2.5-4 2.5S6 9.5 6 8"/><path d="M14 12c0 1.5-1.8 2.5-4 2.5S6 13.5 6 12"/></svg>,
    team: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="6" r="3"/><path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>,
    settings: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4"/></svg>,
    chevron: <svg style={{ ...s, width: 14, height: 14 }} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 3l4 4-4 4"/></svg>,
    collapse: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M13 4l-6 6 6 6"/></svg>,
    expand: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M7 4l6 6-6 6"/></svg>,
    plus: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M4 10h12"/></svg>,
    reported: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M3 3l14 0 0 11-5 3H3z"/><path d="M7 7h6M7 10h4"/></svg>,
    approvals: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="7"/><path d="M7 10l2 2 4-4"/></svg>,
    history: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="10" cy="10" r="7"/><path d="M10 6v4l3 2"/></svg>,
    pms: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M2 8h16"/><path d="M6 12h3M6 14h5"/></svg>,
    scorecards: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 18V9M10 18V5M14 18V11"/></svg>,
    search: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="9" cy="9" r="5.5"/><path d="M13.5 13.5L17 17"/></svg>,
    bell: <svg style={s} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 8a5 5 0 0110 0c0 4 2 6 2 6H3s2-2 2-6"/><path d="M8.5 17a2 2 0 003 0"/></svg>,
    lock: <svg style={{ ...s, width: 12, height: 12 }} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="9" width="12" height="9" rx="2"/><path d="M7 9V6a3 3 0 016 0v3"/></svg>,
  };
  return icons[name] || null;
}

interface BusinessSidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  activeTab: Tab;
  onNavigate: (tab: Tab) => void;
  onNewDispatch: () => void;
  onLockedTab: () => void;
  workspacePlan: string;
  userRole: string;
  userName?: string;
  userInitials?: string;
  userTitle?: string;
  onNavigateCallback?: () => void;
}

export default function BusinessSidebar({
  collapsed, setCollapsed, activeTab, onNavigate, onNewDispatch, onLockedTab,
  workspacePlan, userRole, userName, userInitials, userTitle, onNavigateCallback,
}: BusinessSidebarProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'dispatch-group': true });
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
    fontSize: 14, color: '#2D2926', cursor: 'pointer', textAlign: 'left',
    fontFamily: "'DM Sans', sans-serif",
  };

  const mobileMenuItemStyle: React.CSSProperties = {
    width: '100%', padding: '16px 20px', background: 'none', border: 'none',
    fontSize: 16, color: '#2D2926', cursor: 'pointer', textAlign: 'left',
    fontFamily: "'DM Sans', sans-serif", fontWeight: 500,
    borderBottom: '1px solid #F5F0EB',
  };

  function showTooltip(e: React.MouseEvent, label: string) {
    if (!collapsed) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2, left: rect.right + 10 });
  }

  function hideTooltip() { setTooltip(null); }
  const navItems = getNavItems(workspacePlan, userRole);

  function toggle(id: string) {
    setExpanded(p => ({ ...p, [id]: !p[id] }));
  }

  function isActive(item: NavItem): boolean {
    if (item.tab && item.tab === activeTab) return true;
    if (item.children) return item.children.some(c => c.tab === activeTab);
    return false;
  }

  function handleClick(item: NavItem | NavChild) {
    if (item.locked) { onLockedTab(); return; }
    if (item.action === 'new-dispatch') { onNewDispatch(); onNavigateCallback?.(); return; }
    if (item.tab) {
      onNavigate(item.tab);
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
          <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: collapsed ? 22 : 26, color: '#E8632B' }}>
            {collapsed ? 'h' : 'homie'}
          </span>
          {!collapsed && <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', fontWeight: 500 }}>for business</span>}
        </div>
        <button onClick={() => { onNavigateCallback ? onNavigateCallback() : setCollapsed(!collapsed); }} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bp-subtle)', padding: 4,
          display: collapsed ? 'none' : 'flex', alignItems: 'center',
        }} title="Close menu">
          <Icon name="collapse" size={18} />
        </button>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', overflowX: collapsed ? 'visible' : 'hidden' }}>
        {navItems.map(item => {
          if (item.divider) return <div key={item.id} style={{ height: 1, background: 'var(--bp-border)', margin: '8px 8px' }} />;
          if (item.adminOnly && userRole !== 'admin') return null;

          const active = isActive(item);
          const isExp = expanded[item.id];
          const hasChildren = !!item.children;

          return (
            <div key={item.id}>
              <button onClick={() => {
                if (hasChildren) {
                  if (collapsed) {
                    // Expand the sidebar to reveal sub-menu
                    setCollapsed(false);
                    setExpanded(p => ({ ...p, [item.id]: true }));
                  } else {
                    const wasExpanded = expanded[item.id];
                    toggle(item.id);
                    if (!wasExpanded && !active && item.children) {
                      const firstClickable = item.children.find(c => !c.locked && c.tab);
                      if (firstClickable && firstClickable.tab) {
                        onNavigate(firstClickable.tab);
                      }
                    }
                  }
                } else {
                  handleClick(item);
                }
              }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '10px 0' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: active ? '#E8632B10' : 'transparent',
                color: item.locked ? 'var(--bp-subtle)' : active ? '#E8632B' : 'var(--bp-muted)',
                border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 14,
                fontFamily: "'DM Sans',sans-serif", fontWeight: active ? 600 : 500,
                transition: 'all 0.15s', whiteSpace: 'nowrap', position: 'relative',
                opacity: item.locked ? 0.6 : 1,
              }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bp-hover)'; showTooltip(e, item.label); }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; hideTooltip(); }}
              >
                <span style={{ flexShrink: 0, display: 'flex' }}><Icon name={item.icon} /></span>
                {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>}
                {!collapsed && item.locked && <Icon name="lock" size={12} />}
                {!collapsed && hasChildren && (
                  <span style={{ transform: isExp ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s', display: 'flex' }}>
                    <Icon name="chevron" />
                  </span>
                )}
              </button>

              {/* Children */}
              {hasChildren && !collapsed && (
                <div style={{
                  maxHeight: isExp ? 300 : 0, overflow: 'hidden',
                  transition: 'max-height 0.25s cubic-bezier(.4,0,.2,1)',
                }}>
                  {item.children!.map(child => {
                    if (child.locked && !['professional', 'business', 'enterprise'].includes(workspacePlan)) {
                      // Show locked child
                    }
                    const childActive = child.tab === activeTab;
                    return (
                      <button key={child.id} onClick={() => handleClick(child)} style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px 8px 44px', background: childActive ? '#E8632B10' : 'transparent',
                        color: child.locked ? 'var(--bp-subtle)' : childActive ? '#E8632B' : 'var(--bp-subtle)',
                        border: 'none', borderRadius: 8,
                        cursor: 'pointer', fontSize: 13, fontFamily: "'DM Sans',sans-serif",
                        fontWeight: childActive ? 600 : 400, transition: 'all 0.15s', whiteSpace: 'nowrap',
                        opacity: child.locked ? 0.6 : 1,
                      }}
                        onMouseEnter={e => { if (!childActive) (e.currentTarget as HTMLElement).style.background = 'var(--bp-hover)'; }}
                        onMouseLeave={e => { if (!childActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <span style={{ display: 'flex', flexShrink: 0 }}><Icon name={child.icon} size={16} /></span>
                        <span style={{ flex: 1, textAlign: 'left' }}>{child.label}</span>
                        {child.locked && <Icon name="lock" size={12} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
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
          width: 36, height: 36, borderRadius: '50%', background: '#E8632B', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: '#fff',
        }}>{userInitials || 'U'}</div>
        {!collapsed && (
          <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName || 'User'}</div>
            {userTitle && <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', whiteSpace: 'nowrap' }}>{userTitle}</div>}
          </div>
        )}
      </button>

      {/* Account menu — bottom sheet on mobile, popover on desktop, portaled to body */}
      {accountOpen && accountMenuPos && createPortal(
        isMobile ? (
          <>
            <style>{`@keyframes bp-sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } } @keyframes bp-sheet-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
            {/* Backdrop */}
            <div
              onClick={() => setAccountOpen(false)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                zIndex: 99998, animation: 'bp-sheet-fade 0.2s ease',
              }}
            />
            {/* Bottom sheet */}
            <div
              ref={accountMenuRef}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                background: '#ffffff',
                borderTopLeftRadius: 18, borderTopRightRadius: 18,
                boxShadow: '0 -8px 32px rgba(0,0,0,0.18)',
                zIndex: 99999,
                fontFamily: "'DM Sans', sans-serif",
                paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
                animation: 'bp-sheet-up 0.25s ease',
              }}
            >
              {/* Drag handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: '#E0DAD4' }} />
              </div>
              {homeowner && (
                <div style={{ padding: '8px 20px 16px', borderBottom: '1px solid #F5F0EB', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', background: '#E8632B',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0,
                  }}>{userInitials || 'U'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: '#2D2926', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName || homeowner.email}</div>
                    <div style={{ fontSize: 13, color: '#9B9490', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{homeowner.email}</div>
                  </div>
                </div>
              )}
              <button onClick={() => { setAccountOpen(false); navigate('/business?tab=settings&focus=profile'); }} style={mobileMenuItemStyle}>Workspace Profile</button>
              <button onClick={() => { setAccountOpen(false); navigate('/business?tab=settings&focus=workspace'); }} style={mobileMenuItemStyle}>Workspace Settings</button>
              <button onClick={() => { setAccountOpen(false); navigate('/business?tab=billing'); }} style={mobileMenuItemStyle}>Billing</button>
              <button onClick={() => { setAccountOpen(false); navigate('/business?tab=team'); }} style={mobileMenuItemStyle}>Team</button>

              {/* Highlighted: Personal Homie service */}
              <div style={{ padding: '14px 16px 4px' }}>
                <button
                  onClick={() => { setAccountOpen(false); navigate('/account'); }}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #FFF3E8 0%, #FFE8D6 100%)',
                    border: '1px solid #F5C9A8',
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    fontFamily: "'DM Sans', sans-serif",
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                  }}>{'\uD83C\uDFE0'}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#2D2926', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontFamily: 'Fraunces, serif', fontSize: 14, color: '#E8632B' }}>homie</span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: '#1B9E77', padding: '2px 6px', borderRadius: 3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Personal</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6B6560', marginTop: 2 }}>Home services for your own home</div>
                  </div>
                  <span style={{ color: '#E8632B', fontSize: 18, flexShrink: 0 }}>{'\u2192'}</span>
                </button>
              </div>

              <div style={{ borderTop: '1px solid #F5F0EB', marginTop: 8 }}>
                <button onClick={() => { setAccountOpen(false); logout(); window.location.href = '/'; }} style={{ ...mobileMenuItemStyle, color: '#E24B4A' }}>Sign out</button>
              </div>
            </div>
          </>
        ) : (
          <div
            ref={accountMenuRef}
            style={{
              position: 'fixed',
              bottom: `calc(100vh - ${accountMenuPos.top}px)`,
              left: accountMenuPos.left,
              background: '#ffffff',
              borderRadius: 12,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              border: '1px solid rgba(0,0,0,0.06)',
              minWidth: 220,
              overflow: 'hidden',
              zIndex: 99999,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {homeowner && (
              <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#2D2926' }}>{userName || homeowner.email}</div>
                <div style={{ fontSize: 12, color: '#9B9490' }}>{homeowner.email}</div>
              </div>
            )}
            <button onClick={() => { setAccountOpen(false); navigate('/business?tab=settings&focus=profile'); }} style={accountMenuItemStyle}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>Workspace Profile</button>
            <button onClick={() => { setAccountOpen(false); navigate('/business?tab=settings&focus=workspace'); }} style={accountMenuItemStyle}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>Workspace Settings</button>
            <button onClick={() => { setAccountOpen(false); navigate('/business?tab=billing'); }} style={accountMenuItemStyle}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>Billing</button>
            <button onClick={() => { setAccountOpen(false); navigate('/business?tab=team'); }} style={accountMenuItemStyle}
              onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>Team</button>

            {/* Highlighted: Personal Homie service */}
            <div style={{ padding: '12px 12px 4px' }}>
              <button
                onClick={() => { setAccountOpen(false); navigate('/account'); }}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #FFF3E8 0%, #FFE8D6 100%)',
                  border: '1px solid #F5C9A8',
                  borderRadius: 10,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, background: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>{'\uD83C\uDFE0'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#2D2926', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: 'Fraunces, serif', fontSize: 13, color: '#E8632B' }}>homie</span>
                    <span style={{ fontSize: 8, fontWeight: 800, color: '#fff', background: '#1B9E77', padding: '1.5px 5px', borderRadius: 3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Personal</span>
                  </div>
                  <div style={{ fontSize: 10, color: '#6B6560', marginTop: 1 }}>Home services for your own home</div>
                </div>
                <span style={{ color: '#E8632B', fontSize: 15, flexShrink: 0 }}>{'\u2192'}</span>
              </button>
            </div>

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
      {/* Tooltip rendered as fixed overlay */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          top: tooltip.top,
          left: tooltip.left,
          transform: 'translateY(-50%)',
          background: '#2D2926',
          color: '#fff',
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          fontWeight: 600,
          padding: '6px 12px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 99999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          <div style={{
            position: 'absolute',
            right: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            width: 0, height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderRight: '5px solid #2D2926',
          }} />
          {tooltip.label}
        </div>
      )}
    </div>
  );
}
