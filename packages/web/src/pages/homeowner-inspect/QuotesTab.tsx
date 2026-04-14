import { G } from './constants';

export default function QuotesTab() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Quotes</h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Track dispatch status and compare quotes from providers</p>
      </div>

      {/* Status tabs placeholder */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['All', 'Dispatched', 'Quotes Received', 'Booked', 'Completed'].map(label => (
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
        <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCB0'}</div>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
          No quotes yet
        </h3>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: 0, maxWidth: 400, marginInline: 'auto' }}>
          Dispatch inspection items to our provider network to receive competitive quotes. Compare prices, ratings, and availability side by side.
        </p>
      </div>
    </div>
  );
}
