import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { inspectorService, type InspectionReport } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';
const RED = '#DC2626';
const ACCENT = '#2563EB';
const AMBER = '#D97706';

// ──────────────────────────────────────────────────────────────────────────
// Inspector Reports list — realtime status, no tabs, no drawer.
//
// Each row's state is driven by `parsingStatus` (the source of truth):
//   uploading / processing  → grayed-out, animated dot, NOT clickable
//   review_pending          → "Needs review" amber chip, clickable
//   parsed                  → "Report ready" green chip, clickable
//   sent_to_client          → "Sent {timeAgo}" + opened/unopened badge,
//                             nudge button when 3+ days unopened
//   failed                  → "Parse failed" red chip + inline retry
//
// Polling: while ANY row is in uploading/processing, refresh the full
// list every 4 seconds. Auto-stops when nothing is in flight.
// ──────────────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  'pre-purchase': { bg: '#E3F2FD', text: '#1565C0' },
  'pre-listing': { bg: '#FFF3E8', text: O },
  annual: { bg: '#E8F5E9', text: G },
  warranty: { bg: '#F3E8FF', text: '#7C3AED' },
};

const POLL_INTERVAL_MS = 4000;
const NUDGE_AFTER_DAYS = 3;

type ParsingStatus = NonNullable<InspectionReport['parsingStatus']>;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

/** Sort key — lower = higher in the list. Processing pinned to top so
 *  in-flight uploads are always visible while the inspector keeps
 *  working on other things. */
function statusPriority(s: ParsingStatus | undefined): number {
  switch (s) {
    case 'uploading':
    case 'processing':       return 0;
    case 'failed':           return 1;
    case 'review_pending':   return 2;
    case 'parsed':           return 3;
    case 'sent_to_client':   return 4;
    default:                  return 5;
  }
}

