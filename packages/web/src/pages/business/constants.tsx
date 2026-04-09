import { useState, useEffect } from 'react';
import type { PricingConfig } from '@/hooks/usePricing';
import type { Reservation } from '@/services/api';

// ── Color Constants ──────────────────────────────────────────────────────────
export const O = '#E8632B', G = '#1B9E77', D = '#2D2926', W = '#F9F5F2';

// ── Tab Types ────────────────────────────────────────────────────────────────
export const TABS = ['dashboard', 'dispatch-chat', 'dispatches', 'bookings', 'guest-requests', 'guest-issues', 'guest-settings', 'guest-auto-dispatch', 'guest-qr-codes', 'schedules', 'reports', 'scorecards', 'properties', 'vendors', 'team', 'settings', 'billing'] as const;
export type Tab = typeof TABS[number];
export const TAB_LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard', 'dispatch-chat': 'New Dispatch', dispatches: 'Dispatches', bookings: 'Bookings',
  'guest-requests': 'Guest Requests', 'guest-issues': 'Requests', 'guest-settings': 'Settings',
  'guest-auto-dispatch': 'Auto-Dispatch', 'guest-qr-codes': 'QR Codes',
  schedules: 'Auto-Dispatch', billing: 'Billing',
  reports: 'Reports', scorecards: 'Scorecards', properties: 'Properties', vendors: 'Providers', team: 'Team', settings: 'Settings',
};

// ── Vendor Types & Constants ─────────────────────────────────────────────────
export type VendorSched = Record<string, { start: string; end: string } | null>;

export const VENDOR_CATEGORIES: { value: string; label: string }[] = [
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'electrical', label: 'Electrical' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'appliance', label: 'Appliance' },
  { value: 'roofing', label: 'Roofing' },
  { value: 'general', label: 'General Contractor' },
  { value: 'pest_control', label: 'Pest Control' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'pool', label: 'Pool' },
  { value: 'hot_tub', label: 'Hot Tub' },
  { value: 'painting', label: 'Painting' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'handyman', label: 'Handyman' },
  { value: 'flooring', label: 'Flooring' },
  { value: 'tile', label: 'Tile' },
  { value: 'tree_trimming', label: 'Tree Trimming' },
  { value: 'stump_removal', label: 'Stump Removal' },
  { value: 'garage_door', label: 'Garage Door' },
  { value: 'fence', label: 'Fencing' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'window_cleaning', label: 'Window Cleaning' },
  { value: 'carpet_cleaning', label: 'Carpet Cleaning' },
  { value: 'pressure_washing', label: 'Pressure Washing' },
  { value: 'steam_cleaning', label: 'Steam Cleaning' },
  { value: 'furniture_assembly', label: 'Furniture Assembly' },
  { value: 'gutter', label: 'Gutter Cleaning' },
  { value: 'moving', label: 'Moving' },
  { value: 'junk_removal', label: 'Junk Removal' },
  { value: 'masonry', label: 'Masonry' },
  { value: 'siding', label: 'Siding' },
  { value: 'drywall', label: 'Drywall' },
  { value: 'insulation', label: 'Insulation' },
  { value: 'solar', label: 'Solar' },
  { value: 'security_systems', label: 'Security Systems' },
  { value: 'deck_patio', label: 'Deck & Patio' },
  { value: 'window_door_install', label: 'Window & Door Install' },
  { value: 'kitchen_remodel', label: 'Kitchen Remodel' },
  { value: 'bathroom_remodel', label: 'Bathroom Remodel' },
  { value: 'foundation_waterproofing', label: 'Foundation & Waterproofing' },
  { value: 'chimney', label: 'Chimney' },
  { value: 'septic_sewer', label: 'Septic & Sewer' },
  { value: 'sprinkler_irrigation', label: 'Sprinkler & Irrigation' },
  { value: 'tv_mounting', label: 'TV Mounting' },
  { value: 'generator_install', label: 'Generator Install' },
  { value: 'ev_charger_install', label: 'EV Charger Install' },
  { value: 'welding_metal_work', label: 'Welding & Metal Work' },
  { value: 'concierge', label: 'Concierge' },
  { value: 'photography', label: 'Professional Photography' },
];

