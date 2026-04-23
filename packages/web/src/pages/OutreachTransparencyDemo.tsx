import { useEffect, useState, useMemo } from 'react';
import OutreachTransparencyStrip, { type ProviderActivity } from '@/components/OutreachTransparencyStrip';

/**
 * /demo/outreach-transparency — visual mockup of feature #8 from the
 * innovations list. Renders the OutreachTransparencyStrip against a
 * scripted sequence of provider events so we can judge the UX before
 * wiring the backend WS to emit per-provider events.
 *
 * The scripted sequence mimics a realistic 2-minute dispatch:
 *   t=0s   two providers start getting contacted (SMS + voice)
 *   t=8s   a third provider gets pinged via web form
 *   t=22s  one is now reviewing
 *   t=44s  first quote lands — row turns green, jumps to top of queue
 *   t=60s  second provider declines, fades
 *   t=75s  fourth provider contacted
 *   t=95s  second quote lands
 *
 * The existing HomieOutreachLive aggregate view is rendered below the
 * strip so we can see how they compose.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';

export default function OutreachTransparencyDemo() {
  const script = useMemo(() => buildScript(), []);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);

  // Simple time-based state machine — advances every 500ms unless
  // paused. The script describes what each provider's state is at
  // each elapsed-seconds mark; we interpolate to find the current state.
  useEffect(() => {
    if (paused) return;
    const i = setInterval(() => setTick(t => (t + 1) % 260), 500);
    return () => clearInterval(i);
  }, [paused]);

  const elapsedSec = tick * 0.5;
  const activity: ProviderActivity[] = script.map(p => resolveAt(p, elapsedSec));

  // Aggregate stats for the faux HomieOutreachLive below.
  const aggregate = useMemo(() => {
    const contacted = activity.filter(a => a.status !== 'no_response').length;
    const responded = activity.filter(a => a.status === 'quoted' || a.status === 'declined').length;
    return { contacted, responded };
  }, [activity]);

  return (
    <div style={{
      minHeight: '100vh', background: W, padding: '32px 20px',
      fontFamily: "'DM Sans',sans-serif", color: D,
    }}>
      <style>{`
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity: 0.4 } }
      `}</style>

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Demo header */}
        <div style={{
          marginBottom: 20, padding: '16px 20px',
          background: '#FFF7ED', border: `1px solid ${O}33`, borderRadius: 12,
        }}>
          <div style={{
            fontSize: 11, fontFamily: "'DM Mono',monospace", letterSpacing: 1.4,
            textTransform: 'uppercase', color: O, fontWeight: 700, marginBottom: 4,
          }}>
            Design Preview · Scripted Simulation
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: D }}>
            Live outreach transparency strip
          </div>
          <div style={{ fontSize: 13, color: DIM, marginTop: 4, lineHeight: 1.5 }}>
            Sits above the existing HomieOutreachLive aggregate view during the 2-min dispatch window. Shows individual provider activity Uber-style so the wait feels active. This preview loops a scripted 2-minute sequence — not yet wired to real WebSocket events (backend emits aggregates today; we'd add a <code style={{ fontSize: 12 }}>provider_activity</code> event to drive this live).
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setPaused(p => !p)} style={controlBtn}>
              {paused ? '▶ Resume' : '❚❚ Pause'}
            </button>
            <button onClick={() => setTick(0)} style={controlBtn}>↺ Restart</button>
            <div style={{
              flex: 1, fontSize: 11, color: DIM, textAlign: 'right',
              fontFamily: "'DM Mono',monospace",
            }}>
              t={elapsedSec.toFixed(1)}s / {(script.reduce((m, p) => Math.max(m, lastFrame(p)), 0)).toFixed(0)}s
            </div>
          </div>
        </div>

        {/* The component under test */}
        <OutreachTransparencyStrip
          activity={activity}
          onQuoteTap={(id) => alert(`Would jump to provider card for ${id}`)}
        />

        {/* Faux HomieOutreachLive to show composition */}
        <div style={{ marginTop: 16 }}>
          <FauxOutreachAggregate contacted={aggregate.contacted} responded={aggregate.responded} />
        </div>
      </div>
    </div>
  );
}

// ── Scripted sequence ──────────────────────────────────────────────────

interface ScriptFrame {
  providerId: string;
  name: string;
  company: string;
  channel: 'voice' | 'sms' | 'web';
  frames: Array<{ t: number; state: Partial<ProviderActivity> }>;
}

