import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { inspectorService, type InspectionReport } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  processing: { bg: '#FFF3E8', text: O },
  ready: { bg: '#E8F5E9', text: G },
  sent: { bg: '#E3F2FD', text: '#1565C0' },
  active: { bg: '#E3F2FD', text: '#1565C0' },
  completed: { bg: '#F5F0EB', text: '#9B9490' },
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'pre-purchase': { bg: '#E3F2FD', text: '#1565C0' },
  'pre-listing': { bg: '#FFF3E8', text: O },
  annual: { bg: '#E8F5E9', text: G },
  warranty: { bg: '#F3E8FF', text: '#7C3AED' },
};

const TABS = ['all', 'processing', 'active', 'completed'] as const;
type TabFilter = typeof TABS[number];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InspectorReports() {
  const navigate = useNavigate();
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await inspectorService.listReports(activeTab === 'all' ? undefined : activeTab);
        if (res.data) setReports(res.data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [activeTab]);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: 0 }}>
          Reports
        </h1>
        <button
          onClick={() => navigate('/inspector/reports/upload')}
          style={{
            padding: '10px 20px', background: O, color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Upload report
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #E0DAD4', paddingBottom: 0 }}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setExpandedId(null); }}
            style={{
              padding: '10px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab ? `2px solid ${O}` : '2px solid transparent',
              color: activeTab === tab ? O : '#9B9490',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              textTransform: 'capitalize',
              transition: 'color 0.15s',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: '#9B9490', fontSize: 14, padding: 20 }}>Loading reports...</div>
      ) : reports.length === 0 ? (
        <div style={{
          background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: '#9B9490' }}>No reports found.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map(report => {
            const statusStyle = STATUS_COLORS[report.status] ?? STATUS_COLORS.processing;
            const typeStyle = TYPE_COLORS[report.inspectionType] ?? { bg: '#F5F0EB', text: '#6B6560' };
            const isExpanded = expandedId === report.id;

            return (
              <div key={report.id} style={{
                background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', overflow: 'hidden',
              }}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                  style={{
                    padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = '#FAFAF8'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = '#ffffff'; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: D }}>
                        {report.propertyAddress}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                        background: typeStyle.bg, color: typeStyle.text, whiteSpace: 'nowrap',
                      }}>
                        {report.inspectionType}
                      </span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                        background: statusStyle.bg, color: statusStyle.text, whiteSpace: 'nowrap',
                      }}>
                        {report.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#9B9490', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>{formatDate(report.inspectionDate)}</span>
                      <span>{report.clientName}</span>
                      <span>{report.itemCount} items ({report.dispatchedCount} dispatched)</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: G }}>
                      {formatCurrency(report.earnings)}
                    </div>
                  </div>
                  <svg
                    width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="#9B9490" strokeWidth="1.5" strokeLinecap="round"
                    style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
                  >
                    <path d="M4 6l4 4 4-4" />
                  </svg>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 20px 16px', borderTop: '1px solid #E0DAD4' }}>
                    <div style={{ padding: '12px 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 12, color: '#6B6560' }}>
                        <strong>Client:</strong> {report.clientName} {report.clientEmail ? `(${report.clientEmail})` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: '#6B6560' }}>
                        <strong>Location:</strong> {report.propertyCity}, {report.propertyState} {report.propertyZip}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => navigate(`/inspector/reports/${report.id}`)}
                        style={{
                          padding: '8px 16px', background: O, color: '#fff', border: 'none',
                          borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        View details
                      </button>
                    </div>
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
