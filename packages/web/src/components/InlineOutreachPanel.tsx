import { useEffect, useRef, useState } from 'react';
import HomieOutreachLive, { type OutreachStatus, type LogEntry } from '@/components/HomieOutreachLive';
import EstimateCard from '@/components/EstimateCard';
import EstimateBadge from '@/components/EstimateBadge';
import {
  connectJobSocket, jobService, accountService,
  type CostEstimate, type JobStatusResponse, type ProviderResponseItem,
} from '@/services/api';

/**
 * InlineOutreachPanel — renders the live dispatch view in the right
 * split of /quote instead of inside QuoteOutreachModal. Once the user
 * confirms tier + zip + timing (still handled by the modal), the modal
 * fires `onOutreachStart(jobId)` to the parent and closes itself; the
 * parent then mounts this panel where the "Homie is listening" card
 * used to sit. Diagnosis + estimate stay visible on the left; live
 * outreach + provider quotes surface on the right.
 *
 * State + WS + mock-demo logic is lifted wholesale from the modal's
 * old outreach step — same contract, same side-effects, just a
 * different container.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';

// ── Types + fixtures (duplicated from GetQuotes so this component
//    is self-contained). Shapes match the originals 1:1. ───────────

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
}

interface MockProvider {
  name: string;
  rating: number;
  reviews: number;
  quote: string;
  availability: string;
  channel: string;
  note: string;
  distance: string;
  delay: number;
}

const MOCK_PROVIDERS: MockProvider[] = [
  { name: 'Rapid Rooter Plumbing', rating: 4.9, reviews: 214, quote: '$180', availability: 'Today 2–4pm', channel: 'voice', note: "I'll bring a cartridge kit.", distance: '2.3 mi', delay: 8000 },
  { name: 'Blue Star Plumbing', rating: 4.7, reviews: 88, quote: '$210', availability: 'Tomorrow 9–11am', channel: 'sms', note: 'Call me to schedule.', distance: '4.1 mi', delay: 22000 },
  { name: 'ABC Plumbing & Drain', rating: 4.6, reviews: 512, quote: '$225', availability: 'Tomorrow 1–3pm', channel: 'web', note: 'Price includes parts + labor.', distance: '6.8 mi', delay: 48000 },
];

const OUTREACH_LOG = [
  { t: 0, msg: 'Launching AI agent...', type: 'system' as const },
  { t: 2000, msg: 'Calling Rapid Rooter Plumbing', type: 'voice' as const },
  { t: 6000, msg: 'SMS sent to Blue Star Plumbing', type: 'sms' as const },
  { t: 10000, msg: 'Submitting to ABC Plumbing & Drain', type: 'web' as const },
  { t: 12000, msg: 'Rapid Rooter answered', type: 'success' as const },
  { t: 22000, msg: 'Blue Star replied', type: 'success' as const },
  { t: 48000, msg: 'ABC Plumbing responded', type: 'success' as const },
  { t: 52000, msg: 'Outreach complete', type: 'done' as const },
];

/** Trim whitespace + collapse duplicate $ signs a provider might put
 *  in their quote field. Kept local so this component doesn't reach
 *  back into GetQuotes for one helper. */
function cleanPrice(price: string): string {
  return price.replace(/\s+/g, ' ').replace(/\$+/g, '$').trim();
}

// ── Component ─────────────────────────────────────────────────────────

interface Props {
  jobId: string | null;
  isDemo: boolean;
  costEstimate: CostEstimate | null;
  onBooked: (providerName: string) => void;
}

