import { useEffect, useState } from 'react';
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
 * Returns a stable identity for `inventory` as long as the underlying
 * data hasn't changed (not by ref equality, but by content) so React
 * memoization downstream works.
 */
export function useHomeIQ(): {
  inventory: PropertyInventoryItem[];
  homeData: HomeData | null;
  loading: boolean;
  /** True when the homeowner has any inventory OR home details on file. */
  hasAnyData: boolean;
  /** True when the user isn't signed in — the hook is idle. */
  anonymous: boolean;
} {
  const [inventory, setInventory] = useState<PropertyInventoryItem[]>([]);
  const [homeData, setHomeData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [anonymous, setAnonymous] = useState<boolean>(() => !authService.isAuthenticated());

  useEffect(() => {
    let cancelled = false;
    // Check auth at mount — unauthenticated users skip the fetch
    // entirely so we don't log a 401 spam into devtools.
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
      // Home data — used as the form-row source for the merged inventory.
      const home: HomeData | null = homeRes.data ?? null;
      setHomeData(home);
      // Scan rows — flatten rooms + unassignedItems, drop pm_dismissed.
      const rooms = invRes.data?.rooms ?? [];
      const unassigned = invRes.data?.unassignedItems ?? [];
      const scanRows: PropertyInventoryItem[] = [
        ...rooms.flatMap(r => r.items),
        ...unassigned,
      ].filter(it => it.status !== 'pm_dismissed');
      // Form rows — synthesized from the saved Equipment & Systems form.
      // A homeowner-scoped inventory row doesn't have a propertyId; we pass
      // a synthetic id to satisfy the helper (it's used to build a stable
      // id for the virtual row and for rendering — never sent to the API).
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
  }, []);

  return {
    inventory,
    homeData,
    loading,
    hasAnyData: inventory.length > 0 || !!homeData?.details,
    anonymous,
  };
}
