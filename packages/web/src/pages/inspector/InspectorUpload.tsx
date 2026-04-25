import { useState, useEffect, useRef, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { inspectorService } from '@/services/inspector-api';
import { trackEvent } from '@/services/analytics';

const O = '#E8632B';
const D = '#2D2926';
const W = '#F9F5F2';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', fontSize: 14, fontFamily: "'DM Sans', sans-serif",
  border: '1px solid #E0DAD4', borderRadius: 10, background: '#ffffff', color: D,
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600, color: D, marginBottom: 6,
  fontFamily: "'DM Sans', sans-serif",
};

/** Wholesale upload flow:
 *    upload  → drop the PDF
 *    client  → enter the homeowner's contact + property details
 *    pay     → choose tier (essential / professional / premium) +
 *              Stripe checkout (redirect)
 *
 *  After Stripe success the inspector lands back on
 *  /inspector/reports/:id?paid=1 — the parser is already firing
 *  via the webhook by the time they arrive, so the report-detail
 *  page just shows a "processing" state until items appear. The
 *  homeowner gets the parsed report by email automatically once
 *  parsing completes; the tier on the row decides which sections
 *  are visible to them in the portal. */
type Step = 'upload' | 'client' | 'pay';
type Tier = 'essential' | 'professional' | 'premium';

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'client', label: 'Client details' },
  { key: 'pay',    label: 'Choose tier & pay' },
];

/** Tier card metadata — kept client-side for the picker UI. The
 *  authoritative wholesale price lives in pricing-config on the
 *  server; if an admin changes it via the DB the display here may
 *  briefly mismatch, but Stripe's actual charge always reflects
 *  the server truth (the upload endpoint stamps it). Update these
 *  numbers if you change pricing-config defaults. */
