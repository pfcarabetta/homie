import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAPI } from '@/services/api';
import SEO from '@/components/SEO';

/**
 * Recurring Vendors page (Membership Phase 1, Session 3).
 *
 * Lists the homeowner's vendor team, lets them add a new BYO vendor
 * (which fires the SMS + Connect onboarding flow), and exposes the
 * per-vendor actions: skip next visit, travel hold, resume, cancel.
 *
 * Visual style mirrors the existing inspect-portal pages — dm-sans
 * body + Fraunces headers, orange CTAs. Intentionally minimal so the
 * full Member Dashboard can replace it as the home screen later.
 */

const C = {
  orange: '#E8632B',
  dark: '#2D2926',
  darkMid: '#4A4543',
  gray: '#9B9490',
  grayLight: '#D3CEC9',
  warm: '#F9F5F2',
  green: '#1B9E77',
  greenLight: '#E1F5EE',
};

const dm: CSSProperties = { fontFamily: "'DM Sans', sans-serif" };
const fr: CSSProperties = { fontFamily: 'Fraunces, serif' };

interface RecurringVendor {
  id: string;
  vendorName: string;
  vendorPhone: string | null;
  serviceCategory: string;
  vendorType: 'byo' | 'network';
  schedulePattern: string;
  scheduleDayOfWeek: number | null;
  amountCents: number;
  paymentMethod: string;
  autoPayRule: string;
  status: string;
  totalPaidYtdCents: number;
  vendorConfirmedAt: string | null;
}

interface HomeownerProperty {
  id: string;
  isPrimary: boolean;
  nickname: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

interface PaymentMethod {
  id: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
}

const SERVICE_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'landscaping', label: 'Landscaping' },
  { value: 'pool', label: 'Pool service' },
  { value: 'pest_control', label: 'Pest control' },
  { value: 'hvac', label: 'HVAC' },
  { value: 'window_cleaning', label: 'Window cleaning' },
  { value: 'trash_valet', label: 'Trash valet' },
  { value: 'handyman', label: 'Handyman' },
  { value: 'other', label: 'Other' },
];

const SCHEDULE_PATTERNS: Array<{ value: string; label: string }> = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly_even', label: 'Every 2 weeks (even weeks)' },
  { value: 'biweekly_odd', label: 'Every 2 weeks (odd weeks)' },
  { value: 'monthly_date', label: 'Monthly (by date)' },
  { value: 'monthly_nth_day', label: 'Monthly (e.g. first Tuesday)' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'custom', label: 'Custom' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_vendor_confirmation: { label: 'Awaiting vendor', color: C.orange },
  active: { label: 'Active', color: C.green },
  paused: { label: 'Paused', color: C.gray },
  travel_hold: { label: 'Travel hold', color: '#9B59B6' },
  cancelled: { label: 'Cancelled', color: C.gray },
};

function fmtMoney(cents: number): string {
  if (!cents) return '$0';
  return `$${(cents / 100).toFixed(0)}`;
}

