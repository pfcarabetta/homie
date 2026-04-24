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

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    inspectorService.getReport(id).then(res => {
      if (res.data) setReport(res.data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  const isSent = report && (report.status === 'sent' || report.status === 'active' || report.status === 'completed');

  async function handleSendToClient() {
    if (!report) return;
    setSending(true);
    try {
      const res = await inspectorService.sendToClient(report.id);
      if (res.data) setReport(res.data);
    } catch {
      // handle error silently
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

  async function handleSaveEdit(itemId: string) {
    if (!report) return;
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
      if (res.data) {
        setReport({
          ...report,
          items: report.items.map(i => i.id === itemId ? res.data! : i),
        });
        setEditingId(null);
      }
    } catch {
      // handle error silently
    }
  }

  function startEdit(item: InspectionItem) {
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

      {/* Send to client CTA */}
      {!isSent && (
        <div style={{
          background: '#ffffff', borderRadius: 14, border: `2px solid ${O}`, padding: 20, marginBottom: 24,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 4 }}>Ready to send to client?</div>
            <div style={{ fontSize: 13, color: '#6B6560' }}>Review items below, then send the report to your client.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {(report as unknown as { clientAccessToken?: string }).clientAccessToken && (
              <a
                href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:3001'}/api/v1/inspect/${(report as unknown as { clientAccessToken?: string }).clientAccessToken}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '10px 16px', background: 'transparent', color: O, border: `1px solid ${O}`,
                  borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif", textDecoration: 'none', whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10" /></svg>
                PDF
              </a>
            )}
            <button
              onClick={handleSendToClient}
              disabled={sending}
              style={{
                padding: '10px 24px', background: O, color: '#fff', border: 'none',
                borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
                fontFamily: "'DM Sans', sans-serif", opacity: sending ? 0.7 : 1, whiteSpace: 'nowrap',
              }}
            >
              {sending ? 'Sending...' : 'Send to Client'}
            </button>
          </div>
        </div>
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

      {/* Items list */}
      <h2 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, marginBottom: 16 }}>
        Items ({report.items.length})
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {report.items.map(item => {
          const sevColor = SEVERITY_COLORS[item.severity] ?? '#9B9490';
          const isEditing = editingId === item.id;

          return (
            <div key={item.id} style={{
              background: '#ffffff', borderRadius: 14, border: '1px solid #E0DAD4', padding: 20,
            }}>
              {isEditing ? (
                <>
                  {renderItemForm(editForm, setEditForm)}
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button onClick={() => handleSaveEdit(item.id)} style={{
                      padding: '8px 16px', background: G, color: '#fff', border: 'none',
                      borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    }}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{
                      padding: '8px 16px', background: '#F5F0EB', color: '#6B6560', border: 'none',
                      borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                    }}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                          background: `${sevColor}18`, color: sevColor,
                        }}>
                          {SEVERITY_LABELS[item.severity] ?? item.severity}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                          background: '#F5F0EB', color: '#6B6560',
                        }}>
                          {item.category}
                        </span>
                        {item.location && (
                          <span style={{ fontSize: 11, color: '#9B9490' }}>{item.location}</span>
                        )}
                        {/* Confidence dot */}
                        <span style={{
                          width: 8, height: 8, borderRadius: '50%',
                          background: item.confidence >= 0.8 ? G : item.confidence >= 0.5 ? '#EF9F27' : '#E24B4A',
                          display: 'inline-block', flexShrink: 0,
                        }} title={`Confidence: ${Math.round(item.confidence * 100)}%`} />
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: D, marginBottom: 4 }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 13, color: '#6B6560', lineHeight: 1.5, marginBottom: 8 }}>
                        {item.description}
                      </div>
                      {(item.costEstimateMin !== null || item.costEstimateMax !== null) && (
                        <div style={{ fontSize: 13, color: D, fontWeight: 500 }}>
                          Est. cost: {item.costEstimateMin !== null ? formatCurrency(item.costEstimateMin) : '?'}
                          {' - '}
                          {item.costEstimateMax !== null ? formatCurrency(item.costEstimateMax) : '?'}
                        </div>
                      )}

                      {/* Post-send: dispatch status */}
                      {isSent && item.dispatchStatus && (
                        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100,
                            background: `${DISPATCH_LABELS[item.dispatchStatus]?.color ?? '#9B9490'}18`,
                            color: DISPATCH_LABELS[item.dispatchStatus]?.color ?? '#9B9490',
                          }}>
                            {DISPATCH_LABELS[item.dispatchStatus]?.label ?? item.dispatchStatus}
                          </span>
                          {item.quoteDetails && (
                            <span style={{ fontSize: 12, color: '#6B6560' }}>
                              {item.quoteDetails.providerName} - {formatCurrency(item.quoteDetails.price)}
                              {' '}({item.quoteDetails.availability})
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Edit/Delete buttons (pre-send only) */}
                    {!isSent && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => startEdit(item)} style={{
                          padding: '6px 12px', background: '#F5F0EB', color: '#6B6560', border: 'none',
                          borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                        }}>Edit</button>
                        <button onClick={() => handleDeleteItem(item.id)} style={{
                          padding: '6px 12px', background: '#FFF5F5', color: '#E24B4A', border: 'none',
                          borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                        }}>Delete</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}

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
