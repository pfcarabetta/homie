import { useEffect, useMemo, useRef, useState } from 'react';
import OutreachTransparencyStrip, {
  type ProviderActivity, type OutreachChannel,
} from '@/components/OutreachTransparencyStrip';
import {
  connectJobSocket, jobService, accountService,
  type CostEstimate, type JobStatusResponse,
} from '@/services/api';
import type { ProviderActivityPayload } from '@homie/shared';

/**
 * InlineOutreachPanel — production version of the mockup from
 * /demo/outreach-transparency. Replaces the right-side "Homie is
 * listening" card once dispatch launches. Header is the spinning
 * Homie H (same avatar the diagnosis-generating card uses), followed
 * by a compact stats row, the OutreachTransparencyStrip (which
 * splits incoming quotes vs. still-in-flight live outreach), and a
 * monospace activity ticker.
 *
 * Data wiring:
 *   • Provider responses come from `jobService.getResponses` as they
 *     arrive, and each one becomes a ProviderActivity with
 *     status 'quoted' fed into the strip.
 *   • Aggregate contacted / responded counts drive the mini-stats
 *     and a synthetic "reaching out to N more" line.
 *   • Activity log is derived from WS status transitions — compact,
 *     human-readable copy.
 *
 * Demo-mode fallback: when `isDemo`, synthesizes a believable
 * outreach timeline from a mock provider fixture so the page behaves
 * end-to-end without a backend.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';

// ── Types ────────────────────────────────────────────────────────────

interface RealProvider {
  id: string;
  responseId: string;
  name: string;
  rating: number;
  reviews: number;
  quote: string;
  availability: string;
  channel: string;
  note: string;
  distance: string;
  googlePlaceId?: string | null;
  phone?: string | null;
}

interface MockProvider {
  id: string;
  name: string;
  rating: number;
  reviews: number;
  quote: string;
  availability: string;
  channel: string;
  note: string;
  distance: string;
  phone: string;
  delay: number;
}

interface LogEntry {
  t: number; // seconds from dispatch
  text: string;
  type: 'contact' | 'connected' | 'quote' | 'decline' | 'system';
}

const MOCK_PROVIDERS: MockProvider[] = [
  { id: 'm1', name: 'Rapid Rooter Plumbing', rating: 4.9, reviews: 214, quote: '$180', availability: 'Today 2–4pm', channel: 'voice', note: "I'll bring a cartridge kit — if it's just the seal we can do it in one visit.", distance: '2.3 mi', phone: '(619) 555-0112', delay: 18000 },
  { id: 'm2', name: 'Blue Star Plumbing', rating: 4.7, reviews: 88, quote: '$210', availability: 'Tomorrow 9–11am', channel: 'sms', note: 'Call me to schedule.', distance: '4.1 mi', phone: '(619) 555-0199', delay: 42000 },
  { id: 'm3', name: 'ABC Plumbing & Drain', rating: 4.6, reviews: 512, quote: '$225', availability: 'Tomorrow 1–3pm', channel: 'web', note: 'Price includes parts + labor.', distance: '6.8 mi', phone: '(619) 555-0144', delay: 68000 },
];

function cleanPrice(price: string): string {
  return price.replace(/\s+/g, ' ').replace(/\$+/g, '$').trim();
}

function channelToBadge(raw: string): OutreachChannel {
  const v = raw.toLowerCase();
  if (v.includes('voice') || v.includes('call') || v.includes('phone')) return 'voice';
  if (v.includes('sms') || v.includes('text')) return 'sms';
  return 'web';
}

function parseDistance(raw: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)/.exec(raw);
  return m ? parseFloat(m[1]) : undefined;
}

// ── Public component ─────────────────────────────────────────────────

interface Props {
  jobId: string | null;
  isDemo: boolean;
  costEstimate: CostEstimate | null;
  onBooked: (providerName: string) => void;
  /** Fires whenever provider_activities changes so the parent can
   *  flip the quote-tab status (dispatching → quotes_ready) and
   *  drive the unread-count badge in the tab bar. */
  onActivitiesChange?: (activities: ProviderActivityPayload[]) => void;
}

