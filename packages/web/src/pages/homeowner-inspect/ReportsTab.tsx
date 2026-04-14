import { O, D, formatDate } from './constants';
import type { Tab } from './constants';

interface ReportsTabProps {
  onNavigate: (tab: Tab) => void;
}

export default function ReportsTab({ onNavigate }: ReportsTabProps) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>My Reports</h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Upload and manage your inspection reports</p>
        </div>
        <button style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', background: '#2563EB', color: '#fff',
          cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M4 10h12"/></svg>
          Upload Report
        </button>
      </div>

      {/* Empty state */}
      <div style={{
        background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
        padding: '60px 40px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCC4'}</div>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
          No reports yet
        </h3>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 20px', maxWidth: 400, marginInline: 'auto' }}>
          Upload your home inspection report PDF and our AI will parse every item, categorize by severity, and estimate repair costs.
        </p>
        <button style={{
          padding: '12px 28px', borderRadius: 10, border: 'none', background: '#2563EB', color: '#fff',
          cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
        }}>
          Upload Your First Report
        </button>
      </div>
    </div>
  );
}
