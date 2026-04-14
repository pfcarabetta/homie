/**
 * localStorage helper for persisting Homie Inspect navigation state
 * across page refreshes. Uses `hi_nav_` prefix to avoid collision
 * with the business portal's `bp_nav_` keys.
 */

const PREFIX = 'hi_nav_';

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
