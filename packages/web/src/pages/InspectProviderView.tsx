import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const W = '#F9F5F2';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

const SEVERITY_COLORS: Record<string, string> = {
  safety_hazard: '#E24B4A', urgent: '#E24B4A', recommended: '#EF9F27', monitor: '#9B9490', informational: '#D3CEC9',
};
const SEVERITY_LABELS: Record<string, string> = {
  safety_hazard: 'Safety Hazard', urgent: 'Urgent', recommended: 'Recommended', monitor: 'Monitor', informational: 'Info',
};

interface ProviderReportData {
  jobId: string;
  category: string;
  budget: string;
  property: {
    address: string; city: string; state: string; zip: string;
    inspectionDate: string; inspectionType: string;
  };
  items: Array<{
    id: string; title: string; description: string | null; severity: string;
    category: string; location: string | null; photoDescriptions: string[];
    costEstimateMin: number | null; costEstimateMax: number | null;
  }>;
}

interface SubmitResult {
  ok: boolean;
  providerName: string;
  itemCount: number;
  totalDollars: number | null;
  itemized: boolean;
}

function formatCurrency(amount: number): string {
  if (!amount || isNaN(amount)) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function InspectProviderView() {
  const { providerToken } = useParams<{ providerToken: string }>();
  const [data, setData] = useState<ProviderReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Submit form state
  const [phone, setPhone] = useState('');
  const [itemPrices, setItemPrices] = useState<Record<string, string>>({});
  const [bundlePrice, setBundlePrice] = useState('');
  const [availability, setAvailability] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<SubmitResult | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    if (!providerToken) return;
    fetch(`${API_BASE}/api/v1/inspect/provider/${providerToken}`)
      .then(async res => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'Failed to load');
        setData(body.data);
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [providerToken]);

  const itemTotal = useMemo(() => {
    return Object.values(itemPrices).reduce((sum, v) => {
      const n = parseFloat(v);
      return sum + (isNaN(n) || n <= 0 ? 0 : n);
    }, 0);
  }, [itemPrices]);

  const bundleNum = parseFloat(bundlePrice);
  const hasItemized = itemTotal > 0;
  const hasBundle = !isNaN(bundleNum) && bundleNum > 0;

  async function handleSubmit() {
    if (!data) return;
    setSubmitError(null);

    if (!phone.trim()) {
      setSubmitError('Please enter your business phone number.');
      return;
    }
    if (!hasItemized && !hasBundle) {
      setSubmitError('Enter a price for at least one item, or a bundle total.');
      return;
    }
    if (hasItemized && hasBundle) {
      setSubmitError('Use either per-item prices OR a bundle total — not both.');
      return;
    }

    setSubmitting(true);

    const itemPricesNumeric: Record<string, number> = {};
    if (hasItemized) {
      for (const [itemId, raw] of Object.entries(itemPrices)) {
        const n = parseFloat(raw);
        if (!isNaN(n) && n > 0) itemPricesNumeric[itemId] = n;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/inspect/provider/${providerToken}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.trim(),
          itemPrices: hasItemized ? itemPricesNumeric : undefined,
          bundlePrice: hasBundle ? bundleNum : undefined,
          availability: availability.trim() || undefined,
          message: message.trim() || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSubmitError(body.error ?? 'Failed to submit quote');
        setSubmitting(false);
        return;
      }
      setSubmitted(body.data as SubmitResult);
    } catch (err) {
      setSubmitError((err as Error).message ?? 'Network error');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ color: '#9B9490', fontSize: 14 }}>Loading report details...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: D, marginBottom: 8 }}>Report not found</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>{error ?? 'This link may have expired or is invalid.'}</div>
        </div>
      </div>
    );
  }

  const totalLow = data.items.reduce((s, i) => s + (i.costEstimateMin ?? 0), 0);
  const totalHigh = data.items.reduce((s, i) => s + (i.costEstimateMax ?? 0), 0);

  // ── Submitted state ──────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={{ maxWidth: 520, margin: '0 auto', padding: '60px 16px' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u2713'}</div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, marginBottom: 8 }}>Quote submitted</div>
            <div style={{ fontSize: 14, color: '#6B6560' }}>
              Thanks {submitted.providerName}. The homeowner has been notified.
            </div>
          </div>
          <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#9B9490', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              {submitted.itemized ? `Itemized total (${submitted.itemCount} items)` : `Bundle total (covers ${submitted.itemCount} items)`}
            </div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 700, color: G }}>
              {submitted.totalDollars != null ? formatCurrency(submitted.totalDollars) : '\u2014'}
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#9B9490' }}>
            You can close this page. We'll text you if the homeowner accepts.
          </div>
        </div>
      </div>
    );
  }

  // ── Default state with submit form ───────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: W, fontFamily: "'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@400;700&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 60px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 28, color: O }}>homie</span>
            <span style={{ fontSize: 13, color: '#9B9490', fontWeight: 500 }}>inspect</span>
          </div>
          <div style={{ fontSize: 13, color: '#9B9490', marginTop: 4 }}>Provider quote request</div>
        </div>

        {/* What is Homie? — expandable explainer for first-time providers */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4',
          marginBottom: 16, overflow: 'hidden',
        }}>
          <button
            onClick={() => setAboutOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, padding: '12px 18px', background: 'transparent', border: 'none',
              cursor: 'pointer', textAlign: 'left',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
                background: `${G}18`, color: G, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Free for providers
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: D }}>
                New to Homie? Learn how it works
              </span>
            </div>
            <span style={{ fontSize: 12, color: '#9B9490', fontWeight: 600 }}>
              {aboutOpen ? 'Hide \u25B2' : 'Show \u25BC'}
            </span>
          </button>
          {aboutOpen && (
            <div style={{ padding: '0 18px 18px', borderTop: '1px solid #F0EBE5' }}>
              <p style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, margin: '14px 0 12px' }}>
                Homie is an AI-powered platform that connects homeowners with local pros for repair
                and maintenance work. A homeowner uploaded their inspection report, picked items
                they'd like quoted, and we found you among the top-rated {data.category} pros in
                their area.
              </p>

              <div style={{
                background: `${G}08`, borderRadius: 10, padding: '12px 14px', marginBottom: 12,
                border: `1px solid ${G}25`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: G, marginBottom: 6 }}>
                  100% free for providers. Always.
                </div>
                <div style={{ fontSize: 12, color: '#6B6560', lineHeight: 1.6 }}>
                  No subscription. No lead fees. No commissions. The homeowner pays Homie a small
                  fee for the inspection-to-quote workflow {'\u2014'} you keep your full quote.
                </div>
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, color: D, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                How it works
              </div>
              <ol style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.7, margin: 0, paddingLeft: 20 }}>
                <li>Review the items below and submit your estimated price (per item or bundle).</li>
                <li>The homeowner sees your quote alongside any others and picks the pro they like best.</li>
                <li>If they pick you, we connect you directly to schedule the work. No middleman.</li>
                <li>You invoice and get paid by the homeowner the way you normally do.</li>
              </ol>

              <div style={{ marginTop: 14, fontSize: 12, color: '#9B9490', lineHeight: 1.6 }}>
                Questions? Email <a href="mailto:yo@homiepro.ai" style={{ color: O, textDecoration: 'none', fontWeight: 600 }}>yo@homiepro.ai</a>.
              </div>
            </div>
          )}
        </div>

        {/* Property + Job info */}
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: D, marginBottom: 4, fontFamily: 'Fraunces, serif' }}>
            {data.property.address}
          </div>
          <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 8 }}>
            {data.property.city}, {data.property.state} {data.property.zip}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: '#9B9490' }}>
            <span>Inspected {formatDate(data.property.inspectionDate)}</span>
            <span>|</span>
            <span style={{ textTransform: 'capitalize' }}>{data.category}</span>
            <span>|</span>
            <span>{data.items.length} item{data.items.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Summary card */}
        <div style={{
          background: `linear-gradient(135deg, ${D} 0%, #3D3936 100%)`, borderRadius: 14, padding: 20, marginBottom: 20, color: '#fff',
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, textTransform: 'capitalize' }}>
            {data.category} {'\u2014'} {data.items.length} item{data.items.length !== 1 ? 's' : ''}
          </div>
          {totalLow > 0 && (
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 2 }}>Estimated range</div>
                <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700 }}>
                  {formatCurrency(totalLow)} {'\u2013'} {formatCurrency(totalHigh)}
                </div>
              </div>
            </div>
          )}
          <div style={{ marginTop: 16, fontSize: 13, color: '#9B9490', lineHeight: 1.6 }}>
            Review each item below, enter a price per item (preferred) or a single bundle total, then submit.
          </div>
        </div>

        {/* Items with per-item price inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.items.map((item, idx) => {
            const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
            return (
              <div key={item.id} style={{
                background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#9B9490', minWidth: 20 }}>#{idx + 1}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 100,
                    background: `${sevColor}18`, color: sevColor,
                  }}>
                    {SEVERITY_LABELS[item.severity] ?? item.severity}
                  </span>
                  {item.location && (
                    <span style={{ fontSize: 11, color: '#9B9490' }}>{item.location}</span>
                  )}
                </div>

                <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 6 }}>
                  {item.title}
                </div>

                {item.description && (
                  <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.6, marginBottom: 10 }}>
                    {item.description}
                  </div>
                )}

                {item.photoDescriptions.length > 0 && (
                  <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {item.photoDescriptions.map((desc, pi) => (
                      <div key={pi} style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        fontSize: 12, color: '#6B6560', background: '#F5F0EB',
                        padding: '8px 12px', borderRadius: 8, lineHeight: 1.5,
                      }}>
                        <span style={{ fontSize: 14, lineHeight: '18px' }}>{'\uD83D\uDCF7'}</span>
                        <span style={{ fontStyle: 'italic' }}>{desc}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  {item.costEstimateMin != null && item.costEstimateMin > 0 && (
                    <span style={{
                      fontSize: 12, color: '#6B6560', background: W, padding: '4px 10px', borderRadius: 6,
                    }}>
                      Est. {formatCurrency(item.costEstimateMin)}
                      {item.costEstimateMax != null && item.costEstimateMax > 0 && ` ${'\u2013'} ${formatCurrency(item.costEstimateMax)}`}
                    </span>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: D }}>Estimated price</span>
                    <span style={{ fontSize: 14, color: '#9B9490', marginRight: -2 }}>$</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      min="0"
                      step="1"
                      value={itemPrices[item.id] ?? ''}
                      onChange={e => setItemPrices(p => ({ ...p, [item.id]: e.target.value }))}
                      disabled={hasBundle}
                      style={{
                        width: 90, padding: '8px 10px', borderRadius: 8,
                        border: `1px solid ${hasBundle ? '#E0DAD4' : (itemPrices[item.id] ? G : '#D3CEC9')}`,
                        fontSize: 14, fontWeight: 600, color: D, background: hasBundle ? '#F5F0EB' : '#fff',
                        textAlign: 'right',
                      }}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        {/* Itemized total preview */}
        {hasItemized && !hasBundle && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: `${G}10`, border: `1px solid ${G}30`, borderRadius: 12,
            padding: '12px 16px', marginTop: 12,
          }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: D }}>Itemized total</span>
            <span style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: G }}>
              {formatCurrency(itemTotal)}
            </span>
          </div>
        )}

        {/* Bundle escape hatch */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4',
          padding: '14px 18px', marginTop: 16,
        }}>
          <div style={{ fontSize: 12, color: '#9B9490', marginBottom: 6, textAlign: 'center' }}>
            {'\u2014 or \u2014'}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: D }}>Bundle price (all items together)</div>
              <div style={{ fontSize: 11, color: '#9B9490', marginTop: 2 }}>
                Use this if you'd quote one combined price for the whole visit
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 14, color: '#9B9490' }}>$</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="0"
                min="0"
                step="1"
                value={bundlePrice}
                onChange={e => setBundlePrice(e.target.value)}
                disabled={hasItemized}
                style={{
                  width: 110, padding: '8px 10px', borderRadius: 8,
                  border: `1px solid ${hasItemized ? '#E0DAD4' : (bundlePrice ? G : '#D3CEC9')}`,
                  fontSize: 14, fontWeight: 600, color: D, background: hasItemized ? '#F5F0EB' : '#fff',
                  textAlign: 'right',
                }}
              />
            </div>
          </label>
        </div>

        {/* Phone + availability + message */}
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #E0DAD4',
          padding: 20, marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: D, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Business phone {'\u2217'}
            </label>
            <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 6 }}>
              The phone number Homie reached you at. We use this to verify your quote.
            </div>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid #D3CEC9', fontSize: 14, color: D,
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: D, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Earliest availability
            </label>
            <input
              type="text"
              value={availability}
              onChange={e => setAvailability(e.target.value)}
              placeholder="e.g. Tomorrow afternoon, next Tuesday"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, marginTop: 6,
                border: '1px solid #D3CEC9', fontSize: 14, color: D,
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 700, color: D, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Notes (optional)
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Anything the homeowner should know"
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8, marginTop: 6,
                border: '1px solid #D3CEC9', fontSize: 14, color: D, resize: 'vertical',
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
        </div>

        {submitError && (
          <div style={{
            background: '#FEE2E2', color: '#DC2626', padding: '10px 14px',
            borderRadius: 10, fontSize: 13, marginTop: 14,
          }}>
            {submitError}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%', marginTop: 16, padding: '16px 20px', borderRadius: 12,
            background: O, color: '#fff', border: 'none', cursor: submitting ? 'wait' : 'pointer',
            fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? 'Submitting...' : 'Submit quote'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: '#9B9490' }}>
          Powered by <a href="https://homiepro.ai" style={{ color: O, textDecoration: 'none', fontWeight: 600 }}>Homie</a>
        </div>
      </div>
    </div>
  );
}
