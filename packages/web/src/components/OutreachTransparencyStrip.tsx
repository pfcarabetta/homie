import { useMemo, useState } from 'react';

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
  /** Present only when status === 'quoted'. */
  quote?: {
    priceLabel: string;
    availability?: string;
    /** Free-text note from the provider ("I'll bring a cartridge
     *  kit — if it's the seal we can do it in one visit"). */
    message?: string;
  };
  /** Provider profile data surfaced when the row is expanded. Comes
   *  from the original discovery payload — same provider across state
   *  transitions so we don't re-fetch on every render. */
  profile?: ProviderProfile;
  /** Optional seed color — derived from company name in the demo. */
  avatarColor?: string;
}

export interface ProviderProfile {
  rating?: number;
  reviewCount?: number;
  /** E.164 or formatted — rendered verbatim in the Call button label
   *  and used as the tel: link target. */
  phone?: string;
  distanceMiles?: number;
  /** Sample of recent reviews to show in the expanded card. Ideally
   *  3 — oldest/newest trimmed server-side. */
  reviews?: Array<{ author: string; rating: number; text: string; date?: string }>;
}

// ── Public component ────────────────────────────────────────────────

interface Props {
  activity: ProviderActivity[];
  /** How many rows are visible at once. Rest collapse into "+N more". */
  maxVisible?: number;
  /** Fires when the user taps "Book this provider" inside an expanded
   *  quoted row. Receives the response id (same as ProviderActivity.providerId
   *  in the mock; in production this would be the provider_response id). */
  onBook?: (providerId: string) => void;
  /** Fires when the user taps the "Call" button — optional, defaults
   *  to opening the phone's tel: link when a phone number is on the
   *  profile. */
  onCall?: (providerId: string, phone: string | undefined) => void;
}

export default function OutreachTransparencyStrip({ activity, maxVisible = 3, onBook, onCall }: Props) {
  // Single-open expansion — only one quoted row can be expanded at a
  // time so the panel doesn't balloon vertically.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Split into two groups so the rendered strip has clear section
  // breaks: QUOTES (actionable outcomes) rendered above LIVE OUTREACH
  // (still-in-flight state). Within each group, newer items float to
  // the top so the latest event is always visible.
  const { quotes, live } = useMemo(() => {
    const withStarted = (a: ProviderActivity) => a.startedAt ?? 0;
    const liveRank: Record<ProviderActivityStatus, number> = {
      connected: 0,
      contacting: 1,
      quoted: 99,      // filtered out of live group
      declined: 2,
      no_response: 99, // filtered out entirely
    };
    const quoted: ProviderActivity[] = [];
    const liveOut: ProviderActivity[] = [];
    for (const a of activity) {
      if (a.status === 'quoted') quoted.push(a);
      else if (a.status !== 'no_response') liveOut.push(a);
    }
    quoted.sort((a, b) => withStarted(b) - withStarted(a));
    liveOut.sort((a, b) => {
      const r = liveRank[a.status] - liveRank[b.status];
      if (r !== 0) return r;
      return withStarted(b) - withStarted(a);
    });
    return { quotes: quoted, live: liveOut };
  }, [activity]);

  if (quotes.length === 0 && live.length === 0) return null;

  // Quotes section is unbounded (they're the actionable payoff — show
  // them all). Live section capped at maxVisible; overflow collapses
  // into a "+N more" chip below.
  const liveVisible = live.slice(0, maxVisible);
  const liveHidden = live.length - liveVisible.length;
  const activeCount = activity.filter(a => a.status === 'contacting' || a.status === 'connected').length;

  return (
    <div style={{
      background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 14,
      padding: 10, display: 'flex', flexDirection: 'column', gap: 14,
      animation: 'fadeSlide 0.3s ease',
    }}>
      <style>{`
        @keyframes otsShimmer { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
        @keyframes otsPulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.2); opacity: 0.5 } }
        @keyframes otsSlideIn { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }
      `}</style>

      {/* QUOTES section — actionable, rendered first so the user sees
          the outcome above the process. Hidden when no quotes yet. */}
      {quotes.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SectionHeader
            icon={<QuoteDot />}
            label="Quotes received"
            count={quotes.length}
            countLabel="ready to book"
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {quotes.map(a => (
              <ActivityRow
                key={a.providerId}
                activity={a}
                expanded={expandedId === a.providerId}
                onToggle={() => setExpandedId(id => id === a.providerId ? null : a.providerId)}
                onBook={onBook}
                onCall={onCall}
              />
            ))}
          </div>
        </section>
      )}

      {/* LIVE OUTREACH section — everything that's still in flight or
          recently declined. Hidden once every provider has either
          quoted or dropped off. */}
      {live.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SectionHeader
            icon={<LivePulseDot />}
            label="Live outreach"
            count={activeCount}
            countLabel={activeCount === 1 ? 'active' : 'active'}
            showCountWhenZero={false}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {liveVisible.map(a => (
              <ActivityRow
                key={a.providerId}
                activity={a}
                expanded={false}
                onToggle={() => {}}
                onBook={onBook}
                onCall={onCall}
              />
            ))}
          </div>
          {liveHidden > 0 && (
            <div style={{
              padding: '4px 4px', alignSelf: 'flex-start',
              fontSize: 10.5, color: DIM, fontFamily: "'DM Mono',monospace",
              letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase',
            }}>
              +{liveHidden} more {liveHidden === 1 ? 'provider' : 'providers'} in queue
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── Internal pieces ──────────────────────────────────────────────────

/** Generic section header. Accepts a slotted icon so each section can
 *  brand itself (pulsing green dot for Live, solid check for Quotes)
 *  while keeping the typographic rhythm identical across sections. */
function SectionHeader({
  icon, label, count, countLabel, showCountWhenZero = true,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  countLabel: string;
  showCountWhenZero?: boolean;
}) {
  const showCount = count > 0 || showCountWhenZero;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
      {icon}
      <span style={{
        fontSize: 10.5, fontFamily: "'DM Mono',monospace", letterSpacing: 1.3,
        textTransform: 'uppercase', fontWeight: 700, color: DIM,
      }}>
        {label}
      </span>
      <span style={{ flex: 1 }} />
      {showCount && (
        <span style={{ fontSize: 11, color: G, fontWeight: 700 }}>
          {count} {countLabel}
        </span>
      )}
    </div>
  );
}

function LivePulseDot() {
  return (
    <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: G }} />
      <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: G, opacity: .25, animation: 'otsPulse 1.6s infinite' }} />
    </div>
  );
}

