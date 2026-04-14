import { type ReactNode } from 'react';
import { W, D } from './constants';

interface InspectLayoutProps {
  children: ReactNode;
  sidebar: ReactNode;
  sidebarMobile?: ReactNode;
  mobileOpen?: boolean;
  setMobileOpen?: (open: boolean) => void;
  resolvedTheme: 'light' | 'dark';
}

function HamburgerIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5h14" /><path d="M3 10h14" /><path d="M3 15h14" />
    </svg>
  );
}

export default function InspectLayout({ children, sidebar, sidebarMobile, mobileOpen, setMobileOpen, resolvedTheme }: InspectLayoutProps) {
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
        .bp-sidebar-desktop { display: flex; }
        .bp-sidebar-mobile-overlay { display: none; }
        .bp-hamburger { display: none; }
        @media (max-width: 768px) {
          .bp-sidebar-desktop { display: none !important; }
          .bp-sidebar-mobile-overlay { display: flex; }
          .bp-hamburger { display: flex !important; }
          .bp-content-padding { padding: 16px !important; }
        }
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Desktop sidebar */}
      <div className="bp-sidebar-desktop" style={{ display: 'flex' }}>
        {sidebar}
      </div>

      {/* Mobile drawer overlay */}
      <div className="bp-sidebar-mobile-overlay" style={{ position: 'fixed', inset: 0, zIndex: 100, pointerEvents: mobileOpen ? 'auto' : 'none' }}>
        <div onClick={() => setMobileOpen?.(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', opacity: mobileOpen ? 1 : 0, transition: 'opacity 0.3s' }} />
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
          <button className="bp-hamburger" onClick={() => setMobileOpen?.(true)} style={{
            display: 'none', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bp-text)', padding: 4,
          }}>
            <HamburgerIcon />
          </button>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--bp-subtle)', fontFamily: "'DM Sans', sans-serif" }}>Homie Inspect</span>
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
