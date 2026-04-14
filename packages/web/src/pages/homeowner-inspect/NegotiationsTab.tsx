import { O, G, D } from './constants';

export default function NegotiationsTab() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Negotiations</h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Build repair requests and track seller concessions</p>
      </div>

      {/* Feature preview cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 22 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>{'\uD83D\uDCC3'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 6px' }}>Repair Request Builder</h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', margin: 0 }}>
            Generate a professional, itemized repair request document to present to sellers.
          </p>
        </div>
        <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 22 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>{'\uD83E\uDDEE'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 6px' }}>Credit Calculator</h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', margin: 0 }}>
            Model different negotiation scenarios by toggling items on and off to calculate credit asks.
          </p>
        </div>
        <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 22 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>{'\u2705'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 6px' }}>Concession Tracker</h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', margin: 0 }}>
            Track what the seller agreed to, escrow holdbacks, and repair credits at closing.
          </p>
        </div>
      </div>

      {/* Empty state */}
      <div style={{
        background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
        padding: '48px 40px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83E\uDD1D'}</div>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
          Ready to negotiate
        </h3>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 20px', maxWidth: 420, marginInline: 'auto' }}>
          Upload an inspection report and get quotes to build a data-backed repair request. Use real quotes as leverage in your negotiations.
        </p>
        <button style={{
          padding: '12px 28px', borderRadius: 10, border: 'none', background: '#2563EB', color: '#fff',
          cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
        }}>
          Build Repair Request
        </button>
      </div>
    </div>
  );
}