function buildScript(): ScriptFrame[] {
  // Each frame's `state` OVERRIDES the active state as of that t (seconds).
  return [
    {
      providerId: 'p1',
      name: 'Miguel',
      company: 'Rapid Rooter Plumbing',
      channel: 'voice',
      frames: [
        { t: 0,  state: { status: 'contacting', startedAt: Date.now() } },
        { t: 18, state: { status: 'reviewing', expectedInSec: 180 } },
        { t: 44, state: { status: 'quoted', quote: { priceLabel: '$180', availability: 'Available today 2–4pm' } } },
      ],
    },
    {
      providerId: 'p2',
      name: 'Ana',
      company: 'Blue Star Plumbing',
      channel: 'sms',
      frames: [
        { t: 0,  state: { status: 'contacting' } },
        { t: 15, state: { status: 'reviewing', expectedInSec: 240 } },
        { t: 60, state: { status: 'declined' } },
      ],
    },
    {
      providerId: 'p3',
      name: 'ABC Plumbing & Drain',
      company: 'ABC Plumbing & Drain',
      channel: 'web',
      frames: [
        { t: 8,  state: { status: 'contacting' } },
        { t: 35, state: { status: 'reviewing', expectedInSec: 300 } },
        { t: 95, state: { status: 'quoted', quote: { priceLabel: '$225', availability: 'Tomorrow 9–11am' } } },
      ],
    },
    {
      providerId: 'p4',
      name: 'Sarah',
      company: 'Reliable Home Services',
      channel: 'voice',
      frames: [
        { t: 75, state: { status: 'contacting' } },
        { t: 110, state: { status: 'reviewing', expectedInSec: 200 } },
      ],
    },
  ];
}

function resolveAt(p: ScriptFrame, tSec: number): ProviderActivity {
  // Find the most recent frame whose `t` is ≤ current time.
  const active = p.frames.reduce<ScriptFrame['frames'][number] | null>((acc, f) => {
    if (f.t <= tSec) return f;
    return acc;
  }, null);
  // Before the first frame, provider is a no-op.
  if (!active) {
    return {
      providerId: p.providerId,
      name: p.name,
      company: p.company,
      channel: p.channel,
      status: 'no_response',
    };
  }
  // Compute startedAt as "time since the provider was first contacted".
  const firstContact = p.frames[0].t;
  return {
    providerId: p.providerId,
    name: p.name,
    company: p.company,
    channel: p.channel,
    status: 'contacting', // overridden by spread below if present
    startedAt: Date.now() - (tSec - firstContact) * 1000,
    ...active.state,
  };
}

function lastFrame(p: ScriptFrame): number {
  return p.frames.reduce((m, f) => Math.max(m, f.t), 0);
}

// ── Faux aggregate view (simplified HomieOutreachLive) ─────────────────

function FauxOutreachAggregate({ contacted, responded }: { contacted: number; responded: number }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 18,
      padding: '20px 22px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, background: O,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontFamily: "'Fraunces',serif", fontWeight: 700, fontSize: 18,
        }}>h</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: D }}>
            Homie is finding you pros
          </div>
          <div style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
            This usually takes 2 minutes
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14,
      }}>
        <Stat label="Contacted" value={contacted} color={O} />
        <Stat label="Quoted" value={responded} color={G} />
        <Stat label="Complete" value={responded > 0 ? `${Math.round((responded / Math.max(contacted,1)) * 100)}%` : '—'} color={D} />
      </div>

      <div style={{ fontSize: 11, color: DIM, textAlign: 'center', fontFamily: "'DM Mono',monospace", letterSpacing: 0.5 }}>
        Existing HomieOutreachLive aggregate card — the transparency strip sits ABOVE this.
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{
      padding: '10px 12px', background: W, borderRadius: 10,
      textAlign: 'center',
    }}>
      <div style={{
        fontSize: 9, color: DIM, fontFamily: "'DM Mono',monospace",
        letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700, marginBottom: 3,
      }}>{label}</div>
      <div style={{
        fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color,
      }}>{value}</div>
    </div>
  );
}

const controlBtn: React.CSSProperties = {
  padding: '6px 14px', background: '#fff', border: '1px solid rgba(0,0,0,0.12)',
  borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'DM Sans',sans-serif", color: D,
};
