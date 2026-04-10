import { useState, useEffect } from 'react';
import { businessService, type GuestIssue, type GuestIssueDetail, type GuestReporterSettings, type AutoDispatchRule, type PreferredVendor, type Property } from '@/services/api';
import { O, G, D, W, VENDOR_CATEGORIES, timeAgo } from './constants';

type GuestSubTab = 'issues' | 'settings' | 'auto-dispatch' | 'qr-codes';

const GUEST_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pm_reviewing: { bg: '#FFF3E0', text: '#E65100' },
  approved: { bg: '#E3F2FD', text: '#1565C0' },
  dispatching: { bg: '#F3E5F5', text: '#7B1FA2' },
  provider_booked: { bg: '#E8F5E9', text: '#2E7D32' },
  resolved: { bg: '#E8F5E9', text: '#2E7D32' },
  closed: { bg: '#F5F5F5', text: '#757575' },
  self_resolved: { bg: '#E0F2F1', text: '#00695C' },
};

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  urgent: { bg: '#FFEBEE', text: '#C62828' },
  high: { bg: '#FFF3E0', text: '#E65100' },
  medium: { bg: '#FFFDE7', text: '#F9A825' },
  low: { bg: '#E8F5E9', text: '#2E7D32' },
};

const LANGUAGES = [
  { value: 'en', label: 'English' }, { value: 'es', label: 'Spanish' }, { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' }, { value: 'pt', label: 'Portuguese' }, { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' }, { value: 'ko', label: 'Korean' }, { value: 'ar', label: 'Arabic' },
  { value: 'it', label: 'Italian' },
];

export default function GuestRequestsTab({ workspaceId, plan, onViewDispatch, initialSubTab, focusIssueId, onFocusHandled }: { workspaceId: string; plan: string; onViewDispatch?: (jobId: string) => void; initialSubTab?: GuestSubTab; focusIssueId?: string | null; onFocusHandled?: () => void }) {
  const [subTab, setSubTab] = useState<GuestSubTab>(initialSubTab ?? 'issues');
  const isPro = ['professional', 'business', 'enterprise'].includes(plan);
  const isBizPlus = ['business', 'enterprise'].includes(plan);

  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);

  // If we're being asked to focus a specific issue, force the issues sub-tab
  useEffect(() => {
    if (focusIssueId) setSubTab('issues');
  }, [focusIssueId]);

  if (!isPro) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
        <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>Upgrade to unlock Guest Requests</div>
        <div style={{ fontSize: 14, color: '#9B9490', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
          Guest issue reporting, auto-dispatch rules, and QR code links are available on the <strong style={{ color: O }}>Professional</strong> plan and above.
        </div>
      </div>
    );
  }

  const SUB_TAB_TITLES: Record<GuestSubTab, string> = {
    issues: 'Guest Requests',
    settings: 'Guest Reporter Settings',
    'auto-dispatch': 'Auto-Dispatch Rules',
    'qr-codes': 'QR Codes',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: 0 }}>{SUB_TAB_TITLES[subTab]}</h3>
      </div>
      {subTab === 'issues' && <GuestIssuesSubTab workspaceId={workspaceId} onViewDispatch={onViewDispatch} focusIssueId={focusIssueId} onFocusHandled={onFocusHandled} />}
      {subTab === 'settings' && <GuestSettingsSubTab workspaceId={workspaceId} isBizPlus={isBizPlus} />}
      {subTab === 'auto-dispatch' && <GuestAutoDispatchSubTab workspaceId={workspaceId} />}
      {subTab === 'qr-codes' && <GuestQRCodesSubTab workspaceId={workspaceId} />}
    </div>
  );
}

/* ── Issues sub-tab ── */

