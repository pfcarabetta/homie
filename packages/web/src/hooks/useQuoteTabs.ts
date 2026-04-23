import { useCallback, useEffect, useState } from 'react';
import type { QuoteTabEntry, QuoteTabStatus } from '@/components/QuoteTabsBar';

/**
 * Multi-session quote tabs — storage + subscription hook.
 *
 * Each quote chat session is stored under `homie_quote_session_<id>`
 * (the existing single-session snapshot shape, just keyed by id).
 * A separate `homie_quote_tabs_v1` index tracks metadata for every
 * session (id, title, status, unread count, updatedAt) so the tab bar
 * can render without having to deserialize every snapshot.
 *
 * Cross-tab awareness: subscribes to the `storage` event so tab state
 * stays consistent across multiple /quote windows. Within the same
 * window, subscribers are notified via a custom `homie:quote-tabs`
 * event bubbled from `upsertTab` / `removeTab` / `markRead`.
 *
 * The hook is the ONLY public API — underlying read/write helpers
 * live as file-locals so the storage format stays encapsulated.
 */

const TABS_INDEX_KEY = 'homie_quote_tabs_v1';
const SESSION_PREFIX = 'homie_quote_session_';
const LEGACY_SINGLE_KEY = 'homie_quote_state_v1';
const CHANGE_EVENT = 'homie:quote-tabs';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h — matches existing TTL
const BOOKED_PRUNE_MS = 48 * 60 * 60 * 1000; // 48h — booked tabs age out

// ── Storage helpers ──────────────────────────────────────────────────

function readIndex(): QuoteTabEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TABS_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidTab);
  } catch {
    return [];
  }
}

function writeIndex(tabs: QuoteTabEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TABS_INDEX_KEY, JSON.stringify(tabs));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch { /* quota exceeded — silent */ }
}

function isValidTab(x: unknown): x is QuoteTabEntry {
  if (!x || typeof x !== 'object') return false;
  const t = x as Record<string, unknown>;
  return typeof t.id === 'string' && typeof t.title === 'string'
    && typeof t.status === 'string' && typeof t.updatedAt === 'string';
}

/** Migrate the legacy single-session snapshot into the new index the
 *  first time a multi-session client runs. Creates one tab entry with
 *  a fresh id and re-saves the snapshot under the session-scoped key.
 *  No-op on subsequent loads (the legacy key is deleted post-migrate). */
function migrateLegacySnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(LEGACY_SINGLE_KEY);
    if (!raw) return;
    const snap = JSON.parse(raw) as { savedAt?: number; phase?: string; data?: { category?: string; a1?: string; aiDiagnosis?: string } };
    if (!snap || typeof snap !== 'object') {
      window.localStorage.removeItem(LEGACY_SINGLE_KEY);
      return;
    }
    // TTL guard — the legacy key had its own expiry check in GetQuotes;
    // respect it so we don't resurrect a stale chat as a tab.
    const savedAt = snap.savedAt ?? 0;
    if (Date.now() - savedAt > SESSION_TTL_MS) {
      window.localStorage.removeItem(LEGACY_SINGLE_KEY);
      return;
    }
    const id = newSessionId();
    const title = deriveTitle(snap.data);
    const status = inferStatus(snap.phase, snap.data);
    const entry: QuoteTabEntry = {
      id, title, status,
      updatedAt: new Date(savedAt).toISOString(),
    };
    const index = readIndex();
    index.unshift(entry);
    writeIndex(index);
    window.localStorage.setItem(SESSION_PREFIX + id, raw);
    window.localStorage.removeItem(LEGACY_SINGLE_KEY);
  } catch { /* best-effort */ }
}

/** Remove booked tabs older than 48h + session keys older than the
 *  TTL. Runs once per hook mount — cheap, O(tabs). */
