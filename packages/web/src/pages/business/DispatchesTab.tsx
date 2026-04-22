import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { O, G, D, W, cleanPrice, renderBold, timeAgo, priceToCents, type Tab } from './constants';
import { businessService, jobService, trackingService, estimateService, getToken, type WorkspaceDispatch, type ProviderResponseItem, type CostEstimate } from '@/services/api';
import EstimateCard from '@/components/EstimateCard';
import EstimateBadge from '@/components/EstimateBadge';

/* ── Dispatch Constants ──────────────────────────────────────────────── */

const DISPATCH_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  open: { bg: '#EFF6FF', text: '#2563EB' },
  dispatching: { bg: '#FFF7ED', text: '#C2410C' },
  collecting: { bg: '#F5F3FF', text: '#7C3AED' },
  completed: { bg: '#F0FDF4', text: '#16A34A' },
  expired: { bg: '#F5F5F5', text: '#9B9490' },
  refunded: { bg: '#FEF2F2', text: '#DC2626' },
};

const DISPATCH_STATUS_MESSAGES: Record<string, { icon: string; label: string; desc: string }> = {
  open: { icon: '📋', label: 'Open', desc: 'Dispatch request has been created' },
  dispatching: { icon: '🚀', label: 'Searching', desc: 'AI agent is finding and contacting providers' },
  collecting: { icon: '📡', label: 'Collecting Quotes', desc: 'Providers are being contacted — quotes will appear as they respond' },
  completed: { icon: '✅', label: 'Complete', desc: 'Outreach is complete — quotes are ready' },
  expired: { icon: '⏰', label: 'Expired', desc: 'This dispatch request has expired' },
  refunded: { icon: '💰', label: 'Refunded', desc: 'Payment has been refunded' },
};

const DISPATCH_ENCOURAGEMENT = [
  'Calling around so you don\u2019t have to',
  'Nobody got you like your Homie',
  'Sit tight \u2014 quotes incoming',
  'Making moves behind the scenes',
];

const DISPATCH_CARD_STYLES = `
@keyframes dpc-spin-cw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes dpc-spin-ccw {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(-360deg); }
}
@keyframes dpc-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@keyframes dpc-channel-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.5); opacity: 0; }
}
@keyframes dpc-rotate-msgs {
  0%, 22% { transform: translateY(0); }
  25%, 47% { transform: translateY(-25%); }
  50%, 72% { transform: translateY(-50%); }
  75%, 97% { transform: translateY(-75%); }
}
@media (prefers-reduced-motion: reduce) {
  .dpc-spin-cw, .dpc-spin-ccw, .dpc-channel-pulse, .dpc-msg-rotate { animation: none !important; }
}
`;

const DPC_CHANNELS = [
  { key: 'voice' as const, label: 'Voice', bg: '#FAECE7', color: O },
  { key: 'sms' as const, label: 'SMS', bg: '#E1F5EE', color: G },
  { key: 'web' as const, label: 'Web', bg: '#E6F1FB', color: '#2E86C1' },
];

/* ── Tracking Share Modal ──────────────────────────────────────────── */

