import { useState, useRef, useEffect } from 'react';
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

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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
      <button onClick={() => setOpen(!open)} style={{
        width: 36, height: 36, borderRadius: '50%', background: O, border: 'none',
        color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif", transition: 'opacity 0.15s',
      }}>{initial}</button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          background: 'white', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          border: '1px solid rgba(0,0,0,0.06)', minWidth: 200, overflow: 'hidden', zIndex: 100,
          animation: 'avatarDrop 0.15s ease',
        }}>
          <style>{`@keyframes avatarDrop { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }`}</style>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#2D2926' }}>{displayName}</div>
            {homeowner.first_name && <div style={{ fontSize: 12, color: '#9B9490' }}>{homeowner.email}</div>}
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>{homeowner.membership_tier} plan</div>
          </div>
          {hasWorkspaces && (
            <button onClick={() => { setOpen(false); navigate('/business'); }} style={{
              width: '100%', padding: '12px 16px', background: 'none', border: 'none',
              fontSize: 14, color: G, cursor: 'pointer', textAlign: 'left',
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#F0FDF4'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ fontSize: 16 }}>🏢</span> Business Portal
            </button>
          )}
          <button onClick={() => { setOpen(false); navigate('/account'); }} style={{
            width: '100%', padding: '12px 16px', background: 'none', border: 'none',
            fontSize: 14, color: '#2D2926', cursor: 'pointer', textAlign: 'left',
            fontFamily: "'DM Sans', sans-serif",
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#F9F5F2'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >My Account</button>
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
        </div>
      )}
    </div>
  );
}