function QuoteDot() {
  // Solid check in a tinted green pill — signals "landed / stable"
  // rather than "in flight".
  return (
    <div style={{
      width: 14, height: 14, borderRadius: 3, background: G,
      color: '#fff', fontSize: 9, fontWeight: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>✓</div>
  );
}

function ActivityRow({
  activity, expanded, onToggle, onBook, onCall,
}: {
  activity: ProviderActivity;
  expanded: boolean;
  onToggle: () => void;
  onBook?: (id: string) => void;
  onCall?: (id: string, phone: string | undefined) => void;
}) {
  const { copy, accent, inFlight } = describe(activity);
  const initial = displayInitial(activity);
  const avatarBg = activity.avatarColor || stableColorFor(activity.company || activity.name);

  const expandable = activity.status === 'quoted';

  return (
    <div style={{
      borderRadius: 10,
      background: activity.status === 'quoted' ? `${G}10` : '#FAFAFA',
      border: `1px solid ${activity.status === 'quoted' ? `${G}44` : BORDER}`,
      animation: 'otsSlideIn 0.25s ease',
      transition: 'background 0.15s, border-color 0.15s',
      overflow: 'hidden',
    }}>
      {/* Summary row — always visible. Clickable when there's a quote
          to expand; inert otherwise. */}
      <button
        onClick={expandable ? onToggle : undefined}
        disabled={!expandable}
        style={{
          all: 'unset',
          width: '100%', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px',
          cursor: expandable ? 'pointer' : 'default',
          fontFamily: "'DM Sans',sans-serif",
        }}
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
        <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
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

        {/* Channel badge + expand chevron (quoted rows only) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <ChannelBadge channel={activity.channel} inFlight={inFlight} />
          {expandable && (
            <span style={{
              color: G, fontSize: 14, fontWeight: 700, marginLeft: 2,
              transition: 'transform 0.2s',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              width: 18, textAlign: 'center',
            }}>▾</span>
          )}
        </div>
      </button>

      {/* Expanded detail — only renders when the row is open. Takes
          advantage of the right panel's vertical space: full quote
          message, rating, reviews, action buttons. */}
      {expandable && expanded && (
        <ExpandedQuoteDetail
          activity={activity}
          onBook={onBook}
          onCall={onCall}
        />
      )}
    </div>
  );
}

function ExpandedQuoteDetail({
  activity, onBook, onCall,
}: {
  activity: ProviderActivity;
  onBook?: (id: string) => void;
  onCall?: (id: string, phone: string | undefined) => void;
}) {
  const company = activity.company || activity.name;
  const { rating, reviewCount, phone, distanceMiles, reviews } = activity.profile ?? {};
  const price = activity.quote?.priceLabel ?? '';
  const availability = activity.quote?.availability;
  const message = activity.quote?.message;

  return (
    <div style={{
      padding: '12px 14px 14px',
      borderTop: `1px solid ${G}33`,
      background: '#fff',
      animation: 'otsSlideIn 0.25s ease',
      fontFamily: "'DM Sans',sans-serif",
    }}>
      {/* Header block — company + rating + price breakdown */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: D,
            lineHeight: 1.25,
          }}>
            {company}
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4,
            fontSize: 12, color: DIM, alignItems: 'center',
          }}>
            {rating != null && <StarRating rating={rating} reviewCount={reviewCount} />}
            {distanceMiles != null && (
              <>
                <Dot />
                <span>{distanceMiles.toFixed(1)} mi away</span>
              </>
            )}
          </div>
        </div>

        {/* Price cluster on the right */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: G,
            lineHeight: 1,
          }}>{price}</div>
          {availability && (
            <div style={{ fontSize: 11, color: DIM, marginTop: 4, maxWidth: 150 }}>
              {availability}
            </div>
          )}
        </div>
      </div>

      {/* Provider's quote note */}
      {message && (
        <div style={{
          padding: '10px 12px', background: `${G}08`, borderLeft: `3px solid ${G}`,
          borderRadius: 6, marginBottom: 12,
          fontSize: 12.5, color: D, lineHeight: 1.5, fontStyle: 'italic',
        }}>
          "{message}"
        </div>
      )}

      {/* Reviews */}
      {reviews && reviews.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, fontFamily: "'DM Mono',monospace", letterSpacing: 1.2,
            textTransform: 'uppercase', fontWeight: 700, color: DIM, marginBottom: 6,
          }}>
            Recent reviews
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reviews.slice(0, 3).map((r, i) => (
              <ReviewRow key={i} review={r} />
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <CallButton phone={phone} onCall={() => onCall?.(activity.providerId, phone)} />
        <button
          onClick={() => onBook?.(activity.providerId)}
          style={primaryBtnStyle}
          onMouseEnter={e => (e.currentTarget.style.background = '#17876A')}
          onMouseLeave={e => (e.currentTarget.style.background = G)}
        >
          Book this provider →
        </button>
      </div>
    </div>
  );
}

