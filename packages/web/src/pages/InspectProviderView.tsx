import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const SEVERITY_COLORS: Record<string, string> = {
  safety_hazard: '#E24B4A', urgent: '#E24B4A', recommended: '#EF9F27', monitor: '#9B9490', informational: '#D3CEC9',
};
const SEVERITY_LABELS: Record<string, string> = {
  safety_hazard: 'Safety Hazard', urgent: 'Urgent', recommended: 'Recommended', monitor: 'Monitor', informational: 'Info',
};

interface ProviderReportData {
  jobId: string;
  category: string;
  budget: string;
  property: {
    address: string; city: string; state: string; zip: string;
    inspectionDate: string; inspectionType: string;
  };
  items: Array<{
    id: string; title: string; description: string | null; severity: string;
    category: string; location: string | null; photoDescriptions: string[];
    costEstimateMin: number | null; costEstimateMax: number | null;
  }>;
}

function formatCurrency(amount: number): string {
  if (!amount || isNaN(amount)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function InspectProviderView() {
  const { providerToken } = useParams<{ providerToken: string }>();
  const [data, setData] = useState<ProviderReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!providerToken) return;
    fetch(`${API_BASE}/api/v1/inspect/provider/${providerToken}`)
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Failed to load');
        setData(body.data);
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [providerToken]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ color: '#9B9490', fontSize: 14 }}>Loading report details...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: D, marginBottom: 8 }}>Report not found</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>{error ?? 'This link may have expired or is invalid.'}</div>
        </div>
      </div>
    );
  }

  const totalLow = data.items.reduce((s, i) => s + (i.costEstimateMin ?? 0), 0);
  const totalHigh = data.items.reduce((s, i) => s + (i.costEstimateMax ?? 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 60px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 28, color: O }}>homie</span>
            <span style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>inspect</span>
          </div>
          <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>Provider quote request</div>
        </div>

        {/* Property + Job info */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: D, marginBottom: 4, fontFamily: 'Fraunces, serif' }}>
            {data.property.address}
          </div>
          <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 8 }}>
            {data.property.city}, {data.property.state} {data.property.zip}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#9B9490' }}>
            <span>Inspected {formatDate(data.property.inspectionDate)}</span>
            <span>|</span>
            <span style={{ textTransform: 'capitalize' }}>{data.category}</span>
            <span>|</span>
            <span>{data.items.length} item{data.items.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Summary card */}
        <div style={{
          background: `linear-gradient(135deg, ${D} 0%, #3D3936 100%)`, borderRadius: 14, padding: 20, marginBottom: 20, color: '#fff',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, textTransform: 'capitalize' }}>
            {data.category} — {data.items.length} item{data.items.length !== 1 ? 's' : ''}
          </div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {totalLow > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Estimated range</div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700 }}>
                  {formatCurrency(totalLow)} – {formatCurrency(totalHigh)}
                </div>
              </div>
            )}
            <div>
              <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Budget</div>
              <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700 }}>
                {data.budget}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, fontSize: 13, color: '#9B9490', lineHeight: 1.6 }}>
            Please review each item below and reply to the text with your quote for all {data.items.length} {data.category} items.
          </div>
        </div>

        {/* Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.items.map((item, idx) => {
            const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
            return (
              <div key={item.id} style={{
                background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#9B9490', minWidth: 20 }}>#{idx + 1}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
                    background: `${sevColor}18`, color: sevColor,
                  }}>
                    {SEVERITY_LABELS[item.severity] ?? item.severity}
                  </span>
                  {item.location && (
                    <span style={{ fontSize: 11, color: '#9B9490' }}>{item.location}</span>
                  )}
                </div>

                <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 6 }}>
                  {item.title}
                </div>

                {item.description && (
                  <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 10 }}>
                    {item.description}
                  </div>
                )}

                {/* Photo descriptions */}
                {item.photoDescriptions.length > 0 && (
                  <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {item.photoDescriptions.map((desc, pi) => (
                      <div key={pi} style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        fontSize: 12, color: '#6B6560', background: '#F5F0EB',
                        padding: '8px 12px', borderRadius: 8, lineHeight: 1.5,
                      }}>
                        <span style={{ fontSize: 14, lineHeight: '18px' }}>📷</span>
                        <span style={{ fontStyle: 'italic' }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cost estimate */}
                {item.costEstimateMin != null && item.costEstimateMin > 0 && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 13, color: D, fontWeight: 500,
                    background: W, padding: '4px 10px', borderRadius: 6,
                  }}>
                    Est. {formatCurrency(item.costEstimateMin)}
                    {item.costEstimateMax != null && item.costEstimateMax > 0 && ` – ${formatCurrency(item.costEstimateMax)}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer CTA */}
        <div style={{
          background: '#fff', borderRadius: 14, border: `1px solid ${O}40`, padding: 20, marginTop: 20, textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 8 }}>
            Ready to quote?
          </div>
          <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6 }}>
            Reply to the Homie text message with your quote for all {data.items.length} {data.category} items listed above.
            Include your total price and earliest availability.
          </div>
        </div>

        {/* Powered by */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#9B9490' }}>
          Powered by <a href="https://homiepro.ai" style={{ color: O, textDecoration: 'none', fontWeight: 600 }}>Homie</a>
        </div>
      </div>
    </div>
  );
}
