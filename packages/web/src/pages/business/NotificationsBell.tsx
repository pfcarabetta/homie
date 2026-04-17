import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { businessService, type BusinessNotification } from '@/services/api';
import BusinessPortalRoot from './BusinessPortalRoot';

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 003.4 0" />
    </svg>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

const TYPE_ICONS: Record<string, string> = {
  dispatch_created: '\uD83D\uDE9A',     // truck
  provider_response: '\uD83D\uDCAC',    // chat
  booking_confirmed: '\u2705',          // check
  booking_cancelled: '\u274C',          // X
  job_completed: '\uD83C\uDF89',        // tada
  guest_issue_submitted: '\uD83D\uDD14', // bell
  outreach_failed: '\u26A0\uFE0F',      // warning
  approval_needed: '\uD83D\uDD90',      // raised hand
};

export default function NotificationsBell({ workspaceId }: { workspaceId?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [items, setItems] = useState<BusinessNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const loadNotifications = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await businessService.listNotifications(workspaceId, 30);
      if (res.data) {
        setItems(res.data.items);
        setUnreadCount(res.data.unreadCount);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Load unread count on mount and periodically
  useEffect(() => {
    if (!workspaceId) return;
    loadNotifications();
    const interval = setInterval(loadNotifications, 60_000); // poll every 60s
    return () => clearInterval(interval);
  }, [workspaceId, loadNotifications]);

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function toggleOpen() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setOpen(o => !o);
    if (!open) loadNotifications();
  }

  function handleItemClick(n: BusinessNotification, e?: React.MouseEvent) {
    if (e) e.preventDefault();
    setOpen(false);
    // Mark as read in the background (fire-and-forget) before navigating
    if (workspaceId && !n.read) {
      businessService.markNotificationsRead(workspaceId, { ids: [n.id] }).catch(() => { /* ignore */ });
    }
    if (!n.link) return;
    // Hard navigate to guarantee the URL effect re-runs on the destination.
    // React Router's in-place navigation was unreliable here (likely a portal/
    // context interaction with the dropdown).
    window.location.href = n.link;
  }

  async function handleMarkAllRead() {
    if (!workspaceId) return;
    try {
      await businessService.markNotificationsRead(workspaceId, { all: true });
      setUnreadCount(0);
      setItems(prev => prev.map(x => ({ ...x, read: true })));
    } catch { /* ignore */ }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggleOpen}
        style={{
          position: 'relative', cursor: 'pointer', color: 'var(--bp-subtle)',
          background: 'none', border: 'none', padding: 4, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <BellIcon />
        {unreadCount > 0 && (
          <div style={{
            position: 'absolute', top: 0, right: 0,
            minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 8, background: '#E04343',
            border: '2px solid var(--bp-header)',
            color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </button>

      {open && pos && createPortal(
        <BusinessPortalRoot>
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            width: 380,
            maxHeight: 480,
            background: 'var(--bp-card)',
            border: '1px solid var(--bp-border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'DM Sans', sans-serif",
            overflow: 'hidden',
          }}
        >
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid #F0EBE6',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: 'var(--bp-text)' }}>
              Notifications
            </div>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: '#E8632B', fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && items.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--bp-subtle)', fontSize: 13 }}>
                Loading...
              </div>
            )}
            {!loading && items.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--bp-subtle)', fontSize: 13 }}>
                No notifications yet
              </div>
            )}
            {items.map(n => (
              <a
                key={n.id}
                href={n.link || '#'}
                onClick={(e) => handleItemClick(n, e)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #F5F0EB',
                  cursor: n.link ? 'pointer' : 'default',
                  background: n.read ? 'var(--bp-card)' : '#FFF8F3',
                  display: 'flex', gap: 12,
                  transition: 'background 0.1s',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bp-hover)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = n.read ? 'var(--bp-card)' : '#FFF8F3'; }}
              >
                <div style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center' }}>
                  {TYPE_ICONS[n.type] || '\uD83D\uDD14'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.title}
                    </div>
                    {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E8632B', flexShrink: 0 }} />}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--bp-muted)', marginTop: 2, lineHeight: 1.4 }}>
                    {n.body}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginTop: 4 }}>
                    {timeAgo(n.createdAt)}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
        </BusinessPortalRoot>,
        document.body
      )}
    </>
  );
}
