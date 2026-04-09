import { useState, useEffect } from 'react';
import { O, G, D, W } from './constants';
import { businessService } from '@/services/api';

/* ── Report Types ────────────────────────────────────────────────────── */

type ReportView = 'summary' | 'property' | 'category' | 'vendor' | 'monthly';

/* ── Reports Tab ──────────────────────────────────────────────────── */

export default function ReportsTab({ workspaceId, plan }: { workspaceId: string; plan: string }) {
  const [report, setReport] = useState<{
    total_cost: number; total_bookings: number; avg_cost: number;
    by_property: Array<{ id: string; name: string; cost: number; count: number }>;
    by_category: Array<{ category: string; cost: number; count: number }>;
    by_vendor: Array<{ id: string; name: string; cost: number; count: number }>;
    by_month: Array<{ month: string; cost: number; count: number }>;
    line_items: Array<{ jobId: string; propertyName: string; category: string; providerName: string; quotedPrice: string | null; cost: number; confirmedAt: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ReportView>('summary');

  const isPremium = ['professional', 'business', 'enterprise'].includes(plan);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    businessService.getCostReport(workspaceId).then(costRes => {
      if (costRes.data) setReport(costRes.data);
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
    { id: 'monthly', label: 'Monthly' },
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