export default function InlineOutreachPanel({ jobId, isDemo, costEstimate, onBooked, onActivitiesChange }: Props) {
  const [providers, setProviders] = useState<(MockProvider | RealProvider)[]>([]);
  // Per-provider activities from the backend WS feed. Includes rows
  // for providers in 'contacting' / 'connected' / 'quoted' / 'declined'
  // — we feed these straight into the transparency strip so the LIVE
  // OUTREACH section populates with real names.
  const [activities, setActivities] = useState<ProviderActivityPayload[]>([]);
  const [outreachDone, setOutreachDone] = useState(false);
  const [stats, setStats] = useState({ contacted: 0, responded: 0 });
  const [channels, setChannels] = useState({ voice: 0, sms: 0, web: 0 });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [homeAddress, setHomeAddress] = useState('');
  const [pendingBook, setPendingBook] = useState<RealProvider | MockProvider | null>(null);
  const startedAtRef = useRef<number>(Date.now());

  // Pre-fetch home address so the book flow can submit with a
  // sensible default (user can override in the prompt).
  useEffect(() => {
    if (isDemo) return;
    accountService.getHome().then(res => {
      if (res.data?.address) {
        const parts = [res.data.address, res.data.city, res.data.state].filter(Boolean);
        setHomeAddress(parts.join(', '));
      }
    }).catch(() => {});
  }, [isDemo]);

  // WS wiring for real dispatch — subscribes to aggregate status +
  // refreshes provider responses whenever the count changes.
  useEffect(() => {
    if (!jobId || isDemo) return;
    startedAtRef.current = Date.now();
    pushLog(setLog, 0, 'Dispatch launched', 'system');
    let lastResponded = 0;
    const socket = connectJobSocket(jobId, (status: JobStatusResponse) => {
      setStats({ contacted: status.providers_contacted, responded: status.providers_responded });
      setChannels({
        voice: status.outreach_channels.voice.attempted,
        sms: status.outreach_channels.sms.attempted,
        web: status.outreach_channels.web.attempted,
      });

      // Per-provider activities (contacting / connected / quoted /
      // declined) are now included directly in the WS payload —
      // no second round-trip to /responses needed.
      const incoming = status.provider_activities ?? [];
      setActivities(incoming);
      onActivitiesChange?.(incoming);
      // Also rebuild the `providers` shape the booking flow still
      // expects (legacy callers + the demo mock path).
      const quotedProviders: RealProvider[] = incoming
        .filter(a => a.status === 'quoted' && a.quote)
        .map(a => ({
          id: a.provider_id,
          responseId: a.quote!.response_id,
          name: a.name,
          rating: a.rating ?? 0,
          reviews: a.review_count ?? 0,
          quote: cleanPrice(a.quote!.price_label),
          availability: a.quote!.availability,
          channel: a.channel,
          note: a.quote!.message,
          distance: '',
          googlePlaceId: null,
          phone: a.phone,
        }));
      setProviders(quotedProviders);

      // Append log entries for new aggregate milestones.
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      if (status.providers_responded > lastResponded) {
        pushLog(setLog, elapsed, `Quote ${status.providers_responded} received`, 'quote');
        lastResponded = status.providers_responded;
      }
      if (['completed', 'expired'].includes(status.status)) {
        setOutreachDone(true);
        pushLog(setLog, elapsed, status.providers_responded > 0 ? 'Outreach complete — quotes ready' : 'Outreach complete', 'system');
      }
    });
    return () => socket.close();
  }, [jobId, isDemo]);

  // Demo simulation — scheduled timers synthesize a dispatch.
  useEffect(() => {
    if (!isDemo) return;
    startedAtRef.current = Date.now();
    pushLog(setLog, 0, 'Dispatch launched · demo mode', 'system');
    const contactTimers = MOCK_PROVIDERS.map((p, idx) => setTimeout(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      const verb = p.channel === 'voice' ? 'Calling' : p.channel === 'sms' ? 'SMS to' : 'Web request to';
      pushLog(setLog, elapsed, `${verb} ${p.name}`, 'contact');
      setStats(s => ({ ...s, contacted: s.contacted + 1 }));
      setChannels(c => ({ ...c, [p.channel]: (c as Record<string, number>)[p.channel] + 1 } as typeof c));
      void idx;
    }, idx * 2500));

    const quoteTimers = MOCK_PROVIDERS.map(p => setTimeout(() => {
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setProviders(prev => {
        const next = [...prev, p];
        // Mirror to a synthetic provider_activities list so the
        // parent's tab-status callback still fires for demo users.
        onActivitiesChange?.(next.map(x => ({
          id: x.id, provider_id: x.id, name: x.name,
          rating: x.rating, review_count: x.reviews,
          phone: ('phone' in x && typeof x.phone === 'string') ? x.phone : null,
          channel: x.channel as 'voice' | 'sms' | 'web',
          status: 'quoted' as const,
          responded_at: new Date().toISOString(),
          quote: { response_id: x.id, price_label: x.quote, availability: x.availability, message: x.note },
        })));
        return next;
      });
      setStats(s => ({ ...s, responded: s.responded + 1 }));
      pushLog(setLog, elapsed, `Quote from ${p.name}: ${p.quote}`, 'quote');
    }, p.delay));

    const doneTimer = setTimeout(() => {
      setOutreachDone(true);
      const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
      pushLog(setLog, elapsed, 'Outreach complete — 3 quotes ready', 'system');
    }, 75000);

    return () => {
      contactTimers.forEach(clearTimeout);
      quoteTimers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
  }, [isDemo]);

  // Build ProviderActivity entries for the strip. Real-job flow
  // drives off the backend WS `provider_activities` array (includes
  // live-outreach rows for contacting / connected / declined states).
  // Demo-mode falls back to the scripted `providers` list (quoted
  // only — demo runs with synthesized timers).
  const activity: ProviderActivity[] = useMemo(() => {
    if (isDemo) {
      return providers.map(p => ({
        providerId: ('responseId' in p ? p.responseId : p.id),
        name: p.name,
        company: p.name,
        channel: channelToBadge(p.channel),
        status: 'quoted' as const,
        startedAt: startedAtRef.current,
        quote: {
          priceLabel: p.quote,
          availability: p.availability,
          message: p.note,
        },
        profile: {
          rating: p.rating,
          reviewCount: p.reviews,
          phone: 'phone' in p ? (p.phone ?? undefined) : undefined,
          distanceMiles: parseDistance(p.distance),
        },
      }));
    }
    return activities.map(a => ({
      providerId: a.id,
      name: a.name,
      company: a.name,
      channel: a.channel,
      status: a.status,
      startedAt: a.responded_at
        ? new Date(a.responded_at).getTime()
        : startedAtRef.current,
      ...(a.quote ? {
        quote: {
          priceLabel: cleanPrice(a.quote.price_label),
          availability: a.quote.availability,
          message: a.quote.message,
        },
      } : {}),
      profile: {
        rating: a.rating ?? undefined,
        reviewCount: a.review_count ?? undefined,
        phone: a.phone ?? undefined,
      },
    }));
  }, [isDemo, providers, activities]);

  async function handleBook(providerId: string, address: string) {
    const p = providers.find(x => ('responseId' in x ? x.responseId : x.id) === providerId);
    if (!p) return;
    if (isDemo) {
      onBooked(p.name);
      return;
    }
    // The strip's expanded row collects the service address inline
    // (pre-filled with homeAddress when available) and hands it to
    // us here — no more window.prompt fallback.
    const addr = address.trim();
    if (!addr) return;
    if (!jobId || !('responseId' in p)) return;
    try {
      await jobService.bookProvider(jobId, (p as RealProvider).responseId, (p as RealProvider).id, addr);
      onBooked(p.name);
    } catch (err) {
      console.error('[InlineOutreach] Booking failed:', err);
      window.alert('Booking failed — please try again.');
    }
    setPendingBook(null);
  }
  void pendingBook;

  const pendingLive = Math.max(0, stats.contacted - stats.responded);

  return (
    <div style={{
      background: '#fff', borderRadius: 22, border: `1px solid ${BORDER}`,
      padding: '20px 20px 16px', boxShadow: '0 20px 60px -24px rgba(0,0,0,.12)',
      display: 'flex', flexDirection: 'column', gap: 14,
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <style>{`
        @keyframes iopHomieSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes iopHomieBeat {
          0%, 100% { transform: scale(1); box-shadow: 0 6px 16px -4px ${O}66; }
          50%      { transform: scale(1.06); box-shadow: 0 10px 24px -4px ${O}99; }
        }
      `}</style>

      {/* Header — spinning Homie H + status copy */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <HomieSpinningLogo />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 17, fontWeight: 700, color: D, lineHeight: 1.2 }}>
            {outreachDone && providers.length > 0 ? 'Quotes are in' :
             outreachDone ? 'Outreach complete' :
             'Homie is reaching out'}
          </div>
          <div style={{ fontSize: 12, color: DIM, fontFamily: "'DM Mono',monospace", marginTop: 1 }}>
            {outreachDone ? `${providers.length} quote${providers.length === 1 ? '' : 's'} · tap to book` : 'usually ~2 min'}
          </div>
        </div>
      </div>

      {/* Aggregate stats — 2-col honest counts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MiniStat label="Contacted" value={stats.contacted} color={O} />
        <MiniStat label="Quoted" value={stats.responded} color={G} />
      </div>

      {/* Transparency strip — QUOTES RECEIVED + LIVE OUTREACH sections.
          Real-job activity comes from the backend's provider_activities
          field; demo synthesizes only quoted rows. */}
      {activity.length > 0 && (
        <OutreachTransparencyStrip
          activity={activity}
          onBook={handleBook}
          onCall={() => { /* tel: link handles it */ }}
          defaultBookAddress={homeAddress}
          skipAddressInput={isDemo}
        />
      )}

      {/* Fallback aggregate line — shows if we have aggregate
          contacted counts but no per-provider activity rows yet
          (e.g., an older backend without provider_activities). */}
      {!outreachDone && activity.length === 0 && pendingLive > 0 && (
        <div style={{
          padding: '10px 12px', background: `${G}10`,
          border: `1px solid ${G}33`, borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12.5, color: D,
        }}>
          <LivePulse />
          <span style={{ flex: 1 }}>
            Reaching out to <strong>{pendingLive}</strong> more provider{pendingLive === 1 ? '' : 's'}…
          </span>
          <span style={{ fontSize: 10, color: DIM, fontFamily: "'DM Mono',monospace", letterSpacing: 1, fontWeight: 700, textTransform: 'uppercase' }}>
            via {channels.voice > 0 ? 'call' : channels.sms > 0 ? 'sms' : 'web'}
          </span>
        </div>
      )}

      {/* Activity ticker */}
      <ActivityTicker log={log} />

      {/* Footer */}
      <div style={{
        fontSize: 11.5, color: DIM, textAlign: 'center',
        paddingTop: 4,
      }}>
        {outreachDone
          ? 'Your quotes are saved — bookings available in Account → My Quotes.'
          : "Feel free to close the tab — we'll text you the quotes as they land."}
      </div>
    </div>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────

function HomieSpinningLogo() {
  return (
    <div style={{
      position: 'relative', width: 48, height: 48, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        border: `2.5px solid ${O}22`,
        borderTopColor: O,
        borderRightColor: `${O}88`,
        animation: 'iopHomieSpin 1.4s linear infinite',
      }} />
      <div style={{
        width: 32, height: 32, borderRadius: '50%', background: O,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'iopHomieBeat 1.8s ease-in-out infinite',
      }}>
        <span style={{
          color: '#fff', fontFamily: "'Fraunces',serif",
          fontWeight: 700, fontSize: 16, lineHeight: 1,
        }}>h</span>
      </div>
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

function LivePulse() {
  return (
    <div style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: G }} />
      <span style={{
        position: 'absolute', inset: -3, borderRadius: '50%', background: G,
        opacity: .25, animation: 'iopHomieBeat 1.6s infinite',
      }} />
    </div>
  );
}

function ActivityTicker({ log }: { log: LogEntry[] }) {
  if (log.length === 0) return null;
  const recent = log.slice(-5).reverse();
  return (
    <div style={{
      background: '#1F1B18', borderRadius: 12,
      padding: '10px 12px',
      maxHeight: 140, overflow: 'hidden',
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
    case 'quote':     return '#7ED0B1';
    case 'connected': return '#9FD9BD';
    case 'contact':   return '#F6B76A';
    case 'decline':   return '#9B9490';
    case 'system':    return '#C7C3BE';
    default:          return '#E8E4DF';
  }
}

function formatClock(tSec: number): string {
  const mm = String(Math.floor(tSec / 60)).padStart(2, '0');
  const ss = String(Math.floor(tSec % 60)).padStart(2, '0');
  return `+${mm}:${ss}`;
}

function pushLog(set: React.Dispatch<React.SetStateAction<LogEntry[]>>, t: number, text: string, type: LogEntry['type']) {
  set(prev => [...prev, { t, text, type }]);
}
