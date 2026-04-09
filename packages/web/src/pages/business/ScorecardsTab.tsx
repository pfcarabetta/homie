import { useState, useEffect } from 'react';
import { O, G, D, W } from './constants';
import { businessService } from '@/services/api';

type Scorecard = {
  id: string; name: string; phone: string | null;
  google_rating: string | null; review_count: number; categories: string[] | null;
  total_outreach: number; response_rate: number; acceptance_rate: number;
  avg_response_sec: number | null; avg_quote: number | null;
  total_bookings: number; booking_rate: number;
  overall_score: number; grade: string; badges: string[];
};

export default function ScorecardsTab({ workspaceId, plan }: { workspaceId: string; plan: string }) {
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isPremium = ['professional', 'business', 'enterprise'].includes(plan);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    businessService.getVendorScorecards(workspaceId).then(res => {
      if (res.data) setScorecards(res.data.vendors);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspaceId, isPremium]);

  if (!isPremium) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>Provider scorecards available on Professional+</div>
      <div style={{ fontSize: 14, color: '#9B9490' }}>Upgrade your plan to access provider scorecards with response rates, grades, and performance metrics.</div>
    </div>
  );

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading scorecards...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Provider Scorecards</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {scorecards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No provider data yet — scorecards appear after outreach.</div>
        ) : scorecards.map(v => {
          const isExpanded = expandedVendor === v.id;
          const gradeColors: Record<string, { bg: string; text: string }> = {
            A: { bg: '#F0FDF4', text: '#16A34A' }, B: { bg: '#EFF6FF', text: '#2563EB' },
            C: { bg: '#FFF7ED', text: '#C2410C' }, D: { bg: '#FEF2F2', text: '#DC2626' },
            F: { bg: '#FEF2F2', text: '#DC2626' },
          };
          const gc = gradeColors[v.grade] || gradeColors.C;
          const badgeColors: Record<string, { bg: string; text: string }> = {
            'Reliable': { bg: '#EFF6FF', text: '#2563EB' }, 'Fast Responder': { bg: '#F0FDF4', text: '#16A34A' },
            'Veteran': { bg: '#F5F3FF', text: '#7C3AED' }, 'Top Rated': { bg: '#FFF7ED', text: '#C2410C' },
          };

          return (
            <div key={v.id} onClick={() => setExpandedVendor(isExpanded ? null : v.id)} style={{
              background: '#fff', borderRadius: 12, border: isExpanded ? `2px solid ${O}` : '1px solid #E0DAD4',
              cursor: 'pointer', transition: 'all 0.15s', overflow: 'hidden',
            }}>
              {/* Collapsed */}
              <div style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, background: gc.bg,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700, color: gc.text,
                    }}>{v.grade}</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: D }}>{v.name}</div>
                      <div style={{ fontSize: 12, color: '#9B9490' }}>
                        {v.google_rating && `★ ${v.google_rating}`} · {v.total_outreach} outreach · {v.total_bookings} bookings
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: '#9B9490' }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
                {v.badges.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {v.badges.map(b => {
                      const bc = badgeColors[b] || { bg: '#F5F5F5', text: '#6B7280' };
                      return <span key={b} style={{ fontSize: 11, padding: '2px 10px', borderRadius: 12, fontWeight: 600, background: bc.bg, color: bc.text }}>{b}</span>;
                    })}
                  </div>
                )}
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{ padding: '0 18px 18px', borderTop: '1px solid rgba(0,0,0,0.05)' }} onClick={e => e.stopPropagation()}>
                  {/* Score bar */}
                  <div style={{ padding: '14px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: D }}>Overall Score</span>
                      <span style={{ fontSize: 20, fontWeight: 700, color: gc.text, fontFamily: "'Fraunces', serif" }}>{v.overall_score}/100</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: '#E0DAD4' }}>
                      <div style={{ height: '100%', borderRadius: 4, background: gc.text, width: `${v.overall_score}%`, transition: 'width 0.5s' }} />
                    </div>
                  </div>

                  {/* Stats grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
                    <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: v.response_rate >= 70 ? G : v.response_rate >= 40 ? '#C2410C' : '#DC2626' }}>{v.response_rate}%</div>
                      <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Response Rate</div>
                    </div>
                    <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: D }}>{v.acceptance_rate}%</div>
                      <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Acceptance Rate</div>
                    </div>
                    <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: D }}>
                        {v.avg_response_sec != null ? (v.avg_response_sec < 60 ? `${v.avg_response_sec}s` : `${Math.round(v.avg_response_sec / 60)}m`) : '—'}
                      </div>
                      <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Avg Response</div>
                    </div>
                    <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: O }}>{v.avg_quote != null ? `$${v.avg_quote}` : '—'}</div>
                      <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Avg Quote</div>
                    </div>
                    <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: D }}>{v.booking_rate}%</div>
                      <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Booking Rate</div>
                    </div>
                    <div style={{ background: W, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: D }}>{v.total_bookings}</div>
                      <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>Jobs Completed</div>
                    </div>
                  </div>

                  {/* Categories */}
                  {v.categories && v.categories.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                      {v.categories.map(c => (
                        <span key={c} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 12, background: `${G}15`, color: G, fontWeight: 500, textTransform: 'capitalize' }}>{c}</span>
                      ))}
                    </div>
                  )}

                  {/* Contact */}
                  {v.phone && (
                    <a href={`tel:${v.phone}`} style={{
                      display: 'block', textAlign: 'center', padding: '10px 0', borderRadius: 100,
                      border: `1px solid ${O}`, color: O, fontSize: 14, fontWeight: 600,
                      textDecoration: 'none',
                    }}>📞 Call {v.name.split(' ')[0]}</a>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
