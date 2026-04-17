import type { ReactNode } from 'react';

/**
 * Wrap any content rendered into the business portal via createPortal.
 *
 * Why this exists: BusinessLayout defines all the `--bp-*` CSS variables on
 * the `.bp-portal` className wrapper. createPortal renders directly under
 * `document.body`, escaping that scope, so `var(--bp-card)` etc. resolve to
 * unset → menus/popovers render with no background (transparent).
 *
 * Wrapping the portaled content in this component re-establishes the
 * `bp-portal` scope (and copies the active `data-theme` from the existing
 * portal element so dark mode still works).
 *
 * Usage:
 *   createPortal(
 *     <BusinessPortalRoot>
 *       <MyDropdown />
 *     </BusinessPortalRoot>,
 *     document.body,
 *   )
 */
export default function BusinessPortalRoot({ children }: { children: ReactNode }) {
  const theme = typeof document !== 'undefined'
    ? document.querySelector('.bp-portal')?.getAttribute('data-theme') ?? 'light'
    : 'light';
  return <div className="bp-portal" data-theme={theme}>{children}</div>;
}
