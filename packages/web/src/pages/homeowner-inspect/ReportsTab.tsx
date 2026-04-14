import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { inspectService, type PortalReport, type InspectReportPublic, type InspectionItem, type InspectStatusItem } from '@/services/inspector-api';
import { SEVERITY_COLORS, SEVERITY_LABELS, CATEGORY_ICONS, CATEGORY_LABELS, formatCurrency, formatDate } from './constants';
import type { Tab } from './constants';

interface ReportsTabProps {
  onNavigate: (tab: Tab) => void;
  reports: PortalReport[];
  onReportsChange: () => void;
}

type ReportsView = 'list' | 'upload' | 'detail';
type UploadStep = 'file' | 'address' | 'progress';

const ACCENT = '#2563EB';

// ── Main Component ──────────────────────────────────────────────────────────

export default function ReportsTab({ onNavigate, reports, onReportsChange }: ReportsTabProps) {
  const [view, setView] = useState<ReportsView>('list');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Check URL params for payment return or report selection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('report');
    if (reportId) {
      setSelectedReportId(reportId);
      setView('detail');
    }
  }, []);

  function openReport(id: string) {
    setSelectedReportId(id);
    setView('detail');
  }

  function backToList() {
    setSelectedReportId(null);
    setView('list');
    // Clean URL params
    const url = new URL(window.location.href);
    url.searchParams.delete('report');
    url.searchParams.delete('payment');
    url.searchParams.delete('session_id');
    window.history.replaceState({}, '', url.toString());
  }

  if (view === 'upload') {
    return <UploadWizard onBack={backToList} onComplete={(id) => { onReportsChange(); openReport(id); }} />;
  }

  if (view === 'detail' && selectedReportId) {
    return <ReportDetail reportId={selectedReportId} reports={reports} onBack={backToList} onReportsChange={onReportsChange} onNavigate={onNavigate} />;
  }

  return <ReportList reports={reports} onUpload={() => setView('upload')} onOpen={openReport} onReportsChange={onReportsChange} />;
}

// ── Report List ─────────────────────────────────────────────────────────────

