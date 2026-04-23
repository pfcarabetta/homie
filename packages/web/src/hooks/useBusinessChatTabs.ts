import { useCallback, useEffect, useState } from 'react';
import type { QuoteTabEntry } from '@/components/QuoteTabsBar';

/**
 * Multi-session tabs for /business/chat — B2B analog of useQuoteTabs.
 *
 * Storage layout (different from consumer because B2B is workspace-
 * scoped — a PM in Workspace A should not see tabs from Workspace B):
 *
 *   homie_b2b_chat_tabs_v1               →  QuoteTabsEntryB2B[]
 *     index of every saved B2B session across all workspaces
 *
 *   homie_b2b_chat_session_<id>          →  B2bChatStateSnapshot
 *     full state for a single session (messages, step, property,
 *     audience, preferredProviderIds, jobId, outreachActive, …)
 *
 * The hook returns the FULL tab list; the calling component filters
 * by current workspace id before rendering so tabs from other
 * workspaces stay latent but dormant.
 *
 * Cross-tab awareness: subscribes to `storage` events for other-window
 * sync + a custom `homie:b2b-chat-tabs` event for same-window updates.
 *
 * Prune policy mirrors consumer: stale drafts > 6h, booked > 48h get
 * dropped on hook mount.
 */

const TABS_INDEX_KEY = 'homie_b2b_chat_tabs_v1';
const SESSION_PREFIX = 'homie_b2b_chat_session_';
const CHANGE_EVENT = 'homie:b2b-chat-tabs';
const SESSION_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const BOOKED_PRUNE_MS = 48 * 60 * 60 * 1000; // 48h

/** B2B tab entry = consumer entry + workspace scoping + optional
 *  property metadata. We keep `propertyName` / `propertyId` on the
 *  index entry (not just inside the snapshot) so the tabs bar can
 *  render titles without deserializing every session. */
export interface B2bQuoteTabEntry extends QuoteTabEntry {
  workspaceId: string;
  propertyId?: string | null;
  propertyName?: string | null;
}

/** Snapshot written to homie_b2b_chat_session_<id>. Keep all B2B-only
 *  fields here so tab re-entry fully restores the chat state,
 *  including audience + preferred-provider overrides the PM had
 *  configured pre-dispatch. */
export interface B2bChatStateSnapshot {
  savedAt: number;
  workspaceId: string;
  property: {
    id: string;
    name: string | null;
    address: string | null;
    zipCode: string | null;
  } | null;
  categoryId: string | null;
  categoryLabel: string | null;
  subcategoryId: string | null;
  q1Answer: string | null;
  messages: { role: 'user' | 'assistant'; content: string }[];
  aiConvo: { role: 'user' | 'assistant'; content: string }[];
  summaryText: string | null;
  timing: string | null;
  notifyGuest: boolean;
  audience: string | null;
  preferredProviderIds: string[];
  step: string;
  jobId: string | null;
  outreachActive: boolean;
}

// ── Storage primitives ───────────────────────────────────────────────

function readIndex(): B2bQuoteTabEntry[] {
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

function writeIndex(tabs: B2bQuoteTabEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TABS_INDEX_KEY, JSON.stringify(tabs));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch { /* quota exceeded — silent */ }
}

function isValidTab(x: unknown): x is B2bQuoteTabEntry {
  if (!x || typeof x !== 'object') return false;
  const t = x as Record<string, unknown>;
  return typeof t.id === 'string'
    && typeof t.title === 'string'
    && typeof t.status === 'string'
    && typeof t.updatedAt === 'string'
    && typeof t.workspaceId === 'string';
}

/** Prune booked tabs older than 48h + stale drafts older than 6h.
 *  Also drops orphaned session keys whose index entry has been removed. */
function prune(): void {
  if (typeof window === 'undefined') return;
  try {
    const index = readIndex();
    const now = Date.now();
    const kept: B2bQuoteTabEntry[] = [];
    for (const t of index) {
      const age = now - new Date(t.updatedAt).getTime();
      if (t.status === 'booked' && age > BOOKED_PRUNE_MS) {
        window.localStorage.removeItem(SESSION_PREFIX + t.id);
        continue;
      }
      if (age > SESSION_TTL_MS && t.status === 'drafting') {
        window.localStorage.removeItem(SESSION_PREFIX + t.id);
        continue;
      }
      kept.push(t);
    }
    if (kept.length !== index.length) writeIndex(kept);
  } catch { /* silent */ }
}

