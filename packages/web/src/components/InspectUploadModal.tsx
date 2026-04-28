import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import HomieLoadingAnimation from './HomieLoadingAnimation';

/**
 * Centered modal shown while a homeowner's inspection PDF is uploading
 * and parsing on /inspect.
 *
 * Replaces the prior bottom-right toast — full-screen modal makes it
 * obvious that the user shouldn't close the tab. Three pieces:
 *   1. HomieLoadingAnimation (channels off — they're about provider
 *      outreach, not parsing). Headline + subtext follow the parse phase.
 *   2. 4-step progress bar with the live status sentence underneath.
 *   3. Auto-rotating feature carousel so the wait educates instead of
 *      stares (Items / Quotes / Home IQ / Negotiation).
 */

const C = {
  orange: '#E8632B', orangeSoft: 'rgba(232,99,43,.10)',
  green: '#1B9E77', greenSoft: 'rgba(27,158,119,.10)',
  amber: '#D97706', amberSoft: 'rgba(217,119,6,.12)',
  blue: '#2563EB', blueSoft: 'rgba(37,99,235,.10)',
  purple: '#7C3AED', purpleSoft: 'rgba(124,58,237,.10)',
  dark: '#2D2926', muted: '#6B6560', meta: '#9B9490',
  line: '#E9E3DD', warm: '#F9F5F2', white: '#FFFFFF',
};
const FR: CSSProperties = { fontFamily: 'Fraunces, serif' };
const DM: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const MO: CSSProperties = { fontFamily: "'DM Mono', ui-monospace, Menlo, monospace" };

export type UploadPhase = 'uploading' | 'processing' | 'parsing' | 'complete';

interface InspectUploadModalProps {
  open: boolean;
  phase: UploadPhase;
  /** Live status sentence under the progress bar. */
  statusText: string;
  /** When phase === 'parsing', drives the segment fill from 0–100. */
  itemsParsed?: number;
  /** Approximate total expected; used to scale the parsing-segment fill. */
  expectedItems?: number;
}

interface PhaseMeta { label: string; pct: number; }
const PHASES: Record<UploadPhase, PhaseMeta> = {
  uploading: { label: 'Uploading',      pct: 15 },
  processing: { label: 'Processing',    pct: 35 },
  parsing:    { label: 'Parsing items', pct: 75 },
  complete:   { label: 'Ready',         pct: 100 },
};

/* ── Educational carousel content ──────────────────────────────────── */
interface FeatureCard {
  eyebrow: string;
  title: string;
  desc: string;
  accent: string;
  visual: ReactNode;
}

function ItemPreviewCard() {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12,
      padding: '14px 16px', display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 12, alignItems: 'center',
      boxShadow: '0 8px 24px -12px rgba(0,0,0,.10)',
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: 8, background: C.warm,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
      }}>💧</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...DM, fontSize: 13, fontWeight: 600, color: C.dark, lineHeight: 1.3 }}>
          Water heater drain pan rusted
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ ...DM, fontSize: 10, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: '2px 8px', borderRadius: 100 }}>Recommended</span>
          <span style={{ ...DM, fontSize: 10, fontWeight: 600, color: C.muted, background: 'rgba(0,0,0,.05)', padding: '2px 8px', borderRadius: 100 }}>Plumbing</span>
        </div>
      </div>
      <span style={{ ...FR, fontSize: 14, fontWeight: 700, color: C.dark }}>$250–$400</span>
    </div>
  );
}

function QuoteCard() {
  return (
    <div style={{
      border: `1.5px solid ${C.orange}`, borderRadius: 12,
      padding: '14px 16px', display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: 12, alignItems: 'center',
      background: 'rgba(232,99,43,.04)', boxShadow: '0 8px 24px -12px rgba(232,99,43,.30)',
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: '50%', background: C.line,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
      }}>🔧</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...FR, fontSize: 14, fontWeight: 700, color: C.dark }}>Atlas Plumbing</span>
          <span style={{ ...MO, fontSize: 9, fontWeight: 700, color: C.orange, letterSpacing: '.12em' }}>RECOMMENDED</span>
        </div>
        <div style={{ ...DM, fontSize: 11, color: C.meta }}>4.8★ · 142 jobs · Tomorrow 9–11 AM</div>
      </div>
      <span style={{ ...FR, fontSize: 18, fontWeight: 700, color: C.dark }}>$295</span>
    </div>
  );
}

function HomeIQCard() {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.dark}, #2c2724)`, borderRadius: 12,
      padding: 18, color: '#fff', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 18, alignItems: 'center',
      boxShadow: '0 8px 24px -12px rgba(0,0,0,.20)',
    }}>
      <div style={{ position: 'relative', width: 92, height: 92, flexShrink: 0 }}>
        <svg width="100%" height="100%" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="14"/>
          <circle cx="100" cy="100" r="84" fill="none" stroke={C.orange} strokeWidth="14"
            strokeDasharray={`${(72 / 100) * 528} 528`} strokeLinecap="round" transform="rotate(-90 100 100)"/>
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...FR, fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>72</div>
          <div style={{ ...MO, fontSize: 8, letterSpacing: '.16em', color: 'rgba(255,255,255,.6)', marginTop: 2 }}>HOME IQ</div>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ ...DM, fontSize: 12, color: 'rgba(255,255,255,.7)', lineHeight: 1.5 }}>
          Better than <strong style={{ color: '#fff' }}>64%</strong> of 1965-built homes in 92103.
        </div>
        <div style={{ ...DM, fontSize: 11, color: C.orange, fontWeight: 600, marginTop: 6 }}>+8 with one fix →</div>
      </div>
    </div>
  );
}

