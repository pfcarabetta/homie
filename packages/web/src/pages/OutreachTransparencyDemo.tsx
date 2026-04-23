import { useEffect, useState, useMemo } from 'react';
import OutreachTransparencyStrip, { type ProviderActivity } from '@/components/OutreachTransparencyStrip';

/**
 * /demo/outreach-transparency — full composed mockup.
 *
 * Shows the proposed layout where the live outreach view is embedded
 * inline in the /quote split layout — replacing the right-side "Homie
 * is listening" card once the user hits dispatch. No modal; everything
 * stays on one page so the user can see their diagnosis + estimate +
 * live outreach progress all at once.
 *
 * Left column: the existing chat column showing the completed chat,
 * diagnosis card, AI estimate, and the selected tier (Priority in the
 * demo). Right column: the NEW LiveOutreachPanel — header +
 * mini-stats + OutreachTransparencyStrip + activity ticker — that
 * replaces "Homie is listening" during the outreach phase.
 *
 * The scripted 2-min sequence loops so you can see the motion.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';

// ── Page ──────────────────────────────────────────────────────────────

export default function OutreachTransparencyDemo() {
  const script = useMemo(() => buildScript(), []);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);

  const MAX_T = useMemo(() => script.reduce((m, p) => Math.max(m, lastFrame(p)), 0) + 15, [script]);

  useEffect(() => {
    if (paused) return;
    const i = setInterval(() => setTick(t => (t + 1) % (MAX_T * 2)), 500);
    return () => clearInterval(i);
  }, [paused, MAX_T]);

  const elapsedSec = tick * 0.5;
  const activity: ProviderActivity[] = useMemo(
    () => script.map(p => resolveAt(p, elapsedSec)),
    [script, elapsedSec],
  );

  const log = useMemo(() => buildLog(script, elapsedSec), [script, elapsedSec]);

  const stats = useMemo(() => {
    const contacted = activity.filter(a => a.status !== 'no_response').length;
    const quoted = activity.filter(a => a.status === 'quoted').length;
    const connected = activity.filter(a => a.status === 'connected').length;
    return { contacted, quoted, connected };
  }, [activity]);

  return (
    <div style={{
      minHeight: '100vh', background: W,
      fontFamily: "'DM Sans',sans-serif", color: D,
    }}>
      <style>{`
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity: 0.4 } }
        @keyframes shimmer { 0%,100% { opacity:1 } 50% { opacity:.55 } }
      `}</style>

      {/* Nav mock */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 10,
        padding: '0 24px', height: 56,
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(16px) saturate(180%)',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: O }}>
          homie
        </div>
        <div style={{
          fontSize: 11, fontFamily: "'DM Mono',monospace", letterSpacing: 1.2,
          textTransform: 'uppercase', fontWeight: 700, color: DIM,
        }}>
          /quote
        </div>
      </nav>

      <div style={{ maxWidth: 1180, margin: '0 auto', padding: '22px 24px 80px' }}>
        {/* Demo header */}
        <div style={{
          marginBottom: 18, padding: '14px 18px',
          background: '#FFF7ED', border: `1px solid ${O}33`, borderRadius: 12,
        }}>
          <div style={{
            fontSize: 11, fontFamily: "'DM Mono',monospace", letterSpacing: 1.4,
            textTransform: 'uppercase', color: O, fontWeight: 700, marginBottom: 4,
          }}>
            Design Preview · Scripted Simulation
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: D }}>
            Inline outreach — live progress in the right split, no modal
          </div>
          <div style={{ fontSize: 13, color: DIM, marginTop: 4, lineHeight: 1.5 }}>
            Proposed: once the user taps a tier, the right panel swaps from "Homie is listening" to the LiveOutreachPanel. Diagnosis, estimate, and live progress live on one screen. The scripted 2-min sequence loops — <strong>pause</strong> any frame to inspect.
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setPaused(p => !p)} style={controlBtn}>
              {paused ? '▶ Resume' : '❚❚ Pause'}
            </button>
            <button onClick={() => setTick(0)} style={controlBtn}>↺ Restart</button>
            <div style={{ flex: 1, textAlign: 'right', fontSize: 11, color: DIM, fontFamily: "'DM Mono',monospace" }}>
              t={elapsedSec.toFixed(1)}s / {MAX_T}s
            </div>
          </div>
        </div>

        {/* The 2-column layout matching /quote */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 24,
        }}>
          <LeftChatColumn />
          <RightOutreachColumn
            activity={activity}
            log={log}
            stats={stats}
          />
        </div>
      </div>
    </div>
  );
}

