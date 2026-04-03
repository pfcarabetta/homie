import { useState } from 'react';
import EstimateCard from '@/components/EstimateCard';
import EstimateBadge from '@/components/EstimateBadge';

const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

const STYLE_TAG = `
@keyframes qcd-spin-cw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes qcd-spin-ccw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(-360deg); }
}
@keyframes qcd-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@keyframes qcd-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
@keyframes qcd-fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .qcd-spin-cw, .qcd-spin-ccw { animation: none !important; }
}
`;

// Mock data
const MOCK_JOBS = [
  {
    id: 'demo-active',
    status: 'collecting',
    payment_status: 'authorized',
    tier: 'priority',
    zip_code: '92119',
    preferred_timing: 'ASAP',
    has_booking: false,
    created_at: new Date(Date.now() - 15 * 60000).toISOString(),
    expires_at: new Date(Date.now() + 23 * 3600000).toISOString(),
    diagnosis: {
      category: 'plumbing',
      severity: 'medium' as const,
      summary: 'Leaking kitchen faucet — Moen single-handle with a drip from the base. Homeowner reports it started 2 days ago and is getting worse. May need cartridge replacement.',
      recommendedActions: ['Dispatch professional'],
    },
  },
  {
    id: 'demo-completed',
    status: 'completed',
    payment_status: 'paid',
    tier: 'priority',
    zip_code: '92119',
    preferred_timing: 'This week',
    has_booking: false,
    created_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    expires_at: new Date(Date.now() + 22 * 3600000).toISOString(),
    diagnosis: {
      category: 'locksmith',
      severity: 'high' as const,
      summary: 'Locked out of home — front door Schlage deadbolt. Homeowner needs a locksmith to help regain entry.',
      recommendedActions: ['Dispatch professional'],
    },
  },
];

const MOCK_RESPONSES = {
  'demo-active': [],
  'demo-completed': [
    { id: 'r1', provider: { id: 'p1', name: 'TNT Locksmith', google_rating: '4.8', review_count: 142, phone: '+16195551234' }, quoted_price: '$125', availability: 'Within 30 minutes', message: 'On my way, have all tools needed.', channel: 'voice', responded_at: new Date(Date.now() - 45 * 60000).toISOString() },
    { id: 'r2', provider: { id: 'p2', name: 'El Cheapo Mobile Locksmith', google_rating: '4.6', review_count: 89, phone: '+16195555678' }, quoted_price: '$150', availability: '45 minutes or less', message: null, channel: 'sms', responded_at: new Date(Date.now() - 30 * 60000).toISOString() },
  ],
};

const MOCK_ESTIMATE = {
  estimateLowCents: 7500,
  estimateHighCents: 20000,
  estimateMedianCents: 12500,
  confidence: 0.78,
  dataPointsUsed: 12,
  adjustmentFactors: [{ name: 'emergency_surcharge', direction: 'up' as const, percentage: 25, reason: 'Emergency/same-day service' }],
  dataSourceLabel: 'regional data & benchmarks',
  comparableRangeLabel: '$75 - $200',
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  open: { color: '#2563EB', bg: '#EFF6FF', label: 'Open' },
  dispatching: { color: '#C2410C', bg: '#FFF7ED', label: 'Searching' },
  collecting: { color: '#7C3AED', bg: '#F5F3FF', label: 'Collecting' },
  completed: { color: '#16A34A', bg: '#F0FDF4', label: 'Complete' },
  expired: { color: '#9B9490', bg: '#F5F5F5', label: 'Expired' },
};

