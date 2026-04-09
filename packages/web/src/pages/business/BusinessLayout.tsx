import type { ReactNode } from 'react';
import { W, D } from './constants';
import AvatarDropdown from '@/components/AvatarDropdown';

interface BusinessLayoutProps {
  children: ReactNode;
  sidebar: ReactNode;
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

export default function BusinessLayout({ children, sidebar, resolvedTheme, workspaceLogo, workspaceName }: BusinessLayoutProps) {
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
          .bp-prop-card { flex-direction: column !important; }
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
      `}</style>

      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      {sidebar}

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          height: 64, background: 'var(--bp-header)', borderBottom: '1px solid var(--bp-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bp-bg)',
            borderRadius: 10, padding: '8px 14px', width: 280,
          }}>
            <span style={{ color: 'var(--bp-subtle)', display: 'flex' }}><SearchIcon /></span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)' }}>Search properties, tasks, vendors...</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {workspaceLogo && (
              <>
                <img src={workspaceLogo} alt={workspaceName || ''} style={{ height: 32, maxWidth: 120, objectFit: 'contain' }} />
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
          <div style={{ padding: 32, maxWidth: 1200 }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