// ── Public helpers ──────────────────────────────────────────────────

export function newB2bSessionId(): string {
  return `b2b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function b2bSessionStorageKey(id: string): string {
  return SESSION_PREFIX + id;
}

export function loadB2bSnapshot(id: string): B2bChatStateSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(b2bSessionStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as B2bChatStateSnapshot;
    if (!parsed || typeof parsed.savedAt !== 'number') return null;
    if (Date.now() - parsed.savedAt > SESSION_TTL_MS) {
      window.localStorage.removeItem(b2bSessionStorageKey(id));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveB2bSnapshot(id: string, snap: B2bChatStateSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(b2bSessionStorageKey(id), JSON.stringify(snap));
  } catch { /* quota — silent */ }
}

/** Derive a human-friendly tab title for the B2B context. Prioritizes
 *  the property name + the user's first described issue ("2521
 *  Hermosa — Dishwasher leak"). Falls back to just the property or
 *  category when one side is missing. */
export function deriveB2bTabTitle(opts: {
  propertyName?: string | null;
  q1Answer?: string | null;
  categoryLabel?: string | null;
}): string {
  const propShort = shortenProperty(opts.propertyName);
  const issue = (opts.q1Answer ?? '').trim() || opts.categoryLabel?.trim() || '';
  const issueShort = issue.length > 32 ? issue.slice(0, 30) + '…' : issue;
  if (propShort && issueShort) return `${propShort} — ${issueShort}`;
  if (propShort) return propShort;
  if (issueShort) return issueShort;
  return 'New dispatch';
}

function shortenProperty(name: string | null | undefined): string {
  if (!name) return '';
  const trimmed = name.trim();
  if (trimmed.length <= 22) return trimmed;
  // Prefer short-addresses-ish behaviour: first two comma-separated
  // parts, else first 22 chars.
  const parts = trimmed.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const joined = parts.slice(0, 2).join(', ');
    return joined.length <= 32 ? joined : joined.slice(0, 30) + '…';
  }
  return trimmed.slice(0, 22) + '…';
}

export function upsertB2bTab(entry: B2bQuoteTabEntry): void {
  const index = readIndex();
  const existing = index.findIndex(t => t.id === entry.id);
  if (existing >= 0) {
    index[existing] = { ...index[existing], ...entry };
  } else {
    index.unshift(entry);
  }
  writeIndex(index);
}

export function removeB2bTab(id: string): void {
  if (typeof window === 'undefined') return;
  const index = readIndex().filter(t => t.id !== id);
  writeIndex(index);
  try { window.localStorage.removeItem(SESSION_PREFIX + id); } catch { /* silent */ }
}

export function markB2bTabRead(id: string): void {
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

export function useBusinessChatTabs(): {
  /** The FULL tab list across every workspace. Callers filter by
   *  active workspace before rendering so switching workspaces hides
   *  unrelated sessions without destroying them. */
  tabs: B2bQuoteTabEntry[];
  upsert: (entry: B2bQuoteTabEntry) => void;
  remove: (id: string) => void;
  markRead: (id: string) => void;
} {
  const [tabs, setTabs] = useState<B2bQuoteTabEntry[]>(() => {
    prune();
    return readIndex();
  });

  useEffect(() => {
    const refresh = () => setTabs(readIndex());
    const onStorage = (e: StorageEvent) => {
      if (e.key === TABS_INDEX_KEY) refresh();
    };
    const onChange = () => refresh();
    window.addEventListener('storage', onStorage);
    window.addEventListener(CHANGE_EVENT, onChange as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange as EventListener);
    };
  }, []);

  return {
    tabs,
    upsert: useCallback((entry: B2bQuoteTabEntry) => upsertB2bTab(entry), []),
    remove: useCallback((id: string) => removeB2bTab(id), []),
    markRead: useCallback((id: string) => markB2bTabRead(id), []),
  };
}
