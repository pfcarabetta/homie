import { useState, useEffect, type ReactNode } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useInspectorAuth } from '@/contexts/InspectorAuthContext';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: ReactNode;
}

function DashboardIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="2" y="2" width="7" height="8" rx="2" /><rect x="11" y="2" width="7" height="5" rx="2" />
      <rect x="2" y="12" width="7" height="6" rx="2" /><rect x="11" y="9" width="7" height="9" rx="2" />
    </svg>
  );
}

function ReportsIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2h8l4 4v12a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1z" />
      <path d="M12 2v4h4" /><path d="M7 10h6M7 13h4" />
    </svg>
  );
}

function LeadsIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="7" cy="7" r="3" /><path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" />
      <path d="M14 8l2 2 3-3" />
    </svg>
  );
}

function EarningsIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M10 2v16M6 6c0-1.5 1.8-2.5 4-2.5s4 1 4 2.5-1.8 2.5-4 2.5S6 9.5 6 8" />
      <path d="M14 12c0 1.5-1.8 2.5-4 2.5S6 13.5 6 12" />
    </svg>
  );
}

function MarketingIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 3l-8 5-8-5" /><path d="M2 3v10a2 2 0 002 2h12a2 2 0 002-2V3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M15.8 4.2l-1.4 1.4M5.6 14.4l-1.4 1.4" />
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/inspector', icon: <DashboardIcon /> },
  { id: 'reports', label: 'Reports', path: '/inspector/reports', icon: <ReportsIcon /> },
  { id: 'leads', label: 'Leads', path: '/inspector/leads', icon: <LeadsIcon /> },
  { id: 'earnings', label: 'Earnings', path: '/inspector/earnings', icon: <EarningsIcon /> },
  { id: 'marketing', label: 'Marketing', path: '/inspector/marketing', icon: <MarketingIcon /> },
  { id: 'settings', label: 'Settings', path: '/inspector/settings', icon: <SettingsIcon /> },
];

function isActivePath(itemPath: string, currentPath: string): boolean {
  if (itemPath === '/inspector') return currentPath === '/inspector';
  return currentPath.startsWith(itemPath);
}

export default function InspectorLayout() {
  const { inspector, isAuthenticated, logout } = useInspectorAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/inspector/login');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    function onResize() { setIsMobile(window.innerWidth <= 768); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setAvatarOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated) return null;

  const initials = inspector?.companyName
    ? inspector.companyName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'IP';

  function handleNav(path: string) {
    navigate(path);
    setMobileOpen(false);
  }

  function handleLogout() {
    logout();
    navigate('/inspector/login');
  }

  const sidebarContent = (
    <>
      {/* Logo */}
      <div style={{
        height: 64, display: 'flex', alignItems: 'center', padding: '0 20px',
        borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
      }}>
        <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 26, color: O }}>
          homie
        </span>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#9B9490', fontWeight: 500, marginLeft: 6 }}>
          partner
        </span>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const active = isActivePath(item.path, location.pathname);
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.path)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                marginBottom: 2,
                background: active ? 'rgba(232,99,43,0.08)' : 'transparent',
                border: 'none',
                borderLeft: active ? `3px solid ${O}` : '3px solid transparent',
                borderRadius: 8,
                cursor: 'pointer',
                color: active ? O : '#9B9490',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#E0DAD4';
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLButtonElement).style.color = '#9B9490';
              }}
            >
              <span style={{ display: 'flex', flexShrink: 0 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </>
  );

  // Mobile bottom nav
  if (isMobile) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: W }}>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

        {/* Top bar */}
        <div style={{
          height: 56, background: '#ffffff', borderBottom: '1px solid #E0DAD4',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 20, color: O }}>homie</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: '#9B9490', fontWeight: 500 }}>partner</span>
          </div>
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setAvatarOpen(!avatarOpen)}
              style={{
                width: 32, height: 32, borderRadius: '50%', background: D, color: '#fff',
                border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {initials}
            </button>
            {avatarOpen && (
              <div style={{
                position: 'absolute', top: 40, right: 0, background: '#fff', border: '1px solid #E0DAD4',
                borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 160, overflow: 'hidden',
              }}>
                <button onClick={() => handleNav('/inspector/settings')} style={{
                  width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                  fontSize: 14, color: D, cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
                }}>Settings</button>
                <button onClick={handleLogout} style={{
                  width: '100%', padding: '12px 16px', background: 'none', border: 'none', borderTop: '1px solid #E0DAD4',
                  fontSize: 14, color: '#E24B4A', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
                }}>Log out</button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <Outlet />
        </div>

        {/* Bottom nav */}
        <div style={{
          display: 'flex', background: D, borderTop: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0, justifyContent: 'space-around', padding: '6px 0 env(safe-area-inset-bottom, 6px)',
        }}>
          {NAV_ITEMS.slice(0, 5).map(item => {
            const active = isActivePath(item.path, location.pathname);
            return (
              <button
                key={item.id}
                onClick={() => handleNav(item.path)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px',
                  color: active ? O : '#9B9490', fontFamily: "'DM Sans', sans-serif",
                  fontSize: 10, fontWeight: active ? 600 : 400,
                }}
              >
                <span style={{ display: 'flex' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Desktop layout
  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: W }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <div style={{
        width: 252, minWidth: 252, height: '100vh', background: D,
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        {sidebarContent}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          height: 64, background: '#ffffff', borderBottom: '1px solid #E0DAD4',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 24px', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500, color: D }}>
              {inspector?.companyName ?? 'Inspector'}
            </span>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setAvatarOpen(!avatarOpen)}
                style={{
                  width: 36, height: 36, borderRadius: '50%', background: D, color: '#fff',
                  border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {initials}
              </button>
              {avatarOpen && (
                <div style={{
                  position: 'absolute', top: 44, right: 0, background: '#fff', border: '1px solid #E0DAD4',
                  borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 180, overflow: 'hidden',
                }}>
                  <button
                    onClick={() => handleNav('/inspector/settings')}
                    style={{
                      width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                      fontSize: 14, color: D, cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F9F5F2'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    style={{
                      width: '100%', padding: '12px 16px', background: 'none', border: 'none', borderTop: '1px solid #E0DAD4',
                      fontSize: 14, color: '#E24B4A', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FFF5F5'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: 32, maxWidth: 1200 }}>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
