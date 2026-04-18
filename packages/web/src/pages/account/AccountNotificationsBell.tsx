import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { accountService, type AccountNotification } from '@/services/api';

const O = '#E8632B';
const D = '#2D2926';

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
  quote_received: '\uD83D\uDCB0',       // money — new quote
  provider_response: '\uD83D\uDCAC',    // chat
  booking_confirmed: '\u2705',          // check
  booking_cancelled: '\u274C',          // X
  booking_message: '\uD83D\uDCAC',      // chat
  job_completed: '\uD83C\uDF89',        // tada
  outreach_failed: '\u26A0\uFE0F',      // warning
};

/**
 * Notifications bell for the consumer Account portal. Mirrors the Business
 * NotificationsBell in look + behavior — polls every 60s, dropdown shows
 * recent items with unread highlighting, "Mark all read" header action.
 * Marks individual items read on click before navigating.
 */
export default function AccountNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [items, setItems] = useState<AccountNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await accountService.listNotifications(30);
      if (res.data) {
        setItems(res.data.items);
        setUnreadCount(res.data.unreadCount);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + 60-second poll
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 60_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Click outside closes dropdown
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

  function handleItemClick(n: AccountNotification, e?: React.MouseEvent) {
    if (e) e.preventDefault();
    setOpen(false);
    // Mark as read in the background (fire-and-forget) before navigating
    if (!n.read) {
      accountService.markNotificationsRead({ ids: [n.id] }).catch(() => { /* ignore */ });
      // Optimistic local update so the badge count drops without waiting for poll
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x));
      setUnreadCount(c => Math.max(0, c - 1));
    }
    if (!n.link) return;
    // Hard navigate so any URL-effect on the destination re-runs reliably
    window.location.href = n.link;
  }

  async function handleMarkAllRead() {
    try {
      await accountService.markNotificationsRead({ all: true });
      setUnreadCount(0);
      setItems(prev => prev.map(x => ({ ...x, read: true })));
    } catch { /* ignore */ }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggleOpen}
        aria-label="Notifications"
        title="Notifications"
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
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: pos.top,
            right: pos.right,
            width: 380,
            maxWidth: 'calc(100vw - 24px)',
            maxHeight: 480,
            background: '#fff',
            border: '1px solid #E0DAD4',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            fontFamily: "'DM Sans', sans-serif",
            overflow: 'hidden',
            color: D,
          }}
        >
          <div style={{
            padding: '14px 16px', borderBottom: '1px solid #F0EBE6',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D }}>
              Notifications
            </div>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12, color: O, fontWeight: 600,
                fontFamily: "'DM Sans', sans-serif",
              }}>
                Mark all read
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && items.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#9B9490', fontSize: 13 }}>
                Loading...
              </div>
            )}
            {!loading && items.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: '#9B9490', fontSize: 13 }}>
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
                  background: n.read ? '#fff' : '#FFF8F3',
                  display: 'flex', gap: 12,
                  transition: 'background 0.1s',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#FAFAF8'; }}
                onMouseLeave={e => { e.currentTarget.style.background = n.read ? '#fff' : '#FFF8F3'; }}
              >
                <div style={{ fontSize: 18, flexShrink: 0, width: 24, textAlign: 'center' }}>
                  {TYPE_ICONS[n.type] || '\uD83D\uDD14'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: D, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.title}
                    </div>
                    {!n.read && <div style={{ width: 8, height: 8, borderRadius: '50%', background: O, flexShrink: 0 }} />}
                  </div>
                  <div style={{ fontSize: 12, color: '#6B6560', marginTop: 2, lineHeight: 1.4 }}>
                    {n.body}
                  </div>
                  <div style={{ fontSize: 11, color: '#9B9490', marginTop: 4 }}>
                    {timeAgo(n.createdAt)}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