function prune(): void {
  if (typeof window === 'undefined') return;
  try {
    const index = readIndex();
    const now = Date.now();
    const kept: QuoteTabEntry[] = [];
    for (const t of index) {
      const age = now - new Date(t.updatedAt).getTime();
      if (t.status === 'booked' && age > BOOKED_PRUNE_MS) {
        // Clear the session snapshot too — Account's history has it.
        window.localStorage.removeItem(SESSION_PREFIX + t.id);
        continue;
      }
      if (age > SESSION_TTL_MS && t.status === 'drafting') {
        // Stale draft — no point keeping.
        window.localStorage.removeItem(SESSION_PREFIX + t.id);
        continue;
      }
      kept.push(t);
    }
    if (kept.length !== index.length) writeIndex(kept);
  } catch { /* silent */ }
}

// ── Title / status derivation ────────────────────────────────────────

/** Pick a human-friendly short title from the current session state.
 *  Priority: user's initial description → category label → generic. */
export function deriveTitle(data: { category?: string | null; a1?: string | null; aiDiagnosis?: string | null } | null | undefined): string {
  if (!data) return 'New quote';
  const a1 = (data.a1 ?? '').trim();
  if (a1.length > 0) {
    const short = a1.length > 36 ? a1.slice(0, 34) + '…' : a1;
    return short;
  }
  const cat = (data.category ?? '').trim();
  if (cat.length > 0) return cat.replace(/^./, c => c.toUpperCase()) + ' job';
  return 'New quote';
}

/** Map a GetQuotes `phase` to a tab status bucket. Callers can
 *  override with explicit markers (e.g., "has quotes on file" →
 *  quotes_ready) but the phase is a reasonable default. */
export function inferStatus(phase: string | undefined, data: { aiDiagnosis?: string | null } | null | undefined): QuoteTabStatus {
  if (phase === 'outreach' || phase === 'dispatching') return 'dispatching';
  if (data?.aiDiagnosis && (phase === 'diagnosis' || phase === 'extra')) return 'drafting';
  return 'drafting';
}

// ── Public helpers ───────────────────────────────────────────────────

export function newSessionId(): string {
  // Timestamp + random suffix — not crypto-strong but unique enough
  // for a client-side identifier, and trivially inspectable in devtools.
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sessionStorageKey(id: string): string {
  return SESSION_PREFIX + id;
}

/** Upsert the tab index entry for a session. Called from GetQuotes on
 *  every meaningful state change (category set, diagnosis ready,
 *  outreach started, booking completed). */
export function upsertTab(entry: QuoteTabEntry): void {
  const index = readIndex();
  const existing = index.findIndex(t => t.id === entry.id);
  if (existing >= 0) {
    index[existing] = { ...index[existing], ...entry };
  } else {
    index.unshift(entry);
  }
  writeIndex(index);
}

/** Remove a session completely — tabs index entry + snapshot. */
export function removeTab(id: string): void {
  if (typeof window === 'undefined') return;
  const index = readIndex().filter(t => t.id !== id);
  writeIndex(index);
  try { window.localStorage.removeItem(SESSION_PREFIX + id); } catch { /* silent */ }
}

/** Clear the unread quote badge on a tab (fires on view). */
export function markRead(id: string): void {
  const index = readIndex();
  let changed = false;
  for (const t of index) {
    if (t.id === id && t.unreadQuotes) {
      t.unreadQuotes = 0;
      changed = true;
    }
  }
  if (changed) writeIndex(index);
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useQuoteTabs(): {
  tabs: QuoteTabEntry[];
  upsert: (entry: QuoteTabEntry) => void;
  remove: (id: string) => void;
  markRead: (id: string) => void;
} {
  const [tabs, setTabs] = useState<QuoteTabEntry[]>(() => {
    migrateLegacySnapshot();
    prune();
    return readIndex();
  });

  useEffect(() => {
    const refresh = () => setTabs(readIndex());
    // Cross-window sync via the native storage event.
    const onStorage = (e: StorageEvent) => {
      if (e.key === TABS_INDEX_KEY) refresh();
    };
    // Same-window sync via our custom bubbled event.
    const onChange = () => refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, onChange as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange as EventListener);
    };
  }, []);

  const upsert = useCallback((entry: QuoteTabEntry) => upsertTab(entry), []);
  const remove = useCallback((id: string) => removeTab(id), []);
  const markReadCb = useCallback((id: string) => markRead(id), []);

  return { tabs, upsert, remove, markRead: markReadCb };
}
