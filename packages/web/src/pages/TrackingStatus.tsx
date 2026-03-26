import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { trackingService, type TrackingStatus as TrackingStatusType } from '@/services/api';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

const STEPS = [
  { key: 'reported', icon: '📋', label: 'Reported', desc: 'Issue reported and diagnosed' },
  { key: 'dispatched', icon: '📡', label: 'Dispatching', desc: 'Finding available pros in your area' },
  { key: 'provider_responded', icon: '💬', label: 'Quoted', desc: 'A pro has responded with availability' },
  { key: 'provider_booked', icon: '✅', label: 'Booked', desc: 'Appointment confirmed' },
] as const;

const SEV: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: '#F0FDF4', text: '#16A34A', label: 'Low' },
  medium: { bg: '#FFF7ED', text: '#D4A017', label: 'Medium' },
  high: { bg: '#FFF1F0', text: '#E8632B', label: 'High' },
  urgent: { bg: '#FEF2F2', text: '#DC2626', label: 'Urgent' },
};

function buildDemoData(): TrackingStatusType {
  const now = Date.now();
  return {
    property_name: 'Beach House #4',
    job_title: 'Leaking kitchen faucet',
    job_category: 'plumbing',
    severity: 'medium',
    status: 'provider_booked',
    provider: { name: 'Rodriguez Plumbing', rating: '4.9', reviewCount: 214 },
    last_updated: new Date(now - 30 * 60_000).toISOString(),
    timeline: [
      { event_type: 'reported', title: 'Issue Reported', description: 'Guest reported a leaking kitchen faucet — water dripping from the base when turned on.', metadata: null, created_at: new Date(now - 120 * 60_000).toISOString() },
      { event_type: 'dispatched', title: 'Dispatching Pros', description: 'Contacting plumbers in the area via phone, SMS, and web.', metadata: null, created_at: new Date(now - 110 * 60_000).toISOString() },
      { event_type: 'provider_responded', title: 'Quote Received', description: 'Mike R. is available and has responded.', metadata: { provider_name: 'Mike R.', rating: '4.9 ★' }, created_at: new Date(now - 80 * 60_000).toISOString() },
      { event_type: 'provider_booked', title: 'Appointment Confirmed', description: 'Mike R. is booked and confirmed for the job.', metadata: { scheduled: 'Today, 2:00–4:00 PM', availability: 'Tomorrow 9–11 AM' }, created_at: new Date(now - 30 * 60_000).toISOString() },
    ],
  };
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function fmtTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part);
}

