import { useState } from 'react';
import QuoteTabsBar, { type QuoteTabEntry } from '@/components/QuoteTabsBar';

/**
 * /demo/quote-tabs — mockup of multi-session quote tabs living in the
 * sticky top nav above /quote. Each tab is an independent saved
 * quote chat the user can jump between; "+ New quote" opens a fresh
 * session. Desktop-first strip; mobile collapses to a dropdown.
 *
 * The demo shows 4 tabs at different lifecycle stages so you can see
 * the status dots + unread badges in one shot. Click between them —
 * the body placeholder swaps to that tab's summary so you get a feel
 * for the switching UX.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';

export default function QuoteTabsDemo() {
  const [tabs, setTabs] = useState<QuoteTabEntry[]>(() => [
    {
      id: 't1',
      title: 'Kitchen faucet drip',
      status: 'quotes_ready',
      unreadQuotes: 2,
      updatedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    },
    {
      id: 't2',
      title: 'HVAC not cooling',
      status: 'dispatching',
      updatedAt: new Date(Date.now() - 8 * 60_000).toISOString(),
    },
    {
      id: 't3',
      title: 'Garage door opener',
      status: 'drafting',
      updatedAt: new Date(Date.now() - 35 * 60_000).toISOString(),
    },
    {
      id: 't4',
      title: 'Dishwasher service',
      status: 'booked',
      updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
    },
  ]);
  const [activeId, setActiveId] = useState<string | null>('t1');

  function handleSelect(id: string) {
    setActiveId(id);
    // In the real app we'd also clear that tab's unreadQuotes badge on
    // view — mimicking here so the badge doesn't re-appear every click.
    setTabs(ts => ts.map(t => t.id === id ? { ...t, unreadQuotes: 0 } : t));
  }

  function handleClose(id: string) {
    setTabs(ts => ts.filter(t => t.id !== id));
    if (activeId === id) {
      const remaining = tabs.filter(t => t.id !== id);
      setActiveId(remaining[0]?.id ?? null);
    }
  }

  function handleNewQuote() {
    const id = `t${Date.now()}`;
    const fresh: QuoteTabEntry = {
      id, title: 'New quote', status: 'drafting',
      updatedAt: new Date().toISOString(),
    };
    setTabs(ts => [fresh, ...ts]);
    setActiveId(id);
  }

  const activeTab = tabs.find(t => t.id === activeId) ?? null;

  return (
    <div style={{
      minHeight: '100vh', background: W, color: D,
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <style>{`
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* The nav bar — this is where QuoteTabsBar mounts in production */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 20,
        padding: '0 24px', height: 56,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(16px) saturate(180%)',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div style={{
          fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: O,
          flexShrink: 0,
        }}>
          homie
        </div>

        <QuoteTabsBar
          tabs={tabs}
          activeTabId={activeId}
          onSelect={handleSelect}
          onClose={handleClose}
          onNewQuote={handleNewQuote}
          maxVisible={4}
        />

        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: O, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 13, flexShrink: 0,
        }}>
          P
        </div>
      </nav>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 24px 80px' }}>
        {/* Demo header */}
        <div style={{
          marginBottom: 20, padding: '14px 18px',
          background: '#FFF7ED', border: `1px solid ${O}33`, borderRadius: 12,
        }}>
          <div style={{
            fontSize: 11, fontFamily: "'DM Mono',monospace", letterSpacing: 1.4,
            textTransform: 'uppercase', color: O, fontWeight: 700, marginBottom: 4,
          }}>
            Design Preview
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: D }}>
            Multi-session quote tabs
          </div>
          <div style={{ fontSize: 13, color: DIM, marginTop: 4, lineHeight: 1.5 }}>
            Each tab is a saved quote chat the user can jump between. Click any tab to switch, X to close, + New quote to start fresh. The status dot shows lifecycle (drafting / dispatching / quotes ready / booked) and a green badge shows unread quote count. Resize the window below 768px to see the mobile dropdown treatment.
          </div>
        </div>

        {/* Body — placeholder showing the active tab's state. In
            production this is where the full /quote layout (chat +
            diagnosis + LiveOutreachPanel) renders, switched by active
            tab id. */}
        {activeTab ? (
          <TabBody tab={activeTab} />
        ) : (
          <EmptyState onNewQuote={handleNewQuote} />
        )}

        {/* Mobile preview — fixed-width iframe-style box showing the
            collapsed dropdown version. Gives you a side-by-side look
            without having to resize the browser. */}
        <div style={{ marginTop: 40 }}>
          <div style={{
            fontSize: 11, fontFamily: "'DM Mono',monospace", letterSpacing: 1.2,
            textTransform: 'uppercase', color: DIM, fontWeight: 700, marginBottom: 8,
          }}>
            Mobile preview · ≤ 767px
          </div>
          <MobilePreview tabs={tabs} activeId={activeId} />
        </div>
      </div>
    </div>
  );
}