export default function InspectorReports() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<InspectionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [reminderState, setReminderState] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const pollTimerRef = useRef<number | null>(null);

  // Stripe success_url lands here with ?just_uploaded=<reportId>. Show
  // the "processing" modal once per landing — once dismissed (or once
  // the param is cleared by the user), it stays dismissed.
  const justUploadedId = searchParams.get('just_uploaded');
  const [processingModalOpen, setProcessingModalOpen] = useState(false);
  useEffect(() => {
    if (justUploadedId) setProcessingModalOpen(true);
  }, [justUploadedId]);

  const justUploadedReport = useMemo(
    () => (justUploadedId ? reports.find(r => r.id === justUploadedId) ?? null : null),
    [justUploadedId, reports],
  );

  function dismissProcessingModal() {
    setProcessingModalOpen(false);
    // Strip the param from the URL so a refresh doesn't re-open the modal.
    if (searchParams.has('just_uploaded')) {
      const next = new URLSearchParams(searchParams);
      next.delete('just_uploaded');
      setSearchParams(next, { replace: true });
    }
  }

  const fetchReports = useCallback(async () => {
    try {
      const res = await inspectorService.listReports();
      if (res.data) setReports(res.data);
    } catch {
      // silently fail; existing list stays in view
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling lifecycle. Poll while any row is in
  // uploading/processing; clear the timer when nothing's in flight.
  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    const inFlight = reports.some(r => r.parsingStatus === 'uploading' || r.parsingStatus === 'processing');
    if (inFlight && pollTimerRef.current === null) {
      pollTimerRef.current = window.setInterval(() => {
        void fetchReports();
      }, POLL_INTERVAL_MS);
    } else if (!inFlight && pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [reports, fetchReports]);

  async function handleRetry(reportId: string) {
    setRetryingId(reportId);
    try {
      await inspectorService.retryParse(reportId);
      // Optimistically flip the row to processing so the UI reacts
      // immediately while the next poll confirms.
      setReports(rs => rs.map(r => r.id === reportId
        ? { ...r, parsingStatus: 'processing' as const, parsingError: null }
        : r,
      ));
    } catch {
      // No-op; the failed status will stay visible.
    } finally {
      setRetryingId(null);
    }
  }

  async function handleSendReminder(reportId: string) {
    setReminderState(s => ({ ...s, [reportId]: 'sending' }));
    try {
      await inspectorService.sendReminder(reportId);
      setReminderState(s => ({ ...s, [reportId]: 'sent' }));
      // Optimistic update so the button hides
      setReports(rs => rs.map(r => r.id === reportId
        ? { ...r, homeownerReminderSentAt: new Date().toISOString() }
        : r,
      ));
    } catch {
      setReminderState(s => ({ ...s, [reportId]: 'error' }));
    }
  }

  function handleRowClick(report: InspectionReport) {
    if (report.parsingStatus === 'uploading' || report.parsingStatus === 'processing') return;
    if (report.parsingStatus === 'failed') return; // failed rows have inline retry, no detail
    navigate(`/inspector/reports/${report.id}`);
  }

  // Sort: in-flight first, then failed (action needed), then ready/sent in
  // recency order within each bucket.
  const sortedReports = [...reports].sort((a, b) => {
    const pa = statusPriority(a.parsingStatus);
    const pb = statusPriority(b.parsingStatus);
    if (pa !== pb) return pa - pb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: 0 }}>
          Reports
        </h1>
        <button
          onClick={() => navigate('/inspector/reports/upload')}
          style={{
            padding: '10px 20px', background: O, color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          Upload report
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#9B9490', fontSize: 14, padding: 20 }}>Loading reports...</div>
      ) : sortedReports.length === 0 ? (
        <div style={{
          background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 40, textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: '#9B9490' }}>No reports yet — upload your first inspection above.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {sortedReports.map(report => (
            <ReportRow
              key={report.id}
              report={report}
              onClick={() => handleRowClick(report)}
              onRetry={() => handleRetry(report.id)}
              onSendReminder={() => handleSendReminder(report.id)}
              retrying={retryingId === report.id}
              reminderState={reminderState[report.id]}
            />
          ))}
        </div>
      )}

      {/* "Just uploaded — processing" confirmation modal. Fires once per
          Stripe success_url landing (?just_uploaded=<reportId>). Stays
          dismissed once the inspector clicks Got it OR refreshes. */}
      {processingModalOpen && (
        <ProcessingModal
          report={justUploadedReport}
          onClose={dismissProcessingModal}
        />
      )}

      {/* Pulse keyframe for processing dot */}
      <style>{`
        @keyframes hi-pulse { 0% { opacity: 1; } 50% { opacity: 0.35; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}

// ── Just-uploaded processing modal ──────────────────────────────────────

function ProcessingModal({ report, onClose }: {
  report: InspectionReport | null;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, padding: 28, maxWidth: 460, width: '100%',
        boxShadow: '0 24px 64px -20px rgba(0,0,0,0.25)',
        fontFamily: "'DM Sans', sans-serif", textAlign: 'center',
      }}>
        {/* Spinner / pulse glyph */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `${O}15`, border: `2px solid ${O}`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: 16,
        }}>
          <span style={{
            width: 14, height: 14, borderRadius: '50%', background: O,
            animation: 'hi-pulse 1.4s ease-in-out infinite',
          }} />
        </div>

        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: D, marginBottom: 8 }}>
          Report uploaded — parsing in progress
        </div>

        {report && (
          <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 14 }}>
            <strong style={{ color: D }}>{report.propertyAddress}</strong>
            {report.propertyCity ? `, ${report.propertyCity}` : ''}
            {report.propertyState ? `, ${report.propertyState}` : ''}
          </div>
        )}

        <div style={{ fontSize: 14, color: '#6B6560', lineHeight: 1.55, marginBottom: 22, textAlign: 'left' }}>
          Our AI is parsing this report into actionable items. This usually
          takes <strong style={{ color: D }}>2–5 minutes</strong> for a
          typical inspection — longer for very large reports.
          <br /><br />
          You can leave this page. We'll email you at your inspector account
          address as soon as it's ready to review and send to your client.
          The status badge on this list also updates automatically.
        </div>

        <button
          onClick={onClose}
          style={{
            padding: '12px 28px', background: O, color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}
        >Got it</button>
      </div>
    </div>
  );
}

// ── Single row ──────────────────────────────────────────────────────────

interface ReportRowProps {
  report: InspectionReport;
  onClick: () => void;
  onRetry: () => void;
  onSendReminder: () => void;
  retrying: boolean;
  reminderState: 'sending' | 'sent' | 'error' | undefined;
}

function ReportRow({ report, onClick, onRetry, onSendReminder, retrying, reminderState }: ReportRowProps) {
  const status = report.parsingStatus;
  const isInFlight = status === 'uploading' || status === 'processing';
  const isFailed = status === 'failed';
  const isClickable = !isInFlight && !isFailed;

  const typeStyle = TYPE_COLORS[report.inspectionType] ?? { bg: '#F5F0EB', text: '#6B6560' };

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : -1}
      title={isInFlight ? 'Wait for parsing to finish' : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      style={{
        background: '#ffffff',
        borderRadius: 14,
        border: `1px solid ${isFailed ? `${RED}40` : '#E0DAD4'}`,
        padding: '14px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        cursor: isClickable ? 'pointer' : 'default',
        opacity: isInFlight ? 0.75 : 1,
        transition: 'background 0.1s, border-color 0.1s',
      }}
      onMouseEnter={isClickable ? (e) => { (e.currentTarget as HTMLDivElement).style.background = '#FAFAF8'; } : undefined}
      onMouseLeave={isClickable ? (e) => { (e.currentTarget as HTMLDivElement).style.background = '#ffffff'; } : undefined}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: D, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {report.propertyAddress}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
            background: typeStyle.bg, color: typeStyle.text, whiteSpace: 'nowrap',
          }}>
            {report.inspectionType}
          </span>
          <StatusBadge report={report} />
        </div>
        <div style={{ fontSize: 12, color: '#9B9490', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <span>{formatDate(report.inspectionDate)}</span>
          <span>{report.clientName}</span>
          {(report.itemCount > 0 || status === 'parsed' || status === 'review_pending' || status === 'sent_to_client') && (
            <span>{report.itemCount} item{report.itemCount === 1 ? '' : 's'}{report.dispatchedCount > 0 ? ` (${report.dispatchedCount} dispatched)` : ''}</span>
          )}
          {report.ccEmails && report.ccEmails.length > 0 && (
            <span title={report.ccEmails.join(', ')}>+{report.ccEmails.length} CC</span>
          )}
          {status === 'failed' && report.parsingError && (
            <span style={{ color: RED, maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={report.parsingError}>
              {report.parsingError}
            </span>
          )}
        </div>
      </div>

      {/* Right-side actions / earnings */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {isFailed && (
          <button
            onClick={(e) => { e.stopPropagation(); onRetry(); }}
            disabled={retrying}
            style={{
              padding: '8px 14px', background: '#fff', color: RED, border: `1px solid ${RED}40`,
              borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: retrying ? 'default' : 'pointer',
              fontFamily: "'DM Sans', sans-serif", opacity: retrying ? 0.5 : 1,
            }}
          >
            {retrying ? 'Retrying…' : 'Retry parse'}
          </button>
        )}
        {status === 'sent_to_client' && needsNudge(report) && (
          <button
            onClick={(e) => { e.stopPropagation(); onSendReminder(); }}
            disabled={reminderState === 'sending' || reminderState === 'sent'}
            style={{
              padding: '8px 14px', background: '#fff', color: ACCENT, border: `1px solid ${ACCENT}40`,
              borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: reminderState === 'sending' || reminderState === 'sent' ? 'default' : 'pointer',
              fontFamily: "'DM Sans', sans-serif", opacity: reminderState === 'sending' || reminderState === 'sent' ? 0.6 : 1,
            }}
            title="Send a reminder email to the homeowner"
          >
            {reminderState === 'sending' ? 'Sending…' : reminderState === 'sent' ? 'Reminder sent' : reminderState === 'error' ? 'Retry nudge' : 'Send reminder'}
          </button>
        )}
        {isClickable && (
          <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="#9B9490" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 4l4 4-4 4" />
          </svg>
        )}
      </div>
    </div>
  );
}

function needsNudge(report: InspectionReport): boolean {
  if (!report.clientNotifiedAt) return false;
  if (report.homeownerOpenedAt) return false; // already opened
  const sinceSend = daysSince(report.clientNotifiedAt);
  const sinceLastReminder = report.homeownerReminderSentAt ? daysSince(report.homeownerReminderSentAt) : Infinity;
  return sinceSend >= NUDGE_AFTER_DAYS && sinceLastReminder >= NUDGE_AFTER_DAYS;
}

// ── Status badge — describes parsing + send + open state at a glance ──

function StatusBadge({ report }: { report: InspectionReport }) {
  const status = report.parsingStatus;
  const base: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 100,
    whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
  };

  if (status === 'uploading' || status === 'processing') {
    return (
      <span style={{ ...base, background: `${ACCENT}15`, color: ACCENT }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: ACCENT, animation: 'hi-pulse 1.4s ease-in-out infinite' }} />
        {status === 'uploading' ? 'Uploading' : 'Processing'}
      </span>
    );
  }
  if (status === 'failed') {
    return <span style={{ ...base, background: `${RED}15`, color: RED }}>Parse failed</span>;
  }
  if (status === 'review_pending') {
    return <span style={{ ...base, background: `${AMBER}15`, color: AMBER }}>Needs review</span>;
  }
  if (status === 'parsed') {
    return <span style={{ ...base, background: `${G}18`, color: G }}>Report ready</span>;
  }
  if (status === 'sent_to_client') {
    const sentLabel = report.clientNotifiedAt ? `Sent ${timeAgo(report.clientNotifiedAt)}` : 'Sent';
    if (report.homeownerOpenedAt) {
      return (
        <span style={{ ...base, background: `${G}18`, color: G }} title={`Client opened ${timeAgo(report.homeownerOpenedAt)}`}>
          {sentLabel} · Opened
        </span>
      );
    }
    const days = daysSince(report.clientNotifiedAt);
    if (days >= NUDGE_AFTER_DAYS) {
      return (
        <span style={{ ...base, background: `${AMBER}15`, color: AMBER }} title="Client hasn't opened the report yet">
          {sentLabel} · Unopened
        </span>
      );
    }
    return (
      <span style={{ ...base, background: `${ACCENT}15`, color: ACCENT }}>
        {sentLabel}
      </span>
    );
  }
  return null;
}