function ReportList({ reports, onUpload, onOpen, onReportsChange }: { reports: PortalReport[]; onUpload: () => void; onOpen: (id: string) => void; onReportsChange: () => void }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await inspectService.deleteReport(id);
      setConfirmDeleteId(null);
      onReportsChange();
    } catch { /* ignore */ }
    setDeleting(false);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>My Reports</h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>Upload and manage your inspection reports</p>
        </div>
        <button onClick={onUpload} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
          cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M4 10h12" /></svg>
          Upload Report
        </button>
      </div>

      {reports.length === 0 ? (
        <div style={{
          background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
          padding: '60px 40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCC4'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
            No reports yet
          </h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 20px', maxWidth: 400, marginInline: 'auto' }}>
            Upload your home inspection report PDF and our AI will parse every item, categorize by severity, and estimate repair costs.
          </p>
          <button onClick={onUpload} style={{
            padding: '12px 28px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
            cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
          }}>
            Upload Your First Report
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 0,
              background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
              transition: 'border-color 0.15s', overflow: 'hidden',
            }}
            onMouseOver={e => (e.currentTarget.style.borderColor = ACCENT)}
            onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--bp-border)')}
            >
              {/* Report card — clickable */}
              <button onClick={() => onOpen(r.id)} style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px',
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 0,
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: `${ACCENT}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  {'\uD83C\uDFE0'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.propertyAddress}
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', marginTop: 2 }}>
                    {r.propertyCity}, {r.propertyState} &middot; {formatDate(r.inspectionDate || r.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {r.parsingStatus === 'processing' ? (
                    <StatusBadge label="Processing" color="#3B82F6" pulse />
                  ) : r.pricingTier ? (
                    <StatusBadge label={r.pricingTier.charAt(0).toUpperCase() + r.pricingTier.slice(1)} color="#10B981" />
                  ) : r.parsingStatus === 'parsed' || r.parsingStatus === 'review_pending' || r.parsingStatus === 'sent_to_client' ? (
                    <StatusBadge label="Ready" color="#10B981" />
                  ) : r.parsingStatus === 'failed' ? (
                    <StatusBadge label="Failed" color="#EF4444" />
                  ) : null}
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', minWidth: 60, textAlign: 'right' }}>
                    {r.itemCount} item{r.itemCount !== 1 ? 's' : ''}
                  </div>
                  <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="var(--bp-subtle)" strokeWidth="2" strokeLinecap="round"><path d="M8 4l6 6-6 6" /></svg>
                </div>
              </button>

              {/* Delete button */}
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(r.id); }}
                title="Delete report"
                style={{
                  padding: '18px 14px', background: 'none', border: 'none', borderLeft: '1px solid var(--bp-border)',
                  cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center',
                  opacity: 0.4, transition: 'opacity 0.15s',
                }}
                onMouseOver={e => (e.currentTarget.style.opacity = '1')}
                onMouseOut={e => (e.currentTarget.style.opacity = '0.4')}
              >
                <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 6h14M8 6V4a1 1 0 011-1h2a1 1 0 011 1v2M5 6v11a2 2 0 002 2h6a2 2 0 002-2V6" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDeleteId && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}
        onClick={() => setConfirmDeleteId(null)}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bp-card)', borderRadius: 16, padding: '28px 24px',
            maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
              Delete Report?
            </h3>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 20px' }}>
              This will permanently delete this report and all its parsed items. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDeleteId(null)} style={{
                padding: '8px 18px', borderRadius: 8, border: '1px solid var(--bp-border)',
                background: 'transparent', color: 'var(--bp-text)', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
              }}>Cancel</button>
              <button onClick={() => handleDelete(confirmDeleteId)} disabled={deleting} style={{
                padding: '8px 18px', borderRadius: 8, border: 'none',
                background: '#EF4444', color: '#fff', cursor: deleting ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                opacity: deleting ? 0.7 : 1,
              }}>{deleting ? 'Deleting...' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ label, color, pulse }: { label: string; color: string; pulse?: boolean }) {
  return (
    <span style={{
      fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, padding: '3px 10px',
      borderRadius: 20, background: `${color}18`, color,
      animation: pulse ? 'pulse 2s ease-in-out infinite' : undefined,
    }}>
      {pulse && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, marginRight: 5, animation: 'pulse 1.5s ease-in-out infinite' }} />}
      {label}
    </span>
  );
}

// ── Upload Wizard ───────────────────────────────────────────────────────────

function UploadWizard({ onBack, onComplete }: { onBack: () => void; onComplete: (reportId: string) => void }) {
  const { homeowner } = useAuth();
  const [step, setStep] = useState<UploadStep>('file');
  const [file, setFile] = useState<File | null>(null);
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState(homeowner?.zip_code ?? '');
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [parsingStatus, setParsingStatus] = useState('');
  const [itemsParsed, setItemsParsed] = useState(0);
  const [parsingError, setParsingError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  function handleFile(f: File) {
    if (f.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }
    if (f.size > 50 * 1024 * 1024) {
      setError('File must be under 50 MB');
      return;
    }
    setError(null);
    setFile(f);
    // Convert to data URL
    const reader = new FileReader();
    reader.onload = () => { setFileDataUrl(reader.result as string); setStep('address'); };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsDataURL(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function startUpload() {
    if (!fileDataUrl) return;
    setStep('progress');
    setParsingStatus('uploading');
    setParsingError(null);

    try {
      const res = await inspectService.uploadReport({
        report_file_data_url: fileDataUrl,
        property_address: address || undefined,
        property_city: city || undefined,
        property_state: state || undefined,
        property_zip: zip || undefined,
      });

      if (res.error || !res.data) {
        setParsingError(res.error ?? 'Upload failed');
        setParsingStatus('failed');
        return;
      }

      const rid = res.data.reportId;
      setReportId(rid);
      setParsingStatus('processing');

      // Poll for status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await inspectService.getUploadStatus(rid);
          if (statusRes.data) {
            setParsingStatus(statusRes.data.parsingStatus);
            setItemsParsed(statusRes.data.itemsParsed);
            if (statusRes.data.parsingStatus === 'parsed' || statusRes.data.parsingStatus === 'review_pending' || statusRes.data.parsingStatus === 'sent_to_client') {
              if (pollRef.current) clearInterval(pollRef.current);
            }
            if (statusRes.data.parsingStatus === 'failed') {
              setParsingError(statusRes.data.parsingError ?? 'Parsing failed');
              if (pollRef.current) clearInterval(pollRef.current);
            }
          }
        } catch { /* ignore polling errors */ }
      }, 2000);
    } catch (err) {
      setParsingError((err as Error).message ?? 'Upload failed');
      setParsingStatus('failed');
    }
  }

  const parsed = parsingStatus === 'parsed' || parsingStatus === 'review_pending' || parsingStatus === 'sent_to_client';

  // Step A: File selection
  if (step === 'file') {
    return (
      <div>
        <BackButton onClick={onBack} label="Back to Reports" />
        <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 4px' }}>Upload Inspection Report</h2>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 24px' }}>Upload your home inspection PDF and our AI will analyze every item</p>

        <div
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            background: dragActive ? `${ACCENT}0D` : 'var(--bp-card)',
            border: `2px dashed ${dragActive ? ACCENT : 'var(--bp-border)'}`,
            borderRadius: 16, padding: '60px 40px', textAlign: 'center', cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'\uD83D\uDCC1'}</div>
          <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 17, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
            {dragActive ? 'Drop your PDF here' : 'Drag & drop your inspection report'}
          </h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: 0 }}>
            or click to browse &middot; PDF only &middot; Max 50 MB
          </p>
        </div>
        {error && <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#EF4444', marginTop: 12 }}>{error}</p>}
      </div>
    );
  }

  // Step B: Address confirmation
  if (step === 'address') {
    return (
      <div>
        <BackButton onClick={() => { setStep('file'); setFile(null); setFileDataUrl(null); }} label="Back" />
        <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 4px' }}>Property Address</h2>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 24px' }}>Confirm the property address for this inspection report</p>

        <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: 24, marginBottom: 16 }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="var(--bp-subtle)" strokeWidth="1.5"><rect x="3" y="3" width="14" height="14" rx="2" /><path d="M7 7h6M7 10h4" /></svg>
            {file?.name}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <InputField label="Street Address" value={address} onChange={setAddress} placeholder="123 Main St" required />
          <div style={{ display: 'flex', gap: 12 }}>
            <InputField label="City" value={city} onChange={setCity} placeholder="City" style={{ flex: 2 }} />
            <InputField label="State" value={state} onChange={setState} placeholder="ST" style={{ flex: 1 }} />
            <InputField label="ZIP" value={zip} onChange={setZip} placeholder="00000" style={{ flex: 1 }} />
          </div>
        </div>

        <button onClick={startUpload} disabled={!address} style={{
          marginTop: 24, padding: '12px 32px', borderRadius: 10, border: 'none',
          background: address ? ACCENT : '#94A3B8', color: '#fff',
          cursor: address ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 600,
          fontFamily: "'DM Sans',sans-serif", width: '100%',
        }}>
          Upload & Analyze
        </button>
      </div>
    );
  }

  // Step C: Parsing progress
  return (
    <div>
      <div style={{
        background: 'var(--bp-card)', borderRadius: 16, border: '1px solid var(--bp-border)',
        padding: '48px 32px', textAlign: 'center', maxWidth: 480, margin: '40px auto 0',
      }}>
        {parsingStatus === 'failed' ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{'\u274C'}</div>
            <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: '#EF4444', margin: '0 0 8px' }}>Analysis Failed</h3>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 20px' }}>{parsingError || 'Something went wrong'}</p>
            <button onClick={() => { setStep('file'); setFile(null); setFileDataUrl(null); setError(null); }} style={{
              padding: '10px 24px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
              cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
            }}>
              Try Again
            </button>
          </>
        ) : parsed ? (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{'\u2705'}</div>
            <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>Analysis Complete</h3>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 6px' }}>
              Found <strong style={{ color: 'var(--bp-text)' }}>{itemsParsed} item{itemsParsed !== 1 ? 's' : ''}</strong> in your inspection report
            </p>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', margin: '0 0 24px' }}>
              Each item has been categorized by severity with estimated repair costs
            </p>
            <button onClick={() => { if (reportId) onComplete(reportId); }} style={{
              padding: '12px 32px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
              cursor: 'pointer', fontSize: 15, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
            }}>
              View Results
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 20 }}>
              <Spinner />
            </div>
            <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
              {parsingStatus === 'uploading' ? 'Uploading Report...' : 'Analyzing Your Report...'}
            </h3>
            <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 0 16px' }}>
              {parsingStatus === 'uploading'
                ? 'Uploading your PDF for analysis'
                : 'Our AI is reading every page and extracting actionable items'}
            </p>
            {itemsParsed > 0 && (
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: ACCENT, fontWeight: 600 }}>
                {itemsParsed} item{itemsParsed !== 1 ? 's' : ''} found so far...
              </div>
            )}
            <div style={{ marginTop: 20, height: 4, borderRadius: 2, background: 'var(--bp-border)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 2, background: ACCENT,
                width: parsingStatus === 'uploading' ? '20%' : '60%',
                transition: 'width 0.5s', animation: 'progress-pulse 2s ease-in-out infinite',
              }} />
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes progress-pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

// ── Report Detail with Paywall ──────────────────────────────────────────────

function ReportDetail({ reportId, reports, onBack, onReportsChange, onNavigate }: {
  reportId: string;
  reports: PortalReport[];
  onBack: () => void;
  onReportsChange: () => void;
  onNavigate: (tab: Tab) => void;
}) {
  const portalReport = reports.find(r => r.id === reportId);
  const [fullReport, setFullReport] = useState<InspectReportPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [pricingTier, setPricingTier] = useState<string | null>(portalReport?.pricingTier ?? null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load full report via token — if portalReport isn't in the list yet
  // (race after upload), wait for reports to refresh and retry
  useEffect(() => {
    if (!portalReport?.clientAccessToken) {
      // Reports list may not have refreshed yet — don't show "not found" immediately
      if (!portalReport) return;
      setLoading(false);
      return;
    }
    inspectService.getReport(portalReport.clientAccessToken)
      .then(res => { if (res.data) setFullReport(res.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [portalReport?.clientAccessToken, portalReport]);

  // Handle payment return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const sessionId = params.get('session_id');

    if (payment === 'success' && sessionId && !pricingTier) {
      setCheckingPayment(true);
      inspectService.confirmPayment(reportId, sessionId)
        .then(res => {
          if (res.data?.confirmed && res.data.tier) {
            setPricingTier(res.data.tier);
            onReportsChange();
          }
        })
        .catch(() => {})
        .finally(() => setCheckingPayment(false));

      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('payment');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.toString());
    }
  }, [reportId, pricingTier, onReportsChange]);

  // Quote polling (for professional/premium tiers with dispatched items)
  useEffect(() => {
    if (!portalReport?.clientAccessToken) return;
    if (pricingTier !== 'professional' && pricingTier !== 'premium') return;
    if (!fullReport?.items.some(i => i.dispatchStatus === 'dispatched' || i.dispatchStatus === 'quotes_received')) return;

    pollRef.current = setInterval(async () => {
      try {
        const statusRes = await inspectService.getStatus(portalReport.clientAccessToken);
        if (statusRes.data && fullReport) {
          const statusMap = new Map<string, InspectStatusItem>();
          for (const si of statusRes.data.items) statusMap.set(si.id, si);
          setFullReport(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              items: prev.items.map(item => {
                const si = statusMap.get(item.id);
                if (!si) return item;
                return {
                  ...item,
                  dispatchStatus: si.dispatchStatus as InspectionItem['dispatchStatus'],
                  quoteDetails: si.quoteAmountCents ? {
                    providerName: si.providerName ?? '',
                    providerRating: parseFloat(si.providerRating ?? '0'),
                    price: si.quoteAmountCents / 100,
                    availability: si.providerAvailability ?? '',
                  } : item.quoteDetails,
                };
              }),
            };
          });
        }
      } catch { /* ignore */ }
    }, 10000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [portalReport?.clientAccessToken, pricingTier, fullReport?.items.length]);

  if (loading || checkingPayment) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spinner />
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', marginTop: 16 }}>
          {checkingPayment ? 'Confirming payment...' : 'Loading report...'}
        </p>
      </div>
    );
  }

  if (!fullReport || !portalReport) {
    return (
      <div>
        <BackButton onClick={onBack} label="Back to Reports" />
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--bp-subtle)', fontFamily: "'DM Sans',sans-serif" }}>Report not found</div>
      </div>
    );
  }

  const items = fullReport.items;
  const filteredItems = activeCategory ? items.filter(i => i.category === activeCategory) : items;

  // Group by category
  const categories = new Map<string, number>();
  for (const item of items) {
    categories.set(item.category, (categories.get(item.category) ?? 0) + 1);
  }

  // Severity counts
  const severityCounts = new Map<string, number>();
  for (const item of items) {
    severityCounts.set(item.severity, (severityCounts.get(item.severity) ?? 0) + 1);
  }

  const isLocked = !pricingTier;
  const canDispatch = pricingTier === 'professional' || pricingTier === 'premium';
  const hasUndispatched = items.some(i => !i.dispatchStatus || i.dispatchStatus === 'pending' || i.dispatchStatus === null);

  return (
    <div style={{ position: 'relative' }}>
      <BackButton onClick={onBack} label="Back to Reports" />

      {/* Property header */}
      <div style={{ background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)', padding: '20px 24px', marginBottom: 16 }}>
        <h2 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 4px' }}>
          {fullReport.propertyAddress}
        </h2>
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)' }}>
          {fullReport.propertyCity}, {fullReport.propertyState} {fullReport.propertyZip}
          {fullReport.inspectionDate && <> &middot; Inspected {formatDate(fullReport.inspectionDate)}</>}
        </div>
      </div>

      {/* Content area - blurred if locked */}
      <div style={{ position: 'relative', overflow: isLocked ? 'hidden' : 'visible', maxHeight: isLocked ? 600 : 'none' }}>
        <div style={{
          filter: isLocked ? 'blur(6px)' : 'none',
          pointerEvents: isLocked ? 'none' : 'auto',
          userSelect: isLocked ? 'none' : 'auto',
          transition: 'filter 0.3s',
        }}>
          {/* Severity summary */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {(['safety_hazard', 'urgent', 'recommended', 'monitor', 'informational'] as const).map(sev => {
              const c = severityCounts.get(sev);
              if (!c) return null;
              return (
                <span key={sev} style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
                  padding: '4px 12px', borderRadius: 20,
                  background: `${SEVERITY_COLORS[sev]}18`,
                  color: SEVERITY_COLORS[sev],
                }}>
                  {c} {SEVERITY_LABELS[sev]}
                </span>
              );
            })}
          </div>

          {/* Navigate to Items tab for quote selection */}
          {canDispatch && hasUndispatched && (
            <div style={{
              background: `${ACCENT}0A`, border: `1px solid ${ACCENT}30`, borderRadius: 14,
              padding: '16px 20px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--bp-text)' }}>
                  Ready to get quotes?
                </div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', marginTop: 2 }}>
                  Select specific items and categories to dispatch to local professionals
                </div>
              </div>
              <button onClick={() => onNavigate('items')} style={{
                padding: '10px 20px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
                cursor: 'pointer', fontSize: 14, fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap',
              }}>
                Select Items for Quotes
              </button>
            </div>
          )}

          {/* Category filters */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <button onClick={() => setActiveCategory(null)} style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, padding: '6px 14px',
              borderRadius: 20, border: `1px solid ${!activeCategory ? ACCENT : 'var(--bp-border)'}`,
              background: !activeCategory ? `${ACCENT}10` : 'transparent',
              color: !activeCategory ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
            }}>All ({items.length})</button>
            {Array.from(categories).map(([cat, cnt]) => (
              <button key={cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)} style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, padding: '6px 14px',
                borderRadius: 20, border: `1px solid ${activeCategory === cat ? ACCENT : 'var(--bp-border)'}`,
                background: activeCategory === cat ? `${ACCENT}10` : 'transparent',
                color: activeCategory === cat ? ACCENT : 'var(--bp-subtle)', cursor: 'pointer',
              }}>
                {CATEGORY_ICONS[cat] || ''} {CATEGORY_LABELS[cat] || cat} ({cnt})
              </button>
            ))}
          </div>

          {/* Item cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredItems.map(item => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </div>

        {/* Paywall overlay */}
        {isLocked && <PricingModal reportId={reportId} itemCount={items.length} />}
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  );
}

// ── Pricing Modal ───────────────────────────────────────────────────────────

const TIERS = [
  {
    id: 'essential' as const,
    name: 'Essential',
    price: 99,
    features: ['AI report analysis', 'Item details & severity', 'Cost estimates', 'Category breakdown'],
  },
  {
    id: 'professional' as const,
    name: 'Professional',
    price: 199,
    popular: true,
    features: ['Everything in Essential', 'Dispatch to providers', 'Quote comparison', 'Real-time quote tracking'],
  },
  {
    id: 'premium' as const,
    name: 'Premium',
    price: 299,
    features: ['Everything in Professional', 'Negotiation documents', 'Priority dispatch', 'Maintenance timeline'],
  },
];

function PricingModal({ reportId, itemCount }: { reportId: string; itemCount: number }) {
  const [loading, setLoading] = useState<string | null>(null);

  async function handleSelectTier(tier: 'essential' | 'professional' | 'premium') {
    setLoading(tier);
    try {
      const res = await inspectService.portalCheckout(reportId, tier);
      if (res.data?.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
      }
    } catch { /* ignore */ }
    setLoading(null);
  }

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      zIndex: 10, padding: '20px 20px',
    }}>
      <div style={{
        background: 'var(--bp-card)', borderRadius: 20, border: '1px solid var(--bp-border)',
        padding: '32px 28px', maxWidth: 720, width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 22, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 6px' }}>
            Unlock Your Report
          </h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: 0 }}>
            {itemCount} item{itemCount !== 1 ? 's' : ''} found &middot; Choose a plan to access your full analysis
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          {TIERS.map(tier => (
            <div key={tier.id} style={{
              borderRadius: 14, padding: '22px 18px',
              border: `2px solid ${tier.popular ? ACCENT : 'var(--bp-border)'}`,
              background: tier.popular ? `${ACCENT}06` : 'transparent',
              position: 'relative',
            }}>
              {tier.popular && (
                <div style={{
                  position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                  fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                  padding: '3px 12px', borderRadius: 20, background: ACCENT, color: '#fff',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}>Most Popular</div>
              )}
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: 'var(--bp-text)', marginBottom: 4 }}>
                {tier.name}
              </div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", marginBottom: 14 }}>
                <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--bp-text)' }}>${tier.price}</span>
                <span style={{ fontSize: 13, color: 'var(--bp-subtle)', marginLeft: 4 }}>/report</span>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {tier.features.map(f => (
                  <li key={f} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <span style={{ color: '#10B981', fontWeight: 700, flexShrink: 0 }}>{'\u2713'}</span>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => handleSelectTier(tier.id)}
                disabled={loading !== null}
                style={{
                  width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
                  background: tier.popular ? ACCENT : 'var(--bp-border)',
                  color: tier.popular ? '#fff' : 'var(--bp-text)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
                  opacity: loading && loading !== tier.id ? 0.5 : 1,
                }}
              >
                {loading === tier.id ? 'Redirecting...' : `Select ${tier.name}`}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Item Card ───────────────────────────────────────────────────────────────

function ItemCard({ item }: { item: InspectionItem }) {
  const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
  const catLabel = CATEGORY_LABELS[item.category] ?? item.category;
  const catIcon = CATEGORY_ICONS[item.category] ?? '';

  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
      padding: '18px 20px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, padding: '2px 8px',
              borderRadius: 12, background: `${sevColor}18`, color: sevColor,
            }}>
              {SEVERITY_LABELS[item.severity] ?? item.severity}
            </span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)' }}>
              {catIcon} {catLabel}
            </span>
          </div>
          <h4 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--bp-text)', margin: 0 }}>
            {item.title}
          </h4>
        </div>
        {(item.costEstimateMin || item.costEstimateMax) && (
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap', textAlign: 'right' }}>
            {formatCurrency(item.costEstimateMin ?? 0)} - {formatCurrency(item.costEstimateMax ?? 0)}
          </div>
        )}
      </div>

      {/* Description */}
      {item.description && (
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', margin: '0 0 8px', lineHeight: 1.5 }}>
          {item.description}
        </p>
      )}

      {/* Photo descriptions */}
      {item.photoDescriptions && item.photoDescriptions.length > 0 && (
        <div style={{ marginTop: 8, padding: '8px 12px', background: 'var(--bp-bg)', borderRadius: 8 }}>
          {item.photoDescriptions.map((desc, i) => (
            <div key={i} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', marginBottom: i < item.photoDescriptions.length - 1 ? 4 : 0 }}>
              <span style={{ opacity: 0.5 }}>Photo {i + 1}:</span> {desc}
            </div>
          ))}
        </div>
      )}

      {/* Location */}
      {item.location && (
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', marginTop: 6 }}>
          Location: {item.location}
        </div>
      )}

      {/* Quote display */}
      {item.quoteDetails && (
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 10,
          background: '#10B98110', border: '1px solid #10B98125',
        }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: '#10B981' }}>
            Quote: {formatCurrency(item.quoteDetails.price)}
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', marginTop: 2 }}>
            {item.quoteDetails.providerName}
            {item.quoteDetails.providerRating > 0 && <> &middot; {item.quoteDetails.providerRating} stars</>}
            {item.quoteDetails.availability && <> &middot; {item.quoteDetails.availability}</>}
          </div>
        </div>
      )}

      {/* Dispatched status */}
      {item.dispatchStatus === 'dispatched' && !item.quoteDetails && (
        <div style={{
          marginTop: 10, fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: ACCENT,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: ACCENT, animation: 'pulse 1.5s ease-in-out infinite' }} />
          Waiting for quotes...
        </div>
      )}
    </div>
  );
}

// ── Shared UI Components ────────────────────────────────────────────────────

function BackButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 500,
      color: 'var(--bp-subtle)', background: 'none', border: 'none', cursor: 'pointer',
      display: 'flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: 16,
    }}>
      <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 4l-6 6 6 6" /></svg>
      {label}
    </button>
  );
}

function InputField({ label, value, onChange, placeholder, required, style }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; style?: React.CSSProperties;
}) {
  return (
    <div style={style}>
      <label style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', display: 'block', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10,
          border: '1px solid var(--bp-border)', background: 'var(--bp-card)',
          color: 'var(--bp-text)', fontFamily: "'DM Sans',sans-serif", fontSize: 14,
          outline: 'none', boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 40, height: 40, border: `3px solid var(--bp-border)`,
      borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      margin: '0 auto',
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