// ── Body placeholders per status ──────────────────────────────────────

function TabBody({ tab }: { tab: QuoteTabEntry }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 18,
      border: `1px solid ${BORDER}`,
      padding: '28px 28px 32px',
      minHeight: 280,
      animation: 'fadeSlide 0.25s ease',
    }}>
      <div style={{
        fontSize: 11, fontFamily: "'DM Mono',monospace", letterSpacing: 1.2,
        textTransform: 'uppercase', fontWeight: 700, color: DIM, marginBottom: 4,
      }}>
        Active tab
      </div>
      <div style={{
        fontFamily: "'Fraunces',serif", fontSize: 26, fontWeight: 700, color: D,
        marginBottom: 10,
      }}>
        {tab.title}
      </div>
      <BodyContent tab={tab} />
    </div>
  );
}

function BodyContent({ tab }: { tab: QuoteTabEntry }) {
  switch (tab.status) {
    case 'drafting':
      return (
        <Callout
          icon="✏️"
          title="Still drafting"
          body="The chat is paused mid-conversation. Clicking this tab in production resumes the user right where they left off — messages, photos, and partial context all restored."
        />
      );
    case 'dispatching':
      return (
        <Callout
          icon="●"
          iconColor={G}
          title="Live outreach in progress"
          body="The LiveOutreachPanel (the new right-column card from the previous demo) would render here showing Contacted / Quoted counts + the transparency strip + activity log. User can let this run in another tab while working elsewhere."
        />
      );
    case 'quotes_ready':
      return (
        <Callout
          icon="✓"
          iconColor={G}
          title={`${tab.unreadQuotes && tab.unreadQuotes > 0 ? tab.unreadQuotes + ' new ' : ''}quotes ready to book`}
          body="Full ProviderCard list with Book / Call buttons renders here. Badge on the tab clears as soon as the user opens it (like email unread counts)."
        />
      );
    case 'booked':
      return (
        <Callout
          icon="✓"
          iconColor={D}
          title="Booked"
          body="Confirmation + scheduled date + next-step reminders. Kept as a tab for 48h after booking; then ages out into Account → My Quotes."
        />
      );
  }
}