export default function InlineOutreachPanel({ jobId, isDemo, costEstimate, onBooked }: Props) {
  const [log, setLog] = useState<typeof OUTREACH_LOG>([]);
  const [providers, setProviders] = useState<(MockProvider | RealProvider)[]>([]);
  const [outreachDone, setOutreachDone] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [booked, setBooked] = useState<MockProvider | null>(null);
  const [stats, setStats] = useState({ contacted: 0, responded: 0 });
  const [channels, setChannels] = useState({ voice: 0, sms: 0, web: 0 });
  const [homeAddress, setHomeAddress] = useState('');

  const fetchedResponses = useRef(0);

  useEffect(() => {
    if (isDemo) return;
    accountService.getHome().then(res => {
      if (res.data?.address) {
        const parts = [res.data.address, res.data.city, res.data.state].filter(Boolean);
        setHomeAddress(parts.join(', '));
      }
    }).catch(() => {});
  }, [isDemo]);

  // Reset the response-fetch dedupe when the job changes (mainly for
  // multi-session hot-swap scenarios).
  useEffect(() => { fetchedResponses.current = 0; }, [jobId]);

  // Main outreach effect — real WS subscription or mock demo simulation.
  useEffect(() => {
    if (jobId && !isDemo) {
      setLog([{ t: 0, msg: 'Launching AI agent...', type: 'system' }]);

      const socket = connectJobSocket(jobId, (status: JobStatusResponse) => {
        setStats({ contacted: status.providers_contacted, responded: status.providers_responded });
        setChannels({
          voice: status.outreach_channels.voice.attempted,
          sms: status.outreach_channels.sms.attempted,
          web: status.outreach_channels.web.attempted,
        });

        const newLog: typeof OUTREACH_LOG = [{ t: 0, msg: `Contacting ${status.providers_contacted} providers...`, type: 'system' }];
        if (status.outreach_channels.voice.attempted > 0) newLog.push({ t: 1, msg: `${status.outreach_channels.voice.attempted} voice calls`, type: 'voice' });
        if (status.outreach_channels.sms.attempted > 0) newLog.push({ t: 2, msg: `${status.outreach_channels.sms.attempted} SMS messages`, type: 'sms' });
        if (status.outreach_channels.web.attempted > 0) newLog.push({ t: 3, msg: `${status.outreach_channels.web.attempted} web contacts`, type: 'web' });
        if (status.providers_responded > 0) newLog.push({ t: 4, msg: `${status.providers_responded} quote(s) received!`, type: 'success' });
        if (['completed', 'expired'].includes(status.status)) {
          newLog.push({ t: 5, msg: status.providers_responded > 0 ? `${status.providers_responded} quotes ready!` : 'Outreach complete', type: 'done' });
          setOutreachDone(true);
        }
        setLog(newLog);

        // Refresh provider responses whenever the count changes.
        if (status.providers_responded > 0) {
          void jobService.getResponses(jobId).then(res => {
            if (res.data?.responses) {
              setProviders(res.data.responses.map((r: ProviderResponseItem) => ({
                id: r.provider.id,
                responseId: r.id,
                name: r.provider.name,
                rating: parseFloat(r.provider.google_rating ?? '0'),
                reviews: r.provider.review_count,
                quote: cleanPrice(r.quoted_price ?? 'TBD'),
                availability: r.availability ?? 'To be confirmed',
                channel: r.channel,
                note: r.message ?? '',
                distance: '',
                googlePlaceId: r.provider.google_place_id,
              })));
            }
          });
        }
      });

      return () => socket.close();
    }

    // Non-demo without a jobId — rare (shouldn't happen once the
    // parent resolves the job), but guard against a crash.
    if (!isDemo) {
      setLog([{ t: 0, msg: 'Setting up your search...', type: 'system' }]);
      return;
    }

    // Mock demo — scheduled timers synthesize a plausible outreach.
    const timers = OUTREACH_LOG.map((e) => setTimeout(() => {
      setLog(p => [...p, e]);
      if (['voice', 'sms', 'web'].includes(e.type)) setStats(s => ({ ...s, contacted: s.contacted + 1 }));
      if (e.type === 'success') setStats(s => ({ ...s, responded: s.responded + 1 }));
      if (e.type === 'done') setOutreachDone(true);
    }, e.t));
    const pt = MOCK_PROVIDERS.map(p => setTimeout(() => setProviders(prev => [...prev, p]), p.delay));
    return () => { timers.forEach(clearTimeout); pt.forEach(clearTimeout); };
  }, [jobId, isDemo]);

  const outreachStatusObj: OutreachStatus = {
    providers_contacted: stats.contacted,
    providers_responded: stats.responded,
    outreach_channels: {
      voice: { attempted: channels.voice, connected: 0 },
      sms: { attempted: channels.sms, connected: 0 },
      web: { attempted: channels.web, connected: 0 },
    },
    status: outreachDone ? 'completed' : 'dispatching',
  };
  const logEntries: LogEntry[] = log.map(e => ({ msg: e.msg, type: e.type as LogEntry['type'] }));

  return (
    <div style={{
      background: '#fff', borderRadius: 22, border: `1px solid ${BORDER}`,
      padding: '20px 20px 16px',
      boxShadow: '0 20px 60px -24px rgba(0,0,0,.12)',
      display: 'flex', flexDirection: 'column', gap: 14,
      fontFamily: "'DM Sans',sans-serif",
    }}>
      <div style={{ marginBottom: 0 }}>
        <HomieOutreachLive
          status={outreachStatusObj}
          log={logEntries}
          done={outreachDone}
          showSafeNotice={!outreachDone}
          accountLink="/account?tab=quotes"
        />
      </div>

      {costEstimate && <EstimateCard estimate={costEstimate} />}

      {providers.map((p, i) => (
        <div key={i}>
          <div onClick={() => setSelected(selected === i ? null : i)} style={{
            background: 'white', borderRadius: 14, padding: '14px 16px', cursor: 'pointer',
            border: selected === i ? `2px solid ${O}` : `1px solid ${BORDER}`,
            boxShadow: selected === i ? `0 4px 20px ${O}18` : '0 1px 4px rgba(0,0,0,0.03)',
            transition: 'all 0.2s',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: D, lineHeight: 1.3 }}>{p.name}</div>
                <div style={{ color: DIM, fontSize: 12, marginTop: 2 }}>
                  {'\u2605'} {p.rating} ({p.reviews}){p.distance ? ` · ${p.distance}` : ''}
                  {'googlePlaceId' in p && (p as RealProvider).googlePlaceId && (
                    <a
                      href={`https://www.google.com/maps/place/?q=place_id:${(p as RealProvider).googlePlaceId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      style={{ fontSize: 11, color: '#2563EB', textDecoration: 'none', fontWeight: 600, marginLeft: 6 }}
                    >Reviews</a>
                  )}
                </div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: O, lineHeight: 1 }}>{p.quote}</span>
                {costEstimate ? (
                  <EstimateBadge quotedPrice={p.quote} estimateLow={costEstimate.estimateLowCents} estimateHigh={costEstimate.estimateHighCents} />
                ) : (
                  <div style={{ fontSize: 10.5, color: DIM, fontWeight: 500 }}>quoted price</div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5 }}>
              <span style={{ color: D }}>{'\uD83D\uDCC5'} {p.availability}</span>
              <span style={{ background: W, padding: '2px 9px', borderRadius: 100, fontSize: 10.5, color: DIM }}>via {p.channel}</span>
            </div>
            {p.note && <div style={{ fontSize: 12, color: DIM, fontStyle: 'italic', marginTop: 6 }}>"{p.note}"</div>}
            {selected === i && !booked && (
              <div style={{ marginTop: 12 }} onClick={e => e.stopPropagation()}>
                {!isDemo && (
                  <input
                    id={`inline-addr-${i}`}
                    defaultValue={homeAddress}
                    placeholder="Enter your service address"
                    onClick={e => e.stopPropagation()}
                    style={{
                      width: '100%', padding: '9px 12px', borderRadius: 10, fontSize: 13,
                      border: `2px solid ${BORDER}`, outline: 'none', color: D,
                      fontFamily: "'DM Sans', sans-serif", marginBottom: 8, boxSizing: 'border-box',
                    }}
                  />
                )}
                <button onClick={async () => {
                  if (isDemo) {
                    setBooked(p as unknown as MockProvider);
                    onBooked(p.name);
                    return;
                  }
                  const addrInput = document.getElementById(`inline-addr-${i}`) as HTMLInputElement;
                  const address = addrInput?.value?.trim();
                  if (!address) { alert('Please enter your service address'); return; }
                  if (jobId && 'responseId' in p) {
                    try {
                      await jobService.bookProvider(jobId, (p as RealProvider).responseId, (p as RealProvider).id, address);
                      setBooked(p as unknown as MockProvider);
                      onBooked(p.name);
                    } catch (err) {
                      console.error('[InlineOutreach] Booking failed:', err);
                    }
                  }
                }} style={{
                  width: '100%', padding: '11px 0', borderRadius: 100, border: 'none',
                  background: O, color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", boxShadow: `0 4px 16px ${O}40`,
                }}>Book {p.name.split(' ')[0]}</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {outreachDone && providers.length > 0 && selected === null && !booked && (
        <div style={{ textAlign: 'center', color: DIM, fontSize: 13, marginTop: 4 }}>
          {'\u2191'} Tap a provider to book
        </div>
      )}

      {booked && (
        <div style={{
          padding: 14, background: `${G}10`, borderRadius: 12,
          border: `1px solid ${G}44`, textAlign: 'center',
        }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>{'\u2705'}</div>
          <div style={{ fontFamily: "'Fraunces',serif", fontSize: 16, fontWeight: 700, color: D, marginBottom: 2 }}>
            Booked with {booked.name}
          </div>
          <div style={{ fontSize: 12.5, color: DIM }}>
            They'll be in touch to confirm details.
          </div>
        </div>
      )}
    </div>
  );
}
