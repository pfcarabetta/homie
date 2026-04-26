import type { CSSProperties } from 'react';

const DIY_GREEN = '#1B9E77';
const DIY_BG = '#E1F5EE';
const DIY_BORDER = '#A8DDC9';

/**
 * 🔧 DIY badge — surfaced on inspection items the heuristic (or the AI's
 * cached verdict) deems safe for a confident-beginner DIY.
 *
 * Visually distinct from severity badges (orange/red) so it reads as a
 * positive signal rather than a problem indicator. Used in: Items tab,
 * Reports detail, Negotiations, Quotes, Bookings.
 */
export default function DIYBadge({ confirmed = false, compact = false, style }: {
  /** True when the AI's analysis returned `feasible: true` (cached) — get a
   *  more confident "Confirmed DIY" treatment. False (default) means we're
   *  still on the heuristic. */
  confirmed?: boolean;
  /** Tighter spacing for dense list rows. */
  compact?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      title={confirmed ? 'Confirmed DIY-friendly by Homie' : 'Looks DIY-friendly — open AI Deep Dive for instructions'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: compact ? '2px 6px' : '3px 8px',
        borderRadius: 100,
        background: DIY_BG,
        border: `1px solid ${DIY_BORDER}`,
        color: DIY_GREEN,
        fontFamily: "'DM Sans', sans-serif",
        fontSize: compact ? 10 : 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span style={{ fontSize: compact ? 10 : 11 }}>{'🔧'}</span>
      DIY{confirmed ? '' : '?'}
    </span>
  );
}
