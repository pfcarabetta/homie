import { useState, type ReactNode } from 'react';
import { W, D } from './constants';
import AvatarDropdown from '@/components/AvatarDropdown';

interface BusinessLayoutProps {
  children: ReactNode;
  sidebar: ReactNode;
  sidebarMobile?: ReactNode;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
  resolvedTheme: 'light' | 'dark';
  workspaceLogo?: string | null;
  workspaceName?: string;
}

function SearchIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="9" cy="9" r="5.5" /><path d="M13.5 13.5L17 17" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M5 8a5 5 0 0110 0c0 4 2 6 2 6H3s2-2 2-6" /><path d="M8.5 17a2 2 0 003 0" />
    </svg>
  );
}

function HamburgerIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5h14" /><path d="M3 10h14" /><path d="M3 15h14" />
    </svg>
  );
}

export default function BusinessLayout({ children, sidebar, sidebarMobile, mobileOpen: mobileOpenProp, setMobileOpen: setMobileOpenProp, resolvedTheme, workspaceLogo, workspaceName }: BusinessLayoutProps) {
  const [mobileOpenInternal, setMobileOpenInternal] = useState(false);
  const mobileOpen = mobileOpenProp ?? mobileOpenInternal;
  const setMobileOpen = setMobileOpenProp ?? setMobileOpenInternal;

  return (
    <div className="bp-portal" data-theme={resolvedTheme} style={{ height: '100vh', background: 'var(--bp-bg)', display: 'flex', overflow: 'hidden' }}>
      <style>{`
        .bp-portal {
          --bp-bg: ${W};
          --bp-card: #ffffff;
          --bp-input: #ffffff;
          --bp-text: ${D};
          --bp-muted: #6B6560;
          --bp-subtle: #9B9490;
          --bp-border: #E0DAD4;
          --bp-hover: #FAFAF8;
          --bp-header: #ffffff;
          --bp-warm: ${W};
          color: var(--bp-text);
          transition: background 0.3s, color 0.3s;
        }
        .bp-portal[data-theme="dark"] {
          --bp-bg: #1A1A1A;
          --bp-card: #242424;
          --bp-input: #2E2E2E;
          --bp-text: #E8E4E0;
          --bp-muted: #9B9490;
          --bp-subtle: #6B6560;
          --bp-border: #3A3A3A;
          --bp-hover: #2E2E2E;
          --bp-header: #1E1E1E;
          --bp-warm: #2E2E2E;
        }
        .bp-portal[data-theme="dark"] input,
        .bp-portal[data-theme="dark"] select,
        .bp-portal[data-theme="dark"] textarea {
          background: var(--bp-input) !important;
          color: var(--bp-text) !important;
          border-color: var(--bp-border) !important;
        }
        .bp-portal[data-theme="dark"] button {
          transition: background 0.15s, color 0.15s;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) {
          .bp-prop-inner { flex-direction: column !important; }
          .bp-prop-img { width: 100% !important; height: 140px !important; min-height: auto !important; }
          .bp-prop-body { padding: 14px !important; }
          .bp-prop-name { font-size: 14px !important; }
          .bp-prop-addr { font-size: 12px !important; margin-top: 2px !important; }
          .bp-prop-actions { gap: 4px !important; }
          .bp-prop-badge { font-size: 10px !important; padding: 2px 8px !important; }
          .bp-prop-type { display: none !important; }
          .bp-prop-details { font-size: 12px !important; gap: 6px !important; margin-top: 6px !important; }
          .bp-prop-notes { font-size: 12px !important; margin-top: 6px !important; }
        }
        .bp-sidebar-desktop { display: flex; }
        .bp-sidebar-mobile-overlay { display: none; }
        .bp-hamburger { display: none; }
        .bp-search-desktop { display: flex; }
        @media (max-width: 768px) {
          .bp-sidebar-desktop { display: none !important; }
          .bp-sidebar-mobile-overlay { display: flex; }
          .bp-hamburger { display: flex !important; }
          .bp-search-desktop { display: none !important; }
          .bp-content-padding { padding: 16px !important; }
          .bp-dashboard-mid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Desktop sidebar */}
      <div className="bp-sidebar-desktop" style={{ display: 'flex' }}>
        {sidebar}
      </div>

      {/* Mobile drawer overlay */}
      <div className="bp-sidebar-mobile-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: mobileOpen ? 'auto' : 'none' }}>
        {/* Backdrop */}
        <div onClick={() => setMobileOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', opacity: mobileOpen ? 1 : 0, transition: 'opacity 0.3s' }} />
        {/* Drawer */}
        <div style={{ position: 'relative', transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', transition: 'transform 0.3s ease', height: '100%', zIndex: 1, width: 280 }}>
          {sidebarMobile || sidebar}
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          height: 64, background: 'var(--bp-header)', borderBottom: '1px solid var(--bp-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0,
        }}>
          {/* Hamburger button (mobile only) */}
          <button className="bp-hamburger" onClick={() => setMobileOpen(true)} style={{
            display: 'none', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bp-text)', padding: 4,
          }}>
            <HamburgerIcon />
          </button>

          {/* Search bar (desktop only) */}
          <div className="bp-search-desktop" style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bp-bg)',
            borderRadius: 10, padding: '8px 14px', width: 280,
          }}>
            <span style={{ color: 'var(--bp-subtle)', display: 'flex' }}><SearchIcon /></span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)' }}>Search properties, tasks, vendors...</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {workspaceLogo && (
              <>
                <img src={workspaceLogo} alt={workspaceName || ''} style={{ height: 48, maxWidth: 200, objectFit: 'contain' }} />
                <div style={{ width: 1, height: 24, background: 'var(--bp-border)' }} />
              </>
            )}
            <div style={{ position: 'relative', cursor: 'pointer', color: 'var(--bp-subtle)' }}>
              <BellIcon />
              <div style={{
                position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                borderRadius: '50%', background: '#E04343', border: '2px solid var(--bp-header)',
              }} />
            </div>
            <AvatarDropdown />
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="bp-content-padding" style={{ padding: 32, maxWidth: 1200 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