export function TrackingShareModal({ jobId, propertyName, onClose }: { jobId: string; propertyName?: string; onClose: () => void }) {
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);
  const [creating, setCreating] = useState(true);
  const [copied, setCopied] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notifySaved, setNotifySaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    trackingService.createLink(jobId, { property_name: propertyName })
      .then(res => { if (res.data) setTrackingUrl(res.data.tracking_url); })
      .catch(() => {})
      .finally(() => setCreating(false));
  }, [jobId, propertyName]);

  async function saveNotify() {
    if (!phone.trim() && !email.trim()) return;
    setSaving(true);
    try {
      await trackingService.createLink(jobId, {
        notify_phone: phone.trim() || undefined,
        notify_email: email.trim() || undefined,
        property_name: propertyName,
      });
      setNotifySaved(true);
    } catch { /* ignore */ }
    setSaving(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--bp-card)', borderRadius: 16, padding: '24px 20px', width: '100%', maxWidth: 440, margin: '0 12px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, margin: 0 }}>Share maintenance status</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--bp-subtle)', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--bp-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          Share a live tracking link with property owners or guests. They'll see real-time status updates as providers are contacted and quotes come in.
        </div>

        {creating && <div style={{ fontSize: 13, color: 'var(--bp-subtle)', marginBottom: 12 }}>Creating tracking link...</div>}

        {trackingUrl && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: W, borderRadius: 8, padding: '10px 12px', border: '1px solid rgba(0,0,0,0.06)', marginBottom: 16 }}>
            <input readOnly value={trackingUrl} style={{ flex: 1, border: 'none', outline: 'none', fontSize: 12, color: D, fontFamily: "'DM Mono', monospace", background: 'transparent' }} />
            <button onClick={() => { navigator.clipboard.writeText(trackingUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 600, background: copied ? G : O, color: '#fff', cursor: 'pointer', flexShrink: 0 }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        )}

        {trackingUrl && !notifySaved && (
          <>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--bp-subtle)', marginBottom: 8 }}>Also send automatic updates via (optional)</div>
            <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone for SMS updates"
                style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 14, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email for updates"
                style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)', fontSize: 14, outline: 'none', fontFamily: "'DM Sans', sans-serif" }} />
            </div>
            {(phone.trim() || email.trim()) && (
              <button disabled={saving} onClick={saveNotify} style={{
                width: '100%', padding: '10px 0', borderRadius: 100, border: 'none',
                background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif", opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Saving...' : 'Send updates'}
              </button>
            )}
          </>
        )}

        {notifySaved && (
          <div style={{ fontSize: 13, color: G, fontWeight: 600 }}>
            ✓ Updates will be sent{phone ? ` to ${phone}` : ''}{phone && email ? ' and' : ''}{email ? ` to ${email}` : ''}
          </div>
        )}

        {trackingUrl && (
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <a href={trackingUrl} target="_blank" rel="noopener" style={{ fontSize: 12, color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}>Preview tracking page →</a>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Dispatches Tab ──────────────────────────────────────────────────── */

export default function DispatchesTab({ workspaceId, onTabChange, plan, focusJobId, onFocusHandled }: { workspaceId: string; onTabChange?: (tab: Tab) => void; plan: string; focusJobId?: string | null; onFocusHandled?: () => void }) {
  const navigate = useNavigate();
  const [dispatches, setDispatches] = useState<WorkspaceDispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, ProviderResponseItem[]>>({});
  const [loadingResponses, setLoadingResponses] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null);
  const [sharingJobId, setSharingJobId] = useState<string | null>(null);
  const [preferredProviderIds, setPreferredProviderIds] = useState<Set<string>>(new Set());
  const [estimates, setEstimates] = useState<Record<string, CostEstimate>>({});
  const isPro = ['professional', 'business', 'enterprise'].includes(plan);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProperty, setFilterProperty] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    businessService.listVendors(workspaceId).then(res => {
      if (res.data) setPreferredProviderIds(new Set(res.data.filter(v => v.active).map(v => v.providerId)));
    }).catch(() => {});
  }, [workspaceId]);

  async function handleDownloadEstimate(jobId: string) {
    setDownloadingPdf(jobId);
    try {
      const token = getToken();
      const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
      const res = await fetch(`${API_BASE}/api/v1/business/${workspaceId}/jobs/${jobId}/estimate-pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `estimate-summary-${jobId.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert((err as Error).message || 'Failed to download estimate PDF');
    } finally {
      setDownloadingPdf(null);
    }
  }

  useEffect(() => {
    businessService.listDispatches(workspaceId).then(async res => {
      if (res.data) setDispatches(res.data);
      setLoading(false);

      // Auto-expand focused job after data loads
      if (focusJobId && res.data?.some(d => d.id === focusJobId)) {
        setExpandedId(focusJobId);
        const focusJob = res.data.find(d => d.id === focusJobId);
        if (focusJob) fetchEstimate(focusJob);
        // Load responses for the focused job
        try {
          const respRes = await jobService.getResponses(focusJobId);
          if (respRes.data) setResponses(prev => ({ ...prev, [focusJobId]: respRes.data!.responses }));
        } catch { /* ignore */ }
        // Scroll into view after render
        requestAnimationFrame(() => {
          setTimeout(() => {
            const el = document.getElementById(`dispatch-${focusJobId}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            onFocusHandled?.();
          }, 100);
        });
      }
    }).catch(() => setLoading(false));
  }, [workspaceId]);

  async function fetchEstimate(job: WorkspaceDispatch) {
    if (estimates[job.id] || !job.diagnosis?.category || !job.zipCode) return;
    try {
      const cat = job.diagnosis.category;
      const sub = job.diagnosis.subcategory || cat;
      const res = await estimateService.generate({ category: cat, subcategory: sub, zip_code: job.zipCode, workspace_id: workspaceId });
      if (res.data) setEstimates(prev => ({ ...prev, [job.id]: res.data! }));
    } catch { /* ignore */ }
  }

  async function toggleExpand(jobId: string) {
    if (expandedId === jobId) { setExpandedId(null); return; }
    setExpandedId(jobId);
    const job = dispatches.find(d => d.id === jobId);
    if (job) fetchEstimate(job);
    if (!responses[jobId]) {
      setLoadingResponses(jobId);
      try {
        const res = await jobService.getResponses(jobId);
        setResponses(prev => ({ ...prev, [jobId]: res.data?.responses ?? [] }));
      } catch { setResponses(prev => ({ ...prev, [jobId]: [] })); }
      setLoadingResponses(null);
    }
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--bp-subtle)' }}>Loading dispatches...</div>;

  const filteredDispatches = dispatches.filter(d => {
    if (showArchived) { if (d.status !== 'archived') return false; }
    else { if (d.status === 'archived') return false; }
    if (filterStatus && d.status !== filterStatus) return false;
    if (filterCategory) {
      const cat = (d.diagnosis?.category ?? '').toLowerCase();
      if (cat !== filterCategory) return false;
    }
    if (filterProperty && d.propertyId !== filterProperty) return false;
    if (filterSeverity) {
      const sev = (d.diagnosis?.severity ?? '').toLowerCase();
      if (sev !== filterSeverity) return false;
    }
    if (filterDateFrom) {
      if (new Date(d.createdAt) < new Date(filterDateFrom)) return false;
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo); to.setHours(23, 59, 59, 999);
      if (new Date(d.createdAt) > to) return false;
    }
    return true;
  });

  // Derive unique categories and properties for filter dropdowns
  const uniqueCategories = [...new Set(dispatches.map(d => d.diagnosis?.category).filter(Boolean))] as string[];
  const uniqueProperties = [...new Map(dispatches.filter(d => d.propertyId && d.propertyName).map(d => [d.propertyId, d.propertyName])).entries()].map(([id, name]) => ({ id: id as string, name: name as string }));

  if (dispatches.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bp-hover)', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🚀</div>
      <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No dispatches yet</div>
      <div style={{ fontSize: 14, color: 'var(--bp-subtle)', marginBottom: 20 }}>Dispatch requests from the chat will appear here.</div>
      <button onClick={() => navigate(`/business?tab=dispatch-chat&workspace=${workspaceId}`)}
        style={{ padding: '10px 24px', borderRadius: 100, border: 'none', background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        New Dispatch
      </button>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>Dispatches</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setShowArchived(!showArchived)}
            style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${showArchived ? O : 'var(--bp-border)'}`, background: showArchived ? `${O}08` : 'var(--bp-card)', color: showArchived ? O : '#9B9490', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {showArchived ? 'Active Dispatches' : 'Archived'}
          </button>
          <button onClick={() => { if (isPro) onTabChange?.('schedules'); }}
            title={isPro ? 'Set up recurring dispatches' : 'Upgrade to Professional to use Auto-Dispatch'}
            style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--bp-border)', background: 'var(--bp-card)', fontSize: 12, fontWeight: 600,
              color: isPro ? D : '#ccc', cursor: isPro ? 'pointer' : 'default', opacity: isPro ? 1 : 0.6 }}>
            🔄 Auto-Dispatch{!isPro && ' (Pro+)'}
          </button>
          <button onClick={() => navigate(`/business?tab=dispatch-chat&workspace=${workspaceId}`)}
            style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            + New Dispatch
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bp-border)', fontSize: 12, color: D, cursor: 'pointer', background: 'var(--bp-card)' }}>
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="dispatching">Dispatching</option>
          <option value="collecting">Collecting</option>
          <option value="completed">Completed</option>
          <option value="expired">Expired</option>
          <option value="archived">Archived</option>
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bp-border)', fontSize: 12, color: D, cursor: 'pointer', background: 'var(--bp-card)' }}>
          <option value="">All Categories</option>
          {uniqueCategories.map(c => (
            <option key={c} value={c}>{c.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())}</option>
          ))}
        </select>
        <select value={filterProperty} onChange={e => setFilterProperty(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bp-border)', fontSize: 12, color: D, cursor: 'pointer', background: 'var(--bp-card)' }}>
          <option value="">All Properties</option>
          {uniqueProperties.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bp-border)', fontSize: 12, color: D, cursor: 'pointer', background: 'var(--bp-card)' }}>
          <option value="">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </select>
        <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bp-border)', fontSize: 12, color: D, background: 'var(--bp-card)' }}
          title="From date" />
        <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--bp-border)', fontSize: 12, color: D, background: 'var(--bp-card)' }}
          title="To date" />
        {(filterStatus || filterCategory || filterProperty || filterSeverity || filterDateFrom || filterDateTo) && (
          <button onClick={() => { setFilterStatus(''); setFilterCategory(''); setFilterProperty(''); setFilterSeverity(''); setFilterDateFrom(''); setFilterDateTo(''); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: '#F5F5F5', color: 'var(--bp-subtle)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Clear filters
          </button>
        )}
        <span style={{ fontSize: 12, color: 'var(--bp-subtle)', marginLeft: 'auto' }}>{filteredDispatches.length} dispatch{filteredDispatches.length !== 1 ? 'es' : ''}</span>
      </div>

      <style dangerouslySetInnerHTML={{ __html: DISPATCH_CARD_STYLES }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filteredDispatches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--bp-subtle)', fontSize: 14 }}>
            {showArchived ? 'No archived dispatches' : 'No active dispatches'}
          </div>
        ) : null}
        {(() => {
          let lastDateLabel = '';
          return filteredDispatches.map(j => {
            const dateObj = new Date(j.createdAt);
            const today = new Date();
            const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
            const isToday = dateObj.toDateString() === today.toDateString();
            const isYesterday = dateObj.toDateString() === yesterday.toDateString();
            const dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: dateObj.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
            const showHeader = dateLabel !== lastDateLabel;
            lastDateLabel = dateLabel;

            return (<div key={j.id}>
              {showHeader && (
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--bp-subtle)', padding: '14px 0 6px', letterSpacing: '0.03em' }}>
                  {dateLabel}
                </div>
              )}
              {(() => {
          const sc = DISPATCH_STATUS_COLORS[j.status] || DISPATCH_STATUS_COLORS.expired;
          const isExpanded = expandedId === j.id;
          const jobResponses = responses[j.id] ?? [];
          const isActive = ['open', 'dispatching', 'collecting'].includes(j.status);
          const catLabel = j.diagnosis?.category ? j.diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Dispatch';
          const responseCount = j.responseCount;
          const ringSize = 44;

          return (
            <div key={j.id} id={`dispatch-${j.id}`} onClick={() => toggleExpand(j.id)} style={{
              background: 'var(--bp-card)', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
              border: isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
              transition: 'all 0.2s',
              boxShadow: isExpanded ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
            }}>
              {/* Collapsed header */}
              <div style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {isActive ? (
                    <div style={{ position: 'relative', width: 38, height: 38, flexShrink: 0 }}>
                      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid #F0EBE6' }} />
                      <div className="dpc-spin-cw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderTopColor: O, animation: 'dpc-spin-cw 1.8s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                      <div className="dpc-spin-ccw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid transparent', borderBottomColor: G, animation: 'dpc-spin-ccw 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 17, color: O, lineHeight: 1 }}>h</div>
                    </div>
                  ) : (
                    <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: responseCount > 0 ? `${G}12` : W, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${responseCount > 0 ? `${G}30` : '#F0EBE6'}` }}>
                      <span style={{ fontSize: 16 }}>{responseCount > 0 ? '✓' : j.status === 'expired' ? '⏰' : '✓'}</span>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{catLabel}</span>
                      <span style={{ background: sc.bg, color: sc.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>{j.status.charAt(0).toUpperCase() + j.status.slice(1)}</span>
                      {j.diagnosis?.source === 'inspection_report' && <span style={{ background: '#EFF6FF', color: '#2563EB', padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>Inspect</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bp-subtle)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {j.propertyName && <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>🏠 {j.propertyName}</span>}
                      <span>{new Date(j.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span>{j.zipCode}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 50 }}>
                    {responseCount > 0 ? (
                      <>
                        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: G }}>{responseCount}</div>
                        <div style={{ fontSize: 9, color: 'var(--bp-subtle)' }}>quote{responseCount > 1 ? 's' : ''}</div>
                      </>
                    ) : isActive ? (
                      <div style={{ fontSize: 10, fontWeight: 600, color: O, animation: 'dpc-pulse 1.5s infinite' }}>Searching</div>
                    ) : (
                      <span style={{ fontSize: 12, color: '#C0BBB6' }}>—</span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: '#C0BBB6', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ padding: '0 14px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>

                  {/* Active outreach animation + channel counts */}
                  {isActive && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 0 16px' }}>
                      <div style={{ position: 'relative', width: 72, height: 72, marginBottom: 12 }}>
                        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid #F0EBE6' }} />
                        <div className="dpc-spin-cw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderTopColor: O, animation: 'dpc-spin-cw 1.8s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                        <div className="dpc-spin-ccw" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2.5px solid transparent', borderBottomColor: G, animation: 'dpc-spin-ccw 2.4s cubic-bezier(0.45,0.05,0.55,0.95) infinite' }} />
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 30, color: O, lineHeight: 1 }}>h</div>
                      </div>
                      <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, textAlign: 'center' }}>Your Homie's on it</div>
                      <div style={{ fontSize: 12, color: 'var(--bp-subtle)', textAlign: 'center', marginTop: 2 }}>Contacting pros near {j.zipCode}</div>
                      <div style={{ height: 18, overflow: 'hidden', marginTop: 8, textAlign: 'center' }}>
                        <div className="dpc-msg-rotate" style={{ animation: 'dpc-rotate-msgs 10s ease-in-out infinite' }}>
                          {DISPATCH_ENCOURAGEMENT.map((msg, i) => (
                            <div key={i} style={{ height: 18, lineHeight: '18px', fontSize: 12, fontWeight: 500, color: O }}>{msg}</div>
                          ))}
                        </div>
                      </div>

                      {/* Channel outreach counts */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 14, width: '100%' }}>
                        {DPC_CHANNELS.map(({ key, label, bg, color: chColor }, ci) => (
                          <div key={key} style={{ flex: 1, background: 'var(--bp-card)', borderRadius: 10, padding: '10px 6px', textAlign: 'center', border: '1px solid rgba(0,0,0,0.05)', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: bg, marginBottom: 4 }}>
                              <div className="dpc-channel-pulse" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: bg, animation: `dpc-channel-pulse 2.4s ease-in-out ${ci * 0.8}s infinite` }} />
                              <span style={{ position: 'relative', fontSize: 12 }}>{key === 'voice' ? '📞' : key === 'sms' ? '💬' : '🌐'}</span>
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--bp-subtle)', fontWeight: 500 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  {j.diagnosis?.summary && (
                    <div style={{ fontSize: 13, color: 'var(--bp-muted)', lineHeight: 1.6, marginBottom: 14, paddingTop: isActive ? 0 : 12 }}>
                      {renderBold(j.diagnosis.summary)}
                    </div>
                  )}

                  {/* No-charge notice for expired with 0 responses */}
                  {j.status === 'expired' && j.responseCount === 0 && (
                    <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '10px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid rgba(37,99,235,0.1)' }}>
                      <span style={{ fontSize: 14 }}>💰</span>
                      <span style={{ fontSize: 13, color: '#2563EB', fontWeight: 500 }}>No charge for dispatches with zero responses.</span>
                    </div>
                  )}

                  {/* Details grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 6, marginBottom: 14 }}>
                    {[
                      { label: 'Category', value: catLabel },
                      { label: 'Severity', value: (j.diagnosis?.severity ?? 'medium').replace(/^\w/, c => c.toUpperCase()), color: j.diagnosis?.severity === 'high' ? '#DC2626' : j.diagnosis?.severity === 'low' ? G : D },
                      ...(j.propertyName ? [{ label: 'Property', value: j.propertyName }] : []),
                      { label: 'Timing', value: j.preferredTiming ?? 'ASAP' },
                    ].map((item, i) => (
                      <div key={i} style={{ background: W, borderRadius: 8, padding: '7px 10px' }}>
                        <div style={{ fontSize: 9, color: 'var(--bp-subtle)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: (item as { color?: string }).color ?? D, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Expiry */}
                  {j.expiresAt && isActive && (
                    <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginBottom: 12 }}>
                      Expires: {new Date(j.expiresAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </div>
                  )}

                  {/* Action buttons */}
                  {(jobResponses.length > 0 || !['archived', 'refunded'].includes(j.status)) && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                      {jobResponses.length > 0 && (
                        isPro ? (
                          <button onClick={() => handleDownloadEstimate(j.id)} disabled={downloadingPdf === j.id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${O}40`, background: `${O}08`, color: O, fontSize: 12, fontWeight: 600, cursor: downloadingPdf === j.id ? 'default' : 'pointer', opacity: downloadingPdf === j.id ? 0.6 : 1 }}>
                            {downloadingPdf === j.id ? 'Generating...' : '📄 Estimate PDF'}
                          </button>
                        ) : (
                          <button disabled style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--bp-border)', background: '#F5F3F0', color: '#B0AAA4', fontSize: 12, fontWeight: 600, cursor: 'default' }}>
                            📄 Estimate PDF <span style={{ fontSize: 10 }}>(Pro+)</span>
                          </button>
                        )
                      )}
                      {!['archived', 'refunded'].includes(j.status) && (
                        <button onClick={() => setSharingJobId(j.id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: `1px solid ${G}40`, background: `${G}08`, color: G, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                          🔗 Share Status
                        </button>
                      )}
                    </div>
                  )}

                  {/* AI Cost Estimate */}
                  {estimates[j.id] && (
                    <div style={{ marginBottom: 14 }}>
                      <EstimateCard estimate={estimates[j.id]} />
                    </div>
                  )}

                  {/* Provider Responses */}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: D, marginBottom: 8, letterSpacing: '0.02em' }}>
                      {responseCount > 0 ? `Provider Responses (${responseCount})` : 'Provider Responses'}
                    </div>

                    {loadingResponses === j.id ? (
                      <div style={{ color: 'var(--bp-subtle)', fontSize: 13 }}>Loading responses...</div>
                    ) : jobResponses.length === 0 ? (
                      <div style={{ background: W, borderRadius: 10, padding: '16px 14px', textAlign: 'center', border: '1px dashed rgba(0,0,0,0.08)' }}>
                        {isActive ? (
                          <>
                            <div style={{ fontSize: 13, color: 'var(--bp-subtle)', fontWeight: 500 }}>Waiting for providers to respond...</div>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 8 }}>
                              {[0, 1, 2].map(i => (
                                <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: O, animation: `dpc-pulse 1.2s ${i * 0.3}s infinite` }} />
                              ))}
                            </div>
                          </>
                        ) : (
                          <div style={{ fontSize: 13, color: 'var(--bp-subtle)' }}>No providers responded</div>
                        )}
                      </div>
                    ) : (
                      <BusinessQuoteGrid
                        dispatch={j}
                        responses={jobResponses}
                        estimate={estimates[j.id]}
                        preferredProviderIds={preferredProviderIds}
                        onBooked={() => {
                          setDispatches(prev => prev.map(d => d.id === j.id ? { ...d, status: 'completed' } : d));
                          if (onTabChange) onTabChange('bookings');
                        }}
                      />
                    )}
                  </div>

                  {/* Cancel button */}
                  {isActive && (
                    <div style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 14 }}>
                      <button onClick={() => setShowCancelConfirm(j.id)} disabled={cancellingId === j.id} style={{
                        width: '100%', padding: '10px 0', borderRadius: 100,
                        border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626',
                        fontSize: 13, fontWeight: 600, cursor: cancellingId === j.id ? 'default' : 'pointer',
                        opacity: cancellingId === j.id ? 0.6 : 1,
                      }}>{cancellingId === j.id ? 'Cancelling...' : 'Cancel Dispatch'}</button>
                    </div>
                  )}

                  {/* Archive / Re-open buttons */}
                  {(j.status === 'completed' || j.status === 'expired' || j.status === 'archived') && (
                    <div style={{ marginTop: 14, borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: 14, display: 'flex', gap: 8 }}>
                      {/* Re-open for booking — visible for completed (stuck) and archived */}
                      {(j.status === 'completed' || j.status === 'archived') && (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            const reason = j.status === 'completed'
                              ? 'Re-open this dispatch for booking? Use this if a quote got stuck as "Booked" without an actual confirmation.'
                              : 'Re-open this archived dispatch so quotes can be booked again?';
                            if (!window.confirm(reason)) return;
                            try {
                              const res = await businessService.reopenDispatch(workspaceId, j.id);
                              if (res.error) { alert(res.error); return; }
                              setDispatches(prev => prev.map(d => d.id === j.id ? { ...d, status: 'expired' } : d));
                              const reparsedCount = res.data?.reparsedQuotes?.length ?? 0;
                              if (reparsedCount > 0) {
                                alert(`Re-opened. Updated ${reparsedCount} quote${reparsedCount === 1 ? '' : 's'} with the latest parser.`);
                              }
                              // Refresh responses for this job so the new prices show up
                              try {
                                const respRes = await jobService.getResponses(j.id);
                                if (respRes.data) setResponses(prev => ({ ...prev, [j.id]: respRes.data!.responses }));
                              } catch { /* ignore */ }
                            } catch (err) {
                              alert((err as Error).message || 'Failed to re-open');
                            }
                          }}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 100,
                            border: `1px solid ${O}`, background: `${O}10`, color: O,
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          }}
                        >Re-open for booking</button>
                      )}
                      {/* Archive — only for non-archived */}
                      {j.status !== 'archived' && (
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await businessService.archiveDispatch(workspaceId, j.id);
                            setDispatches(prev => prev.map(d => d.id === j.id ? { ...d, status: 'archived' } : d));
                            setExpandedId(null);
                          } catch { alert('Failed to archive'); }
                        }} style={{
                          flex: 1, padding: '10px 0', borderRadius: 100,
                          border: '1px solid #9B9490', background: 'var(--bp-card)', color: 'var(--bp-subtle)',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>Archive</button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
        </div>);
          });
        })()}
      </div>

      {/* Share tracking modal */}
      {sharingJobId && (
        <TrackingShareModal
          jobId={sharingJobId}
          propertyName={dispatches.find(d => d.id === sharingJobId)?.propertyName ?? undefined}
          onClose={() => setSharingJobId(null)}
        />
      )}

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowCancelConfirm(null)}>
          <div style={{ background: 'var(--bp-card)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <span style={{ fontSize: 22 }}>⚠️</span>
              </div>
              <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, fontWeight: 700, color: D, margin: '0 0 8px' }}>Cancel this dispatch?</h3>
              <p style={{ fontSize: 14, color: 'var(--bp-muted)', lineHeight: 1.6, margin: 0 }}>
                This will stop all outreach for this dispatch.
                {(() => {
                  const job = dispatches.find(d => d.id === showCancelConfirm);
                  return job && job.responseCount > 0
                    ? ' Any booked providers will be notified of the cancellation via SMS and email.'
                    : ' If no providers have responded, there is no charge.';
                })()}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowCancelConfirm(null)} style={{
                flex: 1, padding: '12px 0', borderRadius: 100, border: '1px solid var(--bp-border)',
                background: 'var(--bp-card)', color: D, fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Keep dispatch</button>
              <button onClick={async () => {
                const jobId = showCancelConfirm;
                setShowCancelConfirm(null);
                setCancellingId(jobId);
                try {
                  const res = await businessService.cancelDispatch(workspaceId, jobId);
                  setDispatches(prev => prev.map(d => d.id === jobId ? { ...d, status: 'expired' } : d));
                  if (res.data?.credit_refunded) {
                    alert('Dispatch cancelled. No charge for dispatches with zero responses.');
                  } else if (res.data?.providers_notified && res.data.providers_notified > 0) {
                    alert(`Dispatch cancelled. ${res.data.providers_notified} booked provider${res.data.providers_notified > 1 ? 's were' : ' was'} notified.`);
                  } else {
                    alert('Dispatch cancelled.');
                  }
                } catch (err) {
                  alert((err as Error).message || 'Failed to cancel');
                }
                setCancellingId(null);
              }} style={{
                flex: 1, padding: '12px 0', borderRadius: 100, border: 'none',
                background: '#DC2626', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}>Yes, cancel</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        div::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}

/* ── Provider Quote Grid (Inspect-style) ─────────────────────────────────── */

function BusinessQuoteGrid({ dispatch, responses, estimate, preferredProviderIds, onBooked }: {
  dispatch: WorkspaceDispatch;
  responses: ProviderResponseItem[];
  estimate: CostEstimate | undefined;
  preferredProviderIds: Set<string>;
  onBooked: () => void;
}) {
  const enriched = responses
    .map(r => ({ r, cents: priceToCents(r.quoted_price), rating: parseFloat(r.provider.google_rating ?? '0') }))
    .sort((a, b) => {
      if (a.cents == null && b.cents == null) return 0;
      if (a.cents == null) return 1;
      if (b.cents == null) return -1;
      return a.cents - b.cents;
    });

  const quotedOnly = enriched.filter(q => q.cents != null);
  const lowestCents = quotedOnly.length > 0 ? Math.min(...quotedOnly.map(q => q.cents as number)) : null;
  const highestRating = quotedOnly.length > 0 ? Math.max(...quotedOnly.map(q => q.rating)) : 0;
  // Only show comparison badges if there are 2+ quotes to compare
  const showCompareBadges = quotedOnly.length > 1;

  const canBook = dispatch.status !== 'archived' && dispatch.status !== 'refunded' && dispatch.status !== 'completed';
  const isCompleted = dispatch.status === 'completed';

  return (
    <div onClick={e => e.stopPropagation()} style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12,
      paddingTop: 4, // room for top-edge badges
    }}>
      {enriched.map(({ r, rating }) => (
        <BusinessQuoteCard
          key={r.id}
          r={r}
          rating={rating}
          isBestPrice={showCompareBadges && priceToCents(r.quoted_price) === lowestCents}
          isTopRated={showCompareBadges && rating > 0 && rating === highestRating && priceToCents(r.quoted_price) !== lowestCents}
          isPreferred={preferredProviderIds.has(r.provider.id)}
          estimate={estimate}
          canBook={canBook}
          isCompleted={isCompleted}
          dispatch={dispatch}
          onBookSuccess={onBooked}
        />
      ))}
    </div>
  );
}

