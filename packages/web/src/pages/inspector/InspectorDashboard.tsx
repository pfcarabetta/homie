import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { inspectorService, type InspectionReport, type EarningsSummary } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';

const SEVERITY_COLORS: Record<string, string> = {
  safety_hazard: '#E24B4A',
  urgent: '#E24B4A',
  recommended: '#EF9F27',
  monitor: '#9B9490',
  informational: '#D3CEC9',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  processing: { bg: '#FFF3E8', text: O },
  ready: { bg: '#E8F5E9', text: G },
  sent: { bg: '#E3F2FD', text: '#1565C0' },
  active: { bg: '#E3F2FD', text: '#1565C0' },
  completed: { bg: '#F5F0EB', text: '#9B9490' },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InspectorDashboard() {
  const navigate = useNavigate();
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [earningsRes, reportsRes] = await Promise.all([
          inspectorService.getEarningsSummary(),
          inspectorService.listReports(),
        ]);
        if (earningsRes.data) setEarnings(earningsRes.data);
        if (reportsRes.data) setReports(reportsRes.data.slice(0, 5));
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const totalReports = reports.length;
  const dispatchRate = reports.length > 0
    ? Math.round((reports.filter(r => r.dispatchedCount > 0).length / reports.length) * 100)
    : 0;

  const kpiCards = [
    {
      label: "This month's earnings",
      value: formatCurrency(earnings?.currentMonth ?? 0),
      sub: `Last month: ${formatCurrency(earnings?.lastMonth ?? 0)}`,
      color: G,
    },
    {
      label: 'Reports uploaded',
      value: String(totalReports),
      sub: 'Total reports',
      color: D,
    },
    {
      label: 'Client dispatch rate',
      value: `${dispatchRate}%`,
      sub: 'Items dispatched by clients',
      color: O,
    },
  ];

  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: '0 0 24px' }}>
          Dashboard
        </h1>
        <div style={{ color: '#9B9490', fontSize: 14 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: '0 0 24px' }}>
        Dashboard
      </h1>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        {kpiCards.map(card => (
          <div key={card.label} style={{
            background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {card.label}
            </div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 32, fontWeight: 700, color: card.color, marginBottom: 4 }}>
              {card.value}
            </div>
            <div style={{ fontSize: 12, color: '#9B9490' }}>
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Reports */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, margin: 0 }}>
          Recent Reports
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
          background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 40,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: '#9B9490', marginBottom: 16 }}>No reports yet. Upload your first inspection report to get started.</div>
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
                  background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: '16px 20px',
                  display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
                  transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {report.propertyAddress}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                      background: statusStyle.bg, color: statusStyle.text, whiteSpace: 'nowrap',
                    }}>
                      {report.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#9B9490', display: 'flex', gap: 12 }}>
                    <span>{formatDate(report.inspectionDate)}</span>
                    <span>{report.clientName}</span>
                    <span>{report.itemCount} items</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: G }}>
                    {formatCurrency(report.earnings)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
