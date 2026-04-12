import { useState, useEffect } from 'react';
import { inspectorService, type Earning, type EarningsSummary } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';

const TYPE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  addon_fee: { label: 'Add-on Fee', bg: '#E3F2FD', color: '#1565C0' },
  referral: { label: 'Referral', bg: '#E8F5E9', color: G },
  lead_bonus: { label: 'Lead Bonus', bg: '#F3E8FF', color: '#7C3AED' },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function InspectorEarnings() {
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [earnings, setEarnings] = useState<Earning[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [summaryRes, earningsRes] = await Promise.all([
          inspectorService.getEarningsSummary(),
          inspectorService.getEarnings(),
        ]);
        if (summaryRes.data) setSummary(summaryRes.data);
        if (earningsRes.data) setEarnings(earningsRes.data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const summaryCards = [
    { label: 'This month', value: formatCurrency(summary?.currentMonth ?? 0), color: G },
    { label: 'Last month', value: formatCurrency(summary?.lastMonth ?? 0), color: D },
    { label: 'Lifetime', value: formatCurrency(summary?.lifetime ?? 0), color: O },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: '0 0 24px' }}>
        Earnings
      </h1>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        {summaryCards.map(card => (
          <div key={card.label} style={{
            background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20,
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#9B9490', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {card.label}
            </div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 32, fontWeight: 700, color: card.color }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Earnings list */}
      <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, marginBottom: 16 }}>
        History
      </h2>

      {loading ? (
        <div style={{ color: '#9B9490', fontSize: 14 }}>Loading earnings...</div>
      ) : earnings.length === 0 ? (
        <div style={{
          background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: '#9B9490' }}>No earnings yet. Upload your first report to start earning.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {earnings.map(earning => {
            const typeStyle = TYPE_STYLES[earning.type] ?? TYPE_STYLES.referral;
            return (
              <div key={earning.id} style={{
                background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: '14px 20px',
                display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                  background: typeStyle.bg, color: typeStyle.color, whiteSpace: 'nowrap',
                }}>
                  {typeStyle.label}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {earning.description}
                  </div>
                  <div style={{ fontSize: 12, color: '#9B9490' }}>
                    {formatDate(earning.createdAt)}
                  </div>
                </div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: G, flexShrink: 0 }}>
                  {formatCurrency(earning.amount)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