export default function Vendors() {
  const { homeowner } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<RecurringVendor[]>([]);
  const [properties, setProperties] = useState<HomeownerProperty[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!homeowner) {
      navigate('/login?redirect=/vendors');
      return;
    }
    refresh();
  }, [homeowner]);

  async function refresh() {
    setLoading(true);
    try {
      const [vRes, pRes, pmRes] = await Promise.all([
        fetchAPI<{ vendors: RecurringVendor[] }>('/api/v1/account/vendors'),
        fetchAPI<{ properties: HomeownerProperty[] }>('/api/v1/account/properties'),
        fetchAPI<{ paymentMethods: PaymentMethod[] }>('/api/v1/account/payment-methods'),
      ]);
      if (vRes.data) setVendors(vRes.data.vendors);
      if (pRes.data) setProperties(pRes.data.properties);
      if (pmRes.data) setPaymentMethods(pmRes.data.paymentMethods);
    } catch (err) {
      setError((err as Error).message ?? 'Failed to load');
    }
    setLoading(false);
  }

  async function addCard() {
    try {
      const res = await fetchAPI<{ checkoutUrl: string }>('/api/v1/account/payment-methods/setup-checkout', {
        method: 'POST',
        body: JSON.stringify({ return_to: '/vendors' }),
      });
      if (res.data?.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
      }
    } catch (err) {
      alert((err as Error).message ?? 'Failed to start card setup');
    }
  }

  async function removeCard(id: string) {
    if (!confirm('Remove this card? Vendors set to charge it will fail until you add a new one.')) return;
    try {
      await fetchAPI(`/api/v1/account/payment-methods/${id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      alert((err as Error).message ?? 'Failed to remove card');
    }
  }

  async function actSkipNext(vendorId: string) {
    try {
      await fetchAPI(`/api/v1/account/vendors/${vendorId}/skip-next`, { method: 'POST', body: JSON.stringify({}) });
      refresh();
    } catch (err) {
      alert((err as Error).message ?? 'Skip failed');
    }
  }

  async function actTravelHold(vendorId: string) {
    const starts = window.prompt('Start date (YYYY-MM-DD)');
    if (!starts) return;
    const ends = window.prompt('End date (YYYY-MM-DD)');
    if (!ends) return;
    try {
      await fetchAPI(`/api/v1/account/vendors/${vendorId}/travel-hold`, {
        method: 'POST',
        body: JSON.stringify({ starts_at: starts, ends_at: ends }),
      });
      refresh();
    } catch (err) {
      alert((err as Error).message ?? 'Travel hold failed');
    }
  }

  async function actResume(vendorId: string) {
    try {
      await fetchAPI(`/api/v1/account/vendors/${vendorId}/resume`, { method: 'POST', body: JSON.stringify({}) });
      refresh();
    } catch (err) {
      alert((err as Error).message ?? 'Resume failed');
    }
  }

  async function actCancel(vendorId: string) {
    if (!confirm('Cancel this recurring vendor? Their schedule + future visits stop. Past payments and history stay.')) return;
    try {
      await fetchAPI(`/api/v1/account/vendors/${vendorId}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      alert((err as Error).message ?? 'Cancel failed');
    }
  }

  if (!homeowner) return null;

  return (
    <div style={{ ...dm, minHeight: '100vh', background: C.warm }}>
      <SEO title="Your team — Homie" description="Pay your cleaner, gardener, pool service, and more on autopilot. Recurring vendor management on Homie." canonical="/vendors" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${C.grayLight}` }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <span style={{ ...fr, fontWeight: 700, fontSize: 24, color: C.orange }}>homie</span>
            <span style={{ ...dm, fontSize: 14, color: C.gray, marginLeft: 6 }}>your team</span>
          </div>
          <button onClick={() => setShowAdd(true)} style={{
            padding: '10px 20px', fontSize: 14, fontWeight: 700, color: '#fff',
            background: C.orange, border: 'none', borderRadius: 100, cursor: 'pointer',
          }}>+ Add vendor</button>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px 80px' }}>
        <h1 style={{ ...fr, fontSize: 32, fontWeight: 700, color: C.dark, margin: '0 0 8px' }}>Your recurring team</h1>
        <p style={{ fontSize: 14, color: C.darkMid, lineHeight: 1.55, margin: '0 0 24px', maxWidth: 600 }}>
          Vendors you pay on a schedule. Add your cleaner, gardener, pool guy, or pest control —
          Homie sends them an SMS to confirm payment details, then handles the rest. Skip a visit,
          travel hold, or cancel anytime.
        </p>

        <PaymentMethodsSection paymentMethods={paymentMethods} onAdd={addCard} onRemove={removeCard} />

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '12px 16px', borderRadius: 10, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: C.gray, fontSize: 14, padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : vendors.length === 0 ? (
          <EmptyState onAdd={() => setShowAdd(true)} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {vendors.map((v) => (
              <VendorCard key={v.id} vendor={v} onSkip={actSkipNext} onTravelHold={actTravelHold} onResume={actResume} onCancel={actCancel} />
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddVendorModal
          properties={properties}
          onClose={() => setShowAdd(false)}
          onSuccess={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function VendorCard({ vendor, onSkip, onTravelHold, onResume, onCancel }: {
  vendor: RecurringVendor;
  onSkip: (id: string) => void;
  onTravelHold: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const status = STATUS_LABELS[vendor.status] ?? { label: vendor.status, color: C.gray };
  const cat = SERVICE_CATEGORIES.find((c) => c.value === vendor.serviceCategory)?.label ?? vendor.serviceCategory;
  const sched = SCHEDULE_PATTERNS.find((s) => s.value === vendor.schedulePattern)?.label ?? vendor.schedulePattern;
  const isCancelled = vendor.status === 'cancelled';
  const isTravelHold = vendor.status === 'travel_hold';

  return (
    <div style={{
      background: '#fff', borderRadius: 14, border: `1px solid ${C.grayLight}`,
      padding: 20, display: 'flex', flexDirection: 'column', gap: 12,
      opacity: isCancelled ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ ...fr, fontSize: 18, fontWeight: 700, color: C.dark }}>{vendor.vendorName}</div>
          <div style={{ fontSize: 13, color: C.gray, marginTop: 2 }}>
            {cat} · {sched} · {fmtMoney(vendor.amountCents)}/visit
            {vendor.vendorType === 'network' && (
              <span style={{ marginLeft: 8, padding: '2px 8px', background: C.greenLight, color: '#085041', borderRadius: 100, fontSize: 11, fontWeight: 600 }}>Network</span>
            )}
          </div>
        </div>
        <span style={{ padding: '4px 12px', borderRadius: 100, background: `${status.color}18`, color: status.color, fontSize: 12, fontWeight: 700 }}>
          {status.label}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 24, fontSize: 12, color: C.darkMid, paddingTop: 8, borderTop: `1px solid ${C.warm}` }}>
        <span>YTD paid: <strong style={{ color: C.dark }}>{fmtMoney(vendor.totalPaidYtdCents)}</strong></span>
        <span>Auto-pay: <strong style={{ color: C.dark }}>{vendor.autoPayRule.replace(/_/g, ' ')}</strong></span>
      </div>

      {!isCancelled && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!isTravelHold && (
            <ActionBtn onClick={() => onSkip(vendor.id)}>Skip next visit</ActionBtn>
          )}
          {isTravelHold ? (
            <ActionBtn onClick={() => onResume(vendor.id)} primary>Resume</ActionBtn>
          ) : (
            <ActionBtn onClick={() => onTravelHold(vendor.id)}>Travel hold</ActionBtn>
          )}
          <ActionBtn onClick={() => onCancel(vendor.id)} danger>Cancel</ActionBtn>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, primary, danger }: { children: React.ReactNode; onClick: () => void; primary?: boolean; danger?: boolean }) {
  const bg = primary ? C.orange : danger ? '#fff' : '#fff';
  const color = primary ? '#fff' : danger ? '#DC2626' : C.dark;
  const border = primary ? 'none' : danger ? '1px solid #DC262640' : `1px solid ${C.grayLight}`;
  return (
    <button onClick={onClick} style={{
      padding: '7px 14px', fontSize: 12, fontWeight: 600, color, background: bg, border,
      borderRadius: 100, cursor: 'pointer', ...dm,
    }}>{children}</button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, border: `1px dashed ${C.grayLight}`, padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>👋</div>
      <div style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, marginBottom: 8 }}>No vendors yet</div>
      <p style={{ fontSize: 14, color: C.darkMid, lineHeight: 1.55, maxWidth: 480, margin: '0 auto 20px' }}>
        Add your cleaner, landscaper, pool service, pest control, or any pro you pay on a schedule.
        Homie sends them an SMS to set up payments — they're done in 60 seconds.
      </p>
      <button onClick={onAdd} style={{
        padding: '12px 24px', fontSize: 15, fontWeight: 700, color: '#fff',
        background: C.orange, border: 'none', borderRadius: 100, cursor: 'pointer', ...dm,
      }}>+ Add your first vendor</button>
    </div>
  );
}

function AddVendorModal({ properties, onClose, onSuccess }: {
  properties: HomeownerProperty[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? '');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('cleaning');
  const [pattern, setPattern] = useState('weekly');
  const [dayOfWeek, setDayOfWeek] = useState(2); // Tuesday default
  const [time, setTime] = useState('09:00');
  const [amount, setAmount] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!propertyId) {
      setErr('Add a property first (in your account settings)');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const amountCents = Math.round(parseFloat(amount || '0') * 100);
      if (!Number.isFinite(amountCents) || amountCents <= 0) {
        setErr('Amount must be a positive number');
        setSubmitting(false);
        return;
      }
      const body = {
        homeowner_property_id: propertyId,
        vendor_name: name,
        vendor_phone: phone,
        vendor_email: email,
        service_category: category,
        vendor_type: 'byo',
        schedule_pattern: pattern,
        schedule_day_of_week: pattern === 'weekly' || pattern.startsWith('biweekly') ? dayOfWeek : null,
        schedule_time: time + ':00',
        amount_cents: amountCents,
        payment_method: 'card',
        auto_pay_rule: 'always',
      };
      await fetchAPI('/api/v1/account/vendors', { method: 'POST', body: JSON.stringify(body) });
      onSuccess();
    } catch (e2) {
      setErr((e2 as Error).message ?? 'Failed to add vendor');
      setSubmitting(false);
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{
        background: '#fff', borderRadius: 16, padding: '28px 28px 24px',
        maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ ...fr, fontSize: 22, fontWeight: 700, color: C.dark, marginBottom: 6 }}>Add a vendor</div>
        <p style={{ fontSize: 13, color: C.darkMid, marginBottom: 20, lineHeight: 1.5 }}>
          We'll text them a one-tap link to confirm payment details. They don't need an app.
        </p>

        {properties.length === 0 ? (
          <div style={{ background: '#FEF3C7', color: '#92400E', padding: '12px 14px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>
            You need a property on file first. Add one in your account settings, then come back here.
          </div>
        ) : (
          <Field label="Property">
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} style={fieldStyle}>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname ?? p.address ?? p.id}
                  {p.isPrimary ? ' (primary)' : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Vendor name">
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria's Cleaning Co." style={fieldStyle} />
        </Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Phone">
            <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" style={fieldStyle} />
          </Field>
          <Field label="Email">
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="maria@…" style={fieldStyle} />
          </Field>
        </div>
        <Field label="Service">
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={fieldStyle}>
            {SERVICE_CATEGORIES.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
          </select>
        </Field>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Schedule">
            <select value={pattern} onChange={(e) => setPattern(e.target.value)} style={fieldStyle}>
              {SCHEDULE_PATTERNS.map((s) => (<option key={s.value} value={s.value}>{s.label}</option>))}
            </select>
          </Field>
          {(pattern === 'weekly' || pattern.startsWith('biweekly')) && (
            <Field label="Day">
              <select value={dayOfWeek} onChange={(e) => setDayOfWeek(parseInt(e.target.value, 10))} style={fieldStyle}>
                <option value={0}>Sun</option><option value={1}>Mon</option><option value={2}>Tue</option>
                <option value={3}>Wed</option><option value={4}>Thu</option><option value={5}>Fri</option>
                <option value={6}>Sat</option>
              </select>
            </Field>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Time">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={fieldStyle} />
          </Field>
          <Field label="Amount per visit ($)">
            <input required type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="180" style={fieldStyle} />
          </Field>
        </div>

        {err && (
          <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginTop: 12 }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, padding: 12, fontSize: 14, fontWeight: 600, color: C.dark, background: '#fff',
            border: `1px solid ${C.grayLight}`, borderRadius: 100, cursor: 'pointer', ...dm,
          }}>Cancel</button>
          <button type="submit" disabled={submitting || properties.length === 0} style={{
            flex: 2, padding: 12, fontSize: 14, fontWeight: 700, color: '#fff', background: C.orange,
            border: 'none', borderRadius: 100, cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting || properties.length === 0 ? 0.5 : 1, ...dm,
          }}>{submitting ? 'Adding…' : 'Add vendor + send SMS'}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12, flex: 1, ...dm }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.darkMid, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  );
}

function PaymentMethodsSection({
  paymentMethods,
  onAdd,
  onRemove,
}: {
  paymentMethods: PaymentMethod[];
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const hasCards = paymentMethods.length > 0;
  return (
    <div
      style={{
        background: '#fff',
        borderRadius: 14,
        border: `1px solid ${C.grayLight}`,
        padding: 18,
        marginBottom: 24,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ ...dm, fontSize: 12, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.6 }}>
            Payment methods
          </div>
          <div style={{ ...dm, fontSize: 13, color: C.darkMid, marginTop: 4 }}>
            {hasCards
              ? 'Cards Homie can charge when a vendor visit completes.'
              : "Add a card so Homie can pay your vendors automatically when they finish a visit."}
          </div>
        </div>
        <button
          onClick={onAdd}
          style={{
            ...dm,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            color: hasCards ? C.dark : '#fff',
            background: hasCards ? '#fff' : C.orange,
            border: hasCards ? `1px solid ${C.grayLight}` : 'none',
            borderRadius: 100,
            cursor: 'pointer',
          }}
        >
          {hasCards ? 'Add another card' : '+ Add a card'}
        </button>
      </div>
      {hasCards && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {paymentMethods.map((pm) => (
            <div
              key={pm.id}
              style={{
                padding: '8px 12px',
                background: C.warm,
                borderRadius: 10,
                fontSize: 12,
                color: C.dark,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                ...dm,
              }}
            >
              <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{pm.brand ?? 'card'}</span>
              <span style={{ color: C.gray }}>•••• {pm.last4 ?? '----'}</span>
              {pm.expMonth && pm.expYear && (
                <span style={{ color: C.gray }}>
                  {String(pm.expMonth).padStart(2, '0')}/{String(pm.expYear).slice(-2)}
                </span>
              )}
              <button
                onClick={() => onRemove(pm.id)}
                title="Remove card"
                style={{ background: 'transparent', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const fieldStyle: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 14,
  border: `1px solid ${C.grayLight}`,
  borderRadius: 10,
  outline: 'none',
  fontFamily: "'DM Sans', sans-serif",
  color: C.dark,
  background: '#fff',
  boxSizing: 'border-box',
};
