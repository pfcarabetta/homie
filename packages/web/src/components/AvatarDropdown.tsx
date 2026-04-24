import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { businessService } from '@/services/api';

const O = '#E8632B', G = '#1B9E77';

export default function AvatarDropdown() {
  const { homeowner, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [hasWorkspaces, setHasWorkspaces] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** Popover lives in a portal on document.body (see render below),
   *  so it's no longer a descendant of the component's root `ref`.
   *  The click-outside handler has to check this ref separately or
   *  every click inside the popover would be treated as "outside"
   *  → setOpen(false) on mousedown would kill the dropdown before
   *  the click event on the link ever fires. */
  const popoverRef = useRef<HTMLDivElement>(null);
  /** Viewport-anchored position for the portaled popover — recomputed
   *  every time the dropdown opens, on scroll, and on resize. Using a
   *  portal (see below) escapes any ancestor stacking context or
   *  overflow: hidden that would otherwise clip or stack-order the
   *  popover wrong. Critical for /quote's sticky nav (which has
   *  backdrop-filter → creates its own stacking context) and the
   *  root div's overflowX: hidden. */
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const insideButton = ref.current?.contains(e.target as Node);
      const insidePopover = popoverRef.current?.contains(e.target as Node);
      if (!insideButton && !insidePopover) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Recompute position on open + whenever the viewport changes. The
  // popover is `position: fixed` in the portal, so its coordinates
  // come from the avatar button's bounding rect. Closing the
  // dropdown on scroll (rather than trying to re-anchor) matches
  // most dropdown UX and avoids a stale anchor when the sticky nav
  // re-layouts.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8, // 8px gap under the avatar
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    update();
    const onResize = () => update();
    const onScroll = () => setOpen(false);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (isAuthenticated) {
      businessService.listWorkspaces().then(res => {
        if (res.data && res.data.length > 0) setHasWorkspaces(true);
      }).catch(() => {});
    }
  }, [isAuthenticated]);

  if (!isAuthenticated || !homeowner) {
    return (
      <button onClick={() => navigate('/login')} style={{
        background: O, border: 'none', borderRadius: 100,
        padding: '7px 18px', fontSize: 13, fontWeight: 600, color: 'white', cursor: 'pointer',
        fontFamily: "'DM Sans', sans-serif",
      }}>Sign in</button>
    );
  }

  const initial = (homeowner.first_name || homeowner.email).charAt(0).toUpperCase();
  const displayName = homeowner.first_name ? `${homeowner.first_name}${homeowner.last_name ? ' ' + homeowner.last_name : ''}` : homeowner.email;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button ref={buttonRef} onClick={() => setOpen(!open)} style={{
        width: 36, height: 36, borderRadius: '50%', background: O, border: 'none',
        color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif", transition: 'opacity 0.15s',
      }}>{initial}</button>

      {/* Portal the popover into document.body so it isn't trapped by
          the parent nav's stacking context or any `overflow: hidden`
          ancestor. Without the portal, /quote's sticky nav (with
          backdrop-filter) and the root `overflowX: hidden` container
          prevented clicks on the links from reaching their handlers. */}
      {open && pos && createPortal(
        <div ref={popoverRef} style={{
          position: 'fixed', top: pos.top, right: pos.right,
          background: 'white', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          border: '1px solid rgba(0,0,0,0.06)', minWidth: 200, overflow: 'hidden', zIndex: 10000,
          animation: 'avatarDrop 0.15s ease',
        }}>
          <style>{`@keyframes avatarDrop { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }`}</style>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#2D2926' }}>{displayName}</div>
            {homeowner.first_name && <div style={{ fontSize: 12, color: '#9B9490' }}>{homeowner.email}</div>}
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>{homeowner.membership_tier} plan</div>
          </div>
          {hasWorkspaces && (
            <div style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
              <button onClick={() => { setOpen(false); navigate('/business'); }} style={{
                width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                fontSize: 14, color: '#2D2926', cursor: 'pointer', textAlign: 'left',
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: 8,
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#F0FDF4'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 700, color: '#E8632B' }}>homie</span>
                <span style={{
                  fontSize: 8, fontWeight: 800, color: '#fff', background: G,
                  padding: '1.5px 5px', borderRadius: 3, letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>Business</span>
              </button>
              <button onClick={() => { setOpen(false); navigate('/business?tab=settings&focus=profile'); }} style={{
                width: '100%', padding: '12px 16px', background: 'none', border: 'none',
                fontSize: 14, color: '#2D2926', cursor: 'pointer', textAlign: 'left',
                fontFamily: "'DM Sans', sans-serif",
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#F0FDF4'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >My Profile</button>
            </div>
          )}
          <button onClick={() => { setOpen(false); navigate('/account'); }} style={{
            width: '100%', padding: '12px 16px', background: 'none', border: 'none',
            fontSize: 14, color: '#2D2926', cursor: 'pointer', textAlign: 'left',
            fontFamily: "'DM Sans', sans-serif",
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >My Account</button>
          <button onClick={() => { setOpen(false); navigate('/account?tab=home'); }} style={{
            width: '100%', padding: '12px 16px', background: 'none', border: 'none',
            fontSize: 14, color: '#2D2926', cursor: 'pointer', textAlign: 'left',
            fontFamily: "'DM Sans', sans-serif",
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >My Home IQ</button>
          <button onClick={() => { setOpen(false); navigate('/account?tab=quotes'); }} style={{
            width: '100%', padding: '12px 16px', background: 'none', border: 'none',
            fontSize: 14, color: '#2D2926', cursor: 'pointer', textAlign: 'left',
            fontFamily: "'DM Sans', sans-serif",
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >My Quotes</button>
          <button onClick={() => { setOpen(false); navigate('/account?tab=bookings'); }} style={{
            width: '100%', padding: '12px 16px', background: 'none', border: 'none',
            fontSize: 14, color: '#2D2926', cursor: 'pointer', textAlign: 'left',
            fontFamily: "'DM Sans', sans-serif",
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >My Bookings</button>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
            <button onClick={() => { setOpen(false); logout(); window.location.href = '/'; }} style={{
              width: '100%', padding: '12px 16px', background: 'none', border: 'none',
              fontSize: 14, color: '#E24B4A', cursor: 'pointer', textAlign: 'left',
              fontFamily: "'DM Sans', sans-serif",
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#FFF5F5'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >Sign out</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