const PAYMENT_LABELS: Record<string, { text: string; color: string }> = {
  unpaid: { text: 'Not paid', color: '#9B9490' },
  authorized: { text: 'Authorized', color: '#2563EB' },
  paid: { text: 'Paid', color: '#16A34A' },
  refunded: { text: 'Refunded', color: '#DC2626' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function QuoteCardRedesign({ job, responses, estimate, defaultExpanded }: {
  job: typeof MOCK_JOBS[number];
  responses: typeof MOCK_RESPONSES['demo-completed'];
  estimate: typeof MOCK_ESTIMATE | null;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const isActive = ['open', 'dispatching', 'collecting'].includes(job.status);
  const sc = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.expired;
  const pm = PAYMENT_LABELS[job.payment_status] ?? PAYMENT_LABELS.unpaid;
  const catLabel = job.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const responseCount = responses.length;

  const ringSize = 44;

  return (
    <div onClick={() => setExpanded(!expanded)} style={{
      background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
      border: expanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
      transition: 'all 0.2s',
      boxShadow: expanded ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
    }}>
      {/* ── Collapsed header ── */}
      <div style={{ padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Mini spinner for active jobs, static icon for completed */}
          {isActive ? (
            <div style={{ position: 'relative', width: ringSize, height: ringSize, flexShrink: 0 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #F0EBE6' }} />
              <div className="qcd-spin-cw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: O, animation: 'qcd-spin-cw 1.8s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
              <div className="qcd-spin-ccw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderBottomColor: G, animation: 'qcd-spin-ccw 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 20, color: O, lineHeight: 1 }}>h</div>
            </div>
          ) : (
            <div style={{
              width: ringSize, height: ringSize, borderRadius: '50%', flexShrink: 0,
              background: responseCount > 0 ? `${G}12` : W,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${responseCount > 0 ? `${G}30` : '#F0EBE6'}`,
            }}>
              <span style={{ fontSize: 18 }}>{responseCount > 0 ? '✓' : '⏰'}</span>
            </div>
          )}

          {/* Title + meta */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 16, color: D }}>{catLabel}</span>
              <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 100, fontSize: 10, fontWeight: 600 }}>{sc.label}</span>
            </div>
            <div style={{ fontSize: 12, color: '#9B9490', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <span>{job.zip_code}</span>
              <span>{new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              <span style={{ textTransform: 'capitalize' }}>{job.tier}</span>
            </div>
          </div>

          {/* Right side: quote count or active indicator */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {responseCount > 0 ? (
              <>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: G }}>{responseCount}</div>
                <div style={{ fontSize: 10, color: '#9B9490' }}>quote{responseCount > 1 ? 's' : ''}</div>
              </>
            ) : isActive ? (
              <div style={{ fontSize: 11, fontWeight: 600, color: O, animation: 'qcd-pulse 1.5s infinite' }}>Searching...</div>
            ) : (
              <span style={{ fontSize: 12, color: '#9B9490' }}>—</span>
            )}
          </div>

          <span style={{ fontSize: 12, color: '#C0BBB6', flexShrink: 0 }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>

          {/* Active outreach animation */}
          {isActive && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 16px' }}>
              <div style={{ position: 'relative', width: 72, height: 72, marginBottom: 12 }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid #F0EBE6' }} />
                <div className="qcd-spin-cw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: O, animation: 'qcd-spin-cw 1.8s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                <div className="qcd-spin-ccw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderBottomColor: G, animation: 'qcd-spin-ccw 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 30, color: O, lineHeight: 1 }}>h</div>
              </div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, textAlign: 'center' }}>Your Homie's on it</div>
              <div style={{ fontSize: 12, color: '#9B9490', textAlign: 'center', marginTop: 2 }}>Contacting pros in {job.zip_code}</div>
              <div style={{ fontSize: 12, fontWeight: 500, color: O, marginTop: 8, animation: 'qcd-pulse 2s infinite' }}>
                Calling around so you don't have to
              </div>
            </div>
          )}

          {/* Summary */}
          {job.diagnosis.summary && (
            <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 14, padding: isActive ? 0 : '12px 0 0' }}>
              {job.diagnosis.summary}
            </div>
          )}

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
            {[
              { label: 'Category', value: catLabel },
              { label: 'Severity', value: (job.diagnosis.severity ?? 'Medium').replace(/^\w/, c => c.toUpperCase()), color: (job.diagnosis.severity as string) === 'high' ? '#DC2626' : (job.diagnosis.severity as string) === 'low' ? G : D },
              { label: 'Timing', value: job.preferred_timing ?? 'Flexible' },
              { label: 'Payment', value: pm.text, color: pm.color },
            ].map((item, i) => (
              <div key={i} style={{ background: W, borderRadius: 8, padding: '7px 10px' }}>
                <div style={{ fontSize: 9, color: '#9B9490', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: item.color ?? D, textTransform: item.label === 'Severity' ? 'capitalize' : undefined }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Expiry */}
          {job.expires_at && isActive && (
            <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 12 }}>
              Expires: {new Date(job.expires_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </div>
          )}

          {/* AI Cost Estimate */}
          {estimate && (
            <div style={{ marginBottom: 14 }}>
              <EstimateCard estimate={estimate} />
            </div>
          )}

          {/* Provider Quotes */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: D, marginBottom: 8, letterSpacing: '0.02em' }}>
              {responseCount > 0 ? `Provider Quotes (${responseCount})` : 'Provider Quotes'}
            </div>

            {responseCount === 0 ? (
              <div style={{
                background: W, borderRadius: 10, padding: '16px 14px', textAlign: 'center',
                border: '1px dashed rgba(0,0,0,0.08)',
              }}>
                {isActive ? (
                  <>
                    <div style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>Waiting for providers to respond...</div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: '50%', background: O,
                          animation: `qcd-pulse 1.2s ${i * 0.3}s infinite`,
                        }} />
                      ))}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 13, color: '#9B9490' }}>No providers responded</div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {responses.map(r => (
                  <div key={r.id} style={{
                    background: W, borderRadius: 10, padding: '12px 14px',
                    border: '1px solid rgba(0,0,0,0.04)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14, color: D }}>{r.provider.name}</span>
                        <span style={{ color: '#9B9490', fontSize: 11, marginLeft: 6 }}>★ {r.provider.google_rating} ({r.provider.review_count})</span>
                      </div>
                      {r.quoted_price && (
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: O }}>{r.quoted_price}</span>
                          {estimate ? (
                            <EstimateBadge quotedPrice={r.quoted_price} estimateLow={estimate.estimateLowCents} estimateHigh={estimate.estimateHighCents} />
                          ) : (
                            <div style={{ fontSize: 10, color: '#9B9490', fontWeight: 500 }}>quoted price</div>
                          )}
                        </div>
                      )}
                    </div>
                    {r.availability && <div style={{ fontSize: 12, color: D, marginBottom: 3 }}>📅 {r.availability}</div>}
                    {r.message && <div style={{ fontSize: 12, color: '#6B6560', fontStyle: 'italic' }}>"{r.message}"</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <span style={{ fontSize: 11, color: '#9B9490' }}>via {r.channel} · {timeAgo(r.responded_at)}</span>
                      {r.provider.phone && (
                        <a href={`tel:${r.provider.phone}`} style={{ fontSize: 12, color: G, textDecoration: 'none', fontWeight: 600 }}>📞 Call</a>
                      )}
                    </div>
                    {!job.has_booking && (
                      <button style={{
                        width: '100%', padding: '10px 0', borderRadius: 100, border: 'none', marginTop: 10,
                        background: O, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        fontFamily: "'DM Sans', sans-serif",
                      }}>Book {r.provider.name.split(' ')[0]}</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function QuoteCardDemo() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLE_TAG }} />
      <div style={{ minHeight: '100vh', background: '#FAFAF8', fontFamily: "'DM Sans', sans-serif" }}>
        {/* Header */}
        <div style={{ background: '#fff', borderBottom: '1px solid #E0DAD4', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: O }}>homie</span>
            <span style={{ fontSize: 13, color: '#9B9490', marginLeft: 12 }}>Quote Card Redesign Demo</span>
          </div>
        </div>

        <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px' }}>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, marginBottom: 16 }}>My Quotes</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Active job — expanded by default to show the animation */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6 }}>ACTIVE — COLLECTING QUOTES</div>
              <QuoteCardRedesign
                job={MOCK_JOBS[0]}
                responses={MOCK_RESPONSES['demo-active']}
                estimate={MOCK_ESTIMATE}
                defaultExpanded
              />
            </div>

            {/* Completed job with quotes */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6 }}>COMPLETED — WITH QUOTES</div>
              <QuoteCardRedesign
                job={MOCK_JOBS[1]}
                responses={MOCK_RESPONSES['demo-completed']}
                estimate={MOCK_ESTIMATE}
                defaultExpanded
              />
            </div>

            {/* Collapsed state */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9B9490', letterSpacing: '0.05em', marginBottom: 6 }}>COLLAPSED STATES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <QuoteCardRedesign job={MOCK_JOBS[0]} responses={[]} estimate={null} />
                <QuoteCardRedesign job={MOCK_JOBS[1]} responses={MOCK_RESPONSES['demo-completed']} estimate={null} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
