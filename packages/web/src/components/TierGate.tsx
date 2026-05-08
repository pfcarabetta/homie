import type { CSSProperties, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * <TierGate> — Membership Phase 1, Session 5.
 *
 * Frontend mirror of `middleware/require-tier.ts`. Renders children if
 * the current homeowner is on the required tier or higher; otherwise
 * renders a locked state with an upgrade CTA.
 *
 * Tier order: free < plus < premier.
 *
 * Use cases:
 *   - Wrap a feature card to gate it (Health Score, Walkthrough button)
 *   - Wrap a whole page section that requires Plus+
 *   - Use `inline` for compact placeholder rendering inside a list
 *
 * The backend middleware is the security boundary; this component is
 * UX only. Don't trust it as the sole gate for sensitive features —
 * the backend `requireTier` returns 403 even if a clever user bypasses
 * the UI.
 */

export type MembershipTier = 'free' | 'plus' | 'premier';

const RANK: Record<MembershipTier, number> = {
  free: 0,
  plus: 1,
  premier: 2,
};

const C = {
  orange: '#E8632B',
  dark: '#2D2926',
  darkMid: '#4A4543',
  gray: '#9B9490',
  grayLight: '#D3CEC9',
  warm: '#F9F5F2',
};

const dm: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const fr: CSSProperties = { fontFamily: 'Fraunces, serif' };

function meetsTier(current: MembershipTier, required: MembershipTier): boolean {
  return RANK[current] >= RANK[required];
}

function isMembershipTier(value: string | null | undefined): value is MembershipTier {
  return value === 'free' || value === 'plus' || value === 'premier';
}

export interface TierGateProps {
  /** Minimum tier required to view children. */
  requiredTier: 'plus' | 'premier';
  /** What the locked feature is — surfaces in the upgrade prompt. */
  feature: string;
  /** Compact rendering for inline placement (e.g. inside a list row). */
  inline?: boolean;
  /** Optional override for the upgrade-CTA destination. Defaults to /membership. */
  upgradeHref?: string;
  children: ReactNode;
}

export default function TierGate({ requiredTier, feature, inline, upgradeHref = '/membership', children }: TierGateProps) {
  const { homeowner } = useAuth();
  const current = isMembershipTier(homeowner?.membership_tier) ? homeowner!.membership_tier : 'free';

  if (meetsTier(current, requiredTier)) {
    return <>{children}</>;
  }

  const friendly = requiredTier === 'plus' ? 'Plus' : 'Premier';

  if (inline) {
    return (
      <span
        style={{
          ...dm,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 100,
          background: `${C.orange}14`,
          color: C.orange,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        🔒 {friendly} unlocks {feature}
        <a href={upgradeHref} style={{ color: C.orange, textDecoration: 'underline' }}>
          Upgrade
        </a>
      </span>
    );
  }

  return (
    <div
      style={{
        ...dm,
        background: '#fff',
        borderRadius: 14,
        border: `2px dashed ${C.grayLight}`,
        padding: 24,
        textAlign: 'center',
      }}
      data-tier-gate-impression={`${feature}-${requiredTier}`}
    >
      <div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div>
      <div style={{ ...fr, fontSize: 18, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
        {friendly} unlocks {feature}
      </div>
      <div style={{ ...dm, fontSize: 13, color: C.darkMid, lineHeight: 1.55, marginBottom: 14 }}>
        Currently on the {current.charAt(0).toUpperCase() + current.slice(1)} plan. Upgrade to{' '}
        {friendly} to access this.
      </div>
      <a
        href={upgradeHref}
        style={{
          display: 'inline-block',
          padding: '10px 22px',
          background: C.orange,
          color: '#fff',
          borderRadius: 100,
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        See plans →
      </a>
    </div>
  );
}
