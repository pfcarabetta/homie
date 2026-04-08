import { useState, useEffect } from 'react';
import { O, G, D, W } from './constants';
import { businessService } from '@/services/api';

/* ── Report Types ────────────────────────────────────────────────────── */

type ReportView = 'summary' | 'property' | 'category' | 'vendor' | 'monthly' | 'scorecards';

/* ── Reports Tab ──────────────────────────────────────────────────── */

export default function ReportsTab({ workspaceId, plan, initialView }: { workspaceId: string; plan: string; initialView?: ReportView }) {
  const [report, setReport] = useState<{
    total_cost: number; total_bookings: number; avg_cost: number;
    by_property: Array<{ id: string; name: string; cost: number; count: number }>;
    by_category: Array<{ category: string; cost: number; count: number }>;
    by_vendor: Array<{ id: string; name: string; cost: number; count: number }>;
    by_month: Array<{ month: string; cost: number; count: number }>;
    line_items: Array<{ jobId: string; propertyName: string; category: string; providerName: string; quotedPrice: string | null; cost: number; confirmedAt: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ReportView>(initialView ?? 'summary');

  const [scorecards, setScorecards] = useState<Array<{
    id: string; name: string; phone: string | null;
    google_rating: string | null; review_count: number; categories: string[] | null;
    total_outreach: number; response_rate: number; acceptance_rate: number;
    avg_response_sec: number | null; avg_quote: number | null;
    total_bookings: number; booking_rate: number;
    overall_score: number; grade: string; badges: string[];
  }>>([]);
  const [expandedVendor, setExpandedVendor] = useState<string | null>(null);

  const isPremium = ['professional', 'business', 'enterprise'].includes(plan);

  useEffect(() => {
    if (initialView) setView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    Promise.all([
      businessService.getCostReport(workspaceId),
      businessService.getVendorScorecards(workspaceId),
    ]).then(([costRes, vendorRes]) => {
      if (costRes.data) setReport(costRes.data);
      if (vendorRes.data) setScorecards(vendorRes.data.vendors);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspaceId, isPremium]);

  if (!isPremium) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
      <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>Cost reporting available on Professional+</div>
      <div style={{ fontSize: 14, color: '#9B9490' }}>Upgrade your plan to access cost breakdowns by property, category, provider, and time period.</div>
    </div>
  );

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading reports...</div>;
  if (!report) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Failed to load reports</div>;

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const views: { id: ReportView; label: string }[] = [
    { id: 'summary', label: 'Summary' }, { id: 'property', label: 'By Property' },
    { id: 'category', label: 'By Category' }, { id: 'vendor', label: 'By Provider' },
    { id: 'monthly', label: 'Monthly' }, { id: 'scorecards', label: 'Provider Scorecards' },
  ];

  const maxCost = (arr: Array<{ cost: number }>) => Math.max(...arr.map(a => a.cost), 1);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Cost Reports</h3>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: O, fontFamily: "'Fraunces', serif" }}>{fmt(report.total_cost)}</div>
          <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>Total Spend</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: D }}>{report.total_bookings}</div>
          <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>Total Jobs</div>
        </div>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E0DAD4', padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: G }}>{fmt(report.avg_cost)}</div>
          <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>Avg Cost / Job</div>
        </div>
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {views.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={{
            padding: '6px 16px', borderRadius: 100, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: view === v.id ? `2px solid ${O}` : '1px solid #E0DAD4',
            background: view === v.id ? `${O}08` : '#fff',
            color: view === v.id ? O : '#6B6560',
          }}>{v.label}</button>
        ))}
      </div>

      {/* By Property */}
      {view === 'property' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.by_property.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No cost data yet</div>
          ) : report.by_property.map(p => (
            <div key={p.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: D }}>{p.name}</span>
                <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: O }}>{fmt(p.cost)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: '#E0DAD4' }}>
                <div style={{ height: '100%', borderRadius: 3, background: O, width: `${(p.cost / maxCost(report.by_property)) * 100}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>{p.count} job{p.count !== 1 ? 's' : ''}</div>
            </div>
          ))}
        </div>
      )}

      {/* By Category */}
      {view === 'category' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.by_category.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No cost data yet</div>
          ) : report.by_category.map(c => (
            <div key={c.category} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: D, textTransform: 'capitalize' }}>{c.category.replace(/_/g, ' ')}</span>
                <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: O }}>{fmt(c.cost)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: '#E0DAD4' }}>
                <div style={{ height: '100%', borderRadius: 3, background: G, width: `${(c.cost / maxCost(report.by_category)) * 100}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>{c.count} job{c.count !== 1 ? 's' : ''} · {Math.round((c.cost / report.total_cost) * 100)}% of total</div>
            </div>
          ))}
        </div>
      )}

      {/* By Vendor */}
      {view === 'vendor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.by_vendor.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No cost data yet</div>
          ) : report.by_vendor.map(v => (
            <div key={v.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', padding: '14px 18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: D }}>{v.name}</span>
                <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: O }}>{fmt(v.cost)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: '#E0DAD4' }}>
                <div style={{ height: '100%', borderRadius: 3, background: '#7C3AED', width: `${(v.cost / maxCost(report.by_vendor)) * 100}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>{v.count} job{v.count !== 1 ? 's' : ''} · avg {fmt(v.cost / v.count)}/job</div>
            </div>
          ))}
        </div>
      )}

      {/* Monthly */}
      {view === 'monthly' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {report.by_month.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No cost data yet</div>
          ) : report.by_month.map(m => {
            const [year, month] = m.month.split('-');
            const label = new Date(+year, +month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            return (
              <div key={m.month} style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: D }}>{label}</span>
                  <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18, color: O }}>{fmt(m.cost)}</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: '#E0DAD4' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: '#2563EB', width: `${(m.cost / maxCost(report.by_month)) * 100}%`, transition: 'width 0.5s' }} />
                </div>
                <div style={{ fontSize: 12, color: '#9B9490', marginTop: 6 }}>{m.count} job{m.count !== 1 ? 's' : ''}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vendor Scorecards */}
      {view === 'scorecards' && (
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
      )}

      {/* Summary — line items */}
      {view === 'summary' && (
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: D, marginBottom: 10 }}>Recent Jobs</div>
          {report.line_items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: '#9B9490', fontSize: 14 }}>No booked jobs yet — costs appear when providers are booked.</div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E0DAD4', overflow: 'hidden' }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: W, borderBottom: '1px solid #E0DAD4' }}>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9B9490', fontSize: 12 }}>Date</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9B9490', fontSize: 12 }}>Property</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9B9490', fontSize: 12 }}>Category</th>
                    <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, color: '#9B9490', fontSize: 12 }}>Provider</th>
                    <th style={{ textAlign: 'right', padding: '10px 14px', fontWeight: 600, color: '#9B9490', fontSize: 12 }}>Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {report.line_items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                      <td style={{ padding: '10px 14px', color: '#6B6560' }}>{new Date(item.confirmedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                      <td style={{ padding: '10px 14px', color: D, fontWeight: 500 }}>{item.propertyName}</td>
                      <td style={{ padding: '10px 14px', color: '#6B6560', textTransform: 'capitalize' }}>{item.category?.replace(/_/g, ' ') ?? '-'}</td>
                      <td style={{ padding: '10px 14px', color: '#6B6560' }}>{item.providerName}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: O }}>{item.quotedPrice ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
