import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { inspectorService, type Earning, type EarningsSummary } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';

const TIER_LABELS: Record<string, string> = {
  essential: 'Essential',
  professional: 'Professional',
  premium: 'Premium',
};
const TIER_BG: Record<string, string> = {
  essential: '#F5F0EB',
  professional: '#E3F2FD',
  premium: '#F3E8FF',
};
const TIER_FG: Record<string, string> = {
  essential: '#6B6560',
  professional: '#1565C0',
  premium: '#7C3AED',
};

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);
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
    { label: 'This month', value: formatCents(summary?.currentMonthCents ?? 0), color: G },
    { label: 'Last month', value: formatCents(summary?.lastMonthCents ?? 0), color: D },
    { label: 'Lifetime', value: formatCents(summary?.lifetimeCents ?? 0), color: O },
  ];

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: 'var(--ip-text)', margin: '0 0 8px' }}>
        Earnings
      </h1>
      <div style={{ fontSize: 13, color: 'var(--ip-subtle)', marginBottom: 24, lineHeight: 1.5 }}>
        Estimated earnings = your retail price for the tier minus the Homie wholesale cost.{' '}
        <Link to="/inspector/settings" style={{ color: O, fontWeight: 600, textDecoration: 'none' }}>
          Set your retail pricing →
        </Link>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 32 }}>
        {summaryCards.map(card => (
          <div key={card.label} style={{
            background: 'var(--ip-card)', borderRadius: 14, border: '1px solid var(--ip-border)', padding: '18px 20px',
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ip-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              {card.label}
            </div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 32, fontWeight: 700, color: card.color, lineHeight: 1.1 }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Per-report ledger */}
      <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: 'var(--ip-text)', marginBottom: 16 }}>
        Per-report breakdown
      </h2>

      {loading ? (
        <div style={{ color: 'var(--ip-subtle)', fontSize: 14 }}>Loading earnings...</div>
      ) : earnings.length === 0 ? (
        <div style={{
          background: 'var(--ip-card)', borderRadius: 14, border: '1px solid var(--ip-border)', padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: 'var(--ip-subtle)' }}>
            No paid reports yet. Upload your first inspection to start earning.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {earnings.map(earning => {
            const tier = earning.pricingTier ?? 'essential';
            const tierLabel = TIER_LABELS[tier] ?? tier;
            return (
              <Link
                key={earning.id}
                to={`/inspector/reports/${earning.reportId}`}
                style={{
                  background: 'var(--ip-card)', borderRadius: 14, border: '1px solid var(--ip-border)',
                  padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 16,
                  textDecoration: 'none', color: 'inherit', cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#D0CAC4';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--ip-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                  background: TIER_BG[tier], color: TIER_FG[tier], whiteSpace: 'nowrap',
                }}>
                  {tierLabel}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ip-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {earning.propertyAddress}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ip-subtle)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <span>{earning.clientName}</span>
                    <span>{formatDate(earning.createdAt)}</span>
                    <span>Wholesale {formatCents(earning.wholesaleCents)}</span>
                  </div>
                </div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: G, flexShrink: 0 }}>
                  {formatCents(earning.estimatedEarningsCents)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
