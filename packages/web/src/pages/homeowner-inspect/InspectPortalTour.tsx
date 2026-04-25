import { useEffect, useMemo, useState } from 'react';
import Joyride, { type CallBackProps, type Step, ACTIONS, EVENTS, STATUS } from 'react-joyride';
import { tierRank, type Tab, type Tier } from './constants';
import type { PortalReport } from '@/services/inspector-api';

const STORAGE_KEY = 'homie_inspect_tour_v1';

interface TourProps {
  /** Whether the tour should attempt to run. Caller controls based on auth + reports loaded. */
  active: boolean;
  /** Setter — used to mark the tour as completed/skipped externally. */
  setActive: (v: boolean) => void;
  /** Reports the homeowner has access to — drives tier-aware copy. */
  reports: PortalReport[];
  /** Currently active tab. */
  currentTab: Tab;
  /** Driver-style nav: tour calls this to switch tabs as it walks through them. */
  onNavigate: (tab: Tab) => void;
}

/** Has the user already completed or skipped the tour? */
export function hasSeenTour(): boolean {
  try { return !!localStorage.getItem(STORAGE_KEY); } catch { return false; }
}

/** Mark the tour as seen so it doesn't auto-fire again. */
export function markTourSeen(state: 'completed' | 'skipped'): void {
  try { localStorage.setItem(STORAGE_KEY, state); } catch { /* silent */ }
}

/** Reset the tour so it fires next portal load. */
export function resetTour(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* silent */ }
}

/** Pick the highest tier the user holds across all their reports. */
function maxTier(reports: PortalReport[]): Tier | null {
  let best: Tier | null = null;
  for (const r of reports) {
    const rank = tierRank(r.pricingTier);
    if (rank === 0) continue;
    if (!best || rank > tierRank(best)) best = r.pricingTier as Tier;
  }
  return best;
}

const ACCENT = '#2563EB';

const upgradeBadge = (tier: 'professional' | 'premium') => (
  <span style={{
    display: 'inline-block', marginTop: 8, fontSize: 11, fontWeight: 700,
    color: '#9B6260', background: '#FEF3F2', border: '1px solid #F4C7C5',
    padding: '4px 10px', borderRadius: 100,
  }}>
    {'\uD83D\uDD12'} {tier === 'premium' ? 'Premium feature' : 'Professional feature'}
  </span>
);

interface TourStep {
  target: string;
  tab?: Tab;
  placement?: Step['placement'];
  /** Render the step body, given the user's max tier (null = no paid report). */
  render: (current: Tier | null) => React.ReactNode;
  disableBeacon?: boolean;
}

/** Helper — true when current tier rank is below the required tier. */
function locked(current: Tier | null, required: Tier): boolean {
  return tierRank(current) < tierRank(required);
}

