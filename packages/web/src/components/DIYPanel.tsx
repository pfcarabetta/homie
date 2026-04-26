import { useEffect, useRef, useState } from 'react';
import { diyService } from '@/services/api';
import { amazonSearchUrl, AFFILIATE_LINK_ATTRS, logAffiliateEvent } from '@/utils/affiliate';
import type { DIYAnalysisPayload, DIYToolSupply } from '@homie/shared';

/**
 * Secondary CTA that sits below the AI diagnosis card in the quote chat.
 * Collapsed by default so dispatch-to-pros remains the visually primary
 * action. When a homeowner taps it, we lazy-fetch structured DIY
 * guidance (steps + Amazon-affiliate tool links) from the backend.
 *
 * If the AI deems the job unsafe to self-service (`feasible: false`),
 * the panel collapses into a "get a pro" state — same end-state as not
 * showing it at all, but the AI got to decide, not a client heuristic.
 *
 * Affiliate monetization: each tool/supply row is an Amazon search URL
 * tagged with the Homie Associates ID. FTC-required disclosure shows
 * inline when expanded.
 */

// Brand colors — same in light + dark.
const O = '#E8632B';
const G = '#1B9E77';

// Theme-adaptive tokens. The inspect portal sets these CSS variables on
// the layout root for light/dark mode; the quote chat doesn't define them
// so the fallbacks keep that surface working unchanged. Mirrors the
// pattern in components/outreach-theme.ts.
const D = 'var(--bp-text, #2D2926)';
const DIM = 'var(--bp-subtle, #6B6560)';
const BORDER = 'var(--bp-border, rgba(0,0,0,.08))';
const W = 'var(--bp-bg, #F9F5F2)';
const CARD = 'var(--bp-card, #ffffff)';

interface DIYPanelProps {
  /** The AI-generated diagnosis text — fed into the DIY endpoint as context. */
  diagnosis: string;
  /** Category hint for the analysis prompt (plumbing, electrical, etc.). */
  category?: string | null;
  /** Raw user description fallback when diagnosis is thin. */
  userDescription?: string | null;
  /** Fired when the homeowner taps "didn't work? get a pro" so the parent
   *  can re-surface the tier-selection flow. */
  onBackToPro?: () => void;
  /** Controls the left-margin alignment with the diagnosis card.
   *  Defaults to the 42px used by AI-message bubbles in GetQuotes. */
  indent?: number;
  /** Optional override for the fetch step. Used by surfaces (like the
   *  homeowner-inspect portal) that have a server-cached DIY endpoint
   *  instead of the public /api/v1/diy/analyze route. Default: fetch
   *  from the public DIY service. */
  fetcher?: () => Promise<{ data?: DIYAnalysisPayload | null; error?: string | null }>;
  /** Pre-loaded analysis. When provided, the panel skips the fetch and
   *  renders immediately. Used when the parent already has a cached
   *  payload on the item. */
  initialAnalysis?: DIYAnalysisPayload | null;
  /** Where this panel is rendered — for analytics + GA event source tag. */
  source?: 'quote_chat' | 'inspect_item';
  /** Hide the collapsible header — caller already provides expand UX. */
  hideTrigger?: boolean;
  /** Visual override: instead of a self-contained card, render flush so
   *  the parent (e.g. ItemDeepDive) can frame it. */
  flush?: boolean;
}