export default function TrackingStatus() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<TrackingStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const isDemo = token === 'demo';

  const fetchData = useCallback(async () => {
    if (!token || isDemo) return;
    try {
      const res = await trackingService.getStatus(token);
      if (res.data) {
        if (res.data.expired) setExpired(true);
        else { setData(res.data); setExpired(false); }
      } else { setExpired(true); }
    } catch { setExpired(true); }
    finally { setLoading(false); }
  }, [token, isDemo]);

  useEffect(() => {
    if (isDemo) { setData(buildDemoData()); setLoading(false); return; }
    fetchData();
    pollRef.current = setInterval(fetchData, 30_000);
    return () => clearInterval(pollRef.current);
  }, [fetchData, isDemo]);

  const completedKeys = new Set(data?.timeline.map(e => e.event_type) ?? []);
  const eventMap = Object.fromEntries((data?.timeline ?? []).map(e => [e.event_type, e]));
  let lastDoneIdx = -1;
  STEPS.forEach((s, i) => { if (completedKeys.has(s.key)) lastDoneIdx = i; });

  const sev = data ? (SEV[data.severity] ?? SEV.medium) : SEV.medium;

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @keyframes trackPulse { 0%,100% { transform:scale(1); box-shadow: 0 0 0 0 rgba(232,99,43,0.4); } 50% { transform:scale(1.15); box-shadow: 0 0 0 8px rgba(232,99,43,0); } }
        @keyframes trackFadeIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes trackSpin { to { transform:rotate(360deg); } }
        .track-step { animation: trackFadeIn 0.4s ease-out both; }
      `}</style>

      {/* Header */}
      <header style={{ background: '#fff', padding: '20px 20px 16px', textAlign: 'center', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, color: O }}>homie</span>
        </Link>
        <div style={{ fontSize: 12, color: '#9B9490', marginTop: 4, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Maintenance Status</div>
      </header>

      <main style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 40px' }}>

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '100px 0' }}>
            <div style={{ width: 36, height: 36, border: `3px solid ${O}30`, borderTopColor: O, borderRadius: '50%', margin: '0 auto 16px', animation: 'trackSpin 0.7s linear infinite' }} />
            <p style={{ color: '#9B9490', fontSize: 14 }}>Loading status...</p>
          </div>
        )}

        {/* Expired */}
        {!loading && expired && (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: '#fff', borderRadius: 20, marginTop: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: D, marginBottom: 8 }}>Update Expired</h2>
            <p style={{ color: '#6B6560', fontSize: 15, lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
              This maintenance update has expired. Contact your property manager for status.
            </p>
          </div>
        )}

        {/* Main content */}
        {!loading && !expired && data && (
          <>
            {/* Demo banner */}
            {isDemo && (
              <div style={{ background: '#EFF6FF', border: '1px solid rgba(37,99,235,0.1)', borderRadius: 12, padding: '10px 16px', marginBottom: 16, textAlign: 'center', fontSize: 13, color: '#2563EB', fontWeight: 500 }}>
                Demo — this is a sample tracking page
              </div>
            )}

            {/* Job summary */}
            <div style={{ background: '#fff', borderRadius: 16, padding: '16px 18px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 14, cursor: 'pointer' }}
              onClick={() => setSummaryExpanded(e => !e)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, color: '#9B9490', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                    {data.property_name}
                  </div>
                  <div style={{
                    fontSize: 15, fontWeight: 600, color: D, lineHeight: 1.4,
                    ...(summaryExpanded ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }),
                  }}>
                    {renderBold(data.job_title)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0, marginLeft: 10 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ padding: '3px 10px', borderRadius: 100, background: `${G}15`, color: G, fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>
                      {data.job_category.replace(/_/g, ' ')}
                    </span>
                    <span style={{ padding: '3px 10px', borderRadius: 100, background: sev.bg, color: sev.text, fontSize: 11, fontWeight: 600 }}>
                      {sev.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: '#9B9490', transition: 'transform 0.2s', transform: summaryExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
                </div>
              </div>

            </div>

            {/* Provider card */}
            {data.provider && (
              <div style={{ background: '#fff', borderRadius: 20, padding: '22px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 16, border: `1px solid ${O}15` }}>
                <div style={{ fontSize: 12, color: '#9B9490', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>Your Provider</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%', background: `${O}12`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, fontWeight: 700, color: O, fontFamily: "'Fraunces', serif",
                  }}>
                    {data.provider.name.charAt(0)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: D }}>{data.provider.name}</div>
                    {data.provider.rating && (
                      <div style={{ fontSize: 14, color: '#6B6560', marginTop: 2 }}>
                        <span style={{ color: '#F5A623' }}>★</span> {data.provider.rating}{data.provider.reviewCount ? ` (${data.provider.reviewCount} reviews)` : ''} · Google
                      </div>
                    )}
                  </div>
                </div>
                {/* Appointment time from booked event */}
                {(() => {
                  const bookedEvent = data.timeline.find(e => e.event_type === 'provider_booked');
                  const respondedEvent = data.timeline.find(e => e.event_type === 'provider_responded');
                  const scheduled = (bookedEvent?.metadata?.scheduled ?? bookedEvent?.metadata?.availability ?? respondedEvent?.metadata?.availability) as string | undefined;
                  if (!scheduled) return null;
                  return (
                    <div style={{ marginTop: 14, background: W, borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 18 }}>📅</span>
                      <div>
                        <div style={{ fontSize: 11, color: '#9B9490', fontWeight: 600 }}>APPOINTMENT</div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: D }}>{scheduled}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Timeline */}
            <div style={{ background: '#fff', borderRadius: 20, padding: '28px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.04)', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#9B9490', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 20 }}>Progress</div>

              {STEPS.map((step, i) => {
                const event = eventMap[step.key];
                const done = completedKeys.has(step.key);
                const current = !done && i === lastDoneIdx + 1;
                const upcoming = !done && !current;
                const isLast = i === STEPS.length - 1;
                const nextDone = completedKeys.has(STEPS[i + 1]?.key);

                return (
                  <div key={step.key} className={done ? 'track-step' : undefined} style={{ display: 'flex', gap: 14, position: 'relative', paddingBottom: isLast ? 0 : 6 }}>
                    {/* Timeline column */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
                      {done && (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: G, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 12.75l6 6 9-13.5" /></svg>
                        </div>
                      )}
                      {current && (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <div style={{ width: 16, height: 16, borderRadius: '50%', background: O, animation: 'trackPulse 2s ease-in-out infinite' }} />
                        </div>
                      )}
                      {upcoming && (
                        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid #E0DAD4', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span style={{ fontSize: 14, opacity: 0.4 }}>{step.icon}</span>
                        </div>
                      )}
                      {!isLast && (
                        <div style={{ width: 2, flex: 1, minHeight: 20, marginTop: 4, marginBottom: 4, background: done && nextDone ? G : '#E0DAD4', borderRadius: 1 }} />
                      )}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, paddingTop: 4, paddingBottom: isLast ? 0 : 16, opacity: upcoming ? 0.35 : 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: D }}>{event?.title ?? step.label}</div>
                      <div style={{ fontSize: 13, color: '#6B6560', marginTop: 2, lineHeight: 1.5 }}>
                        {renderBold(event?.description ?? step.desc)}
                      </div>
                      {event?.metadata && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          {Object.entries(event.metadata).filter(([k, v]) => k !== 'provider_name' && k !== 'quote' && v != null).map(([k, v]) => (
                            <span key={k} style={{
                              padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                              background: k === 'quote' ? `${G}12` : k === 'rating' ? '#FFF7ED' : `${O}08`,
                              color: k === 'quote' ? G : k === 'rating' ? '#D4A017' : O,
                            }}>
                              {String(v)}
                            </span>
                          ))}
                        </div>
                      )}
                      {event && (
                        <div style={{ fontSize: 11, color: '#9B9490', marginTop: 6 }}>{fmtTime(event.created_at)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Last updated */}
            <div style={{ textAlign: 'center', fontSize: 12, color: '#9B9490', padding: '8px 0' }}>
              Last updated {timeAgo(data.last_updated)} · Auto-refreshes every 30s
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={{ textAlign: 'center', padding: '20px 16px 32px', borderTop: '1px solid rgba(0,0,0,0.04)', fontSize: 13, color: '#9B9490' }}>
        Powered by{' '}
        <Link to="/" style={{ color: O, textDecoration: 'none', fontFamily: "'Fraunces', serif", fontWeight: 700 }}>homie</Link>
        {' '}— Your home's best friend
      </footer>
    </div>
  );
}
