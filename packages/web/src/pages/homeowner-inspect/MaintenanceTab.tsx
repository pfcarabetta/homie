export default function MaintenanceTab() {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Maintenance</h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Projected maintenance timeline and seasonal reminders</p>
      </div>

      {/* Feature preview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 22 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>{'\uD83D\uDCC5'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 6px' }}>Maintenance Timeline</h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', margin: 0 }}>
            See when monitor items will need attention, projected costs, and recommended action dates.
          </p>
        </div>
        <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 22 }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>{'\uD83C\uDF41'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 6px' }}>Seasonal Reminders</h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', margin: 0 }}>
            Get timely reminders based on your inspection findings and your region's climate.
          </p>
        </div>
      </div>

      {/* Empty state */}
      <div style={{
        background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
        padding: '60px 40px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{'\u23F0'}</div>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
          No maintenance schedule yet
        </h3>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: 0, maxWidth: 400, marginInline: 'auto' }}>
          Your maintenance timeline will be built from inspection items marked as "monitor" and "informational". Upload a report to get started.
        </p>
      </div>
    </div>
  );
}
