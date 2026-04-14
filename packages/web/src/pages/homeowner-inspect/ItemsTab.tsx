import { SEVERITY_COLORS, SEVERITY_LABELS, CATEGORY_ICONS, CATEGORY_LABELS } from './constants';

export default function ItemsTab() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>All Items</h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Browse, filter, and dive deeper into every inspection item</p>
      </div>

      {/* Filter bar placeholder */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap',
      }}>
        {['All', 'Safety Hazard', 'Urgent', 'Recommended', 'Monitor'].map(label => (
          <button key={label} style={{
            padding: '6px 14px', borderRadius: 100, border: '1px solid var(--bp-border)',
            background: label === 'All' ? '#2563EB' : 'var(--bp-card)',
            color: label === 'All' ? '#fff' : 'var(--bp-muted)',
            cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Empty state */}
      <div style={{
        background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
        padding: '60px 40px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDD0D'}</div>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
          No items to display
        </h3>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: 0, maxWidth: 400, marginInline: 'auto' }}>
          Items will appear here after you upload an inspection report. Each item includes AI-powered analysis, cost estimates, and deep-dive recommendations.
        </p>
      </div>
    </div>
  );
}
