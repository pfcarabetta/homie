import { createContext, useContext } from 'react';

/**
 * Shared theme tokens for InlineOutreachPanel + OutreachTransparencyStrip.
 *
 * Consumer surfaces (/quote, /account) use fixed hex colors tuned for
 * the homeowner brand palette. Business surfaces (/business/chat,
 * /business) use CSS custom properties (--bp-*) so the dark-mode
 * toggle in the business portal carries through.
 *
 * Components consume colors via `useOutreachColors()` (reads the
 * nearest OutreachThemeProvider) instead of importing module-level
 * constants. Top-level components wrap their render with the
 * provider; sub-components inherit via context. Keeps the JSX clean
 * without prop-drilling a theme prop through every sub-component.
 *
 * Brand accents (orange + green) are identical across themes since
 * they're used for status semantics (orange = in-flight, green =
 * connected/quoted), not chrome.
 */

export type OutreachTheme = 'consumer' | 'business';

export interface OutreachColors {
  O: string;       // orange accent (brand — same on both themes)
  G: string;       // green accent (success/quoted — same on both themes)
  D: string;       // primary text
  W: string;       // warm / soft-surface background
  DIM: string;     // muted / secondary text
  BORDER: string;  // subtle border
  CARD: string;    // card surface background
}

const CONSUMER: OutreachColors = {
  O: '#E8632B',
  G: '#1B9E77',
  D: '#2D2926',
  W: '#F9F5F2',
  DIM: '#6B6560',
  BORDER: 'rgba(0,0,0,.08)',
  CARD: '#ffffff',
};

/** Business tokens — CSS vars driven by BusinessPortal's theme switch.
 *  Fallbacks kept in sync with the consumer values so the component
 *  still renders correctly if rendered outside the .bp-portal
 *  container for any reason (e.g. a standalone demo). */
const BUSINESS: OutreachColors = {
  O: '#E8632B',
  G: '#1B9E77',
  D: 'var(--bp-text, #2D2926)',
  W: 'var(--bp-warm, #F9F5F2)',
  DIM: 'var(--bp-subtle, #6B6560)',
  BORDER: 'var(--bp-border, rgba(0,0,0,.08))',
  CARD: 'var(--bp-card, #ffffff)',
};

export function outreachColors(theme: OutreachTheme = 'consumer'): OutreachColors {
  return theme === 'business' ? BUSINESS : CONSUMER;
}

// ── Context ────────────────────────────────────────────────────────

export const OutreachThemeContext = createContext<OutreachTheme>('consumer');

export function useOutreachColors(): OutreachColors {
  const theme = useContext(OutreachThemeContext);
  return outreachColors(theme);
}
