import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { inspectorService, type InspectionReport, type InspectionItem } from '@/services/inspector-api';

const O = '#E8632B';
const G = '#1B9E77';
const D = '#2D2926';

const SEVERITY_COLORS: Record<string, string> = {
  safety_hazard: '#E24B4A',
  urgent: '#E24B4A',
  recommended: '#EF9F27',
  monitor: '#9B9490',
  informational: '#D3CEC9',
};

const SEVERITY_LABELS: Record<string, string> = {
  safety_hazard: 'Safety Hazard',
  urgent: 'Urgent',
  recommended: 'Recommended',
  monitor: 'Monitor',
  informational: 'Informational',
};

// Category emoji icons + display labels — kept in sync with the homeowner-
// inspect portal's constants.tsx so the inspector view feels visually
// equivalent to what their client will see.
const CATEGORY_LABELS: Record<string, string> = {
  plumbing: 'Plumbing', electrical: 'Electrical', hvac: 'HVAC', roofing: 'Roofing',
  structural: 'Structural', general_repair: 'General', pest_control: 'Pest Control',
  safety: 'Safety', cosmetic: 'Cosmetic', landscaping: 'Landscaping',
  appliance: 'Appliance', insulation: 'Insulation', foundation: 'Foundation',
  windows_doors: 'Windows & Doors', fireplace: 'Fireplace',
};
const CATEGORY_ICONS: Record<string, string> = {
  plumbing: '💧', electrical: '⚡', hvac: '❄️', roofing: '🏠',
  structural: '🏗️', general_repair: '🔧', pest_control: '🐛',
  safety: '⚠️', cosmetic: '🎨', landscaping: '🌿',
  appliance: '📦', insulation: '🧱', foundation: '🏛️',
  windows_doors: '🪟', fireplace: '🔥',
};

const SEVERITY_ORDER: Array<keyof typeof SEVERITY_LABELS> = [
  'safety_hazard', 'urgent', 'recommended', 'monitor', 'informational',
];

/** AI-confidence threshold below which an item is pinned to the top with
 *  a "Review before sending" badge. Matches the parser's review_pending
 *  bar — anything below 0.7 lands in review. */
const REVIEW_CONFIDENCE_THRESHOLD = 0.7;

function itemNeedsReview(item: InspectionItem & { inspectorAdjusted?: boolean }): boolean {
  if (item.inspectorAdjusted) return false;
  // Confidence may arrive as either number or string depending on
  // serialization — coerce defensively.
  const c = typeof item.confidence === 'number' ? item.confidence : parseFloat(String(item.confidence ?? '1'));
  return Number.isFinite(c) && c < REVIEW_CONFIDENCE_THRESHOLD;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  processing: { bg: '#FFF3E8', text: O },
  ready: { bg: '#E8F5E9', text: G },
  sent: { bg: '#E3F2FD', text: '#1565C0' },
  active: { bg: '#E3F2FD', text: '#1565C0' },
  completed: { bg: '#F5F0EB', text: '#9B9490' },
};

const DISPATCH_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#9B9490' },
  dispatched: { label: 'Dispatched', color: '#1565C0' },
  quoted: { label: 'Quoted', color: O },
  booked: { label: 'Booked', color: G },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

interface AddItemForm {
  title: string;
  description: string;
  severity: InspectionItem['severity'];
  category: string;
  location: string;
  costEstimateMin: string;
  costEstimateMax: string;
}

const emptyAddForm: AddItemForm = {
  title: '', description: '', severity: 'recommended', category: '', location: '',
  costEstimateMin: '', costEstimateMax: '',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: "'DM Sans', sans-serif",
  border: '1px solid #E0DAD4', borderRadius: 8, background: '#ffffff', color: D,
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: D, marginBottom: 4,
  fontFamily: "'DM Sans', sans-serif",
};

