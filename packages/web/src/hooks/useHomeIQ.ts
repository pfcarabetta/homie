import { useCallback, useEffect, useState } from 'react';
import { accountService, authService } from '@/services/api';
import {
  inventoryFromPropertyDetails, mergedInventory,
} from '@/utils/home-iq';
import type { HomeData, PropertyInventoryItem } from '@homie/shared';

/**
 * Fetch a logged-in homeowner's full Home IQ inventory — scan rows +
 * Equipment & Systems form rows, merged + deduped — for use in the
 * consumer quote chat.
 *
 * No-ops when the user isn't authenticated (returns an empty inventory
 * + hasAnyData: false), so the consumer /quote flow can mount this
 * hook unconditionally and render the "sign in to unlock" empty state
 * without having to guard on auth at the call site.
 *
 * Exposes `refresh()` so callers can force a re-fetch after the
 * inventory mutates elsewhere (e.g., the model-label scan flow writes a
 * new row and wants the panel to light up immediately).
 */
export function useHomeIQ(): {
  inventory: PropertyInventoryItem[];
  homeData: HomeData | null;
  loading: boolean;
  /** True when the homeowner has any inventory OR home details on file. */
  hasAnyData: boolean;
  /** True when the user isn't signed in — the hook is idle. */
  anonymous: boolean;
  /** Force a re-fetch of the inventory + home data. No-op when anonymous. */
  refresh: () => void;
} {
  const [inventory, setInventory] = useState<PropertyInventoryItem[]>([]);
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [anonymous, setAnonymous] = useState<boolean>(() => !authService.isAuthenticated());
  // Bumped by refresh() to re-run the fetch effect.
  const [fetchKey, setFetchKey] = useState(0);

  const refresh = useCallback(() => setFetchKey(k => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!authService.isAuthenticated()) {
      setAnonymous(true);
      setInventory([]);
      setHomeData(null);
      setLoading(false);
      return;
    }
    setAnonymous(false);
    setLoading(true);

    Promise.all([
      accountService.getHomeInventory(),
      accountService.getHome(),
    ]).then(([invRes, homeRes]) => {
      if (cancelled) return;
      const home: HomeData | null = homeRes.data ?? null;
      setHomeData(home);
      const rooms = invRes.data?.rooms ?? [];
      const unassigned = invRes.data?.unassignedItems ?? [];
      const scanRows: PropertyInventoryItem[] = [
        ...rooms.flatMap(r => r.items),
        ...unassigned,
      ].filter(it => it.status !== 'pm_dismissed');
      const formRows = home?.details
        ? inventoryFromPropertyDetails('home', home.details)
        : [];
      setInventory(mergedInventory(scanRows, formRows));
    }).catch(() => {
      // Best-effort — empty state falls through just like the business
      // chat pattern. Don't surface an error banner, the panel already
      // handles an empty list gracefully.
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [fetchKey]);

  return {
    inventory,
    homeData,
    loading,
    hasAnyData: inventory.length > 0 || !!homeData?.details,
    anonymous,
    refresh,
  };
}