function Callout({
  icon, iconColor, title, body,
}: {
  icon: string; iconColor?: string; title: string; body: string;
}) {
  return (
    <div style={{
      padding: '18px 20px', background: W, borderRadius: 14,
      border: `1px solid ${BORDER}`,
      display: 'flex', gap: 14, alignItems: 'flex-start',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10,
        background: iconColor ? `${iconColor}14` : `${O}14`,
        border: `1px solid ${iconColor ? `${iconColor}33` : `${O}33`}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, color: iconColor ?? O, fontWeight: 700, flexShrink: 0,
      }}>{icon}</div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: D,
          marginBottom: 4,
        }}>{title}</div>
        <div style={{ fontSize: 13.5, color: DIM, lineHeight: 1.55 }}>{body}</div>
      </div>
    </div>
  );
}

function EmptyState({ onNewQuote }: { onNewQuote: () => void }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 18,
      border: `1px dashed ${BORDER}`, padding: '48px 32px',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: D,
        marginBottom: 6,
      }}>
        No open quotes
      </div>
      <div style={{ fontSize: 13.5, color: DIM, marginBottom: 16 }}>
        Start a new quote chat to describe an issue and dispatch it to pros.
      </div>
      <button
        onClick={onNewQuote}
        style={{
          padding: '10px 18px', background: O, color: '#fff',
          border: 'none', borderRadius: 10,
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          fontFamily: "'DM Sans',sans-serif",
        }}
      >
        + New quote
      </button>
    </div>
  );
}

// ── Mobile preview box ────────────────────────────────────────────────

function MobilePreview({ tabs, activeId }: { tabs: QuoteTabEntry[]; activeId: string | null }) {
  const [innerActive, setInnerActive] = useState(activeId);
  const [innerTabs, setInnerTabs] = useState(tabs);

  return (
    <div style={{
      maxWidth: 360, margin: '0 auto',
      border: `1px solid ${BORDER}`, borderRadius: 24,
      overflow: 'hidden', background: '#fff',
      boxShadow: '0 20px 60px -24px rgba(0,0,0,.18)',
    }}>
      {/* Simulated narrow-viewport wrapper forces the mobile treatment
          regardless of the host window width. */}
      <div style={{ background: 'rgba(255,255,255,0.95)', borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: O,
          }}>homie</div>
          {/* Force the mobile dropdown variant by wrapping in a style
              override that flips display. */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <MobileOnlyTabs
              tabs={innerTabs}
              activeTabId={innerActive}
              onSelect={(id) => {
                setInnerActive(id);
                setInnerTabs(ts => ts.map(t => t.id === id ? { ...t, unreadQuotes: 0 } : t));
              }}
              onClose={(id) => {
                setInnerTabs(ts => ts.filter(t => t.id !== id));
                if (innerActive === id) {
                  const rem = innerTabs.filter(t => t.id !== id);
                  setInnerActive(rem[0]?.id ?? null);
                }
              }}
              onNewQuote={() => {
                const id = `mt${Date.now()}`;
                setInnerTabs(ts => [{ id, title: 'New quote', status: 'drafting', updatedAt: new Date().toISOString() }, ...ts]);
                setInnerActive(id);
              }}
            />
          </div>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: O, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700, flexShrink: 0,
          }}>P</div>
        </div>
      </div>
      <div style={{ padding: '18px 16px', minHeight: 200, background: W }}>
        <div style={{
          fontSize: 10.5, fontFamily: "'DM Mono',monospace", letterSpacing: 1.2,
          textTransform: 'uppercase', color: DIM, fontWeight: 700, marginBottom: 4,
        }}>
          Active tab
        </div>
        <div style={{
          fontFamily: "'Fraunces',serif", fontSize: 18, fontWeight: 700, color: D,
          marginBottom: 4,
        }}>
          {innerTabs.find(t => t.id === innerActive)?.title ?? '—'}
        </div>
        <div style={{ fontSize: 12, color: DIM, lineHeight: 1.5 }}>
          On mobile the tab strip collapses to a single dropdown — tap the row above to switch, close, or start a new quote.
        </div>
      </div>
    </div>
  );
}

// Render ONLY the mobile variant regardless of viewport width. Wraps
// QuoteTabsBar in a style override that undoes its @media rules.
function MobileOnlyTabs(props: React.ComponentProps<typeof QuoteTabsBar>) {
  return (
    <div className="qtb-force-mobile">
      <style>{`
        .qtb-force-mobile .qtb-desktop-strip { display: none !important; }
        .qtb-force-mobile .qtb-mobile-dropdown { display: flex !important; }
      `}</style>
      <QuoteTabsBar {...props} />
    </div>
  );
}
