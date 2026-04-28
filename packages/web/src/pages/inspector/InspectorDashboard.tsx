import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { inspectorService, type InspectionReport, type DashboardMetrics } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  processing: { bg: '#FFF3E8', text: O },
  ready: { bg: '#E8F5E9', text: G },
  sent: { bg: '#E3F2FD', text: '#1565C0' },
  active: { bg: '#E3F2FD', text: '#1565C0' },
  completed: { bg: '#F5F0EB', text: '#9B9490' },
};

function formatCents(cents: number): string {
  if (cents >= 1_000_000) return `$${(cents / 100_000_000).toFixed(1)}M`;
  if (cents >= 100_000) return `$${Math.round(cents / 100_000)}k`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDelta(current: number, previous: number): { label: string; positive: boolean } | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return { label: `+${current} vs last month`, positive: true };
  const diff = current - previous;
  if (diff === 0) return { label: 'Same as last month', positive: true };
  const pct = Math.round((diff / previous) * 100);
  return { label: `${diff > 0 ? '+' : ''}${pct}% vs last month`, positive: diff > 0 };
}

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string | null;
  delta?: { label: string; positive: boolean } | null;
  color: string;
}

function KpiCard({ label, value, sub, delta, color }: KpiCardProps) {
  return (
    <div style={{
      background: 'var(--ip-card)',
      borderRadius: 14,
      border: '1px solid var(--ip-border)',
      padding: '18px 20px',
      transition: 'border-color 0.15s, box-shadow 0.15s, transform 0.15s',
    }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = color;
        e.currentTarget.style.boxShadow = `0 4px 16px ${color}1A`;
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--ip-border)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ip-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 32, fontWeight: 700, color, marginBottom: 4, lineHeight: 1.1 }}>
        {value}
      </div>
      {(sub || delta) && (
        <div style={{ fontSize: 12, color: 'var(--ip-subtle)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {delta && (
            <span style={{ color: delta.positive ? G : '#9B9490', fontWeight: 600 }}>
              {delta.label}
            </span>
          )}
          {sub && <span>{sub}</span>}
        </div>
      )}
    </div>
  );
}

interface SparklineProps {
  data: Array<{ weekStart: string; count: number }>;
}

/** SVG bar chart of report uploads per week (last 8 weeks). Height is
 *  fixed; bars fill the width responsively. Hover shows the exact count
 *  via title attribute. Renders nothing if all weeks are zero. */