function CallButton({ phone, onCall }: { phone: string | undefined; onCall: () => void }) {
  // When a phone number is present, render as an anchor so mobile
  // "tap to call" just works. Desktop still honors the click for the
  // parent's analytics hook.
  if (phone) {
    return (
      <a
        href={`tel:${phone.replace(/[^\d+]/g, '')}`}
        onClick={onCall}
        style={{ ...secondaryBtnStyle, textAlign: 'center' }}
      >
        📞 Call {phone}
      </a>
    );
  }
  return (
    <button onClick={onCall} style={secondaryBtnStyle} disabled>
      📞 Call
    </button>
  );
}

function StarRating({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ color: '#F5A623' }}>
        {'★'.repeat(full)}{half ? '☆' : ''}{'☆'.repeat(5 - full - (half ? 1 : 0))}
      </span>
      <span style={{ color: D, fontWeight: 700 }}>{rating.toFixed(1)}</span>
      {reviewCount != null && (
        <span style={{ color: DIM }}>({reviewCount.toLocaleString()})</span>
      )}
    </span>
  );
}

function ReviewRow({ review }: { review: { author: string; rating: number; text: string; date?: string } }) {
  return (
    <div style={{
      padding: '8px 10px', background: '#FAFAFA', borderRadius: 8,
      border: `1px solid ${BORDER}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ color: '#F5A623', fontSize: 11 }}>{'★'.repeat(Math.round(review.rating))}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: D }}>{review.author}</span>
        {review.date && (
          <>
            <Dot />
            <span style={{ fontSize: 10.5, color: DIM }}>{review.date}</span>
          </>
        )}
      </div>
      <div style={{
        fontSize: 12, color: D, lineHeight: 1.5,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {review.text}
      </div>
    </div>
  );
}

function Dot() {
  return <span style={{ color: DIM, opacity: 0.4 }}>·</span>;
}

const primaryBtnStyle: React.CSSProperties = {
  flex: 1, padding: '10px 14px', background: G, color: '#fff',
  border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700,
  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
  transition: 'background 0.15s',
};

const secondaryBtnStyle: React.CSSProperties = {
  flex: 1, padding: '10px 14px', background: '#fff', color: D,
  border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 13, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
  textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
  justifyContent: 'center', gap: 4,
};

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
