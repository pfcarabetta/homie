import { useMemo } from 'react';

/**
 * Live-outreach transparency strip — sits above the existing
 * HomieOutreachLive aggregate view during the 2-minute dispatch window.
 * Shows individual provider activity Uber-style so the wait feels
 * active: "Connected with Miguel at Rapid Rooter · Response expected
 * soon", "Quote from ABC Plumbing: $180 · available today 2–4pm", etc.
 *
 * Component contract is designed for a future WS event —
 * `provider_activity` with the ProviderActivity shape below — but the
 * demo page drives it with a scripted local state so we can evaluate
 * the UX before wiring the backend.
 *
 * UX decisions:
 *   • Max 3 visible rows so the strip stays compact. Older activity
 *     collapses into a "+N more" chip (click to expand — v2).
 *   • Activity rows auto-sort: in-flight (contacting/connected) on
 *     top, then quoted (most recent first), declined drops off.
 *   • Channel badge (📞 / 💬 / 🌐) + subtle pulse when in-flight.
 *   • No speculative time estimates — `connected` only fires when the
 *     backend DETECTS engagement (voice answered / SMS reply / web
 *     acknowledgment). Secondary line says "Response expected soon"
 *     instead of a fake countdown.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';

// ── Types ────────────────────────────────────────────────────────────

export type ProviderActivityStatus =
  /** Just started contacting — voice ringing, SMS sending, web submitting. */
  | 'contacting'
  /** Provider engagement DETECTED by the backend — voice call
   *  answered, SMS reply received, or web form acknowledged. Only
   *  fires on real signal; no speculative "they're probably reading
   *  it" states. */
  | 'connected'
  /** Quote landed. Priceless visibility for the homeowner. */
  | 'quoted'
  /** Provider declined or opted out. Renders briefly then collapses. */
  | 'declined'
  /** Timed out without responding. Hidden from strip. */
  | 'no_response';

export type OutreachChannel = 'voice' | 'sms' | 'web';

export interface ProviderActivity {
  providerId: string;
  name: string;
  company?: string | null;
  channel: OutreachChannel;
  status: ProviderActivityStatus;
  /** Timestamp (epoch ms) when we started contacting this provider.
   *  Not rendered today — kept for future use (e.g., sort stability). */
  startedAt?: number;
  quote?: { priceLabel: string; availability?: string };
  /** Optional seed color — derived from company name in the demo. */
  avatarColor?: string;
}

// ── Public component ────────────────────────────────────────────────

interface Props {
  activity: ProviderActivity[];
  /** How many rows are visible at once. Rest collapse into "+N more". */
  maxVisible?: number;
  /** Fires when the user taps a quote row (for the parent to jump to
   *  the provider card / booking flow). Optional — mockup ignores. */
  onQuoteTap?: (providerId: string) => void;
}