function NegotiationCard() {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${C.line}`, borderRadius: 12,
      padding: '14px 18px', boxShadow: '0 8px 24px -12px rgba(0,0,0,.10)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${C.line}`, paddingBottom: 8, marginBottom: 8 }}>
        <div style={{ ...MO, fontSize: 9, color: C.meta, letterSpacing: '.16em' }}>REPAIR REQUEST · DRAFT</div>
        <span style={{ ...DM, fontSize: 10, fontWeight: 600, color: C.green, background: C.greenSoft, padding: '2px 8px', borderRadius: 100 }}>● Ready</span>
      </div>
      {[
        ['Water heater drain pan rusted', '$295'],
        ['GFCI in two bathrooms',         '$180'],
        ['Re-flash chimney saddle',       '$840'],
        ['+ 11 more items',               '$9,885'],
      ].map(([n, p], i, a) => (
        <div key={n} style={{
          display: 'flex', justifyContent: 'space-between', padding: '5px 0',
          borderBottom: i < a.length - 1 ? `1px solid ${C.line}` : 'none',
          ...DM, fontSize: 12, color: i === a.length - 1 ? C.meta : C.dark,
          fontStyle: i === a.length - 1 ? 'italic' : 'normal',
        }}>
          <span>{n}</span>
          <span style={{ ...FR, fontWeight: 600 }}>{p}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', marginTop: 4, borderTop: `2px solid ${C.dark}` }}>
        <span style={{ ...FR, fontSize: 13, fontWeight: 700, color: C.dark }}>Total credit</span>
        <span style={{ ...FR, fontSize: 16, fontWeight: 700, color: C.orange }}>$11,200</span>
      </div>
    </div>
  );
}

const FEATURES: FeatureCard[] = [
  {
    eyebrow: 'WHILE YOU WAIT',
    title: 'Every line item, with a real cost range',
    desc: 'Homie reads every paragraph and turns it into one clean item — severity, category, location, and a real cost range from local pricing data.',
    accent: C.amber,
    visual: <ItemPreviewCard />,
  },
  {
    eyebrow: 'WHILE YOU WAIT',
    title: 'Real local quotes, not Google searches',
    desc: 'Tap any item and Homie\'s AI dispatches local pros — you\'ll have real quotes with availability in hours, not weeks of phone tag.',
    accent: C.orange,
    visual: <QuoteCard />,
  },
  {
    eyebrow: 'WHILE YOU WAIT',
    title: 'A score for your whole home',
    desc: 'Public datasets benchmark your home against millions of others. See your weakest system and the one fix that lifts it most.',
    accent: C.green,
    visual: <HomeIQCard />,
  },
  {
    eyebrow: 'WHILE YOU WAIT',
    title: 'Walk into negotiation with a number',
    desc: 'Pick the items, pick the format. Homie generates a polished repair-request package with line-item quotes attached.',
    accent: C.blue,
    visual: <NegotiationCard />,
  },
];

const PHASE_HEADLINES: Record<UploadPhase, { headline: string; sub: string }> = {
  uploading:  { headline: 'Uploading your report',       sub: 'Sending the PDF to Homie\'s parser' },
  processing: { headline: 'Reading your report',         sub: 'Identifying sections, photos, and findings' },
  parsing:    { headline: 'Turning paragraphs into items', sub: 'Pulling severity, location, and cost ranges' },
  complete:   { headline: 'Your report is ready',        sub: 'Redirecting you now' },
};

export default function InspectUploadModal({ open, phase, statusText, itemsParsed = 0, expectedItems = 30 }: InspectUploadModalProps) {
  const [cardIndex, setCardIndex] = useState(0);

  // Auto-rotate the feature carousel every 6 seconds while the modal
  // is open. Reset to 0 whenever it opens fresh so users don't land
  // mid-carousel on subsequent uploads.
  useEffect(() => {
    if (!open) { setCardIndex(0); return; }
    const tick = setInterval(() => setCardIndex(i => (i + 1) % FEATURES.length), 6000);
    return () => clearInterval(tick);
  }, [open]);

  // Scroll lock + Escape no-op while open. Don't allow ESC to close —
  // the upload is in flight and bailing leaves the user with nothing.
  const lastBodyOverflow = useRef<string>('');
  useEffect(() => {
    if (!open) return;
    lastBodyOverflow.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = lastBodyOverflow.current; };
  }, [open]);

  if (!open) return null;

  // Compute the overall progress percentage. While in 'parsing' phase,
  // ramp the segment fill based on actual items parsed so the bar
  // creeps forward instead of sitting at 75% silently.
  const phaseMeta = PHASES[phase];
  let progress = phaseMeta.pct;
  if (phase === 'parsing' && itemsParsed > 0) {
    const parsingStart = PHASES.processing.pct;
    const parsingEnd = PHASES.complete.pct;
    const ratio = Math.min(1, itemsParsed / Math.max(expectedItems, 1));
    progress = parsingStart + (parsingEnd - parsingStart) * 0.85 * ratio;
  }
  progress = Math.max(8, Math.min(100, Math.round(progress)));

  const headlineCopy = PHASE_HEADLINES[phase];
  const card = FEATURES[cardIndex];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Uploading inspection report"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(45, 41, 38, 0.62)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px 16px', overflowY: 'auto',
      }}
    >
      <style>{`
        @keyframes ium-fade-in { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes ium-progress-shimmer { 0% { background-position: -150% 0; } 100% { background-position: 250% 0; } }
        @keyframes ium-card-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>

      <div style={{
        background: C.white, borderRadius: 24, maxWidth: 720, width: '100%',
        boxShadow: '0 40px 100px -32px rgba(0,0,0,.35)',
        padding: '32px 32px 28px', position: 'relative',
        animation: 'ium-fade-in .35s cubic-bezier(.2,.6,.2,1)',
      }}>
        {/* Header — Homie loading animation */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 6 }}>
          <HomieLoadingAnimation
            size="md"
            showChannels={false}
            headline={headlineCopy.headline}
            subtext={headlineCopy.sub}
            messages={[]}
          />
        </div>

        {/* Progress bar */}
        <div style={{ marginTop: 12 }}>
          <div style={{
            position: 'relative', height: 8, background: C.warm,
            borderRadius: 100, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: phase === 'complete'
                ? C.green
                : `linear-gradient(90deg, ${C.orange} 0%, #F08358 50%, ${C.orange} 100%)`,
              backgroundSize: '200% 100%',
              animation: phase === 'complete' ? 'none' : 'ium-progress-shimmer 2s linear infinite',
              borderRadius: 100,
              transition: 'width .6s cubic-bezier(.2,.6,.2,1)',
            }}/>
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', marginTop: 10, gap: 8,
          }}>
            {(Object.keys(PHASES) as UploadPhase[]).map(p => {
              const isCurrent = p === phase;
              const isPast = PHASES[p].pct <= phaseMeta.pct && p !== phase;
              return (
                <div key={p} style={{
                  ...DM, fontSize: 11, fontWeight: 600,
                  color: isCurrent ? C.orange : isPast ? C.dark : C.meta,
                  display: 'flex', alignItems: 'center', gap: 6, flex: 1,
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: isPast ? C.green : isCurrent ? C.orange : C.line,
                    flexShrink: 0,
                  }} />
                  {PHASES[p].label}
                </div>
              );
            })}
          </div>
          <div style={{
            ...DM, fontSize: 13, color: C.muted, marginTop: 14,
            padding: '10px 14px', background: C.warm, borderRadius: 10,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%', background: C.green,
              flexShrink: 0,
            }} />
            <span style={{ color: C.dark, fontWeight: 600 }}>{statusText}</span>
          </div>
        </div>

        {/* Reassurance */}
        <div style={{
          marginTop: 16, display: 'flex', alignItems: 'flex-start', gap: 10,
          padding: '12px 14px', background: 'rgba(232,99,43,.06)',
          border: `1px solid rgba(232,99,43,.18)`, borderRadius: 10,
        }}>
          <span style={{ fontSize: 16, lineHeight: 1.2 }}>⏱️</span>
          <div style={{ ...DM, fontSize: 12.5, color: C.dark, lineHeight: 1.55 }}>
            <strong>This usually takes 2–5 minutes.</strong>{' '}
            <span style={{ color: C.muted }}>
              Keep this tab open — we’ll redirect you the moment your report’s ready.
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.line, margin: '24px 0 20px' }} />

        {/* Educational carousel */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ ...MO, fontSize: 10, fontWeight: 700, color: card.accent, letterSpacing: '.18em' }}>
              {card.eyebrow}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {FEATURES.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCardIndex(i)}
                  aria-label={`Show feature ${i + 1}`}
                  style={{
                    width: i === cardIndex ? 18 : 6, height: 6, borderRadius: 100,
                    background: i === cardIndex ? card.accent : C.line,
                    border: 'none', cursor: 'pointer', padding: 0,
                    transition: 'all .25s',
                  }}
                />
              ))}
            </div>
          </div>
          <div key={cardIndex} style={{ animation: 'ium-card-in .35s cubic-bezier(.2,.6,.2,1) both' }}>
            <h3 style={{ ...FR, fontSize: 22, fontWeight: 700, color: C.dark, margin: '0 0 8px', letterSpacing: '-0.01em', lineHeight: 1.15 }}>
              {card.title}
            </h3>
            <p style={{ ...DM, fontSize: 14, color: C.muted, lineHeight: 1.55, margin: '0 0 16px' }}>
              {card.desc}
            </p>
            {card.visual}
          </div>
        </div>
      </div>
    </div>
  );
}
