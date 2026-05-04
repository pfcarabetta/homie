import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * `/inspect-portal/demo` is the inspector partner-program preview.
 * Feature flags + UI surfaces in the homeowner portal use this helper
 * to decide whether to short-circuit interactions that would either
 * (a) leak the underlying real test report (PDF source links), or
 * (b) make a network call that would 401 since the demo is unauth'd.
 *
 * Reads `window.location.pathname` so it works without prop drilling
 * through every tab. Safe to call during SSR (returns false).
 */
export function isDemoMode(): boolean {
  return typeof window !== 'undefined'
    && window.location.pathname.startsWith('/inspect-portal/demo');
}

/**
 * In-portal modal explaining why a PDF link is inert in demo mode.
 * Used by `PageCitation` (every per-item "Page N" badge) and the
 * Documents tab "View PDF" button. Self-contained — render with
 * `<DemoPdfModal open={...} onClose={...} />` and the consumer holds
 * the open state.
 */
export function DemoPdfModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  // Portal to document.body so the modal escapes the demo-mode
  // <fieldset disabled> wrapper around the tab content. Without the
  // portal, the "Got it" <button> would itself be disabled by the
  // surrounding fieldset and only the backdrop click would close it.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          background: '#fff', borderRadius: 16,
          padding: '28px 28px 24px',
          maxWidth: 440, width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: '#2D2926', marginBottom: 8, lineHeight: 1.2 }}>
          Your client&apos;s inspection PDF will appear here
        </div>
        <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.6, marginBottom: 22 }}>
          In a real report, this opens the original PDF jumped to the cited page so your client can read the inspector&apos;s exact wording in context. The source PDF is hidden in this sample so the test report stays private.
        </div>
        <button
          onClick={onClose}
          style={{
            display: 'inline-block',
            padding: '10px 22px', borderRadius: 100,
            background: '#E8632B', color: '#fff',
            border: 'none', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14, fontWeight: 600,
          }}
        >Got it</button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Convenience hook: returns `[open, openFn, closeFn]` for any surface
 * that wants to wire a button-click → modal-open in two lines.
 */
export function useDemoPdfModal(): [boolean, () => void, () => void] {
  const [open, setOpen] = useState(false);
  return [open, () => setOpen(true), () => setOpen(false)];
}
