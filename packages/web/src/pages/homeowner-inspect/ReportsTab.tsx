import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { inspectService, type PortalReport, type InspectReportPublic, type InspectionItem, type InspectStatusItem, type SupportingDocument, type CrossReferenceInsight } from '@/services/inspector-api';
import { SEVERITY_COLORS, SEVERITY_LABELS, CATEGORY_ICONS, CATEGORY_LABELS, formatCurrency, formatDate } from './constants';
import type { Tab } from './constants';
import ItemDeepDive from './ItemDeepDive';
import PageCitation from './PageCitation';
import ModeToggle, { type ReportMode } from './ModeToggle';
import SupportingDocUploadModal from './SupportingDocUploadModal';

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
          <style>{`@media (max-width: 540px) { .hi-report-card-btn { padding: 14px 16px !important; gap: 12px !important; } }`}</style>
          {reports.map(r => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 0,
              background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
              transition: 'border-color 0.15s', overflow: 'hidden',
            }}
            onMouseOver={e => (e.currentTarget.style.borderColor = ACCENT)}
            onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--bp-border)')}
            >
              {/* Report card — clickable. On mobile the meta row (badge + items
                  + chevron) wraps below the address; on desktop it stays inline. */}
              <button onClick={() => onOpen(r.id)} className="hi-report-card-btn" style={{
                display: 'flex', alignItems: 'center', gap: 16, padding: '18px 22px',
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 0,
                flexWrap: 'wrap',
              }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: `${ACCENT}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                  {'\uD83C\uDFE0'}
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.propertyAddress}
                  </div>
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.propertyCity}, {r.propertyState} &middot; {formatDate(r.inspectionDate || r.createdAt)}
                  </div>
                </div>
                <div className="hi-report-meta" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
                  {r.parsingStatus === 'processing' ? (
                    <StatusBadge label="Processing" color="#3B82F6" pulse />
                  ) : r.pricingTier ? (
                    <StatusBadge label={r.pricingTier.charAt(0).toUpperCase() + r.pricingTier.slice(1)} color="#10B981" />
                  ) : r.parsingStatus === 'parsed' || r.parsingStatus === 'review_pending' || r.parsingStatus === 'sent_to_client' ? (
                    <StatusBadge label="Ready" color="#10B981" />
                  ) : r.parsingStatus === 'failed' ? (
                    <StatusBadge label="Failed" color="#EF4444" />
                  ) : null}
                  <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', whiteSpace: 'nowrap' }}>
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
  const [xrefOnly, setXrefOnly] = useState(false);
  const [pricingTier, setPricingTier] = useState<string | null>(portalReport?.pricingTier ?? null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [reportMode, setReportMode] = useState<ReportMode>((portalReport?.reportMode as ReportMode | undefined) ?? 'buyer');
  const [supportingDocs, setSupportingDocs] = useState<SupportingDocument[]>([]);
  const [insights, setInsights] = useState<CrossReferenceInsight[]>([]);
  const [showDocUploadModal, setShowDocUploadModal] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const docsPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable refs to avoid re-creating callbacks
  const tokenRef = useRef(portalReport?.clientAccessToken);
  tokenRef.current = portalReport?.clientAccessToken;
  const reportIdRef = useRef(reportId);
  reportIdRef.current = reportId;

  // Load supporting docs + insights — stable callback, never changes
  const loadDocsAndInsights = useCallback(async () => {
    try {
      const rid = reportIdRef.current;
      const [docsRes, insightsRes] = await Promise.all([
        inspectService.listSupportingDocuments(rid),
        inspectService.getCrossReferenceInsights(rid),
      ]);
      if (docsRes.data) setSupportingDocs(docsRes.data.documents);
      if (insightsRes.data) setInsights(insightsRes.data.insights);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load full report — stable callback, never changes
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadFullReport = useCallback(() => {
    const token = tokenRef.current;
    if (!token) return;
    setLoadError(null);
    inspectService.getReport(token)
      .then(res => {
        if (res.data) setFullReport(res.data);
        else setLoadError(res.error ?? 'Failed to load report');
      })
      .catch(err => setLoadError((err as Error).message ?? 'Failed to load report'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Initial load
  useEffect(() => {
    void loadDocsAndInsights();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  // Poll docs while any are still processing
  useEffect(() => {
    const stillProcessing = supportingDocs.some(d => d.parsingStatus === 'processing' || d.parsingStatus === 'uploading');
    if (!stillProcessing) {
      if (docsPollRef.current) { clearInterval(docsPollRef.current); docsPollRef.current = null; }
      return;
    }
    if (docsPollRef.current) return;
    docsPollRef.current = setInterval(() => { void loadDocsAndInsights(); }, 4000);
    return () => { if (docsPollRef.current) { clearInterval(docsPollRef.current); docsPollRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportingDocs.length]);

  async function handleDeleteDoc(docId: string) {
    if (!window.confirm('Delete this document?')) return;
    try {
      await inspectService.deleteSupportingDocument(reportId, docId);
      await loadDocsAndInsights();
      loadFullReport();
    } catch { /* ignore */ }
  }

  async function handleReprocessDoc(docId: string) {
    try {
      const res = await inspectService.reprocessSupportingDocument(reportId, docId);
      await loadDocsAndInsights();
      loadFullReport();
      if (res.data) {
        alert(`Reprocessed: ${res.data.itemsExtracted} items extracted, ${res.data.insightsGenerated} insights generated.`);
      }
    } catch (err) {
      alert(`Reprocess failed: ${(err as Error).message ?? 'unknown error'}`);
    }
  }

  // Sync mode on mount
  const initialMode = portalReport?.reportMode as ReportMode | undefined;
  useEffect(() => {
    setReportMode(initialMode ?? 'buyer');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  async function handleModeChange(newMode: ReportMode) {
    setReportMode(newMode);
    try {
      await inspectService.updateReportMode(reportId, newMode);
      onReportsChange();
    } catch { /* revert on error */ }
  }

  // Load full report on mount, on reportId change, or when portalReport
  // appears (handles the race where parent's getMyReports is still in
  // flight after a magic-link claim).
  const refetchTriedRef = useRef(false);
  // Reset refetch flag whenever the selected reportId changes
  useEffect(() => { refetchTriedRef.current = false; }, [reportId]);
  useEffect(() => {
    if (!portalReport) {
      // Report not in parent's list yet. If we haven't already, kick off
      // a single refetch to handle the post-claim race. Stay in "loading".
      if (!refetchTriedRef.current) {
        refetchTriedRef.current = true;
        onReportsChange();
        // Give the refetch a few seconds; if still not found, surface the
        // not-found UI so the user isn't stuck on a spinner forever.
        const t = setTimeout(() => setLoading(false), 4000);
        return () => clearTimeout(t);
      }
      return;
    }
    if (!portalReport.clientAccessToken) {
      setLoading(false);
      return;
    }
    loadFullReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, portalReport]);

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
                const matchingQuote = si.quoteAmountCents
                  ? si.quotes.find(q => q.amountCents === si.quoteAmountCents)
                  : null;
                return {
                  ...item,
                  dispatchStatus: si.dispatchStatus as InspectionItem['dispatchStatus'],
                  quoteDetails: si.quoteAmountCents ? {
                    providerName: si.providerName ?? '',
                    providerRating: parseFloat(si.providerRating ?? '0'),
                    price: si.quoteAmountCents / 100,
                    availability: si.providerAvailability ?? '',
                    ...(matchingQuote?.bundleSize && matchingQuote.bundleSize > 1
                      ? { bundleSize: matchingQuote.bundleSize }
                      : {}),
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

  // Must be before any conditional returns — React hooks rule
  const scrollToItem = useCallback((targetId: string) => {
    const el = document.getElementById(`item-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setExpandedItemId(targetId);
    }
  }, []);

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
        <div style={{ textAlign: 'center', padding: 40, fontFamily: "'DM Sans',sans-serif" }}>
          <div style={{ color: 'var(--bp-text)', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Report not found</div>
          <div style={{ color: 'var(--bp-subtle)', fontSize: 14, marginBottom: 16 }}>
            {loadError ?? 'This report may not be linked to your account yet.'}
          </div>
          <button
            onClick={() => { refetchTriedRef.current = false; setLoading(true); onReportsChange(); }}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none', background: '#2563EB', color: '#fff',
              fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const items = fullReport.items;
  const xrefCount = items.filter(i => (i.crossReferencedItemIds?.length ?? 0) > 0).length;
  const filteredItems = items.filter(i => {
    if (activeCategory && i.category !== activeCategory) return false;
    if (xrefOnly && (i.crossReferencedItemIds?.length ?? 0) === 0) return false;
    return true;
  });

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

      {/* Property header with mode toggle */}
      <style>{`
        @media (max-width: 640px) {
          .hi-report-header { padding: 16px !important; }
          .hi-report-header-actions { width: 100%; justify-content: space-between; gap: 8px !important; }
          .hi-report-header-actions .hi-mode-label { display: none !important; }
        }
      `}</style>
      <div className="hi-report-header" style={{
        background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
        padding: '20px 24px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <h2 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {fullReport.propertyAddress}
          </h2>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {fullReport.propertyCity}, {fullReport.propertyState} {fullReport.propertyZip}
            {fullReport.inspectionDate && <> &middot; Inspected {formatDate(fullReport.inspectionDate)}</>}
          </div>
        </div>
        <div className="hi-report-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={() => setShowDocUploadModal(true)}
            style={{
              padding: '7px 14px', borderRadius: 8, border: '1px solid var(--bp-border)',
              background: 'var(--bp-card)', color: 'var(--bp-text)',
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: 13 }}>{'\uD83D\uDCC4'}</span> Add Document
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="hi-mode-label" style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Mode:
            </span>
            <ModeToggle mode={reportMode} onChange={handleModeChange} />
          </div>
        </div>
      </div>

      {/* Supporting Document Upload Modal */}
      {showDocUploadModal && (
        <SupportingDocUploadModal
          reportId={reportId}
          onClose={() => setShowDocUploadModal(false)}
          onUploaded={() => { void loadDocsAndInsights(); }}
        />
      )}

      {/* Content area - blurred if locked */}
      <div style={{ position: 'relative', overflow: isLocked ? 'hidden' : 'visible', maxHeight: isLocked ? 600 : 'none' }}>
        <div style={{
          filter: isLocked ? 'blur(6px)' : 'none',
          pointerEvents: isLocked ? 'none' : 'auto',
          userSelect: isLocked ? 'none' : 'auto',
          transition: 'filter 0.3s',
        }}>
          {/* Supporting Documents list */}
          {supportingDocs.length > 0 && (
            <SupportingDocsList docs={supportingDocs} onDelete={handleDeleteDoc} onReprocess={handleReprocessDoc} />
          )}

          {/* Cross-Reference Insights panel */}
          <CrossReferenceInsightsPanel
            insights={insights}
            supportingDocs={supportingDocs}
            allItems={items}
            onScrollToItem={scrollToItem}
            onAddDocument={() => setShowDocUploadModal(true)}
          />

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
                  {reportMode === 'seller' ? 'Get pre-listing quotes' : 'Ready to get quotes?'}
                </div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', marginTop: 2 }}>
                  {reportMode === 'seller'
                    ? 'Pick items to schedule pros for pre-listing repair work'
                    : 'Select specific items and categories to dispatch to local professionals'}
                </div>
              </div>
              <button onClick={() => onNavigate('items')} style={{
                padding: '10px 20px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
                cursor: 'pointer', fontSize: 14, fontWeight: 600,
                fontFamily: "'DM Sans',sans-serif", whiteSpace: 'nowrap',
              }}>
                {reportMode === 'seller' ? 'Select Items to Schedule' : 'Select Items for Quotes'}
              </button>
            </div>
          )}

          {/* Category + cross-referenced filters */}
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
            {xrefCount > 0 && (
              <button
                onClick={() => setXrefOnly(v => !v)}
                title="Items the AI found correlations for across the inspection and supporting documents"
                style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, padding: '6px 14px',
                  borderRadius: 20,
                  border: `1px solid ${xrefOnly ? '#7C3AED' : 'var(--bp-border)'}`,
                  background: xrefOnly ? '#F3E8FF' : 'transparent',
                  color: xrefOnly ? '#7C3AED' : 'var(--bp-subtle)', cursor: 'pointer',
                }}
              >
                {'\uD83D\uDD17'} Cross-referenced ({xrefCount})
              </button>
            )}
          </div>

          {/* Item cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredItems.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                expanded={expandedItemId === item.id}
                onToggleExpand={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                reportId={reportId}
                showDeepDive={!isLocked}
                reportFileUrl={fullReport?.reportFileUrl ?? null}
                supportingDocs={supportingDocs}
                allItems={items}
                onScrollToItem={scrollToItem}
              />
            ))}
          </div>
        </div>

        {/* Paywall overlay */}
        {isLocked && <PricingModal reportId={reportId} itemCount={items.length} mode={reportMode} />}
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

