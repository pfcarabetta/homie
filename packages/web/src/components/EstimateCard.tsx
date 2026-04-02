import { useState } from 'react';
import type { CostEstimate } from '@/services/api';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';

function formatCents(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function confidenceLabel(c: number): { label: string; color: string } {
  if (c >= 0.75) return { label: 'High confidence', color: G };
  if (c >= 0.50) return { label: 'Medium confidence', color: '#EF9F27' };
  return { label: 'Low confidence', color: '#9B9490' };
}

interface EstimateCardProps {
  estimate: CostEstimate;
  diyEstimate?: string;
}

export default function EstimateCard({ estimate, diyEstimate }: EstimateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const conf = confidenceLabel(estimate.confidence);

  return (
    <div style={{
      borderLeft: `4px solid ${O}`,
      background: W,
      borderRadius: '0 12px 12px 0',
      padding: '16px 18px',
      marginTop: 8,
      animation: 'dcFadeSlide 0.4s ease',
    }}>
      {/* Cost range */}
      <div style={{
        fontFamily: "'Fraunces', serif",
        fontWeight: 700,
        fontSize: 26,
        color: D,
        lineHeight: 1.2,
      }}>
        {formatCents(estimate.estimateLowCents)} &ndash; {formatCents(estimate.estimateHighCents)}
      </div>

      {/* Median */}
      <div style={{ fontSize: 14, color: '#6B6560', marginTop: 4 }}>
        Most likely: <strong style={{ color: D }}>{formatCents(estimate.estimateMedianCents)}</strong>
      </div>

      {/* DIY estimate if provided */}
      {diyEstimate && (
        <div style={{ fontSize: 13, color: G, fontWeight: 600, marginTop: 4 }}>
          DIY: {diyEstimate}
        </div>
      )}

      {/* Confidence bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <div style={{
          width: 80, height: 6, borderRadius: 3,
          background: 'rgba(0,0,0,0.06)', overflow: 'hidden',
        }}>
          <div style={{
            width: `${Math.round(estimate.confidence * 100)}%`,
            height: '100%',
            borderRadius: 3,
            background: conf.color,
            transition: 'width 0.4s ease',
          }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: conf.color }}>
          {conf.label}
        </span>
      </div>

      {/* Data source */}
      <div style={{ fontSize: 12, color: '#9B9490', marginTop: 8 }}>
        Based on {estimate.dataPointsUsed.toLocaleString()} {estimate.dataSourceLabel}
        {estimate.comparableRangeLabel ? ` in ${estimate.comparableRangeLabel}` : ''}
      </div>

      {/* Expandable details */}
      {estimate.adjustmentFactors.length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'none', border: 'none', padding: 0,
            fontSize: 12, fontWeight: 600, color: O,
            cursor: 'pointer', marginTop: 10, display: 'block',
          }}
        >
          {expanded ? 'Hide details \u25B2' : 'See details \u25BC'}
        </button>
      )}

      {expanded && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10,
          animation: 'dcFadeSlide 0.2s ease',
        }}>
          {estimate.adjustmentFactors.map((f, i) => (
            <span
              key={i}
              title={f.reason}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 100,
                fontSize: 11, fontWeight: 600, lineHeight: 1.4,
                background: f.direction === 'up' ? 'rgba(232,99,43,0.08)'
                  : f.direction === 'down' ? 'rgba(27,158,119,0.08)'
                  : 'rgba(0,0,0,0.04)',
                color: f.direction === 'up' ? O
                  : f.direction === 'down' ? G
                  : '#6B6560',
              }}
            >
              <span>{f.direction === 'up' ? '\u2191' : f.direction === 'down' ? '\u2193' : '\u2013'}</span>
              {f.name} {f.percentage}%
            </span>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <p style={{ fontSize: 11, color: '#C4BFBB', marginTop: 12, lineHeight: 1.4 }}>
        Actual quotes may vary based on on-site assessment
      </p>
    </div>
  );
}
