/**
 * Tiny localStorage helper for persisting Homie business navigation state
 * across page refreshes. Each piece of nav state has a stable key under the
 * `bp_nav_` prefix. Reads/writes are wrapped in try/catch so a corrupted or
 * disabled localStorage never breaks the app.
 *
 * Persisted keys:
 *   - tab            → top-level sidebar tab (dashboard, properties, etc.)
 *   - propertyId     → currently selected property in the property detail view
 *   - propertyPage   → active rail page within PropertyDetailView
 *                      (activity | jobs | bookings | calendar | providers | property)
 *   - propertySubTab → active pill tab within the Property tab of the detail view
 *                      (profile | equipment | inventory)
 */

const PREFIX = 'bp_nav_';

export function getStoredNav(key: string): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function setStoredNav(key: string, value: string | null | undefined): void {
  try {
    if (value === null || value === undefined || value === '') {
      localStorage.removeItem(PREFIX + key);
    } else {
      localStorage.setItem(PREFIX + key, value);
    }
  } catch {
    /* ignore quota / disabled localStorage */
  }
}

/** Clears all persisted business nav state. Call on logout. */
export function clearStoredNav(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