const STEPS: TourStep[] = [
  // 1. Welcome — no anchor
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    render: () => (
      <div>
        <div style={{ fontSize: 32, marginBottom: 8 }}>{'\uD83D\uDC4B'}</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#2D2926' }}>Welcome to Homie Inspect</h3>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: '#4A4540' }}>
          Your inspection report is parsed and ready. We'll walk you through how to get the most out of it — comparing quotes, building a repair request, and planning maintenance. Takes about 60 seconds.
        </p>
      </div>
    ),
  },

  // 2. Sidebar overview
  {
    target: '[data-tour="nav-dashboard"]',
    placement: 'right',
    disableBeacon: true,
    render: () => (
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#2D2926' }}>Your home base</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#4A4540' }}>
          Everything is one click away from this sidebar. Most buyers spend their first week in <b>Reports</b> and <b>Negotiations</b>. Let's run through each one.
        </p>
      </div>
    ),
  },

  // 3. Reports
  {
    target: '[data-tour="nav-reports"]',
    tab: 'reports',
    placement: 'right',
    render: () => (
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#2D2926' }}>Your inspection reports</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#4A4540' }}>
          Every report you upload lives here. Click a property to drill in — items grouped by severity, location, and category. Severity colors: <b style={{ color: '#E24B4A' }}>red</b> = safety hazard, <b style={{ color: '#EF9F27' }}>orange</b> = recommended, <b style={{ color: '#9B9490' }}>grey</b> = monitor.
        </p>
      </div>
    ),
  },

  // 4. Items + AI Deep Dive
  {
    target: '[data-tour="nav-items"]',
    tab: 'items',
    placement: 'right',
    render: () => (
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#2D2926' }}>All items + Ask Homie</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#4A4540' }}>
          The cross-property view of every inspection item. Click any item for an instant AI <b>deep dive</b>: what it actually means, what it'll cost, DIY vs pro, and what to ask the seller. Like a contractor friend on call.
        </p>
      </div>
    ),
  },

  // 5. Quotes — Professional+
  {
    target: '[data-tour="nav-quotes"]',
    tab: 'quotes',
    placement: 'right',
    render: (tier) => (
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#2D2926' }}>Real prices, not estimates</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#4A4540' }}>
          Pick the items you want fixed and Homie reaches out to vetted local contractors. Real quotes come back — usually within a few hours — and you compare them side-by-side.
        </p>
        {locked(tier, 'professional') && upgradeBadge('professional')}
      </div>
    ),
  },

  // 6. Negotiations — Premium ONLY
  {
    target: '[data-tour="nav-negotiations"]',
    tab: 'negotiations',
    placement: 'right',
    render: (tier) => (
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#2D2926' }}>Build your repair request</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#4A4540' }}>
          Pick which items you want the seller to address and Homie generates a polished PDF for your agent. Stack it with real provider quotes and you've got leverage that makes sellers say yes.
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#9B6260', fontStyle: 'italic' }}>
          Most buyers using this recover 3–5× their report cost in seller credits.
        </p>
        {locked(tier, 'premium') && upgradeBadge('premium')}
      </div>
    ),
  },

  // 7. Bookings — Professional+
  {
    target: '[data-tour="nav-bookings"]',
    tab: 'bookings',
    placement: 'right',
    render: (tier) => (
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#2D2926' }}>Track what you've booked</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#4A4540' }}>
          Once you accept a quote, the booking lands here with the provider's contact info, quoted price, and scheduling. One tap to call or email them.
        </p>
        {locked(tier, 'professional') && upgradeBadge('professional')}
      </div>
    ),
  },

  // 8. Maintenance — Premium ONLY
  {
    target: '[data-tour="nav-maintenance"]',
    tab: 'maintenance',
    placement: 'right',
    render: (tier) => (
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#2D2926' }}>Past closing? You're not done.</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#4A4540' }}>
          Items flagged "monitor" plus a season-by-season home maintenance checklist live here. Catches the small things before they become $5,000 surprises.
        </p>
        {locked(tier, 'premium') && upgradeBadge('premium')}
      </div>
    ),
  },

  // 9. Documents
  {
    target: '[data-tour="nav-documents"]',
    tab: 'documents',
    placement: 'right',
    render: () => (
      <div>
        <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: '#2D2926' }}>Smoking-gun analysis</h3>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#4A4540' }}>
          Drop in pest reports, seller disclosures, sewer scope reports — anything else from your transaction. Homie cross-references them with the inspection so contradictions stand out.
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6B6560', fontStyle: 'italic' }}>
          e.g. "inspector found moisture → seller disclosed 2022 leak → pest report shows wood-destroying activity in the same area."
        </p>
      </div>
    ),
  },

  // 10. Wrap-up
  {
    target: 'body',
    placement: 'center',
    disableBeacon: true,
    render: (tier) => {
      const wrapCta = tier === 'premium'
        ? null
        : tier === 'professional'
          ? "Upgrade to Premium for Negotiations and Maintenance — the highest-leverage features for buyers."
          : "Upgrade to Premium once and unlock every feature for this report — forever.";
      return (
        <div>
          <div style={{ fontSize: 28, marginBottom: 8 }}>{'\uD83C\uDF89'}</div>
          <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#2D2926' }}>You're set</h3>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: '#4A4540' }}>
            Start with <b>Reports</b> to dig into the items, then build your <b>Negotiations</b> request before your inspection contingency window closes. You can re-launch this tour from <b>Settings</b> anytime.
          </p>
          {wrapCta && (
            <p style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.5, color: '#9B6260', fontWeight: 600 }}>
              {wrapCta}
            </p>
          )}
        </div>
      );
    },
  },
];

