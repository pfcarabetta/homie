import { useState } from 'react';
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
    { id: 'guest-requests', label: 'Guest Requests', icon: 'reported', tab: 'guest-requests', locked: !isPro },
    { id: 'div1', label: '', icon: '', divider: true },
    {
      id: 'vendors-group', label: 'Vendors', icon: 'vendors', children: [
        { id: 'vendors', label: 'Preferred', icon: 'vendors', tab: 'vendors' },
        { id: 'reports-scorecards', label: 'Scorecards', icon: 'scorecards', tab: 'reports', locked: !isPro },
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
  onNavigate: (tab: Tab, options?: { initialView?: string }) => void;
  onNewDispatch: () => void;
  onLockedTab: () => void;
  workspacePlan: string;
  userRole: string;
  userName?: string;
  userInitials?: string;
  userTitle?: string;
}

export default function BusinessSidebar({
  collapsed, setCollapsed, activeTab, onNavigate, onNewDispatch, onLockedTab,
  workspacePlan, userRole, userName, userInitials, userTitle,
}: BusinessSidebarProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ 'dispatch-group': true });
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
    if (item.action === 'new-dispatch') { onNewDispatch(); return; }
    if (item.tab) {
      const opts = item.id === 'reports-scorecards' ? { initialView: 'scorecards' } : undefined;
      onNavigate(item.tab, opts);
    }
  }

  const w = collapsed ? 64 : 252;

  return (
    <div style={{
      width: w, minWidth: w, height: '100vh', background: 'var(--bp-card)',
      borderRight: '1px solid var(--bp-border)', display: 'flex', flexDirection: 'column',
      transition: 'width 0.25s cubic-bezier(.4,0,.2,1), min-width 0.25s cubic-bezier(.4,0,.2,1)',
      position: 'sticky', top: 0, zIndex: 10, overflow: 'hidden', flexShrink: 0,
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
        <button onClick={() => setCollapsed(!collapsed)} style={{
          background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bp-subtle)', padding: 4,
          display: collapsed ? 'none' : 'flex', alignItems: 'center',
        }} title="Collapse sidebar">
          <Icon name="collapse" size={18} />
        </button>
      </div>

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px', overflowX: 'hidden' }}>
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
                  toggle(item.id);
                  if (!active && item.children) {
                    const firstClickable = item.children.find(c => !c.locked && c.tab);
                    if (firstClickable) handleClick(firstClickable);
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
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bp-hover)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                title={collapsed ? item.label : undefined}
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

      {/* Bottom user */}
      <div style={{
        borderTop: '1px solid var(--bp-border)', padding: collapsed ? '12px 8px' : '12px 16px',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: '#E8632B', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: '#fff',
        }}>{userInitials || 'U'}</div>
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap' }}>{userName || 'User'}</div>
            {userTitle && <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', whiteSpace: 'nowrap' }}>{userTitle}</div>}
          </div>
        )}
      </div>

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
    </div>
  );
}
