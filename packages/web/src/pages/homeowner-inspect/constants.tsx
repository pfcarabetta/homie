import { useState, useEffect } from 'react';

// ── Color Constants ──────────────────────────────────────────────────────────
export const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

// ── Tab Types ────────────────────────────────────────────────────────────────
export const TABS = [
  'dashboard',
  'reports',
  'items',
  'quotes',
  'negotiations',
  'maintenance',
  'documents',
  'settings',
] as const;
export type Tab = typeof TABS[number];

export const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  reports: 'My Reports',
  items: 'Items',
  quotes: 'Quotes',
  negotiations: 'Negotiations',
  maintenance: 'Maintenance',
  documents: 'Documents',
  settings: 'Settings',
};

// ── Tier gating ──────────────────────────────────────────────────────────────
// A report is "paid" once the homeowner has chosen any tier (essential+).
// Cross-report tabs (Items, Quotes, Negotiations, Maintenance, Documents)
// only surface data from paid reports — unpaid reports are gated to the
// per-report paywall in the Reports tab.
export interface ReportLike { pricingTier?: string | null }
export function isPaidReport(r: ReportLike): boolean {
  return !!r.pricingTier;
}
export function paidReports<T extends ReportLike>(reports: T[]): T[] {
  return reports.filter(isPaidReport);
}

// ── Severity ─────────────────────────────────────────────────────────────────
export const SEVERITY_COLORS: Record<string, string> = {
  safety_hazard: '#E24B4A',
  urgent: '#E24B4A',
  recommended: '#EF9F27',
  monitor: '#9B9490',
  informational: '#D3CEC9',
};

export const SEVERITY_LABELS: Record<string, string> = {
  safety_hazard: 'Safety Hazard',
  urgent: 'Urgent',
  recommended: 'Recommended',
  monitor: 'Monitor',
  informational: 'Informational',
};

// ── Category ─────────────────────────────────────────────────────────────────
export const CATEGORY_LABELS: Record<string, string> = {
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  hvac: 'HVAC',
  roofing: 'Roofing',
  structural: 'Structural',
  general_repair: 'General',
  pest_control: 'Pest Control',
  safety: 'Safety',
  cosmetic: 'Cosmetic',
  landscaping: 'Landscaping',
  appliance: 'Appliance',
  insulation: 'Insulation',
  foundation: 'Foundation',
  windows_doors: 'Windows & Doors',
  fireplace: 'Fireplace',
};

export const CATEGORY_ICONS: Record<string, string> = {
  plumbing: '\uD83D\uDCA7', electrical: '\u26A1', hvac: '\u2744\uFE0F', roofing: '\uD83C\uDFE0', structural: '\uD83C\uDFD7\uFE0F',
  general_repair: '\uD83D\uDD27', pest_control: '\uD83D\uDC1B', safety: '\u26A0\uFE0F', cosmetic: '\uD83C\uDFA8',
  landscaping: '\uD83C\uDF3F', appliance: '\uD83D\uDCE6', insulation: '\uD83E\uDDF1', foundation: '\uD83C\uDFDB\uFE0F',
  windows_doors: '\uD83E\uDE9F', fireplace: '\uD83D\uDD25',
};

// ── Utility Functions ────────────────────────────────────────────────────────

export function formatCurrency(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ── Shared Components ────────────────────────────────────────────────────────

export function HomieInspectLogo({ size = 'default' }: { size?: 'default' | 'large' }) {
  const isLarge = size === 'large';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 0 }}>
      <span style={{ fontFamily: "'Fraunces', serif", fontSize: isLarge ? 28 : 22, fontWeight: 700, color: O, lineHeight: 1 }}>homie</span>
      <span style={{
        fontFamily: "'DM Sans', sans-serif", fontSize: isLarge ? 11 : 9, fontWeight: 800,
        color: '#fff', background: '#2563EB', padding: isLarge ? '3px 8px' : '2px 6px',
        borderRadius: 4, marginLeft: isLarge ? 10 : 7, letterSpacing: '0.08em',
        textTransform: 'uppercase' as const, lineHeight: 1,
        position: 'relative' as const, bottom: isLarge ? 3 : 2,
      }}>Inspect</span>
    </span>
  );
}

// ── Theme Hook ───────────────────────────────────────────────────────────────

export function useThemeMode() {
  const [mode, setMode] = useState<'light' | 'dark' | 'auto'>(() => {
    return (localStorage.getItem('hi_theme') as 'light' | 'dark' | 'auto') || 'light';
  });

  const resolvedTheme = mode === 'auto'
    ? (new Date().getHours() >= 18 || new Date().getHours() < 7 ? 'dark' : 'light')
    : mode;

  function setTheme(m: 'light' | 'dark' | 'auto') {
    setMode(m);
    localStorage.setItem('hi_theme', m);
  }

  useEffect(() => {
    if (mode !== 'auto') return;
    const interval = setInterval(() => setMode('auto'), 60000);
    return () => clearInterval(interval);
  }, [mode]);

  return { mode, resolvedTheme, setTheme };
}
