import { useState, useEffect, useCallback, useRef } from 'react';
import {
  inspectService,
  type PortalReport,
  type SupportingDocumentWithReport,
} from '@/services/inspector-api';
import type { Tab } from './constants';
import SupportingDocUploadModal, { type SupportingDocType } from './SupportingDocUploadModal';

const ACCENT = '#2563EB';

const TYPE_META: Record<SupportingDocType, { label: string; icon: string; short: string }> = {
  pest_report: { label: 'Pest / WDO Report', icon: '\uD83D\uDC1B', short: 'Pest Reports' },
  seller_disclosure: { label: 'Seller Disclosure', icon: '\uD83D\uDCCB', short: 'Seller Disclosures' },
};

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  uploading: { label: 'Uploading', bg: '#DBEAFE', color: '#1D4ED8' },
  processing: { label: 'Analyzing', bg: '#FEF3C7', color: '#B45309' },
  parsed: { label: 'Ready', bg: '#DCFCE7', color: '#15803D' },
  failed: { label: 'Failed', bg: '#FEE2E2', color: '#DC2626' },
};

interface Props {
  reports: PortalReport[];
  onNavigate: (tab: Tab) => void;
  onReportsChange: () => void;
}

type TypeFilter = 'all' | SupportingDocType;

export default function DocumentsTab({ reports, onNavigate, onReportsChange }: Props) {
  const [docs, setDocs] = useState<SupportingDocumentWithReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [reportFilter, setReportFilter] = useState<string>('all');
  const [showUploadPicker, setShowUploadPicker] = useState(false);
  const [uploadTargetReportId, setUploadTargetReportId] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const fetchDocs = useCallback(() => {
    inspectService.listAllSupportingDocuments()
      .then(res => { if (res.data) setDocs(res.data.documents); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  // Poll while there are docs in 'processing' or 'uploading' state
  useEffect(() => {
    const hasInFlight = docs.some(d => d.parsingStatus === 'processing' || d.parsingStatus === 'uploading');
    if (hasInFlight) {
      pollRef.current = window.setInterval(fetchDocs, 4000);
      return () => {
        if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      };
    }
  }, [docs, fetchDocs]);

  const handleDelete = useCallback(async (doc: SupportingDocumentWithReport) => {
    if (!confirm(`Delete "${doc.fileName}"? Cross-reference insights will be regenerated.`)) return;
    const res = await inspectService.deleteSupportingDocument(doc.reportId, doc.id);
    if (!res.error) {
      fetchDocs();
      onReportsChange();
    }
  }, [fetchDocs, onReportsChange]);

  function openUploadFlow() {
    if (reports.length === 0) return;
    if (reports.length === 1) {
      setUploadTargetReportId(reports[0].id);
    } else {
      setShowUploadPicker(true);
    }
  }

  function selectReportToUpload(reportId: string) {
    setShowUploadPicker(false);
    setUploadTargetReportId(reportId);
  }

  // Filter logic
  const visibleDocs = docs.filter(d => {
    if (typeFilter !== 'all' && d.documentType !== typeFilter) return false;
    if (reportFilter !== 'all' && d.reportId !== reportFilter) return false;
    return true;
  });

  // Group by report
  const grouped = new Map<string, SupportingDocumentWithReport[]>();
  visibleDocs.forEach(d => {
    const list = grouped.get(d.reportId) ?? [];
    list.push(d);
    grouped.set(d.reportId, list);
  });

  const counts = {
    all: docs.length,
    pest_report: docs.filter(d => d.documentType === 'pest_report').length,
    seller_disclosure: docs.filter(d => d.documentType === 'seller_disclosure').length,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 24, fontWeight: 700, color: 'var(--bp-text)', margin: 0 }}>Documents</h1>
          <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '4px 0 0' }}>
            Pest reports, seller disclosures, and other supporting documents that AI cross-references with your inspection
          </p>
        </div>
        <button
          onClick={openUploadFlow}
          disabled={reports.length === 0}
          style={{
            padding: '10px 20px', borderRadius: 10, border: 'none', background: ACCENT, color: '#fff',
            cursor: reports.length === 0 ? 'not-allowed' : 'pointer',
            opacity: reports.length === 0 ? 0.5 : 1,
            fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans',sans-serif",
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <svg width={16} height={16} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 4v12M4 10h12"/></svg>
          Upload Document
        </button>
      </div>

      {/* Type filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <FilterPill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} label={`All (${counts.all})`} />
        <FilterPill
          active={typeFilter === 'pest_report'}
          onClick={() => setTypeFilter('pest_report')}
          label={`${TYPE_META.pest_report.icon} Pest Reports (${counts.pest_report})`}
        />
        <FilterPill
          active={typeFilter === 'seller_disclosure'}
          onClick={() => setTypeFilter('seller_disclosure')}
          label={`${TYPE_META.seller_disclosure.icon} Seller Disclosures (${counts.seller_disclosure})`}
        />
      </div>

      {/* Property filter */}
      {reports.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-subtle)', fontWeight: 600 }}>Property:</span>
          <FilterPill active={reportFilter === 'all'} onClick={() => setReportFilter('all')} label="All" small />
          {reports.map(r => (
            <FilterPill
              key={r.id}
              active={reportFilter === r.id}
              onClick={() => setReportFilter(r.id)}
              label={r.propertyAddress}
              small
            />
          ))}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <EmptyCard icon={'\u23F3'} title="Loading documents..." />
      ) : reports.length === 0 ? (
        <EmptyCard
          icon={'\uD83D\uDCC4'}
          title="Upload an inspection report first"
          body="Once you have an inspection report parsed, you can attach pest reports and seller disclosures to unlock cross-reference insights."
          ctaLabel="Go to Reports"
          onCta={() => onNavigate('reports')}
        />
      ) : visibleDocs.length === 0 && docs.length === 0 ? (
        <EmptyCard
          icon={'\uD83D\uDD0D'}
          title="No supporting documents yet"
          body="Add a pest report or seller disclosure for any of your properties. The AI will analyze each document and flag correlations, contradictions, and gaps with the inspection findings."
          ctaLabel="Upload Document"
          onCta={openUploadFlow}
        />
      ) : visibleDocs.length === 0 ? (
        <EmptyCard
          icon={'\uD83C\uDFAF'}
          title="No matches"
          body="Try a different filter or upload a new document."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {Array.from(grouped.entries()).map(([reportId, reportDocs]) => {
            const report = reports.find(r => r.id === reportId);
            return (
              <div key={reportId}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--bp-text)' }}>
                    {report?.propertyAddress ?? 'Property'}
                  </span>
                  {report && (
                    <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)' }}>
                      {report.propertyCity}, {report.propertyState}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)' }}>
                    {reportDocs.length} document{reportDocs.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                  {reportDocs.map(doc => (
                    <DocCard key={doc.id} doc={doc} onDelete={() => handleDelete(doc)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showUploadPicker && (
        <UploadReportPicker
          reports={reports}
          onPick={selectReportToUpload}
          onClose={() => setShowUploadPicker(false)}
        />
      )}

      {uploadTargetReportId && (
        <SupportingDocUploadModal
          reportId={uploadTargetReportId}
          onClose={() => setUploadTargetReportId(null)}
          onUploaded={() => { fetchDocs(); onReportsChange(); }}
        />
      )}
    </div>
  );
}

function FilterPill({ label, active, onClick, small }: { label: string; active: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: small ? '4px 10px' : '6px 14px',
        borderRadius: 100,
        border: '1px solid var(--bp-border)',
        background: active ? ACCENT : 'var(--bp-card)',
        color: active ? '#fff' : 'var(--bp-muted)',
        cursor: 'pointer',
        fontSize: small ? 11 : 12,
        fontWeight: 600,
        fontFamily: "'DM Sans',sans-serif",
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function DocCard({ doc, onDelete }: { doc: SupportingDocumentWithReport; onDelete: () => void }) {
  const meta = TYPE_META[doc.documentType];
  const status = STATUS_META[doc.parsingStatus] ?? STATUS_META.processing;
  const summary = summarizeParsedDoc(doc);
  const sourceUrl = doc.documentFileUrl;

  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 12, border: '1px solid var(--bp-border)',
      padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 24, lineHeight: 1 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--bp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {doc.fileName}
          </div>
          <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', marginTop: 2 }}>
            {meta.label} {'\u00B7'} {new Date(doc.createdAt).toLocaleDateString()}
          </div>
        </div>
        <span style={{
          fontFamily: "'DM Sans',sans-serif", fontSize: 10, fontWeight: 700,
          padding: '3px 8px', borderRadius: 100, background: status.bg, color: status.color,
          textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          {status.label}
        </span>
      </div>

      {summary && (
        <div style={{
          background: 'var(--bp-bg)', borderRadius: 8, padding: '8px 10px',
          fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: 'var(--bp-muted)',
          lineHeight: 1.5,
        }}>
          {summary}
        </div>
      )}

      {doc.parsingStatus === 'failed' && doc.parsingError && (
        <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: '#DC2626' }}>
          {doc.parsingError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              flex: 1, textAlign: 'center', padding: '7px 10px', borderRadius: 8,
              border: `1px solid ${ACCENT}`, background: 'transparent', color: ACCENT,
              fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
              textDecoration: 'none', cursor: 'pointer',
            }}
          >
            View PDF
          </a>
        ) : (
          <span style={{
            flex: 1, textAlign: 'center', padding: '7px 10px', borderRadius: 8,
            border: '1px solid var(--bp-border)', background: 'transparent', color: 'var(--bp-subtle)',
            fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
          }}>
            PDF unavailable
          </span>
        )}
        <button
          onClick={onDelete}
          style={{
            padding: '7px 12px', borderRadius: 8,
            border: '1px solid var(--bp-border)', background: 'transparent', color: '#DC2626',
            cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600,
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function summarizeParsedDoc(doc: SupportingDocumentWithReport): string | null {
  if (doc.parsingStatus !== 'parsed' || !doc.parsedSummary) return null;
  const summary = doc.parsedSummary as Record<string, unknown>;

  if (doc.documentType === 'pest_report') {
    const verdict = String(summary.overallVerdict ?? '').replace(/_/g, ' ');
    const findings = Array.isArray(summary.findings) ? summary.findings.length : 0;
    const range = summary.treatmentEstimateRange as { lowCents?: number; highCents?: number } | undefined;
    const parts: string[] = [];
    if (verdict) parts.push(verdict);
    parts.push(`${findings} finding${findings === 1 ? '' : 's'}`);
    if (range && (range.lowCents || range.highCents)) {
      const low = Math.round((range.lowCents ?? 0) / 100);
      const high = Math.round((range.highCents ?? 0) / 100);
      parts.push(`Est. $${low.toLocaleString()}\u2013$${high.toLocaleString()}`);
    }
    return parts.join(' \u00B7 ');
  }

  if (doc.documentType === 'seller_disclosure') {
    const issues = Array.isArray(summary.disclosedIssues) ? summary.disclosedIssues.length : 0;
    const repairs = Array.isArray(summary.pastRepairs) ? summary.pastRepairs.length : 0;
    const omissions = Array.isArray(summary.notableOmissions) ? summary.notableOmissions.length : 0;
    const parts: string[] = [];
    parts.push(`${issues} disclosed issue${issues === 1 ? '' : 's'}`);
    if (repairs > 0) parts.push(`${repairs} past repair${repairs === 1 ? '' : 's'}`);
    if (omissions > 0) parts.push(`${omissions} omission${omissions === 1 ? '' : 's'}`);
    return parts.join(' \u00B7 ');
  }

  return null;
}

function EmptyCard({ icon, title, body, ctaLabel, onCta }: { icon: string; title: string; body?: string; ctaLabel?: string; onCta?: () => void }) {
  return (
    <div style={{
      background: 'var(--bp-card)', borderRadius: 14, border: '1px solid var(--bp-border)',
      padding: '60px 40px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
      <h3 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 8px' }}>
        {title}
      </h3>
      {body && (
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--bp-subtle)', margin: '0 auto', maxWidth: 480 }}>
          {body}
        </p>
      )}
      {ctaLabel && onCta && (
        <button
          onClick={onCta}
          style={{
            marginTop: 20, padding: '10px 20px', borderRadius: 10, border: 'none',
            background: ACCENT, color: '#fff', cursor: 'pointer',
            fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600,
          }}
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
}

function UploadReportPicker({ reports, onPick, onClose }: { reports: PortalReport[]; onPick: (id: string) => void; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bp-card)', borderRadius: 16, padding: '24px',
        maxWidth: 480, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: 'var(--bp-text)', margin: '0 0 6px' }}>
          Which property is this for?
        </h3>
        <p style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'var(--bp-subtle)', margin: '0 0 16px' }}>
          Choose the inspection this document should be cross-referenced against.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
          {reports.map(r => (
            <button
              key={r.id}
              onClick={() => onPick(r.id)}
              style={{
                padding: '12px 14px', borderRadius: 10, border: '1px solid var(--bp-border)',
                background: 'var(--bp-bg)', cursor: 'pointer', textAlign: 'left',
              }}
              onMouseOver={e => (e.currentTarget.style.borderColor = ACCENT)}
              onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--bp-border)')}
            >
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 700, color: 'var(--bp-text)' }}>
                {r.propertyAddress}
              </div>
              <div style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 11, color: 'var(--bp-subtle)', marginTop: 2 }}>
                {r.propertyCity}, {r.propertyState} {'\u00B7'} {r.itemCount} item{r.itemCount === 1 ? '' : 's'}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