function BusinessQuoteCard({
  r, rating, isBestPrice, isTopRated, isPreferred, estimate, canBook, isCompleted, dispatch, onBookSuccess,
}: {
  r: ProviderResponseItem;
  rating: number;
  isBestPrice: boolean;
  isTopRated: boolean;
  isPreferred: boolean;
  estimate: CostEstimate | undefined;
  canBook: boolean;
  isCompleted: boolean;
  dispatch: WorkspaceDispatch;
  onBookSuccess: () => void;
}) {
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleBook(e: React.MouseEvent) {
    e.stopPropagation();
    setBooking(true);
    setError(null);
    try {
      const propertyAddr = dispatch.propertyAddress || dispatch.propertyName || undefined;
      await jobService.bookProvider(dispatch.id, r.id, r.provider.id, propertyAddr);
      onBookSuccess();
    } catch (err) {
      setError((err as Error).message || 'Booking failed');
    } finally {
      setBooking(false);
    }
  }

  return (
    <div style={{
      position: 'relative',
      background: isBestPrice ? `${O}06` : 'var(--bp-card)',
      border: `1px solid ${isBestPrice ? `${O}50` : 'var(--bp-border)'}`,
      borderRadius: 12, padding: '16px 16px 14px',
    }}>
      {/* Floating badge row (top, absolute) */}
      {(isBestPrice || isTopRated || isPreferred || r.is_late) && (
        <div style={{ position: 'absolute', top: -9, right: 12, display: 'flex', gap: 4 }}>
          {isBestPrice && <BizTag bg={O} label="Best Price" />}
          {isTopRated && <BizTag bg="#F59E0B" label="Top Rated" />}
          {isPreferred && <BizTag bg="#7C3AED" label="Preferred" />}
          {r.is_late && <BizTag bg="#9B7137" label="Late" title="Quote arrived after the dispatch auto-expired" />}
        </div>
      )}

      {/* Provider name */}
      <div style={{
        fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
        color: 'var(--bp-text)', marginBottom: 2,
      }}>
        {r.provider.name || 'Provider'}
      </div>

      {/* Rating row */}
      {rating > 0 && (
        <div style={{ fontSize: 11, color: 'var(--bp-subtle)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>
            <span style={{ color: '#F59E0B' }}>{'★'.repeat(Math.round(rating))}</span>
            <span style={{ opacity: 0.25 }}>{'★'.repeat(5 - Math.round(rating))}</span>
          </span>
          <span style={{ color: 'var(--bp-text)', fontWeight: 600 }}>{rating.toFixed(1)}</span>
          <span>({r.provider.review_count})</span>
          {r.provider.google_place_id && (
            <a
              href={`https://www.google.com/maps/place/?q=place_id:${r.provider.google_place_id}`}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: '#2563EB', textDecoration: 'none', fontWeight: 600 }}
            >
              Google
            </a>
          )}
          {r.provider.yelp_url && (
            <a
              href={r.provider.yelp_url}
              target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ color: '#D32323', textDecoration: 'none', fontWeight: 600 }}
            >
              Yelp
            </a>
          )}
        </div>
      )}

      {/* Price */}
      {r.quoted_price ? (
        <div style={{ marginBottom: 8 }}>
          <div style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 22, fontWeight: 700,
            color: 'var(--bp-text)', lineHeight: 1.1,
          }}>
            {cleanPrice(r.quoted_price)}
          </div>
          {estimate && (
            <div style={{ marginTop: 4 }}>
              <EstimateBadge
                quotedPrice={cleanPrice(r.quoted_price)}
                estimateLow={estimate.estimateLowCents}
                estimateHigh={estimate.estimateHighCents}
              />
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--bp-subtle)', marginBottom: 8, fontStyle: 'italic' }}>
          No price quoted yet
        </div>
      )}

      {/* Availability */}
      {r.availability && (
        <div style={{ fontSize: 12, color: 'var(--bp-muted)', marginBottom: 8 }}>
          {r.availability}
        </div>
      )}

      {/* Message (truncated 2-line clamp) */}
      {r.message && (
        <div style={{
          fontSize: 12, color: 'var(--bp-muted)', fontStyle: 'italic', marginBottom: 10,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden', lineHeight: 1.4,
        }}>
          "{renderBold(r.message)}"
        </div>
      )}

      {/* Footer meta */}
      <div style={{
        fontSize: 10, color: 'var(--bp-subtle)', opacity: 0.85,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 8,
      }}>
        <span>via {r.channel} · {timeAgo(r.responded_at)}</span>
        {r.provider.phone && (
          <a href={`tel:${r.provider.phone}`}
            onClick={e => e.stopPropagation()}
            style={{ color: G, textDecoration: 'none', fontWeight: 600 }}>
            Call →
          </a>
        )}
      </div>

      {/* Action */}
      {canBook && (
        <button
          onClick={handleBook}
          disabled={booking}
          style={{
            width: '100%', padding: '9px 0', borderRadius: 8,
            border: isBestPrice ? 'none' : '1px solid var(--bp-border)',
            background: isBestPrice ? O : 'var(--bp-card)',
            color: isBestPrice ? '#fff' : 'var(--bp-text)',
            cursor: booking ? 'default' : 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
            opacity: booking ? 0.6 : 1, transition: 'opacity 0.15s',
          }}
        >
          {booking ? 'Booking…' : `Book ${r.provider.name.split(' ')[0]}`}
        </button>
      )}
      {!canBook && (
        <div style={{
          width: '100%', padding: '9px 0', borderRadius: 8,
          background: '#F0FDF4', color: '#16A34A',
          fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
          textAlign: 'center',
        }}>
          {isCompleted ? '✓ Booked' : 'Closed'}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: '#DC2626', marginTop: 6, textAlign: 'center' }}>
          {error}
        </div>
      )}
    </div>
  );
}

function BizTag({ bg, label, title }: { bg: string; label: string; title?: string }) {
  return (
    <span title={title} style={{
      fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700,
      padding: '3px 8px', borderRadius: 100, background: bg, color: '#fff',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
    }}>{label}</span>
  );
}
