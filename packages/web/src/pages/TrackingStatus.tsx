import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { trackingService, type TrackingStatus as TrackingStatusType } from '@/services/api';

// ── Constants ──────────────────────────────────────────────────────────────

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';

const STEPS = [
  { key: 'reported', label: 'Reported' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'provider_responded', label: 'Provider Responded' },
  { key: 'provider_booked', label: 'Provider Booked' },
  { key: 'provider_en_route', label: 'Provider En Route' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
] as const;

const SEVERITY_COLORS: Record<string, string> = {
  low: '#1B9E77',
  medium: '#D4A017',
  high: '#E8632B',
  urgent: '#DC2626',
  emergency: '#DC2626',
};

// ── Demo data ──────────────────────────────────────────────────────────────

function buildDemoData(): TrackingStatusType {
  const now = Date.now();
  return {
    property_name: 'Beach House #4',
    job_title: 'Leaking kitchen faucet',
    job_category: 'plumbing',
    severity: 'medium',
    status: 'provider_en_route',
    provider: { name: 'Mike R.', rating: '4.9' },
    last_updated: new Date(now - 20 * 60_000).toISOString(),
    timeline: [
      {
        event_type: 'reported',
        title: 'Issue Reported',
        description: 'Maintenance request submitted.',
        metadata: null,
        created_at: new Date(now - 120 * 60_000).toISOString(),
      },
      {
        event_type: 'dispatched',
        title: 'Dispatched',
        description: 'Searching for available providers.',
        metadata: null,
        created_at: new Date(now - 110 * 60_000).toISOString(),
      },
      {
        event_type: 'provider_responded',
        title: 'Provider Responded',
        description: 'A provider has accepted the job.',
        metadata: { provider_name: 'Mike R.', quote: '$175' },
        created_at: new Date(now - 80 * 60_000).toISOString(),
      },
      {
        event_type: 'provider_booked',
        title: 'Provider Booked',
        description: 'Appointment confirmed.',
        metadata: { scheduled: 'Today, 2:00-4:00 PM' },
        created_at: new Date(now - 60 * 60_000).toISOString(),
      },
      {
        event_type: 'provider_en_route',
        title: 'Provider En Route',
        description: 'The provider is on the way.',
        metadata: { eta: '~20 minutes' },
        created_at: new Date(now - 20 * 60_000).toISOString(),
      },
    ],
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TrackingStatus() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<TrackingStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  const isDemo = token === 'demo';

  const fetchData = useCallback(async () => {
    if (!token || isDemo) return;
    try {
      const res = await trackingService.getStatus(token);
      if (res.data) {
        if (res.data.expired) {
          setExpired(true);
        } else {
          setData(res.data);
          setExpired(false);
        }
      }
    } catch {
      setExpired(true);
    } finally {
      setLoading(false);
    }
  }, [token, isDemo]);

  useEffect(() => {
    if (isDemo) {
      setData(buildDemoData());
      setLoading(false);
      return;
    }
    fetchData();
    const interval = setInterval(fetchData, 30_000);
    return () => clearInterval(interval);
  }, [fetchData, isDemo]);

  // Determine step statuses
  const completedEventTypes = new Set(data?.timeline.map((e) => e.event_type) ?? []);
  const timelineMap = Object.fromEntries(
    (data?.timeline ?? []).map((e) => [e.event_type, e]),
  );

  let lastCompletedIndex = -1;
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (completedEventTypes.has(STEPS[i].key)) {
      lastCompletedIndex = i;
      break;
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif", color: D }}>
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@400;600;700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes pulse-dot {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.4); opacity: 0.6; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .step-completed { animation: fade-in 0.4s ease-out both; }
      `}</style>

      {/* Header */}
      <header style={{
        padding: '24px 20px 16px',
        textAlign: 'center',
        borderBottom: '1px solid rgba(45,41,38,0.08)',
        background: '#fff',
      }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: O }}>
          homie
        </div>
        <div style={{ fontSize: 13, color: '#888', marginTop: 4, letterSpacing: '0.02em' }}>
          Maintenance Status
        </div>
      </header>

      <main style={{ maxWidth: 520, margin: '0 auto', padding: '20px 16px 40px' }}>
        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <div style={{
              width: 40, height: 40, border: `3px solid ${O}33`, borderTopColor: O,
              borderRadius: '50%', margin: '0 auto 16px',
              animation: 'spin 0.8s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: '#888', fontSize: 14 }}>Loading status...</p>
          </div>
        )}

        {/* Expired */}
        {!loading && expired && (
          <div style={{
            textAlign: 'center', padding: '80px 20px',
            background: '#fff', borderRadius: 16, marginTop: 20,
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#128274;</div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, marginBottom: 12, color: D }}>
              Update Expired
            </h2>
            <p style={{ color: '#666', fontSize: 14, lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
              This maintenance update has expired. Contact your property manager for status.
            </p>
          </div>
        )}

        {/* Content */}
        {!loading && !expired && data && (
          <>
            {/* Job summary card */}
            <div style={{
              background: '#fff', borderRadius: 16, padding: '24px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16,
            }}>
              {data.property_name && (
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {data.property_name}
                </div>
              )}
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 600, margin: '0 0 12px', color: D }}>
                {data.job_title}
              </h1>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                <span style={{
                  display: 'inline-block', padding: '4px 12px', borderRadius: 999,
                  background: `${G}18`, color: G, fontSize: 12, fontWeight: 600,
                  textTransform: 'capitalize',
                }}>
                  {data.job_category}
                </span>
                <span style={{
                  display: 'inline-block', padding: '4px 12px', borderRadius: 999,
                  background: `${SEVERITY_COLORS[data.severity] ?? '#888'}18`,
                  color: SEVERITY_COLORS[data.severity] ?? '#888',
                  fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
                }}>
                  {data.severity}
                </span>
              </div>
              <div style={{
                fontSize: 15, fontWeight: 600, color: O,
                textTransform: 'capitalize',
              }}>
                {data.status.replace(/_/g, ' ')}
              </div>
            </div>

            {/* Timeline */}
            <div style={{
              background: '#fff', borderRadius: 16, padding: '24px 20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: 16,
            }}>
              <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, margin: '0 0 20px', color: D }}>
                Progress
              </h2>
              <div style={{ position: 'relative' }}>
                {STEPS.map((step, i) => {
                  const event = timelineMap[step.key];
                  const isCompleted = completedEventTypes.has(step.key);
                  const isCurrent = !isCompleted && i === lastCompletedIndex + 1;
                  const isUpcoming = !isCompleted && !isCurrent;
                  const isLast = i === STEPS.length - 1;

                  return (
                    <div
                      key={step.key}
                      className={isCompleted ? 'step-completed' : undefined}
                      style={{
                        display: 'flex', gap: 16, position: 'relative',
                        paddingBottom: isLast ? 0 : 24,
                        opacity: isUpcoming ? 0.4 : 1,
                      }}
                    >
                      {/* Left: line + dot */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
                        {/* Dot */}
                        {isCompleted && (
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', background: G,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                          }}>
                            &#10003;
                          </div>
                        )}
                        {isCurrent && (
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <div style={{
                              width: 14, height: 14, borderRadius: '50%', background: O,
                              animation: 'pulse-dot 1.8s ease-in-out infinite',
                            }} />
                          </div>
                        )}
                        {isUpcoming && (
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            border: '2px solid #ccc', background: W, flexShrink: 0,
                          }} />
                        )}
                        {/* Connecting line */}
                        {!isLast && (
                          <div style={{
                            width: 2, flex: 1, marginTop: 4,
                            background: isCompleted && completedEventTypes.has(STEPS[i + 1]?.key) ? G : '#ddd',
                          }} />
                        )}
                      </div>

                      {/* Right: content */}
                      <div style={{ flex: 1, paddingTop: 2 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: D }}>
                          {event?.title ?? step.label}
                        </div>
                        {event?.description && (
                          <div style={{ fontSize: 13, color: '#666', marginTop: 2 }}>
                            {event.description}
                          </div>
                        )}
                        {event?.metadata && (
                          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {Object.entries(event.metadata).map(([k, v]) => (
                              <span key={k} style={{
                                display: 'inline-block', padding: '3px 10px', borderRadius: 8,
                                background: `${O}10`, color: O, fontSize: 12, fontWeight: 500,
                              }}>
                                {String(v)}
                              </span>
                            ))}
                          </div>
                        )}
                        {event && (
                          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                            {formatTimestamp(event.created_at)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Provider card */}
            {data.provider && (
              <div style={{
                background: `${O}08`, borderRadius: 16, padding: '20px',
                border: `1px solid ${O}20`, marginBottom: 16,
              }}>
                <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: D }}>
                  Your Provider
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', background: O,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700,
                  }}>
                    {data.provider.name.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: D }}>{data.provider.name}</div>
                    {data.provider.rating && (
                      <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                        <span style={{ color: '#F5A623' }}>&#9733;</span> {data.provider.rating}
                      </div>
                    )}
                  </div>
                </div>
                {/* Show ETA or scheduled from latest timeline metadata */}
                {(() => {
                  const allMeta = data.timeline
                    .filter((e) => e.metadata)
                    .flatMap((e) => Object.entries(e.metadata!));
                  const eta = allMeta.find(([k]) => k === 'eta');
                  const scheduled = allMeta.find(([k]) => k === 'scheduled');
                  const display = eta ?? scheduled;
                  if (!display) return null;
                  return (
                    <div style={{
                      marginTop: 12, padding: '10px 14px', borderRadius: 10,
                      background: '#fff', fontSize: 13, color: D,
                    }}>
                      <span style={{ fontWeight: 600 }}>
                        {display[0] === 'eta' ? 'ETA: ' : 'Scheduled: '}
                      </span>
                      {String(display[1])}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Last updated */}
            <div style={{ textAlign: 'center', fontSize: 12, color: '#999', marginTop: 8 }}>
              Last updated {timeAgo(data.last_updated)}
            </div>
          </>
        )}
      </main>

      {/* Footer */}
      <footer style={{
        textAlign: 'center', padding: '24px 16px 32px',
        borderTop: '1px solid rgba(45,41,38,0.06)',
        fontSize: 13, color: '#999',
      }}>
        Powered by{' '}
        <Link to="/" style={{ color: O, textDecoration: 'none', fontFamily: "'Fraunces', serif", fontWeight: 600 }}>
          homie
        </Link>
        {' '}&mdash; Your home&rsquo;s best friend
      </footer>
    </div>
  );
}