// ── Property Types ───────────────────────────────────────────────────────────
export const PROPERTY_TYPES: Record<string, string> = {
  residential: 'Residential',
  commercial: 'Commercial',
  vacation_rental: 'Vacation Rental',
  hoa: 'HOA',
  multi_family: 'Multi-Family',
};

export const BED_TYPES = [
  { value: 'king', label: 'King' },
  { value: 'queen', label: 'Queen' },
  { value: 'full', label: 'Full' },
  { value: 'twin', label: 'Twin' },
  { value: 'sofa_bed', label: 'Sofa Bed' },
  { value: 'bunk', label: 'Bunk' },
  { value: 'crib', label: 'Crib' },
];

// ── Schedule Constants ───────────────────────────────────────────────────────
export const DAYS = [
  { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
];

export const TIME_OPTIONS = ['06:00','07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00'];

export const TEMPLATE_CATEGORIES = [
  { key: '', label: 'All' },
  { key: 'cleaning', label: 'Cleaning' },
  { key: 'outdoor', label: 'Outdoor' },
  { key: 'pool', label: 'Pool' },
  { key: 'hvac', label: 'HVAC' },
  { key: 'pest', label: 'Pest' },
  { key: 'safety', label: 'Safety' },
  { key: 'supplies', label: 'Supplies' },
  { key: 'trash', label: 'Trash' },
];

export const CADENCE_OPTIONS = [
  { value: 'weekly', label: 'Weekly', desc: 'Once per week' },
  { value: 'biweekly', label: 'Biweekly', desc: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly', desc: 'Once per month' },
  { value: 'quarterly', label: 'Quarterly', desc: 'Every 3 months' },
  { value: 'semi_annual', label: 'Semi-annual', desc: 'Twice a year' },
  { value: 'annual', label: 'Annual', desc: 'Once a year' },
  { value: 'per_checkout', label: 'After checkout', desc: 'Per guest stay' },
];

// ── Utility Functions ────────────────────────────────────────────────────────

export function cleanPrice(price: string): string {
  let p = price.replace(/^\$+/, '$');
  const bm = p.match(/between\s+\$?(\d+(?:\.\d+)?)\s*(?:and|to)\s*\$?(\d+(?:\.\d+)?)/i);
  if (bm) return `$${bm[1]}-$${bm[2]}`;
  const rm = p.match(/^(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*(\d+(?:\.\d+)?)$/);
  if (rm) return `$${rm[1]}-$${rm[2]}`;
  const nm = p.match(/^(\d+(?:\.\d+)?)$/);
  if (nm) return `$${nm[1]}`;
  const em = p.match(/(?:is|are|be|charge|cost|runs?|pay)\s+(?:about|around)?\s*\$?(\d+(?:\.\d+)?)/i);
  if (em) return `$${em[1]}`;
  const lp = p.match(/^\$(\d+(?:\.\d+)?)\s+\w/);
  if (lp) return `$${lp[1]}`;
  const ln = p.match(/^(\d+(?:\.\d+)?)\s+(?:service|for|per|flat|call|visit|fee|charge|total)/i);
  if (ln) return `$${ln[1]}`;
  return p;
}

export function renderBold(text: string) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

export function trendArrow(current: number, previous: number): { text: string; color: string } {
  if (previous === 0) return current > 0 ? { text: `+${current}`, color: G } : { text: '—', color: '#9B9490' };
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return { text: `↑ ${pct}%`, color: G };
  if (pct < 0) return { text: `↓ ${Math.abs(pct)}%`, color: '#DC2626' };
  return { text: '→ 0%', color: '#9B9490' };
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

export function fmtTimeLabel(t: string) {
  const [h] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12} ${ampm}`;
}

export function formatScheduleSummary(sched: VendorSched | null): string {
  if (!sched) return 'Available anytime';
  const activeDays = DAYS.filter(d => sched[d.key]);
  if (activeDays.length === 0) return 'Available anytime';
  if (activeDays.length === 7) {
    const first = sched[activeDays[0].key]!;
    const allSame = activeDays.every(d => sched[d.key]!.start === first.start && sched[d.key]!.end === first.end);
    if (allSame) return `Every day ${fmtTimeLabel(first.start)}–${fmtTimeLabel(first.end)}`;
  }
  if (activeDays.length === 5 && activeDays.every(d => ['mon','tue','wed','thu','fri'].includes(d.key))) {
    const first = sched[activeDays[0].key]!;
    const allSame = activeDays.every(d => sched[d.key]!.start === first.start && sched[d.key]!.end === first.end);
    if (allSame) return `Mon–Fri ${fmtTimeLabel(first.start)}–${fmtTimeLabel(first.end)}`;
  }
  return activeDays.map(d => d.label).join(', ');
}

export function formatCadence(type: string, config: Record<string, unknown> | null): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (!config) return type.replace(/_/g, ' ');
  switch (type) {
    case 'weekly': return `Every ${days[(config.day_of_week as number) ?? 1]} at ${config.time ?? '10:00'}`;
    case 'biweekly': return `Every other ${days[(config.day_of_week as number) ?? 1]} at ${config.time ?? '10:00'}`;
    case 'monthly': return `${ordinal((config.day_of_month as number) ?? 1)} of every month at ${config.time ?? '10:00'}`;
    case 'quarterly': return `Every quarter on the ${ordinal((config.day_of_month as number) ?? 1)}`;
    case 'semi_annual': return 'Twice a year';
    case 'annual': return 'Once a year';
    case 'per_checkout': return 'After each guest checkout';
    default: return type.replace(/_/g, ' ');
  }
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function relativeTime(dateStr: string): string {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.round(diffMs / 3600000);
  const diffD = Math.round(diffMs / 86400000);
  if (diffMs < 0) {
    const ago = Math.abs(diffD);
    if (ago === 0) return 'today';
    if (ago === 1) return 'yesterday';
    return `${ago} days ago`;
  }
  if (diffH < 1) return 'in less than an hour';
  if (diffH < 24) return `in ${diffH}h`;
  if (diffD === 1) return 'tomorrow';
  return `in ${diffD} days`;
}

// ── Plan Helpers ─────────────────────────────────────────────────────────────

export function getPlanPropertyLimit(plan: string, pricing: PricingConfig): number {
  return pricing.business[plan]?.maxProperties ?? 10;
}

export function getPlanTiersOrdered(pricing: PricingConfig) {
  const bp = pricing.business;
  return [
    { plan: 'starter',      limit: bp.starter?.maxProperties      ?? 10,   label: 'Starter',      price: bp.starter?.base      === 0 ? `$0/mo + $${bp.starter?.perProperty ?? 10}/property`      : `$${bp.starter?.base}/mo + $${bp.starter?.perProperty}/property` },
    { plan: 'professional', limit: bp.professional?.maxProperties  ?? 50,   label: 'Professional', price: `$${bp.professional?.base ?? 99}/mo + $${bp.professional?.perProperty ?? 10}/property` },
    { plan: 'business',     limit: bp.business?.maxProperties      ?? 150,  label: 'Business',     price: `$${bp.business?.base ?? 249}/mo + $${bp.business?.perProperty ?? 10}/property` },
    { plan: 'enterprise',   limit: bp.enterprise?.maxProperties    ?? 9999, label: 'Enterprise',   price: 'Custom' },
  ];
}

export function getPlanMemberLimit(plan: string, pricing: PricingConfig): number {
  return pricing.business[plan]?.maxTeamMembers ?? 1;
}

export function getBillingPlans(pricing: PricingConfig) {
  const bp = pricing.business;
  return [
    { plan: 'starter',      label: 'Starter',       price: bp.starter?.base      ?? 0,   promoPrice: bp.starter?.promoBase      ?? null, promoLabel: bp.starter?.promoLabel      ?? null, perProperty: bp.starter?.perProperty      ?? 10, maxProperties: bp.starter?.maxProperties      ?? 10,  maxMembers: bp.starter?.maxTeamMembers      ?? 1,  features: [`Up to ${bp.starter?.maxProperties ?? 10} properties`, '1 user', 'Unlimited searches', 'Preferred providers (up to 5)', 'Basic cost tracking'] },
    { plan: 'professional', label: 'Professional',   price: bp.professional?.base ?? 99,  promoPrice: bp.professional?.promoBase ?? null, promoLabel: bp.professional?.promoLabel ?? null, perProperty: bp.professional?.perProperty ?? 10, maxProperties: bp.professional?.maxProperties ?? 50,  maxMembers: bp.professional?.maxTeamMembers ?? 5,  features: [`Up to ${bp.professional?.maxProperties ?? 50} properties`, `${bp.professional?.maxTeamMembers ?? 5} team members`, 'PMS import with sync', 'Full cost reporting', 'Provider scorecards', 'Slack integration', 'Estimate summary PDF'] },
    { plan: 'business',     label: 'Business',       price: bp.business?.base     ?? 249, promoPrice: bp.business?.promoBase     ?? null, promoLabel: bp.business?.promoLabel     ?? null, perProperty: bp.business?.perProperty     ?? 10, maxProperties: bp.business?.maxProperties     ?? 150, maxMembers: bp.business?.maxTeamMembers     ?? 15, features: [`Up to ${bp.business?.maxProperties ?? 150} properties`, `${bp.business?.maxTeamMembers ?? 15} team members with roles`, 'Multi-PMS import', 'Priority outreach', 'Advanced analytics', 'API access'] },
  ];
}

// ── Shared Components ────────────────────────────────────────────────────────

export function HomieBizLogo({ size = 'default' }: { size?: 'default' | 'large' }) {
  const isLarge = size === 'large';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 0 }}>
      <span style={{ fontFamily: "'Fraunces', serif", fontSize: isLarge ? 28 : 22, fontWeight: 700, color: O, lineHeight: 1 }}>homie</span>
      <span style={{
        fontFamily: "'DM Sans', sans-serif", fontSize: isLarge ? 11 : 9, fontWeight: 800,
        color: '#fff', background: G, padding: isLarge ? '3px 8px' : '2px 6px',
        borderRadius: 4, marginLeft: isLarge ? 10 : 7, letterSpacing: '0.08em',
        textTransform: 'uppercase' as const, lineHeight: 1,
        position: 'relative' as const, bottom: isLarge ? 3 : 2,
      }}>Business</span>
    </span>
  );
}

export function SchedulePicker({ schedule, onChange }: { schedule: VendorSched; onChange: (s: VendorSched) => void }) {
  function toggleDay(day: string) {
    const current = schedule[day];
    onChange({ ...schedule, [day]: current ? null : { start: '08:00', end: '17:00' } });
  }
  function updateTime(day: string, field: 'start' | 'end', val: string) {
    const slot = schedule[day];
    if (!slot) return;
    onChange({ ...schedule, [day]: { ...slot, [field]: val } });
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {DAYS.map(d => {
          const active = !!schedule[d.key];
          return (
            <button key={d.key} type="button" onClick={() => toggleDay(d.key)} style={{
              flex: 1, padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              border: active ? `2px solid ${O}` : '1px solid #E0DAD4',
              background: active ? `${O}10` : '#fff', color: active ? O : '#9B9490',
            }}>{d.label}</button>
          );
        })}
      </div>
      {DAYS.filter(d => schedule[d.key]).map(d => (
        <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 13 }}>
          <span style={{ width: 32, fontWeight: 600, color: D, fontSize: 12 }}>{d.label}</span>
          <select value={schedule[d.key]!.start} onChange={e => updateTime(d.key, 'start', e.target.value)}
            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #E0DAD4', fontSize: 12, cursor: 'pointer' }}>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{fmtTimeLabel(t)}</option>)}
          </select>
          <span style={{ color: '#9B9490', fontSize: 11 }}>to</span>
          <select value={schedule[d.key]!.end} onChange={e => updateTime(d.key, 'end', e.target.value)}
            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid #E0DAD4', fontSize: 12, cursor: 'pointer' }}>
            {TIME_OPTIONS.map(t => <option key={t} value={t}>{fmtTimeLabel(t)}</option>)}
          </select>
        </div>
      ))}
      {DAYS.every(d => !schedule[d.key]) && (
        <div style={{ fontSize: 12, color: '#9B9490', fontStyle: 'italic' }}>No days selected — provider available anytime</div>
      )}
    </div>
  );
}

export function MiniCalendar({ reservations }: { reservations: Reservation[] }) {
  const today = new Date();
  const months = [
    { year: today.getFullYear(), month: today.getMonth() },
    { year: today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear(), month: (today.getMonth() + 1) % 12 },
  ];

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const BAR_COLORS = ['#E8632B', '#1B9E77', '#2563EB', '#9333EA', '#DC2626', '#D97706'];

  function dateKey(y: number, m: number, d: number): string {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function parseDate(s: string): Date {
    const dateOnly = s.includes('T') ? s.split('T')[0] : s;
    const [y, m, d] = dateOnly.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  const dateReservations: Record<string, Array<{ resIdx: number; isCheckIn: boolean; isCheckOut: boolean }>> = {};
  reservations.forEach((r, idx) => {
    const ci = parseDate(r.checkIn);
    const co = parseDate(r.checkOut);
    const cursor = new Date(ci);
    while (cursor <= co) {
      const key = dateKey(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      if (!dateReservations[key]) dateReservations[key] = [];
      dateReservations[key].push({
        resIdx: idx,
        isCheckIn: cursor.getTime() === ci.getTime(),
        isCheckOut: cursor.getTime() === co.getTime(),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  });

  const [hoveredRes, setHoveredRes] = useState<number | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {months.map(({ year, month }) => {
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const cells: Array<{ day: number | null }> = [];
          for (let i = 0; i < firstDay; i++) cells.push({ day: null });
          for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d });

          return (
            <div key={`${year}-${month}`} style={{ flex: '1 1 220px', minWidth: 220 }}>
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600, color: D, marginBottom: 6, textAlign: 'center' }}>
                {MONTH_NAMES[month]} {year}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
                {DAY_LABELS.map(dl => (
                  <div key={dl} style={{ fontSize: 9, color: '#9B9490', textAlign: 'center', padding: '2px 0', fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>{dl}</div>
                ))}
                {cells.map((cell, i) => {
                  if (cell.day === null) return <div key={`e-${i}`} />;
                  const key = dateKey(year, month, cell.day);
                  const isToday = year === today.getFullYear() && month === today.getMonth() && cell.day === today.getDate();
                  const dayRes = dateReservations[key] || [];
                  const hasCheckIn = dayRes.some(r => r.isCheckIn);
                  const hasCheckOut = dayRes.some(r => r.isCheckOut);
                  const hasRes = dayRes.length > 0;

                  return (
                    <div key={key} style={{
                      position: 'relative', textAlign: 'center', padding: '3px 0', fontSize: 11,
                      fontFamily: 'DM Sans, sans-serif', fontWeight: isToday ? 700 : 400,
                      color: isToday ? '#fff' : hasRes ? D : '#9B9490',
                      background: isToday ? D : 'transparent',
                      borderRadius: isToday ? 4 : 0, cursor: hasRes ? 'pointer' : 'default',
                    }}
                      onMouseEnter={() => { if (dayRes.length > 0) setHoveredRes(dayRes[0].resIdx); }}
                      onMouseLeave={() => setHoveredRes(null)}
                    >
                      {cell.day}
                      {dayRes.length > 0 && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                          {dayRes.slice(0, 2).map((dr, bi) => (
                            <div key={bi} style={{
                              height: 3,
                              background: BAR_COLORS[dr.resIdx % BAR_COLORS.length],
                              borderRadius: `${dr.isCheckIn ? 2 : 0}px ${dr.isCheckOut ? 2 : 0}px ${dr.isCheckOut ? 2 : 0}px ${dr.isCheckIn ? 2 : 0}px`,
                              opacity: hoveredRes === dr.resIdx ? 1 : 0.7,
                            }} />
                          ))}
                        </div>
                      )}
                      {(hasCheckIn || hasCheckOut) && !isToday && (
                        <div style={{ position: 'absolute', top: 0, right: 1, display: 'flex', gap: 1 }}>
                          {hasCheckOut && <div style={{ width: 5, height: 5, borderRadius: '50%', background: O }} />}
                          {hasCheckIn && <div style={{ width: 5, height: 5, borderRadius: '50%', background: G }} />}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 10, color: '#9B9490', fontFamily: 'DM Sans, sans-serif', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: G, display: 'inline-block' }} /> Check-in
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: O, display: 'inline-block' }} /> Check-out
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 12, height: 3, borderRadius: 2, background: '#E8632B', display: 'inline-block', opacity: 0.7 }} /> Reserved
        </span>
      </div>

      {hoveredRes !== null && reservations[hoveredRes] && (
        <div style={{
          marginTop: 8, padding: '8px 12px', background: W, borderRadius: 8,
          fontSize: 12, fontFamily: 'DM Sans, sans-serif', color: D, transition: 'all 0.15s',
          border: `1px solid ${BAR_COLORS[hoveredRes % BAR_COLORS.length]}20`,
        }}>
          <span style={{ fontWeight: 600 }}>{reservations[hoveredRes].guestName || 'Guest'}</span>
          <span style={{ color: '#9B9490', marginLeft: 8 }}>
            {new Date(reservations[hoveredRes].checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            {' - '}
            {new Date(reservations[hoveredRes].checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          {reservations[hoveredRes].guests && (
            <span style={{ color: '#9B9490', marginLeft: 8 }}>{reservations[hoveredRes].guests} guest{reservations[hoveredRes].guests! > 1 ? 's' : ''}</span>
          )}
          {reservations[hoveredRes].source && (
            <span style={{ color: '#9B9490', marginLeft: 8 }}>via {reservations[hoveredRes].source}</span>
          )}
          {(reservations[hoveredRes].guestEmail || reservations[hoveredRes].guestPhone) && (
            <div style={{ marginTop: 4, fontSize: 11, color: '#9B9490' }}>
              {reservations[hoveredRes].guestEmail && <span>{reservations[hoveredRes].guestEmail}</span>}
              {reservations[hoveredRes].guestEmail && reservations[hoveredRes].guestPhone && <span style={{ margin: '0 4px' }}>|</span>}
              {reservations[hoveredRes].guestPhone && <span>{reservations[hoveredRes].guestPhone}</span>}
            </div>
          )}
        </div>
      )}

      {reservations.length > 0 && hoveredRes === null && (
        <div style={{ marginTop: 8 }}>
          {reservations.slice(0, 5).map((r, i) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
              borderBottom: i < Math.min(reservations.length, 5) - 1 ? '1px solid #F0EBE6' : 'none',
              fontSize: 12, fontFamily: 'DM Sans, sans-serif', color: D,
            }}
              onMouseEnter={() => setHoveredRes(i)}
              onMouseLeave={() => setHoveredRes(null)}
            >
              <span style={{ width: 4, height: 16, borderRadius: 2, background: BAR_COLORS[i % BAR_COLORS.length], flexShrink: 0, alignSelf: 'flex-start', marginTop: 4 }} />
              <span style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                <span style={{ fontWeight: 500, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.guestName || 'Guest'}
                </span>
                {(r.guestEmail || r.guestPhone) && (
                  <span style={{ display: 'block', fontSize: 10, color: '#9B9490', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[r.guestEmail, r.guestPhone].filter(Boolean).join(' | ')}
                  </span>
                )}
              </span>
              <span style={{ color: '#9B9490', flexShrink: 0, fontSize: 11 }}>
                {new Date(r.checkIn).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' - '}
                {new Date(r.checkOut).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span style={{
                fontSize: 10, padding: '2px 6px', borderRadius: 10, fontWeight: 500,
                background: r.status === 'confirmed' ? '#F0FDF4' : r.status === 'cancelled' ? '#FEF2F2' : '#F5F5F5',
                color: r.status === 'confirmed' ? '#16A34A' : r.status === 'cancelled' ? '#DC2626' : '#9B9490',
              }}>
                {r.status}
              </span>
            </div>
          ))}
          {reservations.length > 5 && (
            <div style={{ fontSize: 11, color: '#9B9490', textAlign: 'center', paddingTop: 6 }}>
              +{reservations.length - 5} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Theme Hook ───────────────────────────────────────────────────────────────

export function useThemeMode() {
  const [mode, setMode] = useState<'light' | 'dark' | 'auto'>(() => {
    return (localStorage.getItem('bp_theme') as 'light' | 'dark' | 'auto') || 'light';
  });

  const resolvedTheme = mode === 'auto'
    ? (new Date().getHours() >= 18 || new Date().getHours() < 7 ? 'dark' : 'light')
    : mode;

  function setTheme(m: 'light' | 'dark' | 'auto') {
    setMode(m);
    localStorage.setItem('bp_theme', m);
  }

  useEffect(() => {
    if (mode !== 'auto') return;
    const interval = setInterval(() => setMode('auto'), 60000);
    return () => clearInterval(interval);
  }, [mode]);

  return { mode, resolvedTheme, setTheme };
}