function WeeklySparkline({ data }: SparklineProps) {
  const max = Math.max(...data.map(d => d.count), 1);
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div style={{
      background: 'var(--ip-card)', border: '1px solid var(--ip-border)',
      borderRadius: 14, padding: '18px 20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ip-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
            Reports — last 8 weeks
          </div>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: 'var(--ip-text)' }}>
            {total} <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ip-subtle)' }}>total</span>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
        {data.map((d, i) => {
          const heightPct = (d.count / max) * 100;
          const isLast = i === data.length - 1;
          return (
            <div key={d.weekStart} title={`${d.count} report${d.count === 1 ? '' : 's'} — week of ${new Date(d.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 4, height: '100%', justifyContent: 'flex-end', cursor: 'help' }}>
              <div style={{
                background: isLast ? O : `${O}66`,
                borderRadius: 4,
                height: `${Math.max(heightPct, 4)}%`,
                transition: 'background 0.15s',
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: 'var(--ip-subtle)' }}>
        <span>{new Date(data[0]?.weekStart ?? Date.now()).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span>This week</span>
      </div>
    </div>
  );
}

export default function InspectorDashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [metricsRes, reportsRes] = await Promise.all([
          inspectorService.getDashboardMetrics(),
          inspectorService.listReports(),
        ]);
        if (metricsRes.data) setMetrics(metricsRes.data);
        if (reportsRes.data) setReports(reportsRes.data.slice(0, 5));
      } catch {
        // silently fail — empty state covers it
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const reportsDelta = metrics
    ? formatDelta(metrics.reportsThisMonth.count, metrics.reportsThisMonth.lastMonth)
    : null;

  const quoteValueLabel = metrics
    ? metrics.totalQuoteValueThisMonth.lowCents === 0 && metrics.totalQuoteValueThisMonth.highCents === 0
      ? '$0'
      : `${formatCents(metrics.totalQuoteValueThisMonth.lowCents)}–${formatCents(metrics.totalQuoteValueThisMonth.highCents)}`
    : '—';

  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: 'var(--ip-text)', margin: '0 0 24px' }}>
          Dashboard
        </h1>
        <div style={{ color: 'var(--ip-subtle)', fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: 'var(--ip-text)', margin: '0 0 24px' }}>
        Dashboard
      </h1>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
        <KpiCard
          label="Est. earnings"
          value={metrics ? formatCents(metrics.estimatedEarningsThisMonthCents) : '—'}
          sub="this month · retail − wholesale"
          color={G}
        />
        <KpiCard
          label="Reports this month"
          value={String(metrics?.reportsThisMonth.count ?? 0)}
          delta={reportsDelta}
          sub={metrics ? `${metrics.reportsThisMonth.lastMonth} last month` : null}
          color={O}
        />
        <KpiCard
          label="Items extracted"
          value={String(metrics?.itemsExtractedThisMonth ?? 0)}
          sub="this month"
          color="var(--ip-text)"
        />
        <KpiCard
          label="Quote value generated"
          value={quoteValueLabel}
          sub="AI estimates this month"
          color="#1565C0"
        />
        <KpiCard
          label="Items dispatched"
          value={String(metrics?.itemsDispatchedThisMonth ?? 0)}
          sub="this month"
          color="#7C3AED"
        />
      </div>

      {/* Weekly trend */}
      {metrics && metrics.weeklyReports.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <WeeklySparkline data={metrics.weeklyReports} />
        </div>
      )}

      {/* Recent Reports */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: 'var(--ip-text)', margin: 0 }}>
          Recent reports
        </h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            onClick={() => navigate('/inspector/reports')}
            style={{
              background: 'none', border: 'none', color: O, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            View all
          </button>
          <button
            onClick={() => navigate('/inspector/reports/upload')}
            style={{
              padding: '8px 16px', background: O, color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Upload report
          </button>
        </div>
      </div>

      {reports.length === 0 ? (
        <div style={{
          background: 'var(--ip-card)', borderRadius: 14, border: '1px solid var(--ip-border)',
          padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: 'var(--ip-subtle)', marginBottom: 16 }}>
            No reports yet. Upload your first inspection report to get started.
          </div>
          <button
            onClick={() => navigate('/inspector/reports/upload')}
            style={{
              padding: '10px 24px', background: O, color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Upload report
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {reports.map(report => {
            const statusStyle = STATUS_COLORS[report.status] ?? STATUS_COLORS.processing;
            return (
              <div
                key={report.id}
                onClick={() => navigate(`/inspector/reports/${report.id}`)}
                style={{
                  background: 'var(--ip-card)', borderRadius: 14, border: '1px solid var(--ip-border)',
                  padding: '16px 20px',
                  display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                  e.currentTarget.style.borderColor = '#D0CAC4';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'var(--ip-border)';
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ip-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {report.propertyAddress}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                      background: statusStyle.bg, color: statusStyle.text, whiteSpace: 'nowrap',
                    }}>
                      {report.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ip-subtle)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{formatDate(report.inspectionDate)}</span>
                    <span>{report.clientName}</span>
                    <span>{report.itemCount} items</span>
                  </div>
                </div>
                {report.estimatedEarnings > 0 && (
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: G, lineHeight: 1.1 }}>
                      {formatCents(report.estimatedEarnings * 100)}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ip-subtle)', marginTop: 2 }}>est. earnings</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
