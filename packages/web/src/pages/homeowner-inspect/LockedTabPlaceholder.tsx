import type { Tab, Tier } from './constants';
import { TIER_LABEL, TIER_PRICE, tiersAtOrAbove } from './constants';

const ACCENT = '#2563EB';

interface Props {
  tabName: string;
  description: string;
  hasAnyReports: boolean;
  /** Minimum tier required to unlock this tab. */
  requiredTier: Tier;
  /** True when the user has paid reports but none meet the required tier. */
  hasUnderTierReport?: boolean;
  onNavigate: (tab: Tab) => void;
}

/**
 * Shown when a cross-report tab can't be opened because none of the user's
 * reports meet the required tier. Three modes:
 *   - No reports at all → "Upload one to get started"
 *   - Has reports but none paid → "Choose a tier"
 *   - Has paid reports, but on a tier that doesn't include this feature →
 *     "Upgrade to {Professional / Premium} to unlock"
 */
export default function LockedTabPlaceholder({
  tabName,
  description,
  hasAnyReports,
  requiredTier,
  hasUnderTierReport,
  onNavigate,
}: Props) {
  const eligibleTiers = tiersAtOrAbove(requiredTier);
  const lowestPrice = TIER_PRICE[requiredTier];

  // Phrase the tier list naturally: 3 tiers → "any paid tier"; 2 → "Professional or Premium"; 1 → "Premium"
  const tierPhrase =
    eligibleTiers.length === 3 ? 'any paid tier' :
    eligibleTiers.length === 2 ? `${TIER_LABEL[eligibleTiers[0]]} or ${TIER_LABEL[eligibleTiers[1]]}` :
    `${TIER_LABEL[requiredTier]} only`;

  let headline: string;
  let body: string;
  let cta: string;

  if (!hasAnyReports) {
    headline = 'Upload an inspection report to get started';
    body = 'Upload your first inspection report and choose a tier to unlock items, quotes, negotiations, and maintenance planning.';
    cta = 'Go to Reports';
  } else if (hasUnderTierReport) {
    headline = eligibleTiers.length === 1
      ? `${tabName} is a ${TIER_LABEL[requiredTier]}-only feature`
      : `${tabName} requires ${tierPhrase}`;
    body = `Your current report's tier doesn't include ${tabName}. Upgrade to ${TIER_LABEL[requiredTier]} (from $${lowestPrice}/report) to unlock.`;
    cta = `Upgrade to ${TIER_LABEL[requiredTier]}`;
  } else {
    headline = 'Unlock this with a paid tier';
    body = eligibleTiers.length === 3
      ? `${tabName} is available once you've chosen any paid tier for at least one of your reports.`
      : `${tabName} requires ${tierPhrase}. Open Reports and pick a plan.`;
    cta = 'Choose a tier';
  }

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
          {headline}
        </h3>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 auto', maxWidth: 480, lineHeight: 1.6 }}>
          {body}
        </p>
        <button
          onClick={() => onNavigate('reports')}
          style={{
            marginTop: 24, padding: '12px 28px', borderRadius: 100, border: 'none',
            background: ACCENT, color: '#fff', cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600,
          }}
        >
          {cta}
        </button>
      </div>
    </div>
  );
}