export default function OutreachTransparencyStrip({ activity, maxVisible = 3, onQuoteTap }: Props) {
  // Sort: in-flight items first (connected > contacting — connected is
  // a stronger engagement signal), then quoted (newest), then declined.
  // no_response is filtered out.
  const sorted = useMemo(() => {
    const rank: Record<ProviderActivityStatus, number> = {
      connected: 0,
      contacting: 1,
      quoted: 2,
      declined: 3,
      no_response: 99,
    };
    return activity
      .filter(a => a.status !== 'no_response')
      .slice()
      .sort((a, b) => {
        const r = rank[a.status] - rank[b.status];
        if (r !== 0) return r;
        // Within the same tier, newer-started on top.
        return (b.startedAt ?? 0) - (a.startedAt ?? 0);
      });
  }, [activity]);

  if (sorted.length === 0) return null;

  const visible = sorted.slice(0, maxVisible);
  const hiddenCount = sorted.length - visible.length;

  return (
    <div style={{
      background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: 10, display: 'flex', flexDirection: 'column', gap: 8,
      animation: 'fadeSlide 0.3s ease',
    }}>
      <style>{`
        @keyframes otsShimmer { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
        @keyframes otsPulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.2); opacity: 0.5 } }
        @keyframes otsSlideIn { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      <Header activeCount={activity.filter(a => a.status === 'contacting' || a.status === 'connected').length} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visible.map(a => (
          <ActivityRow key={a.providerId} activity={a} onQuoteTap={onQuoteTap} />
        ))}
      </div>

      {hiddenCount > 0 && (
        <div style={{
          marginTop: 2, padding: '4px 10px', alignSelf: 'flex-start',
          fontSize: 11, color: DIM, fontFamily: "'DM Mono',monospace",
          letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase',
        }}>
          +{hiddenCount} more {hiddenCount === 1 ? 'provider' : 'providers'} in queue
        </div>
      )}
    </div>
  );
}

// ── Internal pieces ──────────────────────────────────────────────────

function Header({ activeCount }: { activeCount: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
      <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: G }} />
        <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: G, opacity: .25, animation: 'otsPulse 1.6s infinite' }} />
      </div>
      <span style={{
        fontSize: 10.5, fontFamily: "'DM Mono',monospace", letterSpacing: 1.3,
        textTransform: 'uppercase', fontWeight: 700, color: DIM,
      }}>
        Live outreach
      </span>
      <span style={{ flex: 1 }} />
      {activeCount > 0 && (
        <span style={{
          fontSize: 11, color: G, fontWeight: 700,
        }}>
          {activeCount} active
        </span>
      )}
    </div>
  );
}

function ActivityRow({ activity, onQuoteTap }: { activity: ProviderActivity; onQuoteTap?: (id: string) => void }) {
  const { copy, accent, inFlight } = describe(activity);
  const initial = displayInitial(activity);
  const avatarBg = activity.avatarColor || stableColorFor(activity.company || activity.name);

  const clickable = activity.status === 'quoted' && !!onQuoteTap;
  const RowTag = clickable ? 'button' : 'div';

  return (
    <RowTag
      onClick={clickable ? () => onQuoteTap!(activity.providerId) : undefined}
      style={{
        all: clickable ? 'unset' : undefined,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 10px',
        borderRadius: 10,
        background: activity.status === 'quoted' ? `${G}10` : '#FAFAFA',
        border: `1px solid ${activity.status === 'quoted' ? `${G}44` : BORDER}`,
        cursor: clickable ? 'pointer' : 'default',
        animation: 'otsSlideIn 0.25s ease',
        transition: 'all 0.15s',
        fontFamily: "'DM Sans',sans-serif",
      } as React.CSSProperties}
      onMouseEnter={clickable ? (e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = G;
        (e.currentTarget as HTMLButtonElement).style.background = `${G}18`;
      } : undefined}
      onMouseLeave={clickable ? (e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = `${G}44`;
        (e.currentTarget as HTMLButtonElement).style.background = `${G}10`;
      } : undefined}
    >
      {/* Avatar */}
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        background: avatarBg, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700,
        boxShadow: inFlight ? `0 0 0 2px ${avatarBg}22` : undefined,
        animation: inFlight ? 'otsShimmer 2s infinite' : undefined,
        position: 'relative',
      }}>
        {initial}
        {inFlight && (
          <span style={{
            position: 'absolute', bottom: -1, right: -1,
            width: 10, height: 10, borderRadius: '50%',
            background: accent, border: '2px solid #fff',
            animation: 'otsPulse 1.4s infinite',
          }} />
        )}
      </div>

      {/* Copy */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: D,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}>
          {copy.primary}
        </div>
        {copy.secondary && (
          <div style={{
            fontSize: 11.5, color: DIM, marginTop: 1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}>
            {copy.secondary}
          </div>
        )}
      </div>

      {/* Channel badge + right-side affordance */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <ChannelBadge channel={activity.channel} inFlight={inFlight} />
        {activity.status === 'quoted' && clickable && (
          <span style={{ color: G, fontSize: 16, fontWeight: 700, marginLeft: 2 }}>→</span>
        )}
      </div>
    </RowTag>
  );
}

function ChannelBadge({ channel, inFlight }: { channel: OutreachChannel; inFlight: boolean }) {
  const config = {
    voice: { icon: '📞', label: 'Call' },
    sms:   { icon: '💬', label: 'Text' },
    web:   { icon: '🌐', label: 'Web' },
  }[channel];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 100,
      background: inFlight ? `${O}14` : '#F5F3F1',
      border: `1px solid ${inFlight ? `${O}33` : BORDER}`,
      fontSize: 10, fontWeight: 700, color: inFlight ? O : DIM,
      fontFamily: "'DM Mono',monospace", letterSpacing: 0.5,
      textTransform: 'uppercase',
    }}>
      <span style={{ fontSize: 11 }}>{config.icon}</span>
      {config.label}
    </span>
  );
}

// ── Copy derivation ──────────────────────────────────────────────────

function describe(a: ProviderActivity): {
  copy: { primary: string; secondary: React.ReactNode | null };
  accent: string;
  inFlight: boolean;
} {
  const company = a.company || a.name;
  const actor = a.company && a.name && a.company !== a.name
    ? `${a.name} at ${a.company}`
    : company;

  switch (a.status) {
    case 'contacting':
      return {
        inFlight: true,
        accent: O,
        copy: {
          primary: a.channel === 'voice'
            ? `Calling ${actor}…`
            : a.channel === 'sms'
              ? `Texting ${actor}…`
              : `Submitting to ${actor}…`,
          secondary: 'Reaching out now',
        },
      };
    case 'connected':
      // Only fires when the backend DETECTS engagement (voice answered,
      // SMS reply, web ack). We never fabricate a time estimate —
      // "Response expected soon" is honest; "expected in ~4 min" is not.
      return {
        inFlight: true,
        accent: G,
        copy: {
          primary: `Connected with ${actor}`,
          secondary: 'Response expected soon',
        },
      };
    case 'quoted':
      return {
        inFlight: false,
        accent: G,
        copy: {
          primary: `Quote from ${company}: ${a.quote?.priceLabel ?? ''}`,
          secondary: a.quote?.availability ?? 'Tap to review',
        },
      };
    case 'declined':
      return {
        inFlight: false,
        accent: DIM,
        copy: {
          primary: `${company} is unavailable`,
          secondary: 'Moving on',
        },
      };
    default:
      return { inFlight: false, accent: DIM, copy: { primary: company, secondary: null } };
  }
}

// ── Utilities ────────────────────────────────────────────────────────

function displayInitial(a: ProviderActivity): string {
  const src = (a.name || a.company || '?').trim();
  return src.charAt(0).toUpperCase();
}

/** Deterministic color per company so the same provider always gets
 *  the same avatar tint. Keeps visual continuity when the same
 *  provider moves from 'contacting' → 'reviewing' → 'quoted'. */
function stableColorFor(seed: string): string {
  const palette = ['#E8632B', '#1B9E77', '#EF9F27', '#8B5CF6', '#EC4899', '#0EA5E9', '#16A34A', '#DC2626'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) & 0xffffffff;
  }
  return palette[Math.abs(hash) % palette.length];
}