export default function InspectPortalTour({ active, setActive, reports, currentTab, onNavigate }: TourProps) {
  const tier = useMemo(() => maxTier(reports), [reports]);
  const [stepIndex, setStepIndex] = useState(0);

  // Reset to step 0 every time the tour activates.
  useEffect(() => { if (active) setStepIndex(0); }, [active]);

  // Materialize steps (ReactNode bodies bake in current tier).
  const steps: Step[] = useMemo(() => STEPS.map((s) => ({
    target: s.target,
    placement: s.placement ?? 'right',
    disableBeacon: s.disableBeacon ?? true,
    content: s.render(tier),
  })), [tier]);

  // Drive tab navigation as the tour advances. Joyride doesn't know about
  // React Router or our internal tab state, so we listen to step-change
  // events and call onNavigate ourselves. Skipping over a sidebar-anchored
  // step means the tour can't find the highlight target — switch tabs
  // first so the anchor is rendered.
  useEffect(() => {
    if (!active) return;
    const wantTab = STEPS[stepIndex]?.tab;
    if (wantTab && wantTab !== currentTab) onNavigate(wantTab);
    // We intentionally exclude currentTab from deps — we don't want to
    // re-fire navigation if the user manually clicked away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex, active]);

  function finish(state: 'completed' | 'skipped') {
    markTourSeen(state);
    setActive(false);
    setStepIndex(0); // reset so a re-launch starts at step 1
  }

  function handleCallback(data: CallBackProps) {
    const { action, index, status, type } = data;

    // 1) Joyride already decided the tour is over.
    if (status === STATUS.FINISHED) return finish('completed');
    if (status === STATUS.SKIPPED) return finish('skipped');

    // 2) Close (X) button — fires regardless of which step you're on.
    if (action === ACTIONS.CLOSE) return finish('skipped');

    // 3) Step transition.
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const next = action === ACTIONS.PREV ? index - 1 : index + 1;

      // "Done" / Next on the last step — Joyride doesn't always fire the
      // FINISHED status when in controlled mode, so finish explicitly.
      if (next >= STEPS.length) return finish('completed');
      if (next < 0) return; // back from step 0 — stay put

      setStepIndex(next);
    }
  }

  if (!active) return null;

  return (
    <Joyride
      steps={steps}
      stepIndex={stepIndex}
      run={active}
      continuous
      showProgress
      showSkipButton
      hideCloseButton={false}
      scrollToFirstStep={false}
      disableScrolling
      callback={handleCallback}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip',
      }}
      styles={{
        options: {
          primaryColor: ACCENT,
          textColor: '#2D2926',
          zIndex: 10000,
          arrowColor: '#FFFFFF',
          backgroundColor: '#FFFFFF',
        },
        tooltip: {
          borderRadius: 14,
          padding: '20px 22px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
          fontFamily: "'DM Sans', sans-serif",
          maxWidth: 360,
        },
        tooltipContent: {
          padding: 0,
        },
        buttonNext: {
          background: ACCENT,
          fontSize: 13,
          fontWeight: 600,
          padding: '8px 18px',
          borderRadius: 100,
        },
        buttonBack: {
          color: '#6B6560',
          fontSize: 13,
          fontWeight: 600,
          marginRight: 6,
        },
        buttonSkip: {
          color: '#9B9490',
          fontSize: 12,
          fontWeight: 500,
        },
        spotlight: {
          borderRadius: 10,
        },
      }}
    />
  );
}

