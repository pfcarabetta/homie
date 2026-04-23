import { useState } from 'react';

/**
 * Horizontal tabs strip for managing multiple concurrent quote chats.
 * Mounts in the sticky top nav above /quote; each tab is a saved
 * quote session (chat history, diagnosis, live outreach state) the
 * user can jump between. "+ New quote" spins up a blank session.
 *
 * Desktop-first by design — on mobile (<768px) the bar collapses to
 * a dropdown showing the active tab's title with a "3 quotes ▾"
 * chevron. QuoteTabsDropdown (below) handles that case.
 *
 * Status pill per tab:
 *   • drafting     — orange dot (user still typing into the chat)
 *   • dispatching  — green pulsing dot (providers are being contacted)
 *   • quotes_ready — green solid + unread-count badge (actionable!)
 *   • booked       — green check (job's done, kept around for review)
 *
 * Ordering: active quotes (drafting/dispatching/quotes_ready) come
 * first by most-recently-updated; booked fall to the right side and
 * age out after N days (pruning is the parent's concern).
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';

export type QuoteTabStatus = 'drafting' | 'dispatching' | 'quotes_ready' | 'booked';

export interface QuoteTabEntry {
  id: string;
  /** Short summary of the issue — derived from data.a1 / category. */
  title: string;
  status: QuoteTabStatus;
  /** Only meaningful when status === 'quotes_ready' — count of quotes
   *  received since the user last viewed this tab. */
  unreadQuotes?: number;
  updatedAt: string;  // ISO
}