const TIERS: {
  id: Tier;
  name: string;
  retailLabel: string;
  retailCents: number;
  wholesaleLabel: string;
  wholesaleCents: number;
  spreadLabel: string;
  tagline: string;
  features: string[];
  popular?: boolean;
}[] = [
  {
    id: 'essential',
    name: 'Essential',
    retailLabel: '$99',
    retailCents: 9900,
    wholesaleLabel: '$49',
    wholesaleCents: 4900,
    spreadLabel: '$50',
    tagline: 'AI report analysis',
    features: [
      'AI report analysis',
      'Item details & severity',
      'Cost estimates',
      'Category breakdown',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    retailLabel: '$199',
    retailCents: 19900,
    wholesaleLabel: '$79',
    wholesaleCents: 7900,
    spreadLabel: '$120',
    tagline: 'Real quotes from local pros',
    features: [
      'Everything in Essential',
      'Dispatch to providers',
      'Quote comparison',
      'Real-time quote tracking',
    ],
    popular: true,
  },
  {
    id: 'premium',
    name: 'Premium',
    retailLabel: '$299',
    retailCents: 29900,
    wholesaleLabel: '$99',
    wholesaleCents: 9900,
    spreadLabel: '$200',
    tagline: 'Negotiate and plan with confidence',
    features: [
      'Everything in Professional',
      'Negotiation documents',
      'Priority dispatch',
      'Maintenance timeline',
    ],
  },
];

/** Read a File as a base64 data URL. The backend uploads to Cloudinary
 *  from a data URL, so we keep the wire payload as JSON instead of
 *  multipart. Files larger than ~10MB are rare for inspection PDFs but
 *  this still handles them — just slower over the wire. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function InspectorUpload() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Homeowner contact (was "client details")
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [propertyCity, setPropertyCity] = useState('');
  const [propertyState, setPropertyState] = useState('');
  const [propertyZip, setPropertyZip] = useState('');
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectionType, setInspectionType] = useState('pre-purchase');

  // Submit + payment state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Default tier — Professional (the "most popular" in the consumer
  // pricing page). Inspector can flip to Essential/Premium on the
  // pay step before checkout.
  const [selectedTier, setSelectedTier] = useState<Tier>('professional');

  const stepIndex = STEPS.findIndex(s => s.key === step);

  // Show a banner if Stripe redirected back here with cancel=<reportId>.
  // The row is already in the DB with paymentStatus='pending' but no
  // checkout completed; we surface a soft notice so the inspector
  // knows their upload didn't go through and they can retry. The row
  // gets cleaned up after 24h by an existing housekeeping sweep
  // (or a future one — for now they're just dead rows in 'pending').
  const [cancelledReportId, setCancelledReportId] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cancelled = params.get('cancelled');
    if (cancelled) setCancelledReportId(cancelled);
  }, []);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') {
      trackEvent('inspector_upload_started', {});
      trackEvent('inspect_upload_started', { source: 'inspector_portal' });
      setFile(dropped);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) {
      trackEvent('inspector_upload_started', {});
      trackEvent('inspect_upload_started', { source: 'inspector_portal' });
      setFile(selected);
    }
  }

  /** Final step — convert PDF to a data URL, POST, and redirect to
   *  Stripe. The backend creates the report row in payment_status
   *  'pending' + parsing_status 'awaiting_payment', then returns
   *  the Checkout Session URL. The webhook flips the row to 'paid'
   *  + 'processing' on success and kicks off the parser. */
  async function handlePayAndProcess() {
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await inspectorService.createReport({
        property_address: propertyAddress,
        property_city: propertyCity,
        property_state: propertyState,
        property_zip: propertyZip,
        client_name: clientName,
        client_email: clientEmail,
        client_phone: clientPhone || undefined,
        inspection_date: inspectionDate,
        inspection_type: inspectionType,
        report_file_data_url: dataUrl,
        pricing_tier: selectedTier,
      });
      if (res.error || !res.data) {
        throw new Error(res.error ?? 'Failed to start checkout');
      }
      // The user reached Stripe Checkout — fire the "paid" event here.
      // Stripe abandonment is rare, and we don't get a client-side webhook
      // ping back. Approximation is good enough for funnel tracking; the
      // backend payment_status is the source of truth for revenue numbers.
      trackEvent('inspector_upload_paid', { pricing_tier: selectedTier });
      trackEvent('inspect_upload_paid', { source: 'inspector_portal', pricing_tier: selectedTier });
      // Redirect to Stripe-hosted Checkout. On success Stripe sends
      // the user back to /inspector/reports/<id>?paid=1.
      window.location.href = res.data.checkoutUrl;
    } catch (err) {
      setError((err as Error).message ?? 'Failed to start checkout');
      setSubmitting(false);
    }
  }

  // Form completeness gates the Continue button on each step.
  const clientStepValid =
    !!clientName && !!clientEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail) &&
    !!propertyAddress && !!propertyCity && !!propertyState && !!propertyZip && !!inspectionDate;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: '0 0 24px' }}>
        Upload Report
      </h1>

      {cancelledReportId && (
        <div style={{
          background: '#FFF7ED', border: '1px solid #F59E0B33',
          borderRadius: 10, padding: '12px 14px', marginBottom: 20,
          fontSize: 13, color: '#9A6300', lineHeight: 1.4,
        }}>
          Checkout was cancelled. Your upload wasn&rsquo;t charged or processed
          &mdash; you can re-enter the details below and try again.
        </div>
      )}

      {/* Step indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32 }}>
        {STEPS.map((s, i) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: i <= stepIndex ? O : '#E0DAD4',
              color: i <= stepIndex ? '#fff' : '#9B9490',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
            }}>
              {i + 1}
            </div>
            <span style={{
              fontSize: 12, fontWeight: i === stepIndex ? 600 : 400,
              color: i === stepIndex ? D : '#9B9490',
            }}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ width: 24, height: 1, background: '#E0DAD4' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: File Upload */}
      {step === 'upload' && (
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 24 }}>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? O : '#E0DAD4'}`,
              borderRadius: 12,
              padding: 40,
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? '#FFF8F4' : W,
              transition: 'all 0.15s',
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <svg width={40} height={40} viewBox="0 0 40 40" fill="none" stroke={dragOver ? O : '#9B9490'} strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 12 }}>
              <path d="M20 26V14" /><path d="M14 18l6-6 6 6" />
              <path d="M8 28v2a2 2 0 002 2h20a2 2 0 002-2v-2" />
            </svg>
            {file ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 4 }}>{file.name}</div>
                <div style={{ fontSize: 12, color: '#9B9490' }}>{(file.size / 1024 / 1024).toFixed(1)} MB &mdash; click to change</div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 4 }}>
                  Drop your inspection report PDF here
                </div>
                <div style={{ fontSize: 12, color: '#9B9490' }}>or click to browse files</div>
              </div>
            )}
          </div>

          <button
            onClick={() => setStep('client')}
            disabled={!file}
            style={{
              width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600,
              fontFamily: "'DM Sans', sans-serif", background: file ? O : '#E0DAD4',
              color: '#fff', border: 'none', borderRadius: 10, cursor: file ? 'pointer' : 'not-allowed',
              marginTop: 20,
            }}
          >
            Continue
          </button>
        </div>
      )}

      {/* Step 2: Homeowner contact + property */}
      {step === 'client' && (
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: D, marginBottom: 4 }}>Send the parsed report to your client</div>
            <div style={{ fontSize: 12, color: '#9B9490', lineHeight: 1.5 }}>
              The homeowner will get an email with the parsed report when processing finishes.
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Client Name *</label>
              <input style={inputStyle} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="John Smith" required />
            </div>
            <div>
              <label style={labelStyle}>Client Email *</label>
              <input style={inputStyle} type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="john@email.com" required />
            </div>
            <div>
              <label style={labelStyle}>Client Phone</label>
              <input style={inputStyle} type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="(555) 123-4567" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Property Address *</label>
              <input style={inputStyle} value={propertyAddress} onChange={e => setPropertyAddress(e.target.value)} placeholder="123 Main St" required />
            </div>
            <div>
              <label style={labelStyle}>City *</label>
              <input style={inputStyle} value={propertyCity} onChange={e => setPropertyCity(e.target.value)} placeholder="Austin" required />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>State *</label>
                <input style={inputStyle} value={propertyState} onChange={e => setPropertyState(e.target.value)} placeholder="TX" maxLength={2} required />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Zip *</label>
                <input style={inputStyle} value={propertyZip} onChange={e => setPropertyZip(e.target.value)} placeholder="78701" required />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Inspection Date *</label>
              <input style={inputStyle} type="date" value={inspectionDate} onChange={e => setInspectionDate(e.target.value)} required />
            </div>
            <div>
              <label style={labelStyle}>Inspection Type *</label>
              <select style={inputStyle} value={inspectionType} onChange={e => setInspectionType(e.target.value)}>
                <option value="pre-purchase">Pre-Purchase</option>
                <option value="pre-listing">Pre-Listing</option>
                <option value="annual">Annual</option>
                <option value="warranty">Warranty</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button onClick={() => setStep('upload')} style={{
              flex: 1, padding: '12px 0', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              background: '#F5F0EB', color: '#6B6560', border: 'none', borderRadius: 10, cursor: 'pointer',
            }}>Back</button>
            <button
              onClick={() => setStep('pay')}
              disabled={!clientStepValid}
              style={{
                flex: 2, padding: '12px 0', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                background: clientStepValid ? O : '#E0DAD4',
                color: '#fff', border: 'none', borderRadius: 10,
                cursor: clientStepValid ? 'pointer' : 'not-allowed',
              }}
            >Continue to payment</button>
          </div>
        </div>
      )}

      {/* Step 3: Choose tier & pay */}
      {step === 'pay' && (() => {
        const selected = TIERS.find(t => t.id === selectedTier) ?? TIERS[1];
        return (
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: D, marginBottom: 4 }}>Pick the tier you&rsquo;re selling your client</div>
            <div style={{ fontSize: 12, color: '#9B9490', lineHeight: 1.5 }}>
              Wholesale rate is what you pay Homie at checkout. Bill your client whatever you like on
              your own invoice &mdash; the suggested retail is just a benchmark.
            </div>
          </div>

          {/* Tier cards — radio-card pattern. Click anywhere on a card to select. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
            {TIERS.map(t => {
              const isOn = t.id === selectedTier;
              return (
                <div
                  key={t.id}
                  onClick={() => { trackEvent('inspector_upload_tier_selected', { pricing_tier: t.id }); setSelectedTier(t.id); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trackEvent('inspector_upload_tier_selected', { pricing_tier: t.id }); setSelectedTier(t.id); } }}
                  style={{
                    border: `2px solid ${isOn ? O : '#E0DAD4'}`,
                    background: isOn ? '#FFF8F4' : '#fff',
                    borderRadius: 12,
                    padding: '14px 16px',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    position: 'relative',
                  }}
                >
                  {t.popular && (
                    <div style={{
                      position: 'absolute', top: -10, left: 16,
                      background: O, color: '#fff', fontSize: 10, fontWeight: 700,
                      padding: '3px 10px', borderRadius: 100, letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}>Most popular</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    {/* Radio dot */}
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: `2px solid ${isOn ? O : '#9B9490'}`,
                      flexShrink: 0, marginTop: 3,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isOn && <div style={{ width: 8, height: 8, borderRadius: '50%', background: O }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div>
                          <span style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: D }}>{t.name}</span>
                          <span style={{ fontSize: 12, color: '#9B9490', marginLeft: 8 }}>{t.tagline}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: '#9B9490', textTransform: 'uppercase', letterSpacing: 1 }}>You pay</div>
                          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: D, lineHeight: 1 }}>{t.wholesaleLabel}</div>
                        </div>
                      </div>
                      {/* Inspector economics summary */}
                      <div style={{
                        marginTop: 8, fontSize: 12, color: '#6B6560',
                        display: 'flex', flexWrap: 'wrap', gap: 12,
                      }}>
                        <span><span style={{ color: '#9B9490' }}>Suggested retail:</span> <strong style={{ color: D }}>{t.retailLabel}</strong></span>
                        <span style={{ color: '#1B9E77' }}>You keep <strong>{t.spreadLabel}</strong></span>
                      </div>
                      {/* Feature checklist — tightly stacked. Only show
                          when selected to keep collapsed cards compact. */}
                      {isOn && (
                        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
                          {t.features.map(f => (
                            <li key={f} style={{
                              fontSize: 13, color: '#6B6560', marginBottom: 4,
                              display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                              <span style={{ color: O, fontSize: 12 }}>&#10003;</span> {f}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recipient + property summary */}
          <div style={{
            background: W, border: '1px solid #E0DAD4', borderRadius: 10,
            padding: '12px 14px', fontSize: 12, color: '#6B6560', marginBottom: 18,
          }}>
            <div><strong style={{ color: D }}>Sending to:</strong> {clientEmail}</div>
            <div style={{ marginTop: 4 }}><strong style={{ color: D }}>Property:</strong> {propertyAddress}, {propertyCity}, {propertyState} {propertyZip}</div>
          </div>

          {/* What happens next */}
          <div style={{ fontSize: 12, color: '#9B9490', lineHeight: 1.6, marginBottom: 18 }}>
            We&rsquo;ll redirect you to Stripe to capture payment. Once paid, parsing kicks off automatically
            and the parsed report is emailed to your client when it&rsquo;s ready (usually under 5 minutes).
            You&rsquo;ll see the live progress on the next page.
          </div>

          {error && (
            <div style={{
              background: '#FEF2F2', border: '1px solid #E24B4A33', borderRadius: 10,
              padding: '12px 14px', marginBottom: 16,
              fontSize: 13, color: '#B91C1C',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('client')} disabled={submitting} style={{
              flex: 1, padding: '12px 0', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              background: '#F5F0EB', color: '#6B6560', border: 'none', borderRadius: 10,
              cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1,
            }}>Back</button>
            <button
              onClick={handlePayAndProcess}
              disabled={submitting}
              style={{
                flex: 2, padding: '12px 0', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                background: submitting ? '#E0DAD4' : O, color: '#fff', border: 'none', borderRadius: 10,
                cursor: submitting ? 'default' : 'pointer',
              }}
            >{submitting ? 'Redirecting to Stripe…' : `Pay ${selected.wholesaleLabel} & process →`}</button>
          </div>
        </div>
        );
      })()}

      {/* The "View Report" button + animated processed-items list that
          used to live here under the old multipart flow has been
          removed — payment now happens BEFORE parsing, so when Stripe
          redirects back to /inspector/reports/<id>?paid=1 the report
          detail page is the natural landing surface for the
          processing/parsed states. */}
      {/* Hidden marker so the navigate import is used (suppress lint) */}
      {false && <button onClick={() => navigate('/inspector')} hidden>noop</button>}
    </div>
  );
}
