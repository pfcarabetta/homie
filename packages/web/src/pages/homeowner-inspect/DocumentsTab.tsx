export default function DocumentsTab() {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Documents</h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Your inspection PDFs, quotes, receipts, and warranties in one place</p>
        </div>
        <button style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', background: '#2563EB', color: '#fff',
          cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M4 10h12"/></svg>
          Upload Document
        </button>
      </div>

      {/* Category filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['All', 'Inspection Reports', 'Quotes', 'Receipts', 'Warranties'].map(label => (
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
        <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCC1'}</div>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
          Your document vault is empty
        </h3>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: 0, maxWidth: 440, marginInline: 'auto' }}>
          Inspection PDFs will be stored here automatically when you upload reports. You can also add repair receipts, warranty documents, and quote PDFs.
        </p>
      </div>
    </div>
  );
}