// ── Left: completed chat + diagnosis + estimate + selected tier ────────

function LeftChatColumn() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Completed chat transcript */}
      <UserBubble>Kitchen faucet drips from the base every few seconds, mostly when hot water is on</UserBubble>
      <AIBubble>Got it — drips from the base (not the aerator) + hot-water trigger points to a worn O-ring or cartridge seal. Is the handle single-lever or two-handle?</AIBubble>
      <UserBubble>Single lever, pull-down sprayer</UserBubble>
      <AIBubble>Perfect. One last thing — do you know the brand on the faucet?</AIBubble>
      <UserBubble>Kohler I think</UserBubble>
      <AIBubble>
        Great — that narrows it to a Kohler single-handle cartridge. I&rsquo;ve prepared your diagnosis. Tap Continue when you&rsquo;re ready to find a pro.
      </AIBubble>

      {/* Diagnosis card */}
      <div style={{
        marginLeft: 42, marginTop: 6, marginBottom: 8,
        background: '#fff', border: `2px solid ${G}22`,
        borderRadius: 16, overflow: 'hidden',
      }}>
        <div style={{
          background: `${G}10`, padding: '12px 16px',
          borderBottom: `1px solid ${G}22`,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: G }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: G }}>AI diagnosis ready</span>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: D, marginBottom: 8 }}>
            💧 Plumbing — Kohler single-handle kitchen faucet base drip
          </div>
          <div style={{ fontSize: 13.5, color: DIM, lineHeight: 1.55, marginBottom: 10 }}>
            Worn O-ring or cartridge seal — 85% of base drips on single-handle pull-downs resolve with a $5–$20 replacement part. Roughly 15% of the time the cartridge itself needs swapping.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <MiniChip label="Category" value="Plumbing" />
            <MiniChip label="Est. pro cost" value="$150–$285" />
          </div>
        </div>
      </div>

      {/* Tier choice — Priority shown selected */}
      <div style={{
        marginLeft: 42, marginBottom: 8,
        padding: '14px 16px', borderRadius: 14,
        border: `2px solid ${O}`, background: `${O}08`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', background: O, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14,
        }}>⚡</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: D }}>Priority dispatch · $19</div>
          <div style={{ fontSize: 12.5, color: DIM, marginTop: 1 }}>Within 2 hrs · first in queue</div>
        </div>
        <div style={{
          fontSize: 10, fontFamily: "'DM Mono',monospace", letterSpacing: 1,
          textTransform: 'uppercase', fontWeight: 700, color: O,
        }}>
          Selected
        </div>
      </div>

      {/* Dispatch confirmation banner */}
      <div style={{
        marginLeft: 42, padding: '10px 14px', borderRadius: 12,
        background: `linear-gradient(90deg, ${G}14, ${G}04)`,
        border: `1px solid ${G}44`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{ position: 'relative', width: 10, height: 10 }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: G }} />
          <span style={{ position: 'absolute', inset: -4, borderRadius: '50%', background: G, opacity: .25, animation: 'pulse 1.8s infinite' }} />
        </div>
        <div style={{ flex: 1, fontSize: 12.5, color: D, fontWeight: 600 }}>
          <span style={{ color: G, fontWeight: 800 }}>Dispatch launched</span>
          <span style={{ color: DIM, fontWeight: 500 }}> — live progress on the right →</span>
        </div>
      </div>
    </div>
  );
}

// ── Right: the new LiveOutreachPanel ──────────────────────────────────

function RightOutreachColumn({
  activity, log, stats,
}: {
  activity: ProviderActivity[];
  log: LogEntry[];
  stats: { contacted: number; quoted: number; connected: number };
}) {
  return (
    <div style={{ position: 'sticky', top: 72 }}>
      <div style={{
        background: '#fff', borderRadius: 22, border: `1px solid ${BORDER}`,
        padding: '20px 20px 16px', boxShadow: '0 20px 60px -24px rgba(0,0,0,.12)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* Header — same animated spinning H as HomieGeneratingCard,
            scaled down to fit the compact panel slot. Replaces the
            square 40px block that was here before. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HomieSpinningLogo />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: D, lineHeight: 1.2 }}>
              Homie is reaching out
            </div>
            <div style={{ fontSize: 12, color: DIM, fontFamily: "'DM Mono',monospace", marginTop: 1 }}>
              Priority dispatch · usually ~2 min
            </div>
          </div>
        </div>

        {/* Aggregate stats — two columns now (ETA removed; we no longer
            fabricate time estimates). Contacted + Quoted is the honest
            picture of what the outreach engine actually knows. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <MiniStat label="Contacted" value={stats.contacted} color={O} />
          <MiniStat label="Quoted" value={stats.quoted} color={G} />
        </div>

        {/* The new transparency strip */}
        <OutreachTransparencyStrip
          activity={activity}
          onQuoteTap={(id) => alert(`Would jump to provider card for ${id}`)}
        />

        {/* Activity ticker */}
        <ActivityTicker log={log} />

        {/* Footer */}
        <div style={{
          fontSize: 11.5, color: DIM, textAlign: 'center', fontFamily: "'DM Sans',sans-serif",
          paddingTop: 4,
        }}>
          Feel free to close the tab — we&rsquo;ll text you the quotes as they land.
        </div>
      </div>
    </div>
  );
}

