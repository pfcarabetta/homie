import type { Tab } from './constants';

const ACCENT = '#2563EB';

interface Props {
  tabName: string;
  description: string;
  hasAnyReports: boolean;
  onNavigate: (tab: Tab) => void;
}

/**
 * Shown when a cross-report tab (Items / Quotes / Negotiations / Maintenance /
 * Documents) has no data because none of the user's reports have been paid for
 * yet. Routes them back to the Reports tab to choose a tier.
 */
export default function LockedTabPlaceholder({ tabName, description, hasAnyReports, onNavigate }: Props) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>
          {tabName}
        </h1>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>
          {description}
        </p>
      </div>

      <div style={{
        background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
        padding: '60px 40px', textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDD12'}</div>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
          {hasAnyReports ? 'Unlock this with a paid tier' : 'Upload an inspection report to get started'}
        </h3>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 auto', maxWidth: 460, lineHeight: 1.6 }}>
          {hasAnyReports
            ? `${tabName} is available once you've chosen a tier for at least one of your reports. Open Reports to pick a plan.`
            : 'Upload your first inspection report and choose a tier to unlock items, quotes, negotiations, and maintenance planning.'}
        </p>
        <button
          onClick={() => onNavigate('reports')}
          style={{
            marginTop: 24, padding: '12px 28px', borderRadius: 100, border: 'none',
            background: ACCENT, color: '#fff', cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600,
          }}
        >
          {hasAnyReports ? 'Choose a tier' : 'Go to Reports'}
        </button>
      </div>
    </div>
  );
}
