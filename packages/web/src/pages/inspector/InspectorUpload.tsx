import { useState, useRef, useEffect, type FormEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { inspectorService, type InspectionReport, type InspectionItem } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';
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

type Step = 'upload' | 'client' | 'addon' | 'processing';

const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'client', label: 'Client Details' },
  { key: 'addon', label: 'Add-on' },
  { key: 'processing', label: 'Processing' },
];

export default function InspectorUpload() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Client details state
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [propertyAddress, setPropertyAddress] = useState('');
  const [propertyCity, setPropertyCity] = useState('');
  const [propertyState, setPropertyState] = useState('');
  const [propertyZip, setPropertyZip] = useState('');
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectionType, setInspectionType] = useState('pre-purchase');

  // Add-on state
  const [addonEnabled, setAddonEnabled] = useState(false);
  const [addonFee, setAddonFee] = useState('49');

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [processedItems, setProcessedItems] = useState<InspectionItem[]>([]);
  const [processedReport, setProcessedReport] = useState<InspectionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.findIndex(s => s.key === step);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === 'application/pdf') {
      setFile(dropped);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }

  async function handleSubmit() {
    if (!file) return;
    setStep('processing');
    setProcessing(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('clientName', clientName);
    formData.append('clientEmail', clientEmail);
    formData.append('clientPhone', clientPhone);
    formData.append('propertyAddress', propertyAddress);
    formData.append('propertyCity', propertyCity);
    formData.append('propertyState', propertyState);
    formData.append('propertyZip', propertyZip);
    formData.append('inspectionDate', inspectionDate);
    formData.append('inspectionType', inspectionType);
    if (addonEnabled) {
      formData.append('addonFee', addonFee);
    }

    try {
      const res = await inspectorService.createReport(formData);
      if (res.data) {
        setProcessedReport(res.data);
        // Animate items appearing
        const items = res.data.items;
        for (let i = 0; i < items.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 400));
          setProcessedItems(prev => [...prev, items[i]]);
        }
      }
    } catch (err) {
      setError((err as Error).message ?? 'Failed to process report');
    } finally {
      setProcessing(false);
    }
  }

  const SEVERITY_COLORS: Record<string, string> = {
    safety_hazard: '#E24B4A', urgent: '#E24B4A', recommended: '#EF9F27',
    monitor: '#9B9490', informational: '#D3CEC9',
  };

  const revenueSplit = addonEnabled ? {
    inspector: Math.round(Number(addonFee) * 0.7 * 100) / 100,
    homie: Math.round(Number(addonFee) * 0.3 * 100) / 100,
  } : null;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif", maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: '0 0 24px' }}>
        Upload Report
      </h1>

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
                <div style={{ fontSize: 12, color: '#9B9490' }}>{(file.size / 1024 / 1024).toFixed(1)} MB - Click to change</div>
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

      {/* Step 2: Client Details */}
      {step === 'client' && (
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Client Name *</label>
              <input style={inputStyle} value={clientName} onChange={e => setClientName(e.target.value)} placeholder="John Smith" required />
            </div>
            <div>
              <label style={labelStyle}>Client Email</label>
              <input style={inputStyle} type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="john@email.com" />
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
              onClick={() => setStep('addon')}
              disabled={!clientName || !propertyAddress || !propertyCity || !propertyState || !propertyZip || !inspectionDate}
              style={{
                flex: 2, padding: '12px 0', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                background: (clientName && propertyAddress && propertyCity && propertyState && propertyZip && inspectionDate) ? O : '#E0DAD4',
                color: '#fff', border: 'none', borderRadius: 10,
                cursor: (clientName && propertyAddress && propertyCity && propertyState && propertyZip && inspectionDate) ? 'pointer' : 'not-allowed',
              }}
            >Continue</button>
          </div>
        </div>
      )}

      {/* Step 3: Add-on */}
      {step === 'addon' && (
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 8 }}>
              Add-on Service Fee
            </div>
            <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.5, marginBottom: 16 }}>
              Charge your client an add-on fee for the enhanced digital report with instant quotes.
              You keep 70% of the add-on fee.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button
                onClick={() => setAddonEnabled(!addonEnabled)}
                style={{
                  width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                  background: addonEnabled ? G : '#E0DAD4', position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3,
                  left: addonEnabled ? 25 : 3, transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
              <span style={{ fontSize: 14, fontWeight: 600, color: D }}>
                {addonEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {addonEnabled && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Add-on price ($)</label>
                  <input
                    style={{ ...inputStyle, maxWidth: 120 }}
                    type="number"
                    min="0"
                    step="1"
                    value={addonFee}
                    onChange={e => setAddonFee(e.target.value)}
                  />
                </div>

                {revenueSplit && (
                  <div style={{
                    background: W, borderRadius: 10, padding: 16,
                    display: 'flex', gap: 24,
                  }}>
                    <div>
                      <div style={{ fontSize: 11, color: '#9B9490', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                        Your revenue (70%)
                      </div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: G }}>
                        ${revenueSplit.inspector.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: '#9B9490', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                        Platform fee (30%)
                      </div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: '#9B9490' }}>
                        ${revenueSplit.homie.toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep('client')} style={{
              flex: 1, padding: '12px 0', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              background: '#F5F0EB', color: '#6B6560', border: 'none', borderRadius: 10, cursor: 'pointer',
            }}>Back</button>
            <button onClick={handleSubmit} style={{
              flex: 2, padding: '12px 0', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
              background: O, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer',
            }}>Process Report</button>
          </div>
        </div>
      )}

      {/* Step 4: Processing */}
      {step === 'processing' && (
        <div style={{ background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 24 }}>
          {processing && !error && processedItems.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{
                width: 48, height: 48, border: `3px solid ${O}`, borderTopColor: 'transparent',
                borderRadius: '50%', margin: '0 auto 16px',
                animation: 'inspSpin 0.8s linear infinite',
              }} />
              <style>{`@keyframes inspSpin { to { transform: rotate(360deg); } }`}</style>
              <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 4 }}>Processing your report...</div>
              <div style={{ fontSize: 13, color: '#9B9490' }}>Extracting inspection items from PDF</div>
            </div>
          )}

          {error && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#E24B4A', marginBottom: 8 }}>Processing failed</div>
              <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 16 }}>{error}</div>
              <button onClick={() => { setStep('addon'); setError(null); setProcessedItems([]); }} style={{
                padding: '10px 24px', background: O, color: '#fff', border: 'none',
                borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}>Try again</button>
            </div>
          )}

          {processedItems.length > 0 && (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 16 }}>
                {processing ? 'Extracting items...' : `Found ${processedItems.length} items`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {processedItems.map((item, i) => {
                  const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: '12px 16px', background: W, borderRadius: 10,
                        animation: 'inspFadeIn 0.3s ease-out',
                      }}
                    >
                      <style>{`@keyframes inspFadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 100,
                          background: `${sevColor}18`, color: sevColor,
                        }}>
                          {item.severity.replace('_', ' ')}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: D }}>{item.title}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#6B6560' }}>{item.description}</div>
                    </div>
                  );
                })}
              </div>

              {!processing && processedReport && (
                <button
                  onClick={() => navigate(`/inspector/reports/${processedReport.id}`)}
                  style={{
                    width: '100%', padding: '12px 0', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                    background: O, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', marginTop: 20,
                  }}
                >
                  View Report
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
