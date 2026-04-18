import { type ReactNode } from 'react';

const W = '#F9F5F2';
const D = '#2D2926';

interface AccountLayoutProps {
  children: ReactNode;
  sidebar: ReactNode;
  sidebarMobile?: ReactNode;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

function HamburgerIcon() {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 5h14" /><path d="M3 10h14" /><path d="M3 15h14" />
    </svg>
  );
}

/**
 * Layout shell for the consumer Account portal.
 * Mirrors the Business + Inspect portal structure: sticky sidebar on
 * desktop, slide-in drawer on mobile, top bar with hamburger button.
 */
export default function AccountLayout({
  children, sidebar, sidebarMobile, mobileOpen, setMobileOpen,
}: AccountLayoutProps) {
  return (
    <div className="bp-portal" style={{ height: '100vh', background: 'var(--bp-bg)', display: 'flex', overflow: 'hidden' }}>
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
        <div onClick={() => setMobileOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', opacity: mobileOpen ? 1 : 0, transition: 'opacity 0.3s' }} />
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
          <button className="bp-hamburger" onClick={() => setMobileOpen(true)} style={{
            display: 'none', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bp-text)', padding: 4,
          }}>
            <HamburgerIcon />
          </button>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--bp-subtle)', fontFamily: "'DM Sans', sans-serif" }}>Homie Personal</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="bp-content-padding" style={{ padding: 32, maxWidth: 1100, margin: '0 auto' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
