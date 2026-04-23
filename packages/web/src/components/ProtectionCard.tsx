import { useEffect, useState } from 'react';
import { protectionService, type ProtectionLookupResult } from '@/services/api';

/**
 * Inline chat card that surfaces recall + warranty information for an
 * appliance whose brand + model have been identified this session
 * (either from Home IQ correlation or a fresh label scan).
 *
 * Rendering priority:
 *   1. Active recall → orange-bordered "⚠️ Active recall" card with a
 *      link to the official SaferProducts.gov page
 *   2. Still-active warranty → green-bordered "✓ Likely under warranty"
 *      card with coverage description
 *   3. Neither → renders nothing (don't clutter the chat)
 *
 * Self-fetches on mount using a memoized key so remounting with the
 * same brand+model doesn't re-hit the backend.
 */

const O = '#E8632B', G = '#1B9E77', D = '#2D2926';
const DIM = '#6B6560';
const BORDER = 'rgba(0,0,0,.08)';

interface ProtectionCardProps {
  brand: string;
  modelNumber: string | null;
  /** Inventory itemType ('dishwasher', 'water_heater'…). Optional —
   *  warranty estimate needs it; recalls don't. */
  category?: string | null;
  /** ISO date of manufacture when known. Enables the warranty expiry
   *  calculation. */
  manufactureDate?: string | null;
  /** Stable id used to dedupe renders; usually brand|model. */
  keyForDedupe: string;
}

export default function ProtectionCard({
  brand, modelNumber, category, manufactureDate, keyForDedupe,
}: ProtectionCardProps) {
  const [result, setResult] = useState<ProtectionLookupResult | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    protectionService.check({ brand, modelNumber, category, manufactureDate })
      .then(res => {
        if (cancelled) return;
        if (res.data) setResult(res.data);
      })
      .catch(() => { /* silent — just don't show the card */ });
    return () => { cancelled = true; };
    // keyForDedupe makes the effect re-run only when the item changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyForDedupe]);

  if (dismissed || !result) return null;

  const recall = result.recalls[0] ?? null; // show the first (most recent)
  const warranty = result.warranty;
  const hasRecall = !!recall;
  const hasActiveWarranty = warranty?.stillActive === true;

  if (!hasRecall && !hasActiveWarranty) return null;

  return (
    <div style={{
      marginLeft: 42, marginBottom: 16,
      padding: 14, background: '#fff',
      border: `1.5px solid ${hasRecall ? O : G}66`,
      borderRadius: 14, animation: 'fadeSlide 0.3s ease',
      boxShadow: `0 8px 24px -16px ${hasRecall ? O : G}66`,
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 9,
          background: `${hasRecall ? O : G}14`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18, flexShrink: 0,
        }}>{hasRecall ? '⚠️' : '✓'}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {hasRecall ? (
            <>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700, color: O, marginBottom: 3 }}>
                Active recall · CPSC
              </div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14.5, fontWeight: 700, color: D, lineHeight: 1.3 }}>
                {recall.title}
              </div>
              {recall.hazard && (
                <div style={{ fontSize: 12, color: DIM, marginTop: 6, lineHeight: 1.5 }}>
                  <strong style={{ color: D }}>Hazard:</strong> {recall.hazard}
                </div>
              )}
              {recall.remedy && (
                <div style={{ fontSize: 12, color: DIM, marginTop: 4, lineHeight: 1.5 }}>
                  <strong style={{ color: D }}>Remedy:</strong> {recall.remedy}
                </div>
              )}
              <div style={{ fontSize: 12, color: DIM, marginTop: 8, lineHeight: 1.5 }}>
                Your {brand}{modelNumber ? ` ${modelNumber}` : ''} may qualify for a free fix — call the manufacturer before paying for a repair.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <a href={recall.url} target="_blank" rel="noopener noreferrer" style={primaryLink}>
                  See official recall notice →
                </a>
                <button onClick={() => setDismissed(true)} style={dismissBtn}>Dismiss</button>
              </div>
            </>
          ) : warranty && (
            <>
              <div style={{ fontSize: 10, fontFamily: "'DM Mono',monospace", letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 700, color: G, marginBottom: 3 }}>
                Likely still under warranty
              </div>
              <div style={{ fontFamily: "'Fraunces',serif", fontSize: 14.5, fontWeight: 700, color: D, lineHeight: 1.3 }}>
                {brand}{modelNumber ? ` ${modelNumber}` : ''} — check before paying for repair
              </div>
              <div style={{ fontSize: 12.5, color: D, marginTop: 6, lineHeight: 1.5 }}>
                {warranty.description}
              </div>
              {warranty.expiresAt && (
                <div style={{ fontSize: 12, color: DIM, marginTop: 4 }}>
                  Estimated expiry: <strong style={{ color: D }}>{formatExpiry(warranty.expiresAt)}</strong>
                </div>
              )}
              <div style={{ fontSize: 11, color: DIM, marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
                Estimate based on typical manufacturer coverage — always verify with your paperwork or the brand's support line.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={() => setDismissed(true)} style={dismissBtn}>Got it</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatExpiry(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
  } catch { return iso; }
}

const primaryLink: React.CSSProperties = {
  padding: '8px 14px', background: O, color: '#fff',
  borderRadius: 10, fontSize: 12.5, fontWeight: 600,
  textDecoration: 'none', fontFamily: "'DM Sans',sans-serif",
};

const dismissBtn: React.CSSProperties = {
  padding: '8px 14px', background: 'transparent', color: DIM,
  border: `1px solid ${BORDER}`, borderRadius: 10, fontSize: 12.5, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
};
