import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useInspectorAuth } from '@/contexts/InspectorAuthContext';
import InspectorSidebar from './InspectorSidebar';

/**
 * Inspector portal shell. Mirrors the Business portal's
 * BusinessLayout/BusinessSidebar pattern so the two surfaces feel like
 * the same product — collapsible sidebar with localStorage persistence,
 * sticky 64px top bar, mobile drawer overlay (instead of the old bottom
 * nav). Page content renders into <Outlet /> with 32px padding and a
 * 1200px max-width, matching Business.
 *
 * Theme tokens are exposed as CSS variables (--ip-*) so individual
 * pages can opt into them gradually without breaking. Light-only for
 * now; dark-mode wiring is in place behind data-theme="dark" if/when
 * we surface a toggle.
 */

function HamburgerIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5h14" /><path d="M3 10h14" /><path d="M3 15h14" />
    </svg>
  );
}

const SIDEBAR_COLLAPSE_KEY = 'ip_sidebar_collapsed';

export default function InspectorLayout() {
  const { inspector, isAuthenticated } = useInspectorAuth();
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

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/inspector/login');
    }
  }, [isAuthenticated, navigate]);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  if (!isAuthenticated) return null;

  return (
    <div className="ip-portal" style={{ height: '100vh', background: 'var(--ip-bg)', display: 'flex', overflow: 'hidden' }}>
      <style>{`
        .ip-portal {
          --ip-bg: #F9F5F2;
          --ip-card: #ffffff;
          --ip-input: #ffffff;
          --ip-text: #2D2926;
          --ip-muted: #6B6560;
          --ip-subtle: #9B9490;
          --ip-border: #E0DAD4;
          --ip-hover: #FAFAF8;
          --ip-header: #ffffff;
          color: var(--ip-text);
        }
        .ip-portal[data-theme="dark"] {
          --ip-bg: #1A1A1A;
          --ip-card: #242424;
          --ip-input: #2E2E2E;
          --ip-text: #E8E4E0;
          --ip-muted: #9B9490;
          --ip-subtle: #6B6560;
          --ip-border: #3A3A3A;
          --ip-hover: #2E2E2E;
          --ip-header: #1E1E1E;
        }
        .ip-sidebar-desktop { display: flex; }
        .ip-sidebar-mobile-overlay { display: none; }
        .ip-hamburger { display: none; }
        @media (max-width: 768px) {
          .ip-sidebar-desktop { display: none !important; }
          .ip-sidebar-mobile-overlay { display: flex; }
          .ip-hamburger { display: flex !important; }
          .ip-content-padding { padding: 16px !important; }
        }
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Desktop sidebar */}
      <div className="ip-sidebar-desktop" style={{ display: 'flex' }}>
        <InspectorSidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      </div>

      {/* Mobile drawer overlay */}
      <div className="ip-sidebar-mobile-overlay" style={{
        position: 'fixed', inset: 0, zIndex: 100,
        pointerEvents: mobileOpen ? 'auto' : 'none',
      }}>
        <div onClick={() => setMobileOpen(false)} style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
          opacity: mobileOpen ? 1 : 0, transition: 'opacity 0.3s',
        }} />
        <div style={{
          position: 'relative',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.3s ease',
          height: '100%', zIndex: 1, width: 280,
        }}>
          <InspectorSidebar
            collapsed={false}
            setCollapsed={() => { /* drawer always renders expanded */ }}
            onNavigateCallback={() => setMobileOpen(false)}
          />
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          height: 64, background: 'var(--ip-header)',
          borderBottom: '1px solid var(--ip-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 24px', flexShrink: 0,
        }}>
          <button className="ip-hamburger" onClick={() => setMobileOpen(true)} style={{
            display: 'none', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ip-text)', padding: 4,
          }}>
            <HamburgerIcon />
          </button>
          {/* Spacer keeps right-aligned items pinned right on both desktop + mobile */}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14, fontWeight: 500, color: 'var(--ip-text)',
            }}>
              {inspector?.companyName ?? 'Inspector'}
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="ip-content-padding" style={{ padding: 32, maxWidth: 1200 }}>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