// ── Small pieces ──────────────────────────────────────────────────────

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 0 }}>
      <div style={{
        maxWidth: '78%', padding: '10px 14px',
        background: O, color: '#fff',
        borderRadius: 16, borderBottomRightRadius: 4,
        fontSize: 14, lineHeight: 1.45,
      }}>{children}</div>
    </div>
  );
}

function AIBubble({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 0 }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: O, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Fraunces',serif", fontSize: 14, fontWeight: 700, flexShrink: 0,
      }}>h</div>
      <div style={{
        maxWidth: '78%', padding: '10px 14px',
        background: '#fff', color: D, border: `1px solid ${BORDER}`,
        borderRadius: 16, borderBottomLeftRadius: 4,
        fontSize: 14, lineHeight: 1.5,
      }}>{children}</div>
    </div>
  );
}

function MiniChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: W, padding: '6px 10px', borderRadius: 8,
      fontSize: 12, color: DIM,
    }}>
      <span>{label}: </span>
      <span style={{ color: D, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      padding: '10px 8px', background: W, borderRadius: 10,
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 9, color: DIM, fontFamily: "'DM Mono',monospace",
        letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 2,
      }}>{label}</div>
      <div style={{
        fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color,
        lineHeight: 1.1,
      }}>{value}</div>
    </div>
  );
}

function ActivityTicker({ log }: { log: LogEntry[] }) {
  if (log.length === 0) return null;
  const recent = log.slice(-4).reverse();
  return (
    <div style={{
      background: '#1F1B18', borderRadius: 12,
      padding: '10px 12px',
      maxHeight: 130, overflow: 'hidden',
      fontFamily: "'DM Mono',monospace",
    }}>
      <div style={{
        fontSize: 9.5, letterSpacing: 1.3, textTransform: 'uppercase',
        color: '#9B9490', fontWeight: 700, marginBottom: 6,
      }}>
        Activity
      </div>
      {recent.map((e, i) => (
        <div key={`${e.t}-${i}`} style={{
          fontSize: 11, color: logColor(e.type), lineHeight: 1.55,
          opacity: 1 - i * 0.18,
        }}>
          <span style={{ color: '#6B6560' }}>{formatClock(e.t)}</span>
          {' · '}
          <span>{e.text}</span>
        </div>
      ))}
    </div>
  );
}

function logColor(t: LogEntry['type']): string {
  switch (t) {
    case 'quote':     return '#7ED0B1'; // softer green
    case 'connected': return '#9FD9BD'; // pale green — engagement signal
    case 'contact':   return '#F6B76A'; // amber
    case 'decline':   return '#9B9490'; // muted
    case 'system':    return '#C7C3BE';
    default:          return '#E8E4DF';
  }
}

// ── Scripted simulation ────────────────────────────────────────────────

interface ScriptFrame {
  providerId: string;
  name: string;
  company: string;
  channel: 'voice' | 'sms' | 'web';
  frames: Array<{ t: number; state: Partial<ProviderActivity> }>;
}

interface LogEntry {
  t: number;
  text: string;
  type: 'contact' | 'quote' | 'decline' | 'system' | 'connected';
}