function PricingModal({ reportId, itemCount, mode }: { reportId: string; itemCount: number; mode: ReportMode }) {
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

  const title = mode === 'seller' ? 'Unlock Your Pre-Listing Analysis' : 'Unlock Your Report';
  const subtitle = mode === 'seller'
    ? `${itemCount} item${itemCount !== 1 ? 's' : ''} found \u00B7 Choose a plan for your pre-listing strategy`
    : `${itemCount} item${itemCount !== 1 ? 's' : ''} found \u00B7 Choose a plan to access your full analysis`;

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
            {title}
          </h3>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: 0 }}>
            {subtitle}
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

function ItemCard({ item, expanded, onToggleExpand, reportId, showDeepDive, reportFileUrl, supportingDocs, allItems, onScrollToItem }: {
  item: InspectionItem;
  expanded?: boolean;
  onToggleExpand?: () => void;
  reportId?: string;
  showDeepDive?: boolean;
  reportFileUrl?: string | null;
  supportingDocs?: SupportingDocument[];
  allItems?: InspectionItem[];
  onScrollToItem?: (itemId: string) => void;
}) {
  const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
  const catLabel = CATEGORY_LABELS[item.category] ?? item.category;
  const catIcon = CATEGORY_ICONS[item.category] ?? '';
  const canExpand = showDeepDive && onToggleExpand && reportId;
  const [showXrefList, setShowXrefList] = useState(false);

  const sourceDoc = item.sourceDocumentId && supportingDocs
    ? supportingDocs.find(d => d.id === item.sourceDocumentId)
    : null;
  const xrefIds = item.crossReferencedItemIds ?? [];
  const xrefItems = xrefIds.length > 0 && allItems
    ? xrefIds.map(id => allItems.find(i => i.id === id)).filter((i): i is InspectionItem => !!i)
    : [];

  return (
    <div
      id={`item-${item.id}`}
      onClick={canExpand ? onToggleExpand : undefined}
      style={{
        background: 'var(--bp-card)', borderRadius: 14,
        border: `1px solid ${expanded ? ACCENT : 'var(--bp-border)'}`,
        padding: '18px 20px',
        cursor: canExpand ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
        scrollMarginTop: 80,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, padding: '2px 8px',
              borderRadius: 12, background: `${sevColor}18`, color: sevColor,
            }}>
              {SEVERITY_LABELS[item.severity] ?? item.severity}
            </span>
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)' }}>
              {catIcon} {catLabel}
            </span>
            {sourceDoc && (
              <span
                title={sourceDoc.fileName}
                style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 10,
                  background: sourceDoc.documentType === 'pest_report' ? '#FEF3C7' : '#DBEAFE',
                  color: sourceDoc.documentType === 'pest_report' ? '#B45309' : '#1D4ED8',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                {sourceDoc.documentType === 'pest_report' ? '\uD83D\uDC1B' : '\uD83D\uDCCB'}
                From {sourceDoc.documentType === 'pest_report' ? 'Pest Report' : 'Disclosure'}
              </span>
            )}
            {xrefItems.length > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowXrefList(v => !v); }}
                style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 10,
                  background: '#F3E8FF', color: '#7C3AED',
                  border: 'none', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                {'\uD83D\uDD17'} Cross-referenced ({xrefItems.length})
              </button>
            )}
            {canExpand && (
              <span style={{
                fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                padding: '2px 6px', borderRadius: 4, background: `${ACCENT}12`, color: ACCENT,
                marginLeft: 'auto',
              }}>
                AI {expanded ? '\u25B2' : '\u25BC'}
              </span>
            )}
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

      {/* Cross-referenced items list (expandable) */}
      {showXrefList && xrefItems.length > 0 && (
        <div style={{
          marginBottom: 10, padding: '10px 12px', borderRadius: 10,
          background: '#F3E8FF40', border: '1px solid #DDD6FE',
        }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700, color: '#7C3AED', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Correlates with
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {xrefItems.map(rel => {
              const relSev = SEVERITY_COLORS[rel.severity] ?? '#9B9490';
              return (
                <button
                  key={rel.id}
                  onClick={(e) => { e.stopPropagation(); onScrollToItem?.(rel.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', borderRadius: 8,
                    background: 'var(--bp-card)', border: '1px solid var(--bp-border)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 600, padding: '2px 6px',
                    borderRadius: 8, background: `${relSev}18`, color: relSev, whiteSpace: 'nowrap',
                  }}>
                    {SEVERITY_LABELS[rel.severity] ?? rel.severity}
                  </span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-text)', flex: 1 }}>
                    {rel.title}
                  </span>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: '#7C3AED' }}>
                    Jump {'\u2192'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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

      {/* Location + Page citation */}
      {(item.location || (item.sourcePages && item.sourcePages.length > 0)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
          {item.location && (
            <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)' }}>
              Location: {item.location}
            </span>
          )}
          <PageCitation sourcePages={item.sourcePages} reportFileUrl={reportFileUrl} />
        </div>
      )}

      {/* Value Impact */}
      {item.valueImpact && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <span style={{
            fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, padding: '3px 10px',
            borderRadius: 8, background: '#8B5CF615', color: '#7C3AED', display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <span style={{ fontSize: 12 }}>{'\u2191'}</span>
            ~{formatCurrency(item.valueImpact.roiLow)}-{formatCurrency(item.valueImpact.roiHigh)} value increase
          </span>
          {item.valueImpact.lenderFlagType === 'fha_va_required' && (
            <span style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, padding: '3px 10px',
              borderRadius: 8, background: '#EF444415', color: '#DC2626',
            }}>
              FHA/VA Required
            </span>
          )}
          {item.valueImpact.lenderFlagType === 'lender_concern' && (
            <span style={{
              fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, padding: '3px 10px',
              borderRadius: 8, background: '#F59E0B15', color: '#D97706',
            }}>
              Lender Concern
            </span>
          )}
        </div>
      )}

      {/* Quote display */}
      {item.quoteDetails && (
        <div style={{
          marginTop: 10, padding: '10px 14px', borderRadius: 10,
          background: '#10B98110', border: '1px solid #10B98125',
        }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: '#10B981' }}>
            {item.quoteDetails.bundleSize && item.quoteDetails.bundleSize > 1
              ? `Bundle: ${formatCurrency(item.quoteDetails.price)} (covers ${item.quoteDetails.bundleSize} items)`
              : `Quote: ${formatCurrency(item.quoteDetails.price)}`}
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

      {/* AI Deep Dive — expanded view */}
      {expanded && reportId && (
        <ItemDeepDive reportId={reportId} itemId={item.id} itemTitle={item.title} />
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

// ── Cross-Reference Insights panel ──────────────────────────────────────────

const SEVERITY_META: Record<'info' | 'warning' | 'concern', { color: string; bg: string; icon: string; label: string }> = {
  info: { color: '#2563EB', bg: '#DBEAFE', icon: '\u2139\uFE0F', label: 'Info' },
  warning: { color: '#D97706', bg: '#FEF3C7', icon: '\u26A0\uFE0F', label: 'Worth noting' },
  concern: { color: '#DC2626', bg: '#FEE2E2', icon: '\uD83D\uDEA8', label: 'Concern' },
};

function CrossReferenceInsightsPanel({ insights, supportingDocs, allItems, onScrollToItem, onAddDocument }: {
  insights: CrossReferenceInsight[];
  supportingDocs: SupportingDocument[];
  allItems?: InspectionItem[];
  onScrollToItem?: (itemId: string) => void;
  onAddDocument: () => void;
}) {
  const parsedDocCount = supportingDocs.filter(d => d.parsingStatus === 'parsed').length;
  const stillProcessing = supportingDocs.some(d => d.parsingStatus === 'processing' || d.parsingStatus === 'uploading');
  const hasContent = parsedDocCount > 0 || stillProcessing || insights.length > 0;
  // Default collapsed when there are insights to review (so scanning the page stays compact)
  const [collapsed, setCollapsed] = useState<boolean>(insights.length > 0);
  // Keep the collapsed flag in sync as insights arrive — once the first insight shows up, collapse
  // Without this, a user who opens a report during processing would see the panel stay expanded as
  // insights stream in, which is fine, but we also don't want to auto-collapse if they've manually
  // expanded it. Compromise: only auto-collapse on the initial transition from 0 → N.
  const prevInsightCount = useRef(insights.length);
  useEffect(() => {
    if (prevInsightCount.current === 0 && insights.length > 0) setCollapsed(true);
    prevInsightCount.current = insights.length;
  }, [insights.length]);

  const concernCount = insights.filter(i => i.severity === 'concern').length;
  const warningCount = insights.filter(i => i.severity === 'warning').length;

  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
      padding: 0, marginBottom: 16, overflow: 'hidden',
    }}>
      {/* Header — clickable when there's content */}
      <button
        onClick={() => hasContent && setCollapsed(c => !c)}
        disabled={!hasContent}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '16px 20px', background: 'transparent', border: 'none',
          cursor: hasContent ? 'pointer' : 'default',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 18 }}>{'\uD83D\uDD0D'}</span>
        <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>
          Cross-Reference Insights
        </h3>
        {insights.length > 0 && (
          <span style={{
            fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 700,
            padding: '2px 8px', borderRadius: 100,
            background: concernCount > 0 ? '#FEE2E2' : warningCount > 0 ? '#FEF3C7' : '#DBEAFE',
            color: concernCount > 0 ? '#DC2626' : warningCount > 0 ? '#B45309' : '#1D4ED8',
          }}>
            {insights.length}
          </span>
        )}
        <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)' }}>
          {parsedDocCount > 0 ? `${parsedDocCount} supporting document${parsedDocCount !== 1 ? 's' : ''}` : 'No supporting documents yet'}
        </span>
        {hasContent && (
          <span style={{
            marginLeft: 'auto', fontFamily: "'DM Sans',sans-serif", fontSize: 11,
            color: 'var(--bp-subtle)', fontWeight: 600,
          }}>
            {collapsed ? (insights.length > 0 ? `Show ${insights.length}` : 'Show') : 'Hide'} {collapsed ? '\u25BC' : '\u25B2'}
          </span>
        )}
      </button>

      {(!collapsed || !hasContent) && (
        <div style={{ padding: '0 20px 18px' }}>
          {/* Empty state */}
          {parsedDocCount === 0 && !stillProcessing && (
            <div style={{
              padding: '20px 16px', background: 'var(--bp-bg)', borderRadius: 10,
              textAlign: 'center',
            }}>
              <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', margin: '0 0 12px', maxWidth: 480, marginInline: 'auto' }}>
                Upload a pest report or seller's disclosure to unlock AI cross-referenced insights {'\u2014'} we'll find correlations, contradictions, and gaps across all your documents.
              </p>
              <button onClick={onAddDocument} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff',
                fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>Add Supporting Document</button>
            </div>
          )}

          {/* Processing state */}
          {stillProcessing && insights.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#2563EB', animation: 'pulse 1.5s ease-in-out infinite' }} />
              <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)' }}>
                Analyzing your documents... insights will appear shortly.
              </span>
            </div>
          )}

          {/* No-insights state (docs are parsed but AI found nothing) */}
          {!stillProcessing && parsedDocCount > 0 && insights.length === 0 && (
            <div style={{
              padding: '16px', background: 'var(--bp-bg)', borderRadius: 10,
              fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', lineHeight: 1.5,
            }}>
              No clear cross-references found between your inspection and the uploaded documents.
              Any unique findings from the documents have been added as inspection items below.
              Use the <strong>Reprocess</strong> button if you'd like to retry the analysis.
            </div>
          )}

          {/* Insights */}
          {insights.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {insights.map(insight => {
                const meta = SEVERITY_META[insight.severity] ?? SEVERITY_META.info;
                return (
                  <div key={insight.id} style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: meta.bg, borderLeft: `4px solid ${meta.color}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13 }}>{meta.icon}</span>
                      <span style={{
                        fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
                        padding: '2px 7px', borderRadius: 10,
                        background: `${meta.color}25`, color: meta.color,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                      }}>
                        {meta.label}
                      </span>
                    </div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 700, color: meta.color, marginBottom: 4 }}>
                      {insight.title}
                    </div>
                    <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: '#1F2937', lineHeight: 1.5 }}>
                      {insight.description}
                    </div>
                    {(insight.relatedDocIds.length > 0 || insight.relatedItemIds.length > 0) && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                        {/* Doc chips — open the source PDF in a new tab */}
                        {insight.relatedDocIds.map(docId => {
                          const doc = supportingDocs.find(d => d.id === docId);
                          if (!doc) return null;
                          const icon = doc.documentType === 'pest_report' ? '\uD83D\uDC1B' : '\uD83D\uDCCB';
                          return doc.documentFileUrl ? (
                            <a
                              key={docId}
                              href={doc.documentFileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open ${doc.fileName}`}
                              style={{
                                fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600,
                                padding: '3px 8px', borderRadius: 8,
                                background: '#fff', color: meta.color,
                                border: `1px solid ${meta.color}30`, textDecoration: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}
                            >
                              {icon} {doc.fileName}
                            </a>
                          ) : (
                            <span key={docId} style={{
                              fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600,
                              padding: '3px 8px', borderRadius: 8,
                              background: '#fff', color: meta.color, opacity: 0.6,
                              border: `1px solid ${meta.color}30`,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                              {icon} {doc.fileName}
                            </span>
                          );
                        })}
                        {/* Item chips — scroll to the inspection item card */}
                        {insight.relatedItemIds.map(itemId => {
                          const item = allItems?.find(i => i.id === itemId);
                          if (!item) return null;
                          return (
                            <button
                              key={itemId}
                              onClick={() => onScrollToItem?.(itemId)}
                              title="Jump to inspection item"
                              style={{
                                fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600,
                                padding: '3px 8px', borderRadius: 8,
                                background: '#fff', color: meta.color,
                                border: `1px solid ${meta.color}30`,
                                cursor: 'pointer',
                                maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}
                            >
                              {item.title} {'\u2192'}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Failed docs */}
          {supportingDocs.some(d => d.parsingStatus === 'failed') && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 8,
              background: '#FEE2E2', fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: '#DC2626',
            }}>
              {supportingDocs.filter(d => d.parsingStatus === 'failed').length} document{supportingDocs.filter(d => d.parsingStatus === 'failed').length !== 1 ? 's' : ''} failed to parse {'\u2014'} see the documents list below.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Supporting Documents list ──────────────────────────────────────────────

const DOC_TYPE_LABEL: Record<string, { label: string; icon: string }> = {
  pest_report: { label: 'Pest Report', icon: '\uD83D\uDC1B' },
  seller_disclosure: { label: 'Seller Disclosure', icon: '\uD83D\uDCCB' },
  sewer_scope: { label: 'Sewer Scope', icon: '\uD83D\uDEBD' },
  roof_inspection: { label: 'Roof Inspection', icon: '\uD83C\uDFE0' },
  foundation_report: { label: 'Foundation / Structural', icon: '\uD83C\uDFD7\uFE0F' },
  hvac_inspection: { label: 'HVAC Inspection', icon: '\u2744\uFE0F' },
  electrical_inspection: { label: 'Electrical Inspection', icon: '\u26A1' },
  septic_inspection: { label: 'Septic Inspection', icon: '\uD83D\uDDF3\uFE0F' },
  mold_inspection: { label: 'Mold / Air Quality', icon: '\uD83E\uDDEA' },
  pool_inspection: { label: 'Pool / Spa Inspection', icon: '\uD83C\uDFCA' },
  chimney_inspection: { label: 'Chimney / Fireplace', icon: '\uD83D\uDD25' },
};

function SupportingDocsList({ docs, onDelete, onReprocess }: {
  docs: SupportingDocument[];
  onDelete: (docId: string) => void;
  onReprocess: (docId: string) => Promise<void>;
}) {
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);

  async function handleReprocess(docId: string) {
    setReprocessingId(docId);
    try { await onReprocess(docId); }
    finally { setReprocessingId(null); }
  }

  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
      padding: '14px 18px', marginBottom: 16,
    }}>
      <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 700, color: 'var(--bp-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        Supporting Documents
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {docs.map(doc => {
          const meta = DOC_TYPE_LABEL[doc.documentType] ?? { label: doc.documentType, icon: '\uD83D\uDCC4' };
          const isReprocessing = reprocessingId === doc.id;
          return (
            <div key={doc.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', borderRadius: 8, background: 'var(--bp-bg)',
            }}>
              <span style={{ fontSize: 16 }}>{meta.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--bp-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {meta.label} {'\u00B7'} {doc.fileName}
                </div>
                <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)' }}>
                  {isReprocessing ? 'Reprocessing\u2026' :
                   doc.parsingStatus === 'parsed' ? '\u2713 Parsed' :
                   doc.parsingStatus === 'processing' || doc.parsingStatus === 'uploading' ? 'Processing\u2026' :
                   doc.parsingStatus === 'failed' ? `Failed: ${doc.parsingError ?? 'unknown error'}` : doc.parsingStatus}
                </div>
              </div>
              {doc.parsingStatus === 'parsed' && (
                <button
                  onClick={() => handleReprocess(doc.id)}
                  disabled={isReprocessing}
                  title="Re-extract items and regenerate cross-reference insights"
                  style={{
                    fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'transparent', color: '#7C3AED',
                    border: '1px solid #DDD6FE',
                    cursor: isReprocessing ? 'wait' : 'pointer',
                    opacity: isReprocessing ? 0.6 : 1,
                  }}
                >
                  {isReprocessing ? '\u21BB' : 'Reprocess'}
                </button>
              )}
              {doc.documentFileUrl && (
                <a href={doc.documentFileUrl} target="_blank" rel="noopener noreferrer" style={{
                  fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, color: '#2563EB', textDecoration: 'none',
                  padding: '4px 10px', borderRadius: 6, background: '#2563EB10',
                }}>View</a>
              )}
              <button onClick={() => onDelete(doc.id)} title="Delete document" style={{
                background: 'none', border: 'none', cursor: 'pointer', color: '#9B9490',
                padding: 4, fontSize: 14,
              }}>{'\u2715'}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