function GuestIssuesSubTab({ workspaceId, onViewDispatch, focusIssueId, onFocusHandled }: { workspaceId: string; onViewDispatch?: (jobId: string) => void; focusIssueId?: string | null; onFocusHandled?: () => void }) {
  const [issues, setIssues] = useState<GuestIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<GuestIssueDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterProperty, setFilterProperty] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [preferredOnly, setPreferredOnly] = useState(false);
  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<string>>(new Set());
  const [vendors, setVendors] = useState<PreferredVendor[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    businessService.listProperties(workspaceId).then(res => {
      if (res.data) setProperties(res.data);
    }).catch(() => {});
    businessService.listVendors(workspaceId).then(res => {
      if (res.data) setVendors(res.data.filter(v => v.active));
    }).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    setLoading(true);
    businessService.listGuestIssues(workspaceId, {
      status: showArchived ? 'archived' : (filterStatus || undefined),
      severity: filterSeverity || undefined,
      property_id: filterProperty || undefined,
      page,
      limit: 20,
    }).then(res => {
      if (res.data) {
        // Filter out archived from normal view, show only archived in archive view
        const filtered = showArchived ? res.data.issues : res.data.issues.filter(i => i.status !== 'archived');
        setIssues(filtered);
        setTotal(res.data.total);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspaceId, filterStatus, filterSeverity, filterProperty, page, showArchived]);

  // Auto-expand a focused issue (e.g. from a notification deep link)
  useEffect(() => {
    if (!focusIssueId || loading) return;
    if (!issues.some(i => i.id === focusIssueId)) return;
    setExpandedId(focusIssueId);
    setDetailLoading(true);
    businessService.getGuestIssue(workspaceId, focusIssueId).then(res => {
      if (res.data) setDetail(res.data);
    }).catch(() => {}).finally(() => {
      setDetailLoading(false);
      onFocusHandled?.();
      setTimeout(() => {
        const el = document.getElementById(`guest-issue-${focusIssueId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });
  }, [focusIssueId, loading, issues, workspaceId, onFocusHandled]);

  async function toggleExpand(issueId: string) {
    if (expandedId === issueId) { setExpandedId(null); setDetail(null); return; }
    setExpandedId(issueId);
    setDetailLoading(true);
    try {
      const res = await businessService.getGuestIssue(workspaceId, issueId);
      if (res.data) setDetail(res.data);
    } catch { /* ignore */ }
    setDetailLoading(false);
  }

  async function handleApprove(issueId: string) {
    setActionLoading(true);
    try {
      await businessService.approveGuestIssue(workspaceId, issueId, {
        preferredOnly: preferredOnly || undefined,
        preferredVendorIds: selectedVendorIds.size > 0 ? [...selectedVendorIds] : undefined,
      });
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'approved' } : i));
      if (detail?.id === issueId) setDetail({ ...detail, status: 'approved' });
      setPreferredOnly(false);
      setSelectedVendorIds(new Set());
    } catch { alert('Failed to approve issue'); }
    setActionLoading(false);
  }

  async function handleReject(issueId: string) {
    if (!rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await businessService.rejectGuestIssue(workspaceId, issueId, rejectReason.trim());
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'closed' } : i));
      if (detail?.id === issueId) setDetail({ ...detail, status: 'closed' });
      setRejectModalId(null);
      setRejectReason('');
    } catch { alert('Failed to close issue'); }
    setActionLoading(false);
  }

  async function handleSelfResolve(issueId: string) {
    setActionLoading(true);
    try {
      await businessService.selfResolveGuestIssue(workspaceId, issueId);
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'self_resolved' } : i));
      if (detail?.id === issueId) setDetail({ ...detail, status: 'self_resolved' });
    } catch { alert('Failed to self-resolve issue'); }
    setActionLoading(false);
  }

  async function handleCancel(issueId: string) {
    setActionLoading(true);
    try {
      await businessService.cancelGuestIssue(workspaceId, issueId);
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'closed' } : i));
      if (detail?.id === issueId) setDetail({ ...detail, status: 'closed' });
    } catch { alert('Failed to cancel issue'); }
    setActionLoading(false);
  }

  async function handleResolve(issueId: string) {
    setActionLoading(true);
    try {
      await businessService.resolveGuestIssue(workspaceId, issueId);
      setIssues(prev => prev.map(i => i.id === issueId ? { ...i, status: 'resolved' } : i));
      if (detail?.id === issueId) setDetail({ ...detail, status: 'resolved' });
    } catch { alert('Failed to resolve issue'); }
    setActionLoading(false);
  }

  async function handleArchive(issueId: string) {
    try {
      await businessService.archiveGuestIssue(workspaceId, issueId);
      setIssues(prev => prev.filter(i => i.id !== issueId));
      setExpandedId(null);
      setDetail(null);
    } catch { alert('Failed to archive issue'); }
  }

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 13, color: D, background: '#fff', cursor: 'pointer',
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="pm_reviewing">PM Reviewing</option>
          <option value="approved">Approved</option>
          <option value="dispatching">Dispatching</option>
          <option value="provider_booked">Provider Booked</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
          <option value="self_resolved">Self Resolved</option>
        </select>
        <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All Categories</option>
          {[...new Set(issues.map(i => i.categoryName).filter(Boolean))].map(c => (
            <option key={c!} value={c!}>{c}</option>
          ))}
        </select>
        <select value={filterSeverity} onChange={e => { setFilterSeverity(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All Severities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={filterProperty} onChange={e => { setFilterProperty(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All Properties</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setPage(1); }} style={selectStyle} title="From date" />
        <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setPage(1); }} style={selectStyle} title="To date" />
        {(filterStatus || filterCategory || filterSeverity || filterProperty || filterDateFrom || filterDateTo) && (
          <button onClick={() => { setFilterStatus(''); setFilterCategory(''); setFilterSeverity(''); setFilterProperty(''); setFilterDateFrom(''); setFilterDateTo(''); setPage(1); }}
            style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: '#F5F5F5', color: '#9B9490', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            Clear filters
          </button>
        )}
        <button onClick={() => { setShowArchived(!showArchived); setPage(1); setFilterStatus(''); }}
          style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: `1px solid ${showArchived ? O : '#E0DAD4'}`, background: showArchived ? `${O}08` : '#fff', color: showArchived ? O : '#9B9490', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {showArchived ? 'Active Issues' : 'Archived'}
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading issues...</div>
      ) : (() => {
        // Client-side filtering for category and date (server handles status, severity, property)
        const clientFiltered = issues.filter(i => {
          if (filterCategory && i.categoryName !== filterCategory) return false;
          if (filterDateFrom && new Date(i.createdAt) < new Date(filterDateFrom)) return false;
          if (filterDateTo) { const to = new Date(filterDateTo); to.setHours(23, 59, 59, 999); if (new Date(i.createdAt) > to) return false; }
          return true;
        });

        if (clientFiltered.length === 0) return (
          <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
            <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No guest requests found</div>
            <div style={{ fontSize: 14, color: '#9B9490' }}>
              {issues.length > 0 ? 'Try adjusting your filters.' : 'Issues reported by guests will appear here.'}
            </div>
          </div>
        );

        let lastDateLabel = '';
        return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: '#9B9490', marginBottom: -4 }}>{clientFiltered.length} request{clientFiltered.length !== 1 ? 's' : ''}</div>
          {clientFiltered.map(issue => {
            const dateObj = new Date(issue.createdAt);
            const today = new Date();
            const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
            const isToday = dateObj.toDateString() === today.toDateString();
            const isYesterday = dateObj.toDateString() === yesterday.toDateString();
            const dateLabel = isToday ? 'Today' : isYesterday ? 'Yesterday' : dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: dateObj.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
            const showDateHeader = dateLabel !== lastDateLabel;
            lastDateLabel = dateLabel;

            return (<div key={issue.id}>
            {showDateHeader && (
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9B9490', padding: '14px 0 6px', letterSpacing: '0.03em' }}>
                {dateLabel}
              </div>
            )}
            {(() => { const issue_ = issue; return (() => {
            const issue = issue_;
            const sc = GUEST_STATUS_COLORS[issue.status] || GUEST_STATUS_COLORS.closed;
            const sev = SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.low;
            const isExpanded = expandedId === issue.id;
            const isReviewing = issue.status === 'pm_reviewing';

            return (
              <div key={issue.id} id={`guest-issue-${issue.id}`} onClick={() => toggleExpand(issue.id)} style={{
                background: '#fff', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                border: isReviewing ? `2px solid ${O}` : isExpanded ? `2px solid ${O}` : '1px solid rgba(0,0,0,0.06)',
                transition: 'all 0.2s',
                boxShadow: isReviewing ? `0 2px 12px ${O}15` : isExpanded ? `0 4px 20px ${O}10` : '0 1px 4px rgba(0,0,0,0.03)',
                scrollMarginTop: 80,
              }}>
                {/* Collapsed header */}
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: W, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #F0EBE6', fontSize: 18 }}>
                      {issue.categoryIcon || '🔧'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: D, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{issue.categoryName}</span>
                        <span style={{ background: sc.bg, color: sc.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>
                          {issue.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                        <span style={{ background: sev.bg, color: sev.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>
                          {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
                        </span>
                        {issue.isRecurring && <span style={{ background: '#FFF3E0', color: '#E65100', padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600 }}>Recurring</span>}
                        {issue.autoDispatched && <span style={{ background: '#E8F5E9', color: '#2E7D32', padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600 }}>Auto-dispatched</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#9B9490', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span>🏠 {issue.propertyName}</span>
                        {issue.guestName && <span>👤 {issue.guestName}</span>}
                        <span>{timeAgo(issue.createdAt)}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: '#C0BBB6', flexShrink: 0 }}>{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: '0 14px 16px', borderTop: '1px solid rgba(0,0,0,0.04)' }} onClick={e => e.stopPropagation()}>
                    {detailLoading ? (
                      <div style={{ textAlign: 'center', padding: 20, color: '#9B9490' }}>Loading details...</div>
                    ) : detail && detail.id === issue.id ? (
                      <div style={{ paddingTop: 12 }}>
                        {/* Description */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 6 }}>Description</div>
                          <div style={{ fontSize: 14, color: D, lineHeight: 1.6, background: W, padding: 12, borderRadius: 8 }}
                            dangerouslySetInnerHTML={{ __html: (detail.description ?? '')
                              .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                              .replace(/\n/g, '<br/>') }}
                          />
                        </div>

                        {/* Photos */}
                        {detail.photos.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 6 }}>Photos ({detail.photos.length})</div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {detail.photos.map(photo => (
                                <a key={photo.id} href={photo.storageUrl} target="_blank" rel="noopener noreferrer">
                                  <img src={photo.thumbnailUrl || photo.storageUrl} alt="Issue photo"
                                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1px solid #E0DAD4' }} />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Troubleshoot log */}
                        {detail.troubleshootLog && detail.troubleshootLog.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 6 }}>Troubleshoot Log</div>
                            <div style={{ background: W, borderRadius: 8, padding: 12 }}>
                              {detail.troubleshootLog.map((entry, i) => (
                                <div key={i} style={{ marginBottom: i < detail.troubleshootLog!.length - 1 ? 10 : 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: '#6B6560' }}>Q: {entry.question}</div>
                                  <div style={{ fontSize: 13, color: D, marginTop: 2 }}>A: {entry.answer}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Recurring alert */}
                        {issue.isRecurring && (
                          <div style={{ background: '#FFF3E0', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 16 }}>🔄</span>
                            <div style={{ fontSize: 13, color: '#E65100', fontWeight: 600 }}>This issue has been reported multiple times and may need a permanent fix.</div>
                          </div>
                        )}

                        {/* Guest satisfaction — shown above timeline, before action buttons */}

                        {/* Timeline */}
                        {detail.timeline.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 6 }}>Timeline</div>
                            <div style={{ borderLeft: '2px solid #E0DAD4', paddingLeft: 14 }}>
                              {detail.timeline.map((evt, i) => (
                                <div key={i} style={{ marginBottom: 10, position: 'relative' }}>
                                  <div style={{ position: 'absolute', left: -19, top: 4, width: 8, height: 8, borderRadius: '50%', background: O }} />
                                  <div style={{ fontSize: 12, fontWeight: 600, color: D }}>{evt.title}</div>
                                  {evt.description && <div style={{ fontSize: 12, color: '#9B9490', marginTop: 2 }}>{evt.description}</div>}
                                  <div style={{ fontSize: 11, color: '#C0BBB6', marginTop: 2 }}>{timeAgo(evt.createdAt)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Guest Feedback */}
                        {detail.guestSatisfactionRating != null && (
                          <div style={{
                            background: detail.guestSatisfactionRating === 'positive' ? '#E8F5E9' : '#FFEBEE',
                            border: `1px solid ${detail.guestSatisfactionRating === 'positive' ? G : '#E53935'}`,
                            borderRadius: 10,
                            padding: 14,
                            marginBottom: 16,
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#6B6560', marginBottom: 8 }}>Guest Feedback</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 20 }}>{detail.guestSatisfactionRating === 'positive' ? '\uD83D\uDC4D' : '\uD83D\uDC4E'}</span>
                              <span style={{
                                fontSize: 14,
                                fontWeight: 700,
                                color: detail.guestSatisfactionRating === 'positive' ? G : '#E53935',
                              }}>
                                {detail.guestSatisfactionRating === 'positive' ? 'Positive' : 'Negative'}
                              </span>
                            </div>
                            {detail.guestSatisfactionComment && (
                              <div style={{
                                marginTop: 8,
                                fontSize: 13,
                                color: D,
                                background: W,
                                borderRadius: 6,
                                padding: '8px 10px',
                                fontStyle: 'italic',
                              }}>
                                &ldquo;{detail.guestSatisfactionComment}&rdquo;
                              </div>
                            )}
                          </div>
                        )}

                        {/* Dispatch options */}
                        {issue.status === 'pm_reviewing' && (
                          <div style={{ background: W, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: preferredOnly ? 10 : 0 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: D }}>
                                <div onClick={() => { setPreferredOnly(!preferredOnly); if (preferredOnly) setSelectedVendorIds(new Set()); }} style={{
                                  width: 38, height: 20, borderRadius: 10, background: preferredOnly ? G : '#E0DAD4',
                                  position: 'relative', transition: 'background 0.2s', flexShrink: 0, cursor: 'pointer',
                                }}>
                                  <div style={{
                                    width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute',
                                    top: 2, left: preferredOnly ? 20 : 2, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                  }} />
                                </div>
                                <span style={{ fontWeight: 500 }}>Preferred providers only</span>
                              </label>
                            </div>
                            {preferredOnly && (
                              <div style={{ animation: 'fadeSlide 0.2s ease' }}>
                                <div style={{ border: '1px solid #E0DAD4', borderRadius: 8, padding: '6px 0', maxHeight: 160, overflowY: 'auto' }}>
                                  {[...new Map(vendors.map(v => [v.providerId, v])).values()].map(v => (
                                    <label key={v.providerId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, color: D }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = W; }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedVendorIds.has(v.providerId)}
                                        onChange={() => {
                                          setSelectedVendorIds(prev => {
                                            const next = new Set(prev);
                                            if (next.has(v.providerId)) next.delete(v.providerId);
                                            else next.add(v.providerId);
                                            return next;
                                          });
                                        }}
                                        style={{ accentColor: G, width: 16, height: 16, cursor: 'pointer' }}
                                      />
                                      {v.providerName}
                                    </label>
                                  ))}
                                </div>
                                <div style={{ fontSize: 11, color: '#9B9490', marginTop: 4 }}>
                                  {selectedVendorIds.size > 0 ? `${selectedVendorIds.size} provider${selectedVendorIds.size > 1 ? 's' : ''} selected` : 'All preferred providers will be contacted'}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {issue.status === 'pm_reviewing' && (
                            <>
                              <button onClick={() => handleApprove(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: G, color: '#fff', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Approve &amp; Dispatch
                              </button>
                              <button onClick={() => handleSelfResolve(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${G}`, background: '#fff', color: G, fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Self-Resolved
                              </button>
                              <button onClick={() => { setRejectModalId(issue.id); setRejectReason(''); }}
                                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                Close Issue
                              </button>
                            </>
                          )}
                          {['dispatching', 'approved', 'provider_responding'].includes(issue.status) && (
                            <>
                              <button onClick={() => handleSelfResolve(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${G}`, background: '#fff', color: G, fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Self-Resolved
                              </button>
                              <button onClick={() => handleCancel(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Cancel
                              </button>
                            </>
                          )}
                          {issue.status === 'provider_booked' && (
                            <>
                              <button onClick={() => handleResolve(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: G, color: '#fff', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Mark Resolved
                              </button>
                              <button onClick={() => handleCancel(issue.id)} disabled={actionLoading}
                                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #DC2626', background: '#fff', color: '#DC2626', fontSize: 13, fontWeight: 600, cursor: actionLoading ? 'default' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
                                Cancel
                              </button>
                            </>
                          )}
                          {['closed', 'self_resolved', 'resolved'].includes(issue.status) && (
                            <button onClick={() => handleArchive(issue.id)}
                              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #9B9490', background: '#fff', color: '#9B9490', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                              Archive
                            </button>
                          )}
                          {detail.dispatchedJobId && (
                            <button onClick={() => onViewDispatch?.(detail.dispatchedJobId!)}
                              style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', color: D, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                              View Dispatch
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })(); })()}
          </div>);
          })}
        </div>
        );
      })()}

      {/* Pagination */}
      {total > 20 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: page === 1 ? 'default' : 'pointer', fontSize: 13, color: page === 1 ? '#C0BBB6' : D }}>
            Previous
          </button>
          <span style={{ padding: '8px 12px', fontSize: 13, color: '#9B9490' }}>Page {page} of {Math.ceil(total / 20)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 20)}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: page >= Math.ceil(total / 20) ? 'default' : 'pointer', fontSize: 13, color: page >= Math.ceil(total / 20) ? '#C0BBB6' : D }}>
            Next
          </button>
        </div>
      )}

      {/* Reject modal */}
      {rejectModalId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setRejectModalId(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 32, width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontFamily: 'Fraunces, serif', fontSize: 20, color: D, margin: '0 0 16px' }}>Close Issue</h3>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Reason for closing *</label>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Enter reason..."
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, marginBottom: 16, boxSizing: 'border-box', resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button onClick={() => setRejectModalId(null)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
              <button onClick={() => handleReject(rejectModalId)} disabled={actionLoading || !rejectReason.trim()}
                style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#fff', cursor: actionLoading ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, opacity: actionLoading || !rejectReason.trim() ? 0.6 : 1 }}>
                Close Issue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Settings sub-tab ── */

function GuestSettingsSubTab({ workspaceId, isBizPlus }: { workspaceId: string; isBizPlus: boolean }) {
  const [settings, setSettings] = useState<GuestReporterSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState<Partial<GuestReporterSettings>>({});

  useEffect(() => {
    businessService.getGuestReporterSettings(workspaceId).then(res => {
      if (res.data) { setSettings(res.data); setDraft(res.data); }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspaceId]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await businessService.updateGuestReporterSettings(workspaceId, draft);
      if (res.data) { setSettings(res.data); setDraft(res.data); }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { alert('Failed to save settings'); }
    setSaving(false);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading settings...</div>;
  if (!settings) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Could not load settings.</div>;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', border: '1px solid #E0DAD4', borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 };

  return (
    <div style={{ maxWidth: 600 }}>
      {/* Enable toggle */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D }}>Guest Reporter</div>
            <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>Allow guests to report maintenance issues via a link or QR code.</div>
          </div>
          <button onClick={() => setDraft(d => ({ ...d, isEnabled: !d.isEnabled }))}
            style={{ width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative', background: draft.isEnabled ? G : '#D0CBC6', transition: 'background 0.2s' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: draft.isEnabled ? 25 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
      </div>

      {/* Whitelabel */}
      {isBizPlus && (
        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, marginBottom: 16 }}>Whitelabel</div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Logo URL</label>
            <input value={draft.whitelabelLogoUrl || ''} onChange={e => setDraft(d => ({ ...d, whitelabelLogoUrl: e.target.value || null }))} placeholder="https://..." style={inputStyle} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Company Name</label>
            <input value={draft.whitelabelCompanyName || ''} onChange={e => setDraft(d => ({ ...d, whitelabelCompanyName: e.target.value || null }))} placeholder="Your Company" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={draft.showPoweredByHomie ?? true} onChange={e => setDraft(d => ({ ...d, showPoweredByHomie: e.target.checked }))} />
            <span style={{ fontSize: 13, color: D }}>Show "Powered by Homie" badge</span>
          </div>
        </div>
      )}

      {/* Language */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, marginBottom: 16 }}>Language</div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Default Language</label>
          <select value={draft.defaultLanguage || 'en'} onChange={e => setDraft(d => ({ ...d, defaultLanguage: e.target.value }))}
            style={{ ...inputStyle, cursor: 'pointer' }}>
            {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Supported Languages</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {LANGUAGES.map(l => (
              <label key={l.value} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: D, cursor: 'pointer' }}>
                <input type="checkbox" checked={(draft.supportedLanguages || []).includes(l.value)}
                  onChange={e => {
                    const current = draft.supportedLanguages || [];
                    setDraft(d => ({
                      ...d,
                      supportedLanguages: e.target.checked ? [...current, l.value] : current.filter(v => v !== l.value),
                    }));
                  }} />
                {l.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* SLA */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, marginBottom: 16 }}>SLA Response Times (minutes)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {([['slaUrgentMinutes', 'Urgent'] as const, ['slaHighMinutes', 'High'] as const, ['slaMediumMinutes', 'Medium'] as const, ['slaLowMinutes', 'Low'] as const]).map(([key, label]) => (
            <div key={key}>
              <label style={labelStyle}>{label}</label>
              <input type="number" value={draft[key] ?? ''} onChange={e => setDraft(d => ({ ...d, [key]: parseInt(e.target.value) || 0 }))}
                style={inputStyle} min={0} />
            </div>
          ))}
        </div>
      </div>

      {/* PM Approval */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D }}>Require PM Approval</div>
            <div style={{ fontSize: 13, color: '#9B9490', marginTop: 2 }}>Issues must be reviewed by a PM before auto-dispatching.</div>
          </div>
          <button onClick={() => setDraft(d => ({ ...d, requirePmApproval: !d.requirePmApproval }))}
            style={{ width: 48, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', position: 'relative', background: draft.requirePmApproval ? G : '#D0CBC6', transition: 'background 0.2s' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: draft.requirePmApproval ? 25 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
          </button>
        </div>
      </div>

      {/* Guest Support Contact */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 20, marginBottom: 16 }}>
        <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, marginBottom: 16 }}>Guest Support Contact</div>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Support Email</label>
          <input value={draft.supportEmail || ''} onChange={e => setDraft(d => ({ ...d, supportEmail: e.target.value || null }))} placeholder="support@example.com" style={inputStyle} type="email" />
        </div>
        <div>
          <label style={labelStyle}>Support Phone</label>
          <input value={draft.supportPhone || ''} onChange={e => setDraft(d => ({ ...d, supportPhone: e.target.value || null }))} placeholder="+1 (555) 123-4567" style={inputStyle} type="tel" />
        </div>
      </div>

      {/* Save */}
      <button onClick={handleSave} disabled={saving}
        style={{ padding: '12px 32px', borderRadius: 10, border: 'none', background: O, color: '#fff', fontSize: 15, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

/* ── Auto-Dispatch Rules sub-tab ── */

function GuestAutoDispatchSubTab({ workspaceId }: { workspaceId: string }) {
  const [rules, setRules] = useState<AutoDispatchRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCat, setFormCat] = useState('');
  const [formSeverity, setFormSeverity] = useState('medium');
  const [formVendor, setFormVendor] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendors, setVendors] = useState<PreferredVendor[]>([]);

  useEffect(() => {
    businessService.listAutoDispatchRules(workspaceId).then(res => {
      if (res.data) setRules(res.data.rules);
      setLoading(false);
    }).catch(() => setLoading(false));
    businessService.listVendors(workspaceId).then(res => {
      if (res.data) setVendors(res.data.filter(v => v.active));
    }).catch(() => {});
  }, [workspaceId]);

  function resetForm() {
    setFormCat(''); setFormSeverity('medium'); setFormVendor(''); setFormEnabled(true);
    setShowAdd(false); setEditingId(null);
  }

  function startEdit(rule: AutoDispatchRule) {
    setEditingId(rule.id);
    setFormCat(rule.categoryId);
    setFormSeverity(rule.minSeverity);
    setFormVendor(rule.preferredVendorId || '');
    setFormEnabled(rule.isEnabled);
    setShowAdd(true);
  }

  async function handleSave() {
    if (!formCat) return;
    setSaving(true);
    try {
      if (editingId) {
        const res = await businessService.updateAutoDispatchRule(workspaceId, editingId, {
          category_id: formCat, min_severity: formSeverity,
          preferred_vendor_id: formVendor || undefined,
          is_enabled: formEnabled,
        });
        if (res.data) setRules(prev => prev.map(r => r.id === editingId ? res.data! : r));
      } else {
        const res = await businessService.createAutoDispatchRule(workspaceId, {
          category_id: formCat, min_severity: formSeverity,
          preferred_vendor_id: formVendor || undefined,
        });
        if (res.data) setRules(prev => [...prev, res.data!]);
      }
      resetForm();
    } catch { alert('Failed to save rule'); }
    setSaving(false);
  }

  async function handleDelete(ruleId: string) {
    if (!confirm('Delete this auto-dispatch rule?')) return;
    try {
      await businessService.deleteAutoDispatchRule(workspaceId, ruleId);
      setRules(prev => prev.filter(r => r.id !== ruleId));
    } catch { alert('Failed to delete rule'); }
  }

  async function handleToggle(rule: AutoDispatchRule) {
    try {
      const res = await businessService.updateAutoDispatchRule(workspaceId, rule.id, { is_enabled: !rule.isEnabled });
      if (res.data) setRules(prev => prev.map(r => r.id === rule.id ? res.data! : r));
    } catch { alert('Failed to toggle rule'); }
  }

  const selectStyle: React.CSSProperties = {
    padding: '10px 14px', borderRadius: 8, border: '1px solid #E0DAD4', fontSize: 14, boxSizing: 'border-box' as const, width: '100%', cursor: 'pointer',
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading rules...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: '#9B9490' }}>{rules.length} rule{rules.length !== 1 ? 's' : ''}</div>
        <button onClick={() => { resetForm(); setShowAdd(true); }}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: O, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          + Add Rule
        </button>
      </div>

      {/* Add/Edit form */}
      {showAdd && (
        <div style={{ background: '#fff', borderRadius: 14, border: `2px solid ${O}`, padding: 20, marginBottom: 16 }}>
          <div style={{ fontFamily: 'Fraunces, serif', fontSize: 16, fontWeight: 700, color: D, marginBottom: 16 }}>
            {editingId ? 'Edit Rule' : 'New Auto-Dispatch Rule'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Category *</label>
              <select value={formCat} onChange={e => setFormCat(e.target.value)} style={selectStyle}>
                <option value="">Select category</option>
                {VENDOR_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Min Severity</label>
              <select value={formSeverity} onChange={e => setFormSeverity(e.target.value)} style={selectStyle}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#6B6560', marginBottom: 6 }}>Preferred Provider (optional)</label>
            <select value={formVendor} onChange={e => setFormVendor(e.target.value)} style={selectStyle}>
              <option value="">None - use default matching</option>
              {vendors.map(v => <option key={v.id} value={v.providerId}>{v.providerName}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <input type="checkbox" checked={formEnabled} onChange={e => setFormEnabled(e.target.checked)} />
            <span style={{ fontSize: 13, color: D }}>Enabled</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !formCat}
              style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: O, color: '#fff', fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving || !formCat ? 0.6 : 1 }}>
              {saving ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button onClick={resetForm} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #E0DAD4', background: '#fff', cursor: 'pointer', fontSize: 14, color: D }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
          <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No auto-dispatch rules</div>
          <div style={{ fontSize: 14, color: '#9B9490' }}>Create rules to automatically dispatch guest issues to vendors.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rules.map(rule => {
            const sev = SEVERITY_COLORS[rule.minSeverity] || SEVERITY_COLORS.low;
            return (
              <div key={rule.id} style={{
                background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid rgba(0,0,0,0.06)',
                opacity: rule.isEnabled ? 1 : 0.6,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 14, color: D }}>
                      {rule.categoryName || VENDOR_CATEGORIES.find(c => c.value === rule.categoryId)?.label || rule.categoryId}
                    </span>
                    <span style={{ background: sev.bg, color: sev.text, padding: '2px 7px', borderRadius: 100, fontSize: 9, fontWeight: 600 }}>
                      {rule.minSeverity}+
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#9B9490' }}>
                    {rule.preferredVendorName || (rule.preferredVendorId ? 'Preferred provider' : 'Default matching')}
                  </div>
                </div>
                <button onClick={() => handleToggle(rule)}
                  style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: rule.isEnabled ? G : '#D0CBC6', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: rule.isEnabled ? 23 : 3, transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                </button>
                <button onClick={() => startEdit(rule)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #E0DAD4', background: '#fff', fontSize: 12, color: D, cursor: 'pointer' }}>Edit</button>
                <button onClick={() => handleDelete(rule.id)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #FECACA', background: '#FFF5F5', fontSize: 12, color: '#DC2626', cursor: 'pointer' }}>Delete</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── QR Codes sub-tab ── */

function PropertyQRCard({ workspaceId, property }: { workspaceId: string; property: Property }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const url = `https://homiepro.ai/guest/${workspaceId}/${property.id}`;

  useEffect(() => {
    import('qrcode').then(QRCode => {
      QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: D, light: '#FFFFFF' } })
        .then(dataUrl => setQrDataUrl(dataUrl))
        .catch(() => {});
    });
  }, [url]);

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }).catch(() => { alert('Failed to copy'); });
  }

  function downloadQR() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    const safeName = property.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    a.download = `qr_${safeName}.png`;
    a.click();
  }

  return (
    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.03)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ fontFamily: 'Fraunces, serif', fontWeight: 700, fontSize: 15, color: D, marginBottom: 4, textAlign: 'center' }}>{property.name}</div>
      {property.address && <div style={{ fontSize: 12, color: '#9B9490', marginBottom: 10, textAlign: 'center' }}>{property.address}</div>}
      <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, background: '#fff', borderRadius: 8, border: '1px solid #F0EBE6' }}>
        {qrDataUrl ? <img src={qrDataUrl} alt={`QR code for ${property.name}`} style={{ width: 160, height: 160 }} /> : <div style={{ color: '#9B9490', fontSize: 12 }}>Generating...</div>}
      </div>
      <div style={{ fontSize: 11, color: '#9B9490', wordBreak: 'break-all', marginBottom: 10, background: W, padding: '6px 8px', borderRadius: 6, width: '100%', textAlign: 'center' }}>{url}</div>
      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        <button onClick={copyLink}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: copiedId ? `1px solid ${G}` : '1px solid #E0DAD4', background: copiedId ? `${G}10` : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: copiedId ? G : D, transition: 'all 0.2s' }}>
          {copiedId ? 'Copied!' : 'Copy Link'}
        </button>
        <button onClick={downloadQR} disabled={!qrDataUrl}
          style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', background: qrDataUrl ? O : '#E0DAD4', cursor: qrDataUrl ? 'pointer' : 'default', fontSize: 13, fontWeight: 600, color: '#fff', transition: 'all 0.2s' }}>
          Download QR
        </button>
      </div>
    </div>
  );
}

function GuestQRCodesSubTab({ workspaceId }: { workspaceId: string }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    businessService.listProperties(workspaceId).then(res => {
      if (res.data) setProperties(res.data.sort((a, b) => a.name.localeCompare(b.name)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [workspaceId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#9B9490' }}>Loading properties...</div>;

  if (properties.length === 0) return (
    <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FAFAF8', borderRadius: 12, border: '1px dashed #E0DAD4' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
      <div style={{ fontSize: 16, color: D, fontWeight: 600, marginBottom: 8 }}>No properties</div>
      <div style={{ fontSize: 14, color: '#9B9490' }}>Add properties first to generate guest reporting links.</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontSize: 14, color: '#9B9490', marginBottom: 16 }}>
        Share these QR codes with guests so they can report maintenance issues. Print or download to place in your properties.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {properties.map(p => <PropertyQRCard key={p.id} workspaceId={workspaceId} property={p} />)}
      </div>
    </div>
  );
}