function buildScript(): ScriptFrame[] {
  return [
    {
      providerId: 'p1',
      name: 'Miguel',
      company: 'Rapid Rooter Plumbing',
      channel: 'voice',
      frames: [
        { t: 0,  state: { status: 'contacting' } },
        { t: 18, state: { status: 'connected' } },
        { t: 44, state: { status: 'quoted', quote: { priceLabel: '$180', availability: 'Available today 2–4pm' } } },
      ],
    },
    {
      providerId: 'p2',
      name: 'Ana',
      company: 'Blue Star Plumbing',
      channel: 'sms',
      frames: [
        { t: 2,  state: { status: 'contacting' } },
        { t: 16, state: { status: 'connected' } },
        { t: 70, state: { status: 'declined' } },
      ],
    },
    {
      providerId: 'p3',
      name: 'ABC Plumbing & Drain',
      company: 'ABC Plumbing & Drain',
      channel: 'web',
      frames: [
        { t: 8,  state: { status: 'contacting' } },
        { t: 40, state: { status: 'connected' } },
        { t: 95, state: { status: 'quoted', quote: { priceLabel: '$225', availability: 'Tomorrow 9–11am' } } },
      ],
    },
    {
      providerId: 'p4',
      name: 'Sarah',
      company: 'Reliable Home Services',
      channel: 'voice',
      frames: [
        { t: 75,  state: { status: 'contacting' } },
        { t: 105, state: { status: 'connected' } },
      ],
    },
  ];
}

function resolveAt(p: ScriptFrame, tSec: number): ProviderActivity {
  const active = p.frames.reduce<ScriptFrame['frames'][number] | null>((acc, f) => (f.t <= tSec ? f : acc), null);
  if (!active) {
    return {
      providerId: p.providerId, name: p.name, company: p.company,
      channel: p.channel, status: 'no_response',
    };
  }
  const firstContact = p.frames[0].t;
  const startedMsAgo = (tSec - firstContact) * 1000;
  return {
    providerId: p.providerId,
    name: p.name,
    company: p.company,
    channel: p.channel,
    status: 'contacting',
    startedAt: Date.now() - startedMsAgo,
    ...active.state,
  };
}

function lastFrame(p: ScriptFrame): number {
  return p.frames.reduce((m, f) => Math.max(m, f.t), 0);
}

/** Build a sparse activity log from the script, cut off at tSec. */
function buildLog(script: ScriptFrame[], tSec: number): LogEntry[] {
  const out: LogEntry[] = [];
  out.push({ t: 0, text: 'Dispatch launched · Priority tier', type: 'system' });
  for (const p of script) {
    for (const f of p.frames) {
      if (f.t > tSec) break;
      const actor = p.company;
      if (f.state.status === 'contacting') {
        const verb = p.channel === 'voice' ? 'Calling' : p.channel === 'sms' ? 'SMS to' : 'Web request to';
        out.push({ t: f.t, text: `${verb} ${actor}`, type: 'contact' });
      } else if (f.state.status === 'connected') {
        const verb = p.channel === 'voice' ? 'answered' : p.channel === 'sms' ? 'replied' : 'opened the request';
        out.push({ t: f.t, text: `${p.name} ${verb} at ${actor}`, type: 'connected' });
      } else if (f.state.status === 'quoted') {
        out.push({ t: f.t, text: `Quote from ${actor}: ${f.state.quote?.priceLabel ?? ''}`, type: 'quote' });
      } else if (f.state.status === 'declined') {
        out.push({ t: f.t, text: `${actor} declined — moving on`, type: 'decline' });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// ── Utilities ────────────────────────────────────────────────────────

function formatClock(tSec: number): string {
  const mm = String(Math.floor(tSec / 60)).padStart(2, '0');
  const ss = String(Math.floor(tSec % 60)).padStart(2, '0');
  return `+${mm}:${ss}`;
}

/** Compact version of the HomieGeneratingCard's animated avatar.
 *  Same spinning orange ring + pulsing orange "h" disk, scaled to fit
 *  the panel header slot (48px outer / 32px inner). */
function HomieSpinningLogo() {
  return (
    <div style={{
      position: 'relative', width: 48, height: 48, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <style>{`
        @keyframes homieSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes homieBeat {
          0%, 100% { transform: scale(1); box-shadow: 0 6px 16px -4px ${O}66; }
          50%      { transform: scale(1.06); box-shadow: 0 10px 24px -4px ${O}99; }
        }
      `}</style>
      {/* Orange spinning ring — matches the diagnosis-generating card. */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: `2.5px solid ${O}22`,
        borderTopColor: O,
        borderRightColor: `${O}88`,
        animation: 'homieSpin 1.4s linear infinite',
      }} />
      {/* Solid Homie disk with the "h" wordmark. */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: O,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'homieBeat 1.8s ease-in-out infinite',
      }}>
        <span style={{
          color: '#fff', fontFamily: "'Fraunces',serif",
          fontWeight: 700, fontSize: 16, lineHeight: 1,
        }}>h</span>
      </div>
    </div>
  );
}

const controlBtn: React.CSSProperties = {
  padding: '6px 14px', background: '#fff', border: `1px solid ${BORDER}`,
  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'DM Sans',sans-serif", color: D,
};
