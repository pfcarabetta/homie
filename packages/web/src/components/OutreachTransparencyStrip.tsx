import { useMemo, useState } from 'react';
import EstimateBadge from '@/components/EstimateBadge';
import type { CostEstimate } from '@/services/api';
import {
  OutreachThemeContext, useOutreachColors, outreachColors, type OutreachTheme,
} from '@/components/outreach-theme';

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

// Module-level consumer-theme fallbacks — preserved so the call sites
// that don't need theming (demo page, static styles) keep working. All
// in-component uses are theme-aware via useOutreachColors().
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
   *  quoted row. Receives the provider id + the service address the
   *  user typed (pre-filled with `defaultBookAddress` if provided). */
  onBook?: (providerId: string, address: string) => void;
  /** Fires when the user taps the "Call" button — optional, defaults
   *  to opening the phone's tel: link when a phone number is on the
   *  profile. */
  onCall?: (providerId: string, phone: string | undefined) => void;
  /** Pre-populate the service-address input shown in the expanded row.
   *  Typically the homeowner's primary address from Home IQ. */
  defaultBookAddress?: string;
  /** When true, the inline address input is suppressed and the Book
   *  button fires with an empty address (e.g., demo mode). */
  skipAddressInput?: boolean;
  /** AI cost estimate for the job — used to render the EstimateBadge
   *  next to each provider's quote so the user sees "below estimate"
   *  / "above estimate" context inline. Matches Account → My Quotes. */
  costEstimate?: CostEstimate | null;
  /** Visual theme. 'consumer' (default) uses fixed hex; 'business'
   *  uses CSS vars so BusinessPortal's dark-mode toggle flows through.
   *  Threaded down to every sub-component via OutreachThemeContext. */
  theme?: OutreachTheme;
  /** ProviderId (== expanded row's providerId) whose book button is
   *  mid-flight. The row's button flips to a disabled "Booking…"
   *  state so the PM can't double-fire the request. */
  bookingProviderId?: string | null;
  /** ProviderId of a row that's been successfully booked. Flips that
   *  row's button into a static "✓ Booked" so the PM sees the
   *  outcome inline instead of the page state silently changing
   *  underneath them. */
  bookedProviderId?: string | null;
}