export default function InspectorReportDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<InspectionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddItemForm>(emptyAddForm);
  const [addLoading, setAddLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<AddItemForm>(emptyAddForm);

  // Items page filters — mirror the homeowner-inspect Reports tab UX so
  // the inspector sees their report through their client's lens.
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [reviewOnlyFilter, setReviewOnlyFilter] = useState(false);

  // Bulk-edit selection. Set so order-independent + O(1) lookups.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    inspectorService.getReport(id).then(res => {
      if (res.data) setReport(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const isSent = report && (
    report.parsingStatus === 'sent_to_client'
    || report.status === 'sent' || report.status === 'active' || report.status === 'completed'
  );

  // Send-to-client confirmation modal state. The "Send to client" button
  // opens this modal so the inspector can confirm the recipient name +
  // email and add up to 5 CC recipients (spouse, agent, co-buyer) before
  // the email goes out.
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function handleSendConfirmed(opts: { client_name: string; client_email: string; cc_emails: string[] }) {
    if (!report) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await inspectorService.sendToClient(report.id, opts);
      if (res.error) {
        setSendError(res.error);
        return;
      }
      // Re-fetch the report so status flips to sent_to_client + cc_emails
      // and clientNotifiedAt are reflected from the server.
      const fresh = await inspectorService.getReport(report.id);
      if (fresh.data) setReport(fresh.data);
      setSendModalOpen(false);
    } catch (err) {
      setSendError((err as Error).message ?? 'Failed to send report');
    } finally {
      setSending(false);
    }
  }

  // ── "Send copy" — additional free recipients (spouse, agent,
  //    attorney, listing partner). No charge; doesn't bump the
  //    primary client tracking columns. Modal collects email +
  //    optional name, then POSTs to /reports/:id/send-copy.
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyEmail, setCopyEmail] = useState('');
  const [copyName, setCopyName] = useState('');
  const [copyBusy, setCopyBusy] = useState(false);
  const [copyMsg, setCopyMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  async function handleSendCopy() {
    if (!report || copyBusy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(copyEmail)) {
      setCopyMsg({ type: 'error', text: 'Enter a valid email address' });
      return;
    }
    setCopyBusy(true);
    setCopyMsg(null);
    try {
      const res = await inspectorService.sendCopyOfReport(report.id, {
        email: copyEmail.trim(),
        name: copyName.trim() || undefined,
      });
      if (res.error || !res.data?.sent) {
        throw new Error(res.error ?? 'Failed to send copy');
      }
      setCopyMsg({ type: 'ok', text: `Sent to ${copyEmail.trim()}` });
      setCopyEmail('');
      setCopyName('');
      // Auto-close after a beat so the inspector sees the confirmation.
      setTimeout(() => { setCopyOpen(false); setCopyMsg(null); }, 1400);
    } catch (err) {
      setCopyMsg({ type: 'error', text: (err as Error).message ?? 'Failed to send copy' });
    } finally {
      setCopyBusy(false);
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!report) return;
    try {
      await inspectorService.deleteItem(report.id, itemId);
      setReport({
        ...report,
        items: report.items.filter(i => i.id !== itemId),
        itemCount: report.itemCount - 1,
      });
    } catch {
      // handle error silently
    }
  }

  async function handleAddItem() {
    if (!report) return;
    setAddLoading(true);
    try {
      const res = await inspectorService.addItem(report.id, {
        title: addForm.title,
        description: addForm.description,
        severity: addForm.severity,
        category: addForm.category,
        location: addForm.location || null,
        costEstimateMin: addForm.costEstimateMin ? Number(addForm.costEstimateMin) : null,
        costEstimateMax: addForm.costEstimateMax ? Number(addForm.costEstimateMax) : null,
      });
      if (res.data) {
        setReport({
          ...report,
          items: [...report.items, res.data],
          itemCount: report.itemCount + 1,
        });
        setAddForm(emptyAddForm);
        setShowAddForm(false);
      }
    } catch {
      // handle error silently
    } finally {
      setAddLoading(false);
    }
  }

  // User-facing error message when an item-edit save fails. Previously
  // swallowed silently which made the Save button appear to do nothing.
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSaveEdit(itemId: string) {
    if (!report) return;
    setSaveError(null);
    try {
      const res = await inspectorService.updateItem(report.id, itemId, {
        title: editForm.title,
        description: editForm.description,
        severity: editForm.severity,
        category: editForm.category,
        location: editForm.location || null,
        costEstimateMin: editForm.costEstimateMin ? Number(editForm.costEstimateMin) : null,
        costEstimateMax: editForm.costEstimateMax ? Number(editForm.costEstimateMax) : null,
      });
      if (res.error || !res.data) {
        setSaveError(res.error ?? 'Save failed — please try again');
        return;
      }
      setReport({
        ...report,
        items: report.items.map(i => i.id === itemId ? res.data! : i),
      });
      setEditingId(null);
    } catch (err) {
      setSaveError((err as Error).message ?? 'Save failed — please try again');
    }
  }

  function startEdit(item: InspectionItem) {
    setSaveError(null);
    setEditingId(item.id);
    setEditForm({
      title: item.title,
      description: item.description,
      severity: item.severity,
      category: item.category,
      location: item.location ?? '',
      costEstimateMin: item.costEstimateMin?.toString() ?? '',
      costEstimateMax: item.costEstimateMax?.toString() ?? '',
    });
  }

  function cancelEdit() {
    setSaveError(null);
    setEditingId(null);
  }

  function toggleSelected(itemId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function handleBulkUpdate(updates: { severity?: string; category?: string }) {
    if (!report || selectedIds.size === 0) return;
    setBulkBusy(true);
    setBulkError(null);
    try {
      const ids = Array.from(selectedIds);
      const res = await inspectorService.bulkUpdateItems(report.id, ids, updates);
      if (res.error) {
        setBulkError(res.error);
        return;
      }
      // Patch the in-memory items so the UI reflects the change without a full refetch.
      setReport({
        ...report,
        items: report.items.map(it => {
          if (!selectedIds.has(it.id)) return it;
          return {
            ...it,
            severity: (updates.severity ?? it.severity) as InspectionItem['severity'],
            category: updates.category ?? it.category,
            inspectorAdjusted: true,
          };
        }),
      });
      clearSelection();
      setBulkModalOpen(false);
    } catch (err) {
      setBulkError((err as Error).message ?? 'Failed to update items');
    } finally {
      setBulkBusy(false);
    }
  }

  if (loading) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ color: '#9B9490', fontSize: 14 }}>Loading report...</div>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ color: '#9B9490', fontSize: 14 }}>Report not found.</div>
      </div>
    );
  }

  const statusStyle = STATUS_COLORS[report.status] ?? STATUS_COLORS.processing;

  function renderItemForm(form: AddItemForm, setForm: (f: AddItemForm) => void) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Title</label>
          <input style={inputStyle} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Item title" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Description</label>
          <textarea style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" />
        </div>
        <div>
          <label style={labelStyle}>Severity</label>
          <select style={inputStyle} value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value as InspectionItem['severity'] })}>
            <option value="safety_hazard">Safety Hazard</option>
            <option value="urgent">Urgent</option>
            <option value="recommended">Recommended</option>
            <option value="monitor">Monitor</option>
            <option value="informational">Informational</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Category</label>
          <input style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g., Plumbing, Electrical" />
        </div>
        <div>
          <label style={labelStyle}>Location</label>
          <input style={inputStyle} value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g., Kitchen, Basement" />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Cost min</label>
            <input style={inputStyle} type="number" value={form.costEstimateMin} onChange={e => setForm({ ...form, costEstimateMin: e.target.value })} placeholder="$" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Cost max</label>
            <input style={inputStyle} type="number" value={form.costEstimateMax} onChange={e => setForm({ ...form, costEstimateMax: e.target.value })} placeholder="$" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Back button */}
      <button
        onClick={() => navigate('/inspector/reports')}
        style={{
          background: 'none', border: 'none', color: '#9B9490', fontSize: 13,
          cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginBottom: 16, padding: 0,
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 3L5 7l4 4" /></svg>
        Back to reports
      </button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: D, margin: 0 }}>
            {report.propertyAddress}
          </h1>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 100,
            background: statusStyle.bg, color: statusStyle.text,
          }}>
            {report.status}
          </span>
        </div>
        <div style={{ fontSize: 13, color: '#6B6560', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>{report.propertyCity}, {report.propertyState} {report.propertyZip}</span>
          <span>Inspected {formatDate(report.inspectionDate)}</span>
          <span>Client: {report.clientName}</span>
          <span>{report.inspectionType}</span>
        </div>
      </div>

      {/* Send to client CTA — opens confirmation modal for name/email/CCs.
          PDF download intentionally removed (per spec): inspectors keep
          the original locally; the parsed report is the deliverable. */}
      {!isSent && (
        <div style={{
          background: '#ffffff', borderRadius: 14, border: `2px solid ${O}`, padding: 20, marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 4 }}>Ready to send to client?</div>
            <div style={{ fontSize: 13, color: '#6B6560' }}>Review items below, then confirm the recipient and send.</div>
          </div>
          <button
            onClick={() => { setSendError(null); setSendModalOpen(true); }}
            disabled={sending}
            style={{
              padding: '10px 24px', background: O, color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
              fontFamily: "'DM Sans', sans-serif", opacity: sending ? 0.7 : 1, whiteSpace: 'nowrap',
            }}
          >
            Send to Client
          </button>
        </div>
      )}

      {sendModalOpen && report && (
        <SendToClientModal
          report={report}
          onClose={() => { setSendModalOpen(false); setSendError(null); }}
          onSubmit={handleSendConfirmed}
          sending={sending}
          error={sendError}
        />
      )}

      {/* "Send a copy" — always available once the report is parsed.
          Free extra recipients (spouse, agent, attorney, listing
          partner). Compact section so it doesn't dominate the report
          page; expands into an inline modal on click. */}
      {report && (report.status === 'ready' || report.status === 'sent' || report.status === 'active' || report.status === 'completed') && (
        <div style={{
          background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4',
          padding: 16, marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: D }}>Send a copy to someone else</div>
            <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>Free &mdash; spouse, real-estate agent, attorney, listing partner.</div>
          </div>
          <button
            onClick={() => setCopyOpen(true)}
            style={{
              padding: '8px 14px', background: 'transparent', color: O, border: `1px solid ${O}`,
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", whiteSpace: 'nowrap',
            }}
          >Send copy</button>
        </div>
      )}

      {copyOpen && report && (
        <div
          onClick={() => { if (!copyBusy) { setCopyOpen(false); setCopyMsg(null); } }}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: 24, maxWidth: 440, width: '100%',
            boxShadow: '0 24px 64px -20px rgba(0,0,0,0.25)',
          }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: D, marginBottom: 6 }}>
              Send a copy
            </div>
            <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 18, lineHeight: 1.5 }}>
              They&rsquo;ll get the same parsed report &mdash; AI estimates, items, everything &mdash;
              with a private link that stays active until {report.clientName}&rsquo;s expires. No charge.
            </div>
            <label style={labelStyle}>Email *</label>
            <input
              type="email"
              value={copyEmail}
              onChange={e => setCopyEmail(e.target.value)}
              placeholder="agent@example.com"
              autoFocus
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <label style={labelStyle}>Name <span style={{ color: '#9B9490', fontWeight: 400 }}>(optional)</span></label>
            <input
              value={copyName}
              onChange={e => setCopyName(e.target.value)}
              placeholder="Pat the realtor"
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            {copyMsg && (
              <div style={{
                fontSize: 13, marginBottom: 14, padding: '10px 12px', borderRadius: 8,
                background: copyMsg.type === 'ok' ? '#F0FDF4' : '#FEF2F2',
                color: copyMsg.type === 'ok' ? '#166534' : '#B91C1C',
              }}>
                {copyMsg.text}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setCopyOpen(false); setCopyMsg(null); }}
                disabled={copyBusy}
                style={{
                  padding: '10px 18px', background: 'transparent', color: '#6B6560', border: '1px solid #E0DAD4',
                  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: copyBusy ? 'default' : 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >Cancel</button>
              <button
                onClick={handleSendCopy}
                disabled={copyBusy}
                style={{
                  padding: '10px 22px', background: O, color: '#fff', border: 'none',
                  borderRadius: 8, fontSize: 14, fontWeight: 600,
                  cursor: copyBusy ? 'default' : 'pointer', opacity: copyBusy ? 0.7 : 1,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >{copyBusy ? 'Sending\u2026' : 'Send copy'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Items section ───────────────────────────────────────────────
          Mirrors the homeowner-inspect Reports tab UX so the inspector
          works in the same view their client will see — severity summary,
          category pills, and rich item cards. Inspector-only affordances
          stack on top: per-card checkbox + edit/delete, sticky bulk-edit
          toolbar, and the "Review before sending" pin for low-confidence
          AI-flagged items. */}
      <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, marginBottom: 12 }}>
        Items ({report.items.length})
      </h2>

      {/* Severity summary — clickable pills double as severity filters */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {SEVERITY_ORDER.map(sev => {
          const count = report.items.filter(i => i.severity === sev).length;
          if (count === 0) return null;
          const sevColor = SEVERITY_COLORS[sev] ?? '#9B9490';
          const active = severityFilter === sev;
          return (
            <button
              key={sev}
              onClick={() => setSeverityFilter(active ? null : sev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 100, border: `1px solid ${active ? sevColor : `${sevColor}40`}`,
                background: active ? `${sevColor}15` : '#fff', color: sevColor,
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: sevColor, flexShrink: 0 }} />
              <span>{count}</span>
              <span style={{ color: '#6B6560', fontWeight: 500 }}>{SEVERITY_LABELS[sev]}</span>
            </button>
          );
        })}
        {(() => {
          const reviewCount = report.items.filter(itemNeedsReview).length;
          if (reviewCount === 0 || isSent) return null;
          const active = reviewOnlyFilter;
          return (
            <button
              onClick={() => setReviewOnlyFilter(!active)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                borderRadius: 100, border: `1px solid ${active ? '#D97706' : '#D9770640'}`,
                background: active ? '#D9770615' : '#fff', color: '#D97706',
                fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}
              title="Pin low-confidence items the AI wasn't sure about"
            >
              <span>⚠</span>
              <span>{reviewCount}</span>
              <span style={{ color: '#6B6560', fontWeight: 500 }}>Needs review</span>
            </button>
          );
        })()}
      </div>

      {/* Category pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {(() => {
          const categoryCounts = new Map<string, number>();
          for (const it of report.items) categoryCounts.set(it.category, (categoryCounts.get(it.category) ?? 0) + 1);
          const sorted = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1]);
          return (
            <>
              <button
                onClick={() => setCategoryFilter(null)}
                style={{
                  padding: '6px 12px', borderRadius: 100,
                  border: `1px solid ${!categoryFilter ? O : '#E0DAD4'}`,
                  background: !categoryFilter ? `${O}15` : '#fff', color: !categoryFilter ? O : '#6B6560',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                All ({report.items.length})
              </button>
              {sorted.map(([cat, count]) => {
                const active = categoryFilter === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(active ? null : cat)}
                    style={{
                      padding: '6px 12px', borderRadius: 100,
                      border: `1px solid ${active ? O : '#E0DAD4'}`,
                      background: active ? `${O}15` : '#fff', color: active ? O : '#6B6560',
                      fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    <span>{CATEGORY_ICONS[cat] ?? '•'}</span>
                    <span>{CATEGORY_LABELS[cat] ?? cat}</span>
                    <span style={{ color: '#9B9490', fontWeight: 500 }}>({count})</span>
                  </button>
                );
              })}
            </>
          );
        })()}
      </div>

      {/* Bulk-edit toolbar (sticky once anything's selected) */}
      {!isSent && selectedIds.size > 0 && (
        <div style={{
          position: 'sticky', top: 8, zIndex: 50,
          background: O, color: '#fff', borderRadius: 12, padding: '12px 16px',
          marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 24px -10px rgba(232,99,43,0.5)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{selectedIds.size} selected</span>
          <div style={{ flex: 1 }} />
          <button
            onClick={() => { setBulkError(null); setBulkModalOpen(true); }}
            style={{
              padding: '6px 12px', background: '#fff', color: O, border: 'none',
              borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >Bulk edit</button>
          <button
            onClick={clearSelection}
            style={{
              padding: '6px 12px', background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.4)',
              borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >Clear</button>
        </div>
      )}

      {/* Items list — sorted: Needs Review first, then by severity rank */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(() => {
          const filtered = report.items.filter(it => {
            if (severityFilter && it.severity !== severityFilter) return false;
            if (categoryFilter && it.category !== categoryFilter) return false;
            if (reviewOnlyFilter && !itemNeedsReview(it)) return false;
            return true;
          });
          // Sort: needs-review first (ascending confidence so worst-first
          // within that group), then severity rank (safety_hazard at top).
          const sorted = [...filtered].sort((a, b) => {
            const aReview = itemNeedsReview(a) && !isSent;
            const bReview = itemNeedsReview(b) && !isSent;
            if (aReview !== bReview) return aReview ? -1 : 1;
            if (aReview && bReview) {
              return (toNumberConfidence(a) - toNumberConfidence(b));
            }
            return SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
          });

          if (sorted.length === 0) {
            return (
              <div style={{
                background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4',
                padding: 32, textAlign: 'center', fontSize: 13, color: '#9B9490',
              }}>
                No items match the current filter.
              </div>
            );
          }

          return sorted.map(item => {
            const isEditing = editingId === item.id;
            return (
              <ItemCard
                key={item.id}
                item={item}
                isEditing={isEditing}
                editForm={editForm}
                setEditForm={setEditForm}
                renderForm={renderItemForm}
                onStartEdit={() => startEdit(item)}
                onCancelEdit={cancelEdit}
                onSaveEdit={() => handleSaveEdit(item.id)}
                onDelete={() => handleDeleteItem(item.id)}
                isSent={!!isSent}
                selected={selectedIds.has(item.id)}
                onToggleSelected={() => toggleSelected(item.id)}
                saveError={isEditing ? saveError : null}
              />
            );
          });
        })()}

        {/* Add item (pre-send only) */}
        {!isSent && (
          <>
            {showAddForm ? (
              <div style={{
                background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: D, marginBottom: 12 }}>Add new item</div>
                {renderItemForm(addForm, setAddForm)}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={handleAddItem} disabled={addLoading} style={{
                    padding: '8px 16px', background: G, color: '#fff', border: 'none',
                    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: addLoading ? 'not-allowed' : 'pointer',
                    fontFamily: "'DM Sans', sans-serif", opacity: addLoading ? 0.7 : 1,
                  }}>{addLoading ? 'Adding...' : 'Add item'}</button>
                  <button onClick={() => { setShowAddForm(false); setAddForm(emptyAddForm); }} style={{
                    padding: '8px 16px', background: '#F5F0EB', color: '#6B6560', border: 'none',
                    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}>Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  padding: '14px 20px', background: '#ffffff', border: '1px dashed #E0DAD4',
                  borderRadius: 14, color: O, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", textAlign: 'center',
                }}
              >
                + Add item
              </button>
            )}
          </>
        )}
      </div>

      {bulkModalOpen && (
        <BulkEditModal
          count={selectedIds.size}
          onCancel={() => { setBulkModalOpen(false); setBulkError(null); }}
          onSubmit={handleBulkUpdate}
          busy={bulkBusy}
          error={bulkError}
        />
      )}

      {/* Earnings breakdown */}
      <div style={{
        background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20, marginTop: 24,
      }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 18, fontWeight: 700, color: D, margin: '0 0 12px' }}>
          Earnings
        </h3>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 13, color: '#6B6560' }}>
              Referral commissions from {report.dispatchedCount} dispatched items
            </div>
          </div>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 28, fontWeight: 700, color: G }}>
            {formatCurrency(report.earnings)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Send to Client confirmation modal ───────────────────────────────────
//
// Pre-fills the primary recipient name + email from the report row.
// Inspector can edit either, plus add up to 5 CC recipients (spouse,
// agent, co-buyer). When any CC's email is later used to create a Homie
// account, the backend signup hook auto-binds them to this report so
// they have full read/edit access without paying.

const MAX_CC = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function SendToClientModal({ report, onClose, onSubmit, sending, error }: {
  report: InspectionReport;
  onClose: () => void;
  onSubmit: (opts: { client_name: string; client_email: string; cc_emails: string[] }) => void;
  sending: boolean;
  error: string | null;
}) {
  const [name, setName] = useState(report.clientName);
  const [email, setEmail] = useState(report.clientEmail ?? '');
  const [ccs, setCcs] = useState<string[]>(report.ccEmails ?? []);
  const [ccDraft, setCcDraft] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  function tryAddCc(raw: string): boolean {
    const e = raw.toLowerCase().trim().replace(/,$/, '');
    if (!e) return false;
    if (!EMAIL_RE.test(e)) {
      setValidationError(`"${raw}" is not a valid email address`);
      return false;
    }
    if (e === email.toLowerCase().trim()) {
      setValidationError("That's the primary recipient — no need to CC them");
      return false;
    }
    if (ccs.includes(e)) {
      setValidationError('Already added');
      return false;
    }
    if (ccs.length >= MAX_CC) {
      setValidationError(`Maximum ${MAX_CC} CC recipients`);
      return false;
    }
    setCcs([...ccs, e]);
    setCcDraft('');
    setValidationError(null);
    return true;
  }

  function handleCcKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || (e.key === 'Tab' && ccDraft.trim())) {
      if (ccDraft.trim()) {
        e.preventDefault();
        tryAddCc(ccDraft);
      }
    } else if (e.key === 'Backspace' && !ccDraft && ccs.length > 0) {
      setCcs(ccs.slice(0, -1));
    }
  }

  function handleSend() {
    setValidationError(null);
    // If there's text in the CC draft, try to commit it as a final chip.
    let finalCcs = ccs;
    if (ccDraft.trim()) {
      const e = ccDraft.toLowerCase().trim().replace(/,$/, '');
      if (!EMAIL_RE.test(e)) {
        setValidationError(`"${ccDraft}" is not a valid email address`);
        return;
      }
      if (e !== email.toLowerCase().trim() && !ccs.includes(e) && ccs.length < MAX_CC) {
        finalCcs = [...ccs, e];
      }
    }
    if (!EMAIL_RE.test(email.trim())) {
      setValidationError('Primary client email is not a valid email address');
      return;
    }
    if (!name.trim()) {
      setValidationError("Client's name is required");
      return;
    }
    onSubmit({ client_name: name.trim(), client_email: email.trim().toLowerCase(), cc_emails: finalCcs });
  }

  return (
    <div
      onClick={() => { if (!sending) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, padding: 24, maxWidth: 520, width: '100%',
        boxShadow: '0 24px 64px -20px rgba(0,0,0,0.25)',
      }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700, color: D, marginBottom: 6 }}>
          Send report to client
        </div>
        <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 18, lineHeight: 1.5 }}>
          {report.clientName}'s parsed report for {report.propertyAddress}. Confirm the recipient
          details below, then add anyone else who should have access (spouse, buyer's agent,
          co-buyer). CC recipients get full report access without paying when they create a Homie account.
        </div>

        <label style={labelStyle}>Client name *</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        />

        <label style={labelStyle}>Client email *</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        />

        <label style={labelStyle}>
          Also send to <span style={{ color: '#9B9490', fontWeight: 400 }}>(optional, max {MAX_CC})</span>
        </label>
        <div style={{
          ...inputStyle,
          padding: 6,
          minHeight: 44,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          marginBottom: 6,
        }}>
          {ccs.map(cc => (
            <span key={cc} style={{
              background: '#F5F0EB', color: D, padding: '4px 8px', borderRadius: 100,
              fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {cc}
              <button
                onClick={() => setCcs(ccs.filter(e => e !== cc))}
                style={{ background: 'none', border: 'none', color: '#6B6560', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                title="Remove"
              >×</button>
            </span>
          ))}
          <input
            value={ccDraft}
            onChange={e => { setCcDraft(e.target.value); setValidationError(null); }}
            onKeyDown={handleCcKeyDown}
            onBlur={() => { if (ccDraft.trim()) tryAddCc(ccDraft); }}
            placeholder={ccs.length === 0 ? 'agent@example.com' : ''}
            disabled={ccs.length >= MAX_CC}
            style={{
              flex: 1, minWidth: 140, border: 'none', outline: 'none', padding: '6px 4px',
              fontSize: 13, fontFamily: "'DM Sans', sans-serif", color: D, background: 'transparent',
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: '#9B9490', marginBottom: 18 }}>
          Press Enter or comma to add. {MAX_CC - ccs.length} {MAX_CC - ccs.length === 1 ? 'slot' : 'slots'} remaining.
        </div>

        {(validationError || error) && (
          <div style={{
            fontSize: 13, marginBottom: 14, padding: '10px 12px', borderRadius: 8,
            background: '#FEF2F2', color: '#B91C1C',
          }}>
            {validationError || error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={sending}
            style={{
              padding: '10px 18px', background: 'transparent', color: '#6B6560', border: '1px solid #E0DAD4',
              borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: sending ? 'default' : 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >Cancel</button>
          <button
            onClick={handleSend}
            disabled={sending}
            style={{
              padding: '10px 22px', background: O, color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 14, fontWeight: 700,
              cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.7 : 1,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {sending ? 'Sending…' : ccs.length > 0 ? `Send to ${ccs.length + 1} recipients` : 'Send to client'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Item card (rich version mirroring homeowner-side ItemCard) ──────────

function toNumberConfidence(item: InspectionItem): number {
  const c = typeof item.confidence === 'number' ? item.confidence : parseFloat(String(item.confidence ?? '1'));
  return Number.isFinite(c) ? c : 1;
}

interface ItemCardProps {
  item: InspectionItem & { inspectorAdjusted?: boolean };
  isEditing: boolean;
  editForm: AddItemForm;
  setEditForm: (f: AddItemForm) => void;
  renderForm: (form: AddItemForm, setForm: (f: AddItemForm) => void) => React.ReactNode;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  isSent: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  /** Surfaced when this card is the actively-edited one and a save failed. */
  saveError: string | null;
}

function ItemCard({
  item, isEditing, editForm, setEditForm, renderForm,
  onStartEdit, onCancelEdit, onSaveEdit, onDelete, isSent,
  selected, onToggleSelected, saveError,
}: ItemCardProps) {
  const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
  const catLabel = CATEGORY_LABELS[item.category] ?? item.category;
  const catIcon = CATEGORY_ICONS[item.category] ?? '';
  const needsReview = !isSent && itemNeedsReview(item);
  const confidence = toNumberConfidence(item);
  const confidenceColor = confidence >= 0.8 ? G : confidence >= 0.5 ? '#EF9F27' : '#E24B4A';

  return (
    <div style={{
      background: '#ffffff', borderRadius: 14,
      border: needsReview ? '1px solid #F4D87A' : selected ? `2px solid ${O}` : '1px solid #E0DAD4',
      padding: 18, position: 'relative',
      boxShadow: needsReview ? '0 0 0 3px #FFF8E6' : undefined,
    }}>
      {needsReview && (
        <div style={{
          position: 'absolute', top: -10, left: 14, padding: '3px 10px', borderRadius: 100,
          background: '#FFF8E6', border: '1px solid #F4D87A',
          fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700, color: '#8B6F00',
          letterSpacing: '0.04em', textTransform: 'uppercase',
        }}>
          ⚠ Review before sending
        </div>
      )}

      {isEditing ? (
        <>
          {renderForm(editForm, setEditForm)}
          {saveError && (
            <div style={{
              marginTop: 10, padding: '8px 12px', borderRadius: 8,
              background: '#FEF2F2', color: '#B91C1C',
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
            }}>
              {saveError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={onSaveEdit} style={{
              padding: '8px 16px', background: G, color: '#fff', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}>Save</button>
            <button onClick={onCancelEdit} style={{
              padding: '8px 16px', background: '#F5F0EB', color: '#6B6560', border: 'none',
              borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}>Cancel</button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          {!isSent && (
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelected}
              onClick={e => e.stopPropagation()}
              style={{ marginTop: 4, width: 16, height: 16, accentColor: O, cursor: 'pointer', flexShrink: 0 }}
              aria-label="Select for bulk edit"
            />
          )}

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Top row: badges + cost (right-aligned) */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 700,
                  padding: '2px 8px', borderRadius: 12,
                  background: `${sevColor}18`, color: sevColor,
                }}>
                  {SEVERITY_LABELS[item.severity] ?? item.severity}
                </span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#6B6560', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span>{catIcon}</span>
                  <span>{catLabel}</span>
                </span>
                <span
                  title={`AI confidence: ${Math.round(confidence * 100)}%`}
                  style={{ width: 8, height: 8, borderRadius: '50%', background: confidenceColor, display: 'inline-block', flexShrink: 0 }}
                />
                {item.inspectorAdjusted && (
                  <span style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 8, background: '#E8F5E9', color: G,
                  }} title="You've reviewed this item">
                    ✓ Reviewed
                  </span>
                )}
                {item.sourceDocumentId && (
                  <span style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 8, background: '#FEF3C7', color: '#B45309',
                  }} title="From a supporting document">
                    📋 Supporting doc
                  </span>
                )}
                {item.crossReferencedItemIds && item.crossReferencedItemIds.length > 0 && (
                  <span style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 10, fontWeight: 700,
                    padding: '2px 8px', borderRadius: 8, background: '#F3E8FF', color: '#7C3AED',
                  }}>
                    🔗 Cross-referenced ({item.crossReferencedItemIds.length})
                  </span>
                )}
              </div>
              {(item.costEstimateMin !== null || item.costEstimateMax !== null) && (
                <div style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 700, color: D,
                  whiteSpace: 'nowrap', textAlign: 'right',
                }}>
                  {formatCurrency(item.costEstimateMin ?? 0)} – {formatCurrency(item.costEstimateMax ?? 0)}
                </div>
              )}
            </div>

            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, fontWeight: 600, color: D, marginBottom: 4 }}>
              {item.title}
            </div>

            {item.description && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#6B6560', margin: '0 0 8px', lineHeight: 1.5 }}>
                {item.description}
              </p>
            )}

            {/* Photo descriptions block */}
            {item.photoDescriptions && item.photoDescriptions.length > 0 && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: '#F9F5F2', borderRadius: 8 }}>
                {item.photoDescriptions.map((desc, i) => (
                  <div key={i} style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#6B6560',
                    marginBottom: i < item.photoDescriptions.length - 1 ? 4 : 0, lineHeight: 1.5,
                  }}>
                    <span style={{ opacity: 0.5 }}>Photo {i + 1}:</span> {desc}
                  </div>
                ))}
              </div>
            )}

            {/* Location */}
            {item.location && (
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#9B9490', marginTop: 6 }}>
                Location: {item.location}
              </div>
            )}

            {/* Value-impact badges (parity with homeowner side) */}
            {item.valueImpact && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <span style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                  padding: '3px 10px', borderRadius: 8,
                  background: '#8B5CF615', color: '#7C3AED',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <span style={{ fontSize: 12 }}>↑</span>
                  ~{formatCurrency(item.valueImpact.roiLow)}–{formatCurrency(item.valueImpact.roiHigh)} value increase
                </span>
                {item.valueImpact.lenderFlagType === 'fha_va_required' && (
                  <span style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                    padding: '3px 10px', borderRadius: 8, background: '#EF444415', color: '#DC2626',
                  }}>
                    FHA/VA Required
                  </span>
                )}
                {item.valueImpact.lenderFlagType === 'lender_concern' && (
                  <span style={{
                    fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                    padding: '3px 10px', borderRadius: 8, background: '#F59E0B15', color: '#B45309',
                  }}>
                    Lender Concern
                  </span>
                )}
              </div>
            )}

            {/* Post-send: dispatch + quote */}
            {isSent && item.dispatchStatus && (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 100,
                  background: `${DISPATCH_LABELS[item.dispatchStatus]?.color ?? '#9B9490'}18`,
                  color: DISPATCH_LABELS[item.dispatchStatus]?.color ?? '#9B9490',
                }}>
                  {DISPATCH_LABELS[item.dispatchStatus]?.label ?? item.dispatchStatus}
                </span>
                {item.quoteDetails && (
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: '#6B6560' }}>
                    {item.quoteDetails.providerName} · {formatCurrency(item.quoteDetails.price)} ({item.quoteDetails.availability})
                  </span>
                )}
              </div>
            )}
          </div>

          {!isSent && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button onClick={onStartEdit} style={{
                padding: '6px 12px', background: '#F5F0EB', color: '#6B6560', border: 'none',
                borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}>Edit</button>
              <button onClick={onDelete} style={{
                padding: '6px 12px', background: '#FFF5F5', color: '#E24B4A', border: 'none',
                borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
              }}>Delete</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Bulk-edit modal ─────────────────────────────────────────────────────

function BulkEditModal({ count, onCancel, onSubmit, busy, error }: {
  count: number;
  onCancel: () => void;
  onSubmit: (updates: { severity?: string; category?: string }) => void;
  busy: boolean;
  error: string | null;
}) {
  const [severity, setSeverity] = useState<string>('');
  const [category, setCategory] = useState<string>('');

  function handleApply() {
    const updates: { severity?: string; category?: string } = {};
    if (severity) updates.severity = severity;
    if (category) updates.category = category;
    if (!updates.severity && !updates.category) return;
    onSubmit(updates);
  }

  const canApply = !busy && (severity || category);

  return (
    <div
      onClick={() => { if (!busy) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, padding: 24, maxWidth: 440, width: '100%',
        boxShadow: '0 24px 64px -20px rgba(0,0,0,0.25)',
      }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700, color: D, marginBottom: 6 }}>
          Bulk edit {count} item{count === 1 ? '' : 's'}
        </div>
        <div style={{ fontSize: 13, color: '#6B6560', marginBottom: 18, lineHeight: 1.5 }}>
          Useful for fixing common parsing mistakes — change a batch of items'
          severity or category in one shot. Leave a field blank to keep
          existing values for that field.
        </div>

        <label style={labelStyle}>Severity</label>
        <select
          value={severity}
          onChange={e => setSeverity(e.target.value)}
          style={{ ...inputStyle, marginBottom: 12 }}
        >
          <option value="">— Don't change —</option>
          <option value="safety_hazard">Safety Hazard</option>
          <option value="urgent">Urgent</option>
          <option value="recommended">Recommended</option>
          <option value="monitor">Monitor</option>
          <option value="informational">Informational</option>
        </select>

        <label style={labelStyle}>Category</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          style={{ ...inputStyle, marginBottom: 16 }}
        >
          <option value="">— Don't change —</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{CATEGORY_ICONS[key] ?? ''} {label}</option>
          ))}
        </select>

        {error && (
          <div style={{
            fontSize: 13, marginBottom: 14, padding: '10px 12px', borderRadius: 8,
            background: '#FEF2F2', color: '#B91C1C',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} disabled={busy} style={{
            padding: '10px 18px', background: 'transparent', color: '#6B6560', border: '1px solid #E0DAD4',
            borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: busy ? 'default' : 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>Cancel</button>
          <button onClick={handleApply} disabled={!canApply} style={{
            padding: '10px 22px', background: O, color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 14, fontWeight: 700,
            cursor: canApply ? 'pointer' : 'default', opacity: canApply ? 1 : 0.5,
            fontFamily: "'DM Sans', sans-serif",
          }}>{busy ? 'Updating…' : 'Apply'}</button>
        </div>
      </div>
    </div>
  );
}
