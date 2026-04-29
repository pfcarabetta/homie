import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { getAdminKey } from '@/services/admin-api';
import AdminSidebar from './AdminSidebar';

/**
 * Admin portal shell. Mirrors BusinessLayout/InspectorLayout patterns:
 * collapsible sidebar (64↔252 px) with localStorage persistence,
 * sticky 64 px top bar, mobile drawer overlay (replaces the old top
 * slide-down menu), and CSS-variable theme tokens (--ap-*) so admin
 * pages can opt into the same visual system as the business +
 * inspect portals.
 *
 * Theme tokens are light-only for now; dark mode infrastructure is in
 * place behind data-theme="dark" if/when admin gets a toggle.
 */

function HamburgerIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5h14" /><path d="M3 10h14" /><path d="M3 15h14" />
    </svg>
  );
}

const SIDEBAR_COLLAPSE_KEY = 'ap_sidebar_collapsed';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSE_KEY) === '1';
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SIDEBAR_COLLAPSE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  // Auth gate — redirect to /admin login if no key.
  useEffect(() => {
    if (!getAdminKey()) navigate('/admin');
  }, [navigate]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  // Derive a short page title from the current path so the mobile top
  // bar shows context when the sidebar is hidden.
  const pageTitle = (() => {
    const seg = location.pathname.split('/')[2];
    if (!seg) return 'Admin';
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  })();

  return (
    <div className="ap-portal" style={{ height: '100vh', background: 'var(--ap-bg)', display: 'flex', overflow: 'hidden' }}>
      <style>{`
        .ap-portal {
          --ap-bg: #F9F5F2;
          --ap-card: #ffffff;
          --ap-text: #2D2926;
          --ap-muted: #6B6560;
          --ap-subtle: #9B9490;
          --ap-border: #E0DAD4;
          --ap-hover: #FAFAF8;
          --ap-header: #ffffff;
          color: var(--ap-text);
        }
        .ap-portal[data-theme="dark"] {
          --ap-bg: #1A1A1A;
          --ap-card: #242424;
          --ap-text: #E8E4E0;
          --ap-muted: #9B9490;
          --ap-subtle: #6B6560;
          --ap-border: #3A3A3A;
          --ap-hover: #2E2E2E;
          --ap-header: #1E1E1E;
        }
        .ap-sidebar-desktop { display: flex; }
        .ap-sidebar-mobile-overlay { display: none; }
        .ap-hamburger { display: none; }
        @media (max-width: 768px) {
          .ap-sidebar-desktop { display: none !important; }
          .ap-sidebar-mobile-overlay { display: flex; }
          .ap-hamburger { display: flex !important; }
          .ap-content-padding { padding: 16px !important; }
        }
      `}</style>

      {/* Desktop sidebar */}
      <div className="ap-sidebar-desktop" style={{ display: 'flex' }}>
        <AdminSidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      </div>

      {/* Mobile drawer overlay */}
      <div
        className="ap-sidebar-mobile-overlay"
        style={{
          position: 'fixed', inset: 0, zIndex: 100,
          pointerEvents: mobileOpen ? 'auto' : 'none',
        }}
      >
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
            opacity: mobileOpen ? 1 : 0, transition: 'opacity 0.3s',
          }}
        />
        <div
          style={{
            position: 'relative',
            transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.3s ease',
            height: '100%', zIndex: 1, width: 280,
          }}
        >
          <AdminSidebar
            collapsed={false}
            setCollapsed={() => { /* drawer always renders expanded */ }}
            onNavigateCallback={() => setMobileOpen(false)}
          />
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <div
          className="border-b border-ap-border"
          style={{
            height: 64, background: 'var(--ap-header)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 24px', flexShrink: 0,
          }}
        >
          <button
            className="ap-hamburger text-ap-text"
            onClick={() => setMobileOpen(true)}
            style={{
              display: 'none', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            }}
            aria-label="Open menu"
          >
            <HamburgerIcon />
          </button>
          <div className="font-display font-bold text-ap-text" style={{ fontSize: 18 }}>
            {pageTitle}
          </div>
          <div className="font-sans font-medium text-ap-subtle" style={{ fontSize: 13, letterSpacing: '.06em', textTransform: 'uppercase' }}>
            Admin
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="ap-content-padding" style={{ padding: 32, maxWidth: 1280, margin: '0 auto' }}>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