export default function DIYPanel({
  diagnosis,
  category,
  userDescription,
  onBackToPro,
  indent = 42,
  fetcher,
  initialAnalysis = null,
  source = 'quote_chat',
  hideTrigger = false,
  flush = false,
}: DIYPanelProps) {
  // When the parent pre-loads the analysis, render expanded immediately.
  const [expanded, setExpanded] = useState(initialAnalysis !== null || hideTrigger);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DIYAnalysisPayload | null>(initialAnalysis);
  const shownRef = useRef(false);
  const fetchedRef = useRef(initialAnalysis !== null);

  // Fire "shown" once per mount — gives product visibility into how often
  // the teaser surfaces vs. how often users actually engage.
  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    logAffiliateEvent('diy_panel_shown', { category, source });
  }, [category, source]);

  async function runFetch() {
    fetchedRef.current = true;
    logAffiliateEvent('diy_panel_expanded', { category, source });
    setLoading(true);
    setError(null);

    const result = fetcher
      ? await fetcher()
      : await diyService.analyze({
          diagnosis,
          category: category ?? null,
          userDescription: userDescription ?? null,
        });
    setLoading(false);
    if (result.error || !result.data) {
      logAffiliateEvent('diy_fetch_failed', { error: result.error, source });
      setError(result.error || 'Could not load DIY guide');
      fetchedRef.current = false; // allow retry
      return;
    }
    setAnalysis(result.data);
  }

  // hideTrigger surfaces (inspect Deep Dive) auto-fetch when no preload exists.
  useEffect(() => {
    if (hideTrigger && !fetchedRef.current && !loading) {
      void runFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideTrigger]);

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (!next) return;
    if (fetchedRef.current) return; // already loaded — just re-show
    await runFetch();
  }

  function handleBackToPro() {
    logAffiliateEvent('diy_back_to_pro', { category, feasible: analysis?.feasible ?? null, source });
    setExpanded(false);
    onBackToPro?.();
  }

  return (
    <div style={flush ? {
      animation: 'fadeSlide 0.4s ease',
    } : {
      marginLeft: indent, marginBottom: 16, background: CARD,
      border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden',
      animation: 'fadeSlide 0.4s ease',
    }}>
      {!hideTrigger && (
        <button
          onClick={handleExpand}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', background: 'transparent', border: 'none',
            cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8, background: `${G}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>{'🔧'}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: D }}>
              Or try fixing it yourself?
            </div>
            <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
              {subtitle(analysis, loading)}
            </div>
          </div>
          <div style={{
            fontSize: 18, color: DIM, transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s', flexShrink: 0,
          }}>{'▾'}</div>
        </button>
      )}

      {expanded && (
        <div style={{
          padding: hideTrigger ? 0 : '0 16px 16px',
          borderTop: hideTrigger ? 'none' : `1px solid ${BORDER}`,
          animation: 'fadeSlide 0.25s ease',
        }}>
          {loading && <LoadingState />}
          {error && !loading && (
            <ErrorState
              message={error}
              onRetry={() => {
                fetchedRef.current = false;
                setError(null);
                void runFetch();
              }}
            />
          )}
          {!loading && !error && analysis && (
            analysis.feasible
              ? <FeasibleContent analysis={analysis} onBackToPro={handleBackToPro} />
              : <NotFeasibleContent analysis={analysis} onBackToPro={handleBackToPro} />
          )}
        </div>
      )}
    </div>
  );
}

function subtitle(a: DIYAnalysisPayload | null, loading: boolean): string {
  if (loading) return 'Loading…';
  if (!a) return 'Step-by-step guide + tools';
  if (!a.feasible) return 'This one’s better left to a pro';
  const parts: string[] = [];
  if (a.difficulty) parts.push(capitalize(a.difficulty));
  if (a.timeEstimate) parts.push(a.timeEstimate);
  if (a.costDiyCents) parts.push(`~$${Math.round(a.costDiyCents.min / 100)}–$${Math.round(a.costDiyCents.max / 100)} in parts`);
  return parts.length ? parts.join(' · ') : 'Step-by-step guide';
}

function LoadingState() {
  return (
    <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          height: i === 0 ? 14 : 32, borderRadius: 8,
          background: `linear-gradient(90deg, ${W} 0%, var(--bp-hover, #F0EBE7) 50%, ${W} 100%)`,
          backgroundSize: '200% 100%', animation: 'diyShimmer 1.2s infinite linear',
          width: i === 0 ? '55%' : '100%',
        }} />
      ))}
      <style>{`@keyframes diyShimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
      <div style={{ fontSize: 12, color: DIM, textAlign: 'center', marginTop: 4 }}>
        Generating a DIY guide for you…
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ padding: '16px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: DIM, marginBottom: 10 }}>{message}</div>
      <button onClick={onRetry} style={{
        padding: '6px 14px', background: 'transparent', border: `1px solid ${BORDER}`,
        borderRadius: 8, fontSize: 13, color: D, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
      }}>Try again</button>
    </div>
  );
}

function NotFeasibleContent({ analysis, onBackToPro }: { analysis: DIYAnalysisPayload; onBackToPro: () => void }) {
  return (
    <div style={{ paddingTop: 14 }}>
      <div style={{
        padding: 12, background: `${O}08`, border: `1px solid ${O}22`,
        borderRadius: 10, marginBottom: 14,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: O, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
          Better to get a pro on this one
        </div>
        {analysis.whenToCallPro && (
          <div style={{ fontSize: 13, color: D, lineHeight: 1.5 }}>{analysis.whenToCallPro}</div>
        )}
      </div>
      {analysis.safetyWarnings.length > 0 && (
        <>
          <SectionHeader tone="warn">Why this isn’t DIY</SectionHeader>
          <ul style={{ margin: '0 0 16px', paddingLeft: 18, color: D, fontSize: 13, lineHeight: 1.6 }}>
            {analysis.safetyWarnings.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{w}</li>)}
          </ul>
        </>
      )}
      <button onClick={onBackToPro} style={{
        width: '100%', padding: '12px 16px', background: O, border: 'none',
        color: '#fff', fontWeight: 600, borderRadius: 10, cursor: 'pointer',
        fontSize: 14, fontFamily: "'DM Sans', sans-serif",
      }}>Get pro quotes →</button>
    </div>
  );
}

function FeasibleContent({ analysis, onBackToPro }: { analysis: DIYAnalysisPayload; onBackToPro: () => void }) {
  return (
    <>
      {/* Cost + time strip */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, marginBottom: 16,
        padding: 10, background: `${G}08`, borderRadius: 10, border: `1px solid ${G}1a`,
      }}>
        {analysis.timeEstimate && <Chip label="Time" value={analysis.timeEstimate} />}
        {analysis.costDiyCents && (
          <Chip label="DIY cost" accent={G}
            value={`$${Math.round(analysis.costDiyCents.min / 100)}–$${Math.round(analysis.costDiyCents.max / 100)}`} />
        )}
        {analysis.costProCents && (
          <Chip label="Pro cost" accent={DIM} strike
            value={`$${Math.round(analysis.costProCents.min / 100)}–$${Math.round(analysis.costProCents.max / 100)}`} />
        )}
        {analysis.difficulty && <Chip label="Difficulty" value={capitalize(analysis.difficulty)} />}
      </div>

      {/* Steps */}
      {analysis.steps.length > 0 && (
        <>
          <SectionHeader>Steps</SectionHeader>
          <ol style={{ margin: '0 0 16px', paddingLeft: 0, listStyle: 'none' }}>
            {analysis.steps.map((step, i) => (
              <li key={i} style={{
                display: 'flex', gap: 10, marginBottom: 10, fontSize: 13.5,
                color: D, lineHeight: 1.6,
              }}>
                <div style={{
                  flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                  background: `${O}14`, color: O, fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{i + 1}</div>
                <div style={{ flex: 1 }}>{step}</div>
              </li>
            ))}
          </ol>
        </>
      )}

      {/* Tools & supplies */}
      {analysis.toolsSupplies.length > 0 && (
        <>
          <SectionHeader>Tools & supplies</SectionHeader>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {analysis.toolsSupplies.map((tool, i) => <ToolRow key={i} tool={tool} />)}
          </div>
        </>
      )}

      {/* Safety */}
      {analysis.safetyWarnings.length > 0 && (
        <>
          <SectionHeader tone="warn">Before you start</SectionHeader>
          <ul style={{ margin: '0 0 16px', paddingLeft: 18, color: D, fontSize: 13, lineHeight: 1.6 }}>
            {analysis.safetyWarnings.map((w, i) => <li key={i} style={{ marginBottom: 4 }}>{w}</li>)}
          </ul>
        </>
      )}

      {/* When to escalate */}
      {analysis.whenToCallPro && (
        <div style={{
          padding: 12, background: `${O}08`, border: `1px solid ${O}22`,
          borderRadius: 10, marginBottom: 14,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: O, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            When to stop & call a pro
          </div>
          <div style={{ fontSize: 13, color: D, lineHeight: 1.5 }}>{analysis.whenToCallPro}</div>
        </div>
      )}

      <button onClick={onBackToPro} style={{
        width: '100%', padding: '12px 16px', background: CARD,
        border: `1.5px solid ${O}`, color: O, fontWeight: 600,
        borderRadius: 10, cursor: 'pointer', fontSize: 14,
        fontFamily: "'DM Sans', sans-serif",
      }}>Didn’t work? Get pro quotes →</button>

      <p style={{ fontSize: 10.5, color: DIM, marginTop: 10, marginBottom: 0, lineHeight: 1.5, textAlign: 'center' }}>
        Homie earns a small commission from qualifying Amazon purchases. It doesn’t change your price.
      </p>
    </>
  );
}

function ToolRow({ tool }: { tool: DIYToolSupply }) {
  return (
    <a
      href={amazonSearchUrl(tool.searchQuery)}
      {...AFFILIATE_LINK_ATTRS}
      onClick={() => logAffiliateEvent('diy_affiliate_click', { query: tool.searchQuery, name: tool.name, essential: tool.essential })}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 12px', background: CARD, border: `1px solid ${BORDER}`,
        borderRadius: 10, textDecoration: 'none', color: D, transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = O;
        e.currentTarget.style.background = `${O}06`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = BORDER;
        e.currentTarget.style.background = CARD;
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 6, background: W,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, flexShrink: 0,
      }}>{tool.essential ? '🔩' : '📦'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: D }}>
          {tool.name}
          {!tool.essential && (
            <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: DIM, background: W, padding: '2px 6px', borderRadius: 4 }}>
              If needed
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: DIM, marginTop: 2 }}>Search on Amazon</div>
      </div>
      <div style={{ fontSize: 13, color: O, fontWeight: 600, flexShrink: 0 }}>
        View ↗
      </div>
    </a>
  );
}

function Chip({ label, value, accent, strike }: { label: string; value: string; accent?: string; strike?: boolean }) {
  return (
    <div style={{ background: CARD, padding: '6px 10px', borderRadius: 8, fontSize: 12, border: `1px solid ${BORDER}` }}>
      <span style={{ color: DIM }}>{label}: </span>
      <span style={{ fontWeight: 700, color: accent || D, textDecoration: strike ? 'line-through' : 'none' }}>{value}</span>
    </div>
  );
}

function SectionHeader({ children, tone }: { children: React.ReactNode; tone?: 'warn' }) {
  return (
    <div style={{
      fontSize: 11, fontFamily: "'DM Mono', monospace", letterSpacing: 1.2,
      textTransform: 'uppercase', fontWeight: 700,
      color: tone === 'warn' ? O : DIM,
      marginBottom: 8, marginTop: 4,
    }}>{children}</div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