interface Props {
  tabs: QuoteTabEntry[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNewQuote: () => void;
  /** Max tabs visible inline; overflow collapses to "+N more" button
   *  that opens a dropdown. Default 4 (desktop). */
  maxVisible?: number;
}

export default function QuoteTabsBar({
  tabs, activeTabId, onSelect, onClose, onNewQuote, maxVisible = 4,
}: Props) {
  const [overflowOpen, setOverflowOpen] = useState(false);

  // Sort: active-work first (by most-recent), booked at the end.
  const sorted = [...tabs].sort((a, b) => {
    const aActive = a.status !== 'booked';
    const bActive = b.status !== 'booked';
    if (aActive !== bActive) return aActive ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const visible = sorted.slice(0, maxVisible);
  const overflow = sorted.slice(maxVisible);

  return (
    <div className="qtb-root" style={{
      display: 'flex', alignItems: 'center', gap: 4,
      minWidth: 0, flex: 1,
      position: 'relative',
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <style>{`
        @keyframes qtbPulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.25); opacity: 0.4 } }
        @keyframes qtbSlideIn { from { opacity: 0; transform: translateY(-2px) } to { opacity: 1; transform: translateY(0) } }
        /* Mobile collapse — tabs strip hides, dropdown replaces. */
        @media (max-width: 767px) {
          .qtb-desktop-strip { display: none !important; }
          .qtb-mobile-dropdown { display: flex !important; }
        }
        @media (min-width: 768px) {
          .qtb-mobile-dropdown { display: none !important; }
        }
      `}</style>

      {/* Desktop strip */}
      <div className="qtb-desktop-strip" style={{
        display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1,
      }}>
        {visible.map(t => (
          <TabChip
            key={t.id}
            tab={t}
            active={t.id === activeTabId}
            onSelect={() => onSelect(t.id)}
            onClose={() => onClose(t.id)}
          />
        ))}

        {overflow.length > 0 && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setOverflowOpen(o => !o)}
              style={{
                padding: '6px 10px', background: '#fff',
                border: `1px solid ${BORDER}`, borderRadius: 100,
                fontSize: 12, fontWeight: 600, color: DIM,
                cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}
            >
              +{overflow.length}
              <span style={{ fontSize: 10 }}>▾</span>
            </button>
            {overflowOpen && (
              <OverflowDropdown
                tabs={overflow}
                activeTabId={activeTabId}
                onSelect={(id) => { setOverflowOpen(false); onSelect(id); }}
                onClose={onClose}
                onBackdropClick={() => setOverflowOpen(false)}
              />
            )}
          </div>
        )}

        <button
          onClick={onNewQuote}
          title="Start a new quote chat"
          style={{
            padding: '6px 12px', background: 'transparent',
            border: `1px dashed ${BORDER}`, borderRadius: 100,
            fontSize: 12, fontWeight: 700, color: DIM,
            cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
            display: 'inline-flex', alignItems: 'center', gap: 4,
            transition: 'all 0.15s', flexShrink: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = O;
            e.currentTarget.style.color = O;
            e.currentTarget.style.background = `${O}08`;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = BORDER;
            e.currentTarget.style.color = DIM;
            e.currentTarget.style.background = 'transparent';
          }}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New quote
        </button>
      </div>

      {/* Mobile dropdown — compact single-button that opens a sheet */}
      <div className="qtb-mobile-dropdown" style={{ display: 'none', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        <QuoteTabsDropdown
          tabs={sorted}
          activeTabId={activeTabId}
          onSelect={onSelect}
          onClose={onClose}
          onNewQuote={onNewQuote}
        />
      </div>
    </div>
  );
}

// ── Individual tab chip ──────────────────────────────────────────────

function TabChip({
  tab, active, onSelect, onClose,
}: {
  tab: QuoteTabEntry; active: boolean;
  onSelect: () => void; onClose: () => void;
}) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 4px 5px 12px',
      borderRadius: 100,
      background: active ? '#fff' : 'transparent',
      border: `1px solid ${active ? O : BORDER}`,
      boxShadow: active ? `0 2px 8px -4px ${O}44` : undefined,
      maxWidth: 200, minWidth: 0,
      transition: 'all 0.15s',
      animation: 'qtbSlideIn 0.2s ease',
    }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLDivElement).style.background = `${O}08`;
          (e.currentTarget as HTMLDivElement).style.borderColor = `${O}44`;
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLDivElement).style.background = 'transparent';
          (e.currentTarget as HTMLDivElement).style.borderColor = BORDER;
        }
      }}
    >
      <button
        onClick={onSelect}
        style={{
          all: 'unset',
          display: 'inline-flex', alignItems: 'center', gap: 6,
          minWidth: 0, cursor: 'pointer', flex: 1,
        }}
      >
        <StatusDot status={tab.status} />
        <span style={{
          fontSize: 12.5, fontWeight: active ? 700 : 600,
          color: active ? D : '#3a3430',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          minWidth: 0,
        }}>
          {tab.title}
        </span>
        {tab.status === 'quotes_ready' && tab.unreadQuotes && tab.unreadQuotes > 0 && (
          <span style={{
            background: G, color: '#fff',
            fontSize: 10, fontWeight: 800,
            padding: '1px 6px', borderRadius: 100,
            flexShrink: 0, fontFamily: "'DM Mono',monospace",
          }}>
            {tab.unreadQuotes}
          </span>
        )}
      </button>

      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        title="Close tab"
        style={{
          all: 'unset',
          width: 18, height: 18, borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: DIM, fontSize: 14, lineHeight: 1,
          transition: 'all 0.15s', flexShrink: 0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = '#F5F3F1';
          (e.currentTarget as HTMLButtonElement).style.color = D;
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          (e.currentTarget as HTMLButtonElement).style.color = DIM;
        }}
      >
        ×
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: QuoteTabStatus }) {
  if (status === 'drafting') {
    return (
      <div style={{
        width: 7, height: 7, borderRadius: '50%', background: O, flexShrink: 0,
      }} />
    );
  }
  if (status === 'dispatching') {
    return (
      <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: G }} />
        <span style={{ position: 'absolute', inset: -2, borderRadius: '50%', background: G, opacity: .25, animation: 'qtbPulse 1.5s infinite' }} />
      </div>
    );
  }
  if (status === 'quotes_ready') {
    return (
      <div style={{
        width: 13, height: 13, borderRadius: 3, background: G, color: '#fff',
        fontSize: 8, fontWeight: 900,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>✓</div>
    );
  }
  // booked
  return (
    <div style={{
      width: 13, height: 13, borderRadius: '50%', background: D, color: '#fff',
      fontSize: 8, fontWeight: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>✓</div>
  );
}

// ── Overflow dropdown (desktop — opens from "+N" button) ────────────

function OverflowDropdown({
  tabs, activeTabId, onSelect, onClose, onBackdropClick,
}: {
  tabs: QuoteTabEntry[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onBackdropClick: () => void;
}) {
  return (
    <>
      <div
        onClick={onBackdropClick}
        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
      />
      <div style={{
        position: 'absolute', top: 'calc(100% + 6px)', right: 0,
        zIndex: 50, minWidth: 260, maxWidth: 320,
        background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12,
        boxShadow: '0 20px 60px -20px rgba(0,0,0,.22)',
        padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
      }}>
        {tabs.map(t => (
          <DropdownRow
            key={t.id}
            tab={t}
            active={t.id === activeTabId}
            onSelect={() => onSelect(t.id)}
            onClose={() => onClose(t.id)}
          />
        ))}
      </div>
    </>
  );
}

function DropdownRow({
  tab, active, onSelect, onClose,
}: {
  tab: QuoteTabEntry; active: boolean;
  onSelect: () => void; onClose: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 10px', borderRadius: 8,
      background: active ? `${O}10` : 'transparent',
      transition: 'background 0.15s',
      fontFamily: "'DM Sans',sans-serif",
    }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = W; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <button
        onClick={onSelect}
        style={{
          all: 'unset', flex: 1, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
        }}
      >
        <StatusDot status={tab.status} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: active ? 700 : 600, color: D,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {tab.title}
          </div>
          <div style={{ fontSize: 10.5, color: DIM, fontFamily: "'DM Mono',monospace", marginTop: 1 }}>
            {humanStatus(tab)}
          </div>
        </div>
      </button>
      <button
        onClick={onClose}
        style={{
          all: 'unset', width: 20, height: 20, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: DIM, fontSize: 14,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F5F3F1'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >×</button>
    </div>
  );
}

// ── Mobile dropdown — replaces the whole strip <768px ──────────────

function QuoteTabsDropdown({
  tabs, activeTabId, onSelect, onClose, onNewQuote,
}: Props) {
  const [open, setOpen] = useState(false);
  const active = tabs.find(t => t.id === activeTabId) ?? null;
  const count = tabs.length;

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', background: '#fff',
          border: `1px solid ${BORDER}`, borderRadius: 100,
          fontSize: 12.5, fontWeight: 600, color: D,
          cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
        }}
      >
        {active && <StatusDot status={active.status} />}
        <span style={{
          flex: 1, minWidth: 0, textAlign: 'left',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {active ? active.title : 'New quote'}
        </span>
        <span style={{ fontSize: 10.5, color: DIM, fontFamily: "'DM Mono',monospace", flexShrink: 0 }}>
          {count} {count === 1 ? 'tab' : 'tabs'}
        </span>
        <span style={{ color: DIM, fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            zIndex: 50,
            background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12,
            boxShadow: '0 20px 60px -20px rgba(0,0,0,.22)',
            padding: 6, display: 'flex', flexDirection: 'column', gap: 2,
          }}>
            {tabs.map(t => (
              <DropdownRow
                key={t.id}
                tab={t}
                active={t.id === activeTabId}
                onSelect={() => { setOpen(false); onSelect(t.id); }}
                onClose={() => onClose(t.id)}
              />
            ))}
            <button
              onClick={() => { setOpen(false); onNewQuote(); }}
              style={{
                marginTop: 4, padding: '10px 10px',
                background: O, color: '#fff',
                border: 'none', borderRadius: 8,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: "'DM Sans',sans-serif",
                display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 14 }}>+</span> New quote
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function humanStatus(t: QuoteTabEntry): string {
  switch (t.status) {
    case 'drafting':     return 'Drafting';
    case 'dispatching':  return 'Dispatching…';
    case 'quotes_ready': return t.unreadQuotes ? `${t.unreadQuotes} new quote${t.unreadQuotes === 1 ? '' : 's'}` : 'Quotes ready';
    case 'booked':       return 'Booked';
  }
}