export default function OutreachTransparencyStrip({
  activity, maxVisible = 3, onBook, onCall, defaultBookAddress, skipAddressInput, costEstimate,
  theme = 'consumer', bookingProviderId = null, bookedProviderId = null,
}: Props) {
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

  // Resolve theme once so root div styles use the right tokens. All
  // sub-components read the same theme via context below.
  const c = outreachColors(theme);

  // Quotes section is unbounded (they're the actionable payoff — show
  // them all). Live section capped at maxVisible; overflow collapses
  // into a "+N more" chip below.
  const liveVisible = live.slice(0, maxVisible);
  const liveHidden = live.length - liveVisible.length;
  const activeCount = activity.filter(a => a.status === 'contacting' || a.status === 'connected').length;

  return (
    <OutreachThemeContext.Provider value={theme}>
    <div style={{
      background: c.CARD, border: `1px solid ${c.BORDER}`, borderRadius: 14,
      padding: 10, display: 'flex', flexDirection: 'column', gap: 14,
      animation: 'fadeSlide 0.3s ease',
    }}>
      <style>{`
        @keyframes otsShimmer { 0%,100% { opacity: 1 } 50% { opacity: 0.45 } }
        @keyframes otsPulse { 0%,100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.2); opacity: 0.5 } }
        @keyframes otsSlideIn { from { opacity: 0; transform: translateY(-4px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes otsSpin { to { transform: rotate(360deg) } }
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
                defaultBookAddress={defaultBookAddress}
                skipAddressInput={skipAddressInput}
                costEstimate={costEstimate}
                isBooking={bookingProviderId === a.providerId}
                isBooked={bookedProviderId === a.providerId}
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
                defaultBookAddress={defaultBookAddress}
                skipAddressInput={skipAddressInput}
                costEstimate={costEstimate}
              />
            ))}
          </div>
          {liveHidden > 0 && (
            <div style={{
              padding: '4px 4px', alignSelf: 'flex-start',
              fontSize: 10.5, color: c.DIM, fontFamily: "'DM Mono',monospace",
              letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase',
            }}>
              +{liveHidden} more {liveHidden === 1 ? 'provider' : 'providers'} in queue
            </div>
          )}
        </section>
      )}
    </div>
    </OutreachThemeContext.Provider>
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
  const c = useOutreachColors();
  const showCount = count > 0 || showCountWhenZero;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
      {icon}
      <span style={{
        fontSize: 10.5, fontFamily: "'DM Mono',monospace", letterSpacing: 1.3,
        textTransform: 'uppercase', fontWeight: 700, color: c.DIM,
      }}>
        {label}
      </span>
      <span style={{ flex: 1 }} />
      {showCount && (
        <span style={{ fontSize: 11, color: c.G, fontWeight: 700 }}>
          {count} {countLabel}
        </span>
      )}
    </div>
  );
}

function LivePulseDot() {
  const c = useOutreachColors();
  return (
    <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: c.G }} />
      <span style={{ position: 'absolute', inset: -3, borderRadius: '50%', background: c.G, opacity: .25, animation: 'otsPulse 1.6s infinite' }} />
    </div>
  );
}

function QuoteDot() {
  const c = useOutreachColors();
  // Solid check in a tinted green pill — signals "landed / stable"
  // rather than "in flight".
  return (
    <div style={{
      width: 14, height: 14, borderRadius: 3, background: c.G,
      color: '#fff', fontSize: 9, fontWeight: 900,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>✓</div>
  );
}

function ActivityRow({
  activity, expanded, onToggle, onBook, onCall, defaultBookAddress, skipAddressInput, costEstimate,
  isBooking = false, isBooked = false,
}: {
  activity: ProviderActivity;
  expanded: boolean;
  onToggle: () => void;
  onBook?: (id: string, address: string) => void;
  onCall?: (id: string, phone: string | undefined) => void;
  defaultBookAddress?: string;
  skipAddressInput?: boolean;
  costEstimate?: CostEstimate | null;
  isBooking?: boolean;
  isBooked?: boolean;
}) {
  const c = useOutreachColors();
  const { copy, accent, inFlight } = describe(activity);
  const initial = displayInitial(activity);
  const avatarBg = activity.avatarColor || stableColorFor(activity.company || activity.name);

  const expandable = activity.status === 'quoted';

  return (
    <div style={{
      borderRadius: 10,
      background: activity.status === 'quoted' ? `${c.G}10` : c.W,
      border: `1px solid ${activity.status === 'quoted' ? `${c.G}44` : c.BORDER}`,
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
            fontSize: 13, fontWeight: 600, color: c.D,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}>
            {copy.primary}
          </div>
          {copy.secondary && (
            <div style={{
              fontSize: 11.5, color: c.DIM, marginTop: 1,
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
              color: c.G, fontSize: 14, fontWeight: 700, marginLeft: 2,
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
          defaultBookAddress={defaultBookAddress}
          skipAddressInput={skipAddressInput}
          costEstimate={costEstimate}
          isBooking={isBooking}
          isBooked={isBooked}
        />
      )}
    </div>
  );
}

function ExpandedQuoteDetail({
  activity, onBook, onCall, defaultBookAddress, skipAddressInput, costEstimate,
  isBooking = false, isBooked = false,
}: {
  activity: ProviderActivity;
  onBook?: (id: string, address: string) => void;
  onCall?: (id: string, phone: string | undefined) => void;
  defaultBookAddress?: string;
  skipAddressInput?: boolean;
  costEstimate?: CostEstimate | null;
  isBooking?: boolean;
  isBooked?: boolean;
}) {
  const c = useOutreachColors();
  const company = activity.company || activity.name;
  const { rating, reviewCount, phone, distanceMiles, reviews } = activity.profile ?? {};
  const price = activity.quote?.priceLabel ?? '';
  const availability = activity.quote?.availability;
  const message = activity.quote?.message;

  // Inline service-address input — pre-filled with the homeowner's
  // primary address. Replaces the ugly window.prompt() fallback.
  const [address, setAddress] = useState<string>(defaultBookAddress ?? '');
  const [addressError, setAddressError] = useState(false);
  const disabled = isBooking || isBooked;

  function handleBookClick() {
    // Belt & suspenders guard — parent also ignores re-entries, but
    // blocking the click before it fires keeps the UX honest (no
    // visible "pressed" state that then does nothing).
    if (disabled) return;
    if (skipAddressInput) {
      onBook?.(activity.providerId, '');
      return;
    }
    const trimmed = address.trim();
    if (!trimmed) {
      setAddressError(true);
      return;
    }
    setAddressError(false);
    onBook?.(activity.providerId, trimmed);
  }

  return (
    <div style={{
      padding: '12px 14px 14px',
      borderTop: `1px solid ${c.G}33`,
      background: c.CARD,
      animation: 'otsSlideIn 0.25s ease',
      fontFamily: "'DM Sans',sans-serif",
    }}>
      {/* Header block — company + rating + price breakdown */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: "'Fraunces',serif", fontSize: 15, fontWeight: 700, color: c.D,
            lineHeight: 1.25,
          }}>
            {company}
          </div>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4,
            fontSize: 12, color: c.DIM, alignItems: 'center',
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

        {/* Price cluster on the right — big $ + AI estimate badge
            (matches the Account > My Quotes treatment) + availability. */}
        <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <div style={{
            fontFamily: "'Fraunces',serif", fontSize: 22, fontWeight: 700, color: c.G,
            lineHeight: 1,
          }}>{price}</div>
          {costEstimate && price && (
            <EstimateBadge
              quotedPrice={price}
              estimateLow={costEstimate.estimateLowCents}
              estimateHigh={costEstimate.estimateHighCents}
            />
          )}
          {availability && (
            <div style={{ fontSize: 11, color: c.DIM, maxWidth: 150 }}>
              {availability}
            </div>
          )}
        </div>
      </div>

      {/* Provider's quote note */}
      {message && (
        <div style={{
          padding: '10px 12px', background: `${c.G}08`, borderLeft: `3px solid ${c.G}`,
          borderRadius: 6, marginBottom: 12,
          fontSize: 12.5, color: c.D, lineHeight: 1.5, fontStyle: 'italic',
        }}>
          "{message}"
        </div>
      )}

      {/* Reviews */}
      {reviews && reviews.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: 10, fontFamily: "'DM Mono',monospace", letterSpacing: 1.2,
            textTransform: 'uppercase', fontWeight: 700, color: c.DIM, marginBottom: 6,
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

      {/* Service address input — required for the book call. Defaults
          to the homeowner's primary address from Home IQ when
          available so they rarely have to type it. Skipped entirely
          for demo-mode flows. */}
      {!skipAddressInput && (
        <div style={{ marginBottom: 10 }}>
          <label style={{
            display: 'block', fontSize: 10, fontFamily: "'DM Mono',monospace",
            letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700,
            color: c.DIM, marginBottom: 4,
          }}>
            Service address
          </label>
          <input
            type="text"
            value={address}
            onChange={(e) => { setAddress(e.target.value); if (addressError) setAddressError(false); }}
            placeholder="123 Main St, San Diego, CA"
            style={{
              width: '100%', padding: '9px 12px',
              fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              border: `1.5px solid ${addressError ? '#DC2626' : c.BORDER}`,
              borderRadius: 8, outline: 'none', color: c.D,
              background: c.CARD,
              boxSizing: 'border-box', transition: 'border-color 0.15s',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = c.G; }}
            onBlur={(e) => { if (!addressError) e.currentTarget.style.borderColor = c.BORDER; }}
          />
          {addressError && (
            <div style={{ fontSize: 11, color: '#DC2626', marginTop: 4 }}>
              Enter the service address so the pro knows where to go.
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <CallButton phone={phone} onCall={() => onCall?.(activity.providerId, phone)} />
        <button
          onClick={handleBookClick}
          disabled={disabled}
          style={{
            flex: 1, padding: '10px 14px',
            background: isBooked ? '#17876A' : c.G, color: '#fff',
            border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700,
            cursor: disabled ? 'default' : 'pointer', fontFamily: "'DM Sans',sans-serif",
            opacity: isBooking ? 0.85 : 1,
            transition: 'background 0.15s, opacity 0.15s',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
          onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#17876A'; }}
          onMouseLeave={e => { if (!disabled && !isBooked) e.currentTarget.style.background = c.G; }}
        >
          {isBooked
            ? '✓ Booked'
            : isBooking
              ? <><BookingSpinner />Booking…</>
              : 'Book this provider →'}
        </button>
      </div>
    </div>
  );
}

/** 14px ring spinner shown inside the Book button while the booking
 *  endpoint is in flight. Kept as an inline SVG so it ships in the
 *  same bundle chunk as the button without pulling in a new dep. */
function BookingSpinner() {
  return (
    <svg width={13} height={13} viewBox="0 0 16 16" style={{ animation: 'otsSpin 0.7s linear infinite' }}>
      <circle cx="8" cy="8" r="6" stroke="rgba(255,255,255,0.35)" strokeWidth="2" fill="none" />
      <path d="M8 2 A 6 6 0 0 1 14 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function CallButton({ phone, onCall }: { phone: string | undefined; onCall: () => void }) {
  const c = useOutreachColors();
  const secondaryStyle: React.CSSProperties = {
    flex: 1, padding: '10px 14px', background: c.CARD, color: c.D,
    border: `1px solid ${c.BORDER}`, borderRadius: 10, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
    textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', gap: 4,
  };
  // When a phone number is present, render as an anchor so mobile
  // "tap to call" just works. Desktop still honors the click for the
  // parent's analytics hook.
  if (phone) {
    return (
      <a
        href={`tel:${phone.replace(/[^\d+]/g, '')}`}
        onClick={onCall}
        style={{ ...secondaryStyle, textAlign: 'center' }}
      >
        📞 Call {phone}
      </a>
    );
  }
  return (
    <button onClick={onCall} style={secondaryStyle} disabled>
      📞 Call
    </button>
  );
}

function StarRating({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
  const c = useOutreachColors();
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ color: '#F5A623' }}>
        {'★'.repeat(full)}{half ? '☆' : ''}{'☆'.repeat(5 - full - (half ? 1 : 0))}
      </span>
      <span style={{ color: c.D, fontWeight: 700 }}>{rating.toFixed(1)}</span>
      {reviewCount != null && (
        <span style={{ color: c.DIM }}>({reviewCount.toLocaleString()})</span>
      )}
    </span>
  );
}

function ReviewRow({ review }: { review: { author: string; rating: number; text: string; date?: string } }) {
  const c = useOutreachColors();
  return (
    <div style={{
      padding: '8px 10px', background: c.W, borderRadius: 8,
      border: `1px solid ${c.BORDER}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        <span style={{ color: '#F5A623', fontSize: 11 }}>{'★'.repeat(Math.round(review.rating))}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: c.D }}>{review.author}</span>
        {review.date && (
          <>
            <Dot />
            <span style={{ fontSize: 10.5, color: c.DIM }}>{review.date}</span>
          </>
        )}
      </div>
      <div style={{
        fontSize: 12, color: c.D, lineHeight: 1.5,
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {review.text}
      </div>
    </div>
  );
}

function Dot() {
  const c = useOutreachColors();
  return <span style={{ color: c.DIM, opacity: 0.4 }}>·</span>;
}

function ChannelBadge({ channel, inFlight }: { channel: OutreachChannel; inFlight: boolean }) {
  const c = useOutreachColors();
  const config = {
    voice: { icon: '📞', label: 'Call' },
    sms:   { icon: '💬', label: 'Text' },
    web:   { icon: '🌐', label: 'Web' },
  }[channel];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 8px', borderRadius: 100,
      background: inFlight ? `${c.O}14` : c.W,
      border: `1px solid ${inFlight ? `${c.O}33` : c.BORDER}`,
      fontSize: 10, fontWeight: 700, color: inFlight ? c.O : c.DIM,
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
