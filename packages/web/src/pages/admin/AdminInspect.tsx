import { useCallback, useEffect, useState } from 'react';
import {
  adminService,
  type InspectStatsData,
  type InspectDiagnosticsData,
  type InspectDiagnosticReport,
  type InspectReportRow,
  type InspectReportDetailData,
  type InspectReportItemRow,
  type InspectSupportingDocRow,
  type InspectCrossRefInsight,
  type RevenuePeriod,
} from '@/services/admin-api';

const PERIODS: { id: RevenuePeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All Time' },
];

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function formatUntil(iso: string): string {
  const d = new Date(iso);
  const diffMs = d.getTime() - Date.now();
  const days = Math.round(diffMs / (24 * 60 * 60 * 1000));
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'today';
  if (days === 1) return 'in 1 day';
  return `in ${days}d`;
}

export default function AdminInspect() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-6">Inspect</h1>
      <KpiSection />
      <DiagnosticsSection />
      <ReportsSection />
    </div>
  );
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function statusBadgeClasses(status: string): string {
  switch (status) {
    case 'parsed': return 'bg-green-100 text-green-700';
    case 'processing': return 'bg-amber-100 text-amber-700';
    case 'uploading': return 'bg-amber-100 text-amber-700';
    case 'failed': return 'bg-red-100 text-red-700';
    case 'sent_to_client': return 'bg-blue-100 text-blue-700';
    case 'review_pending': return 'bg-purple-100 text-purple-700';
    default: return 'bg-dark/5 text-dark/50';
  }
}

function tierBadgeClasses(tier: string | null): string {
  if (!tier) return 'bg-dark/5 text-dark/50';
  switch (tier) {
    case 'essential': return 'bg-blue-100 text-blue-700';
    case 'professional': return 'bg-purple-100 text-purple-700';
    case 'premium': return 'bg-orange-100 text-orange-700';
    default: return 'bg-dark/5 text-dark/50';
  }
}

function severityBadgeClasses(severity: string): string {
  switch (severity) {
    case 'safety_hazard': return 'bg-red-100 text-red-700';
    case 'urgent': return 'bg-orange-100 text-orange-700';
    case 'recommended': return 'bg-amber-100 text-amber-700';
    case 'monitor': return 'bg-blue-100 text-blue-700';
    case 'informational': return 'bg-dark/5 text-dark/50';
    default: return 'bg-dark/5 text-dark/50';
  }
}

function insightSeverityClasses(severity: string): string {
  switch (severity) {
    case 'concern': return 'border-l-red-500 bg-red-50';
    case 'warning': return 'border-l-amber-500 bg-amber-50';
    case 'info':
    default: return 'border-l-blue-500 bg-blue-50';
  }
}

// ── KPI Section ─────────────────────────────────────────────────────────────

function KpiSection() {
  const [period, setPeriod] = useState<RevenuePeriod>('month');
  const [data, setData] = useState<InspectStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminService.getInspectStats(period)
      .then(res => {
        if (res.data) setData(res.data);
        else setError(res.error ?? 'Failed to load');
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div className="bg-white rounded-xl border border-dark/10 p-5 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h2 className="text-lg font-bold text-dark">Overview</h2>
        <div className="flex gap-1 bg-warm rounded-full p-1 flex-wrap">
          {PERIODS.map(p => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                period === p.id ? 'bg-white text-dark shadow-sm' : 'text-dark/50 hover:text-dark'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-red-600 text-sm py-4">{error}</div>}
      {loading && !data && (
        <div className="text-dark/40 text-sm py-8 text-center">Loading inspect stats…</div>
      )}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Tile
            label="Reports Uploaded"
            value={data.reportsUploaded.toLocaleString()}
            sublabel={data.reportsUploaded > 0 ? `${pct(data.parseSuccessRate)} parsed` : ''}
            color="bg-blue-500"
          />
          <Tile
            label="Paid Conversion"
            value={pct(data.paidConversionRate)}
            sublabel={`${data.paidReports} paid of ${data.reportsUploaded}`}
            color="bg-green-500"
          />
          <Tile
            label="Avg Items / Report"
            value={data.avgItemsPerReport.toFixed(1)}
            sublabel="AI parse quality"
            color="bg-purple-500"
          />
          <Tile
            label="Parse Failures"
            value={data.parseFailureCount.toLocaleString()}
            sublabel={data.reportsUploaded > 0 ? `${pct(data.parseFailureRate)} failure rate` : ''}
            warn={data.currentlyFailedTotal > 0}
            warnText={data.currentlyFailedTotal > 0 ? `${data.currentlyFailedTotal} failed overall` : ''}
            color="bg-red-500"
          />
          <Tile
            label="Supporting Docs"
            value={data.supportingDocsUploaded.toLocaleString()}
            sublabel="Pest + seller disclosures"
            color="bg-amber-500"
          />
          <Tile
            label="Active Reports"
            value={data.activeReports.toLocaleString()}
            sublabel="Viewed in last 7 days"
            color="bg-teal-500"
          />
        </div>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  sublabel,
  color,
  warn,
  warnText,
}: {
  label: string;
  value: string;
  sublabel?: string;
  color: string;
  warn?: boolean;
  warnText?: string;
}) {
  return (
    <div className={`rounded-lg p-4 ${warn ? 'bg-red-50 border border-red-200' : 'bg-warm'}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <div className="text-[11px] text-dark/50 font-semibold uppercase tracking-wide">{label}</div>
      </div>
      <div className="text-2xl font-bold text-dark">{value}</div>
      {sublabel && <div className="text-xs text-dark/50 mt-1">{sublabel}</div>}
      {warn && warnText && <div className="text-xs text-red-700 font-semibold mt-1">{warnText}</div>}
    </div>
  );
}

// ── Diagnostics Section ─────────────────────────────────────────────────────

function DiagnosticsSection() {
  const [data, setData] = useState<InspectDiagnosticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminService.getInspectDiagnostics()
      .then(res => {
        if (res.data) setData(res.data);
        else setError(res.error ?? 'Failed to load');
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(key: string, fn: () => Promise<unknown>, successMsg: string) {
    setBusy(b => ({ ...b, [key]: true }));
    try {
      await fn();
      setToast(successMsg);
      // Reload after a short delay so the async job has time to update state
      setTimeout(load, 2000);
    } catch (err) {
      setToast(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
      setTimeout(() => setToast(null), 3500);
    }
  }

  const totalIssues = data
    ? data.stuckParsing.length +
      data.recentFailures.length +
      data.missingInsights.length +
      data.expiringSoon.length +
      data.zeroItemReports.length
    : 0;

  return (
    <div className="bg-white rounded-xl border border-dark/10 p-5 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-dark">Diagnostics</h2>
          {data && totalIssues === 0 && (
            <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-1 rounded-full">All clear</span>
          )}
          {data && totalIssues > 0 && (
            <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
              {totalIssues} issue{totalIssues === 1 ? '' : 's'}
            </span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs font-semibold text-dark/60 hover:text-dark disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="text-red-600 text-sm py-4">{error}</div>}
      {loading && !data && (
        <div className="text-dark/40 text-sm py-8 text-center">Loading diagnostics…</div>
      )}

      {data && (
        <div className="space-y-5">
          <DiagnosticGroup
            title="Stuck parsing"
            description="In processing or uploading state for more than 10 minutes — likely a hung pipeline."
            severity="amber"
            reports={data.stuckParsing}
            renderMeta={r => <span>Stuck for {formatRelative(r.createdAt)}</span>}
            renderActions={r => (
              <button
                onClick={() => runAction(
                  `retry-${r.id}`,
                  () => adminService.retryInspectParse(r.id),
                  'Re-parse queued',
                )}
                disabled={busy[`retry-${r.id}`]}
                className="text-xs font-semibold px-3 py-1 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50"
              >
                {busy[`retry-${r.id}`] ? '…' : 'Retry parse'}
              </button>
            )}
          />

          <DiagnosticGroup
            title="Recent parse failures"
            description="Parsing failed in the last 7 days. Error message shown below each row."
            severity="red"
            reports={data.recentFailures}
            renderMeta={r => (
              <>
                <div>Failed {formatRelative(r.createdAt)}</div>
                {r.parsingError && (
                  <div className="text-red-700 font-mono text-[11px] mt-1 truncate max-w-md" title={r.parsingError}>
                    {r.parsingError}
                  </div>
                )}
              </>
            )}
            renderActions={r => (
              <button
                onClick={() => runAction(
                  `retry-${r.id}`,
                  () => adminService.retryInspectParse(r.id),
                  'Re-parse queued',
                )}
                disabled={busy[`retry-${r.id}`]}
                className="text-xs font-semibold px-3 py-1 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50"
              >
                {busy[`retry-${r.id}`] ? '…' : 'Retry parse'}
              </button>
            )}
          />

          <DiagnosticGroup
            title="Missing cross-reference insights"
            description="Has ≥1 parsed supporting doc but no insights row — background job didn't fire."
            severity="amber"
            reports={data.missingInsights}
            renderMeta={r => <span>{r.itemsParsed} items parsed</span>}
            renderActions={r => (
              <button
                onClick={() => runAction(
                  `regen-${r.id}`,
                  () => adminService.regenerateInspectInsights(r.id),
                  'Insight regeneration queued',
                )}
                disabled={busy[`regen-${r.id}`]}
                className="text-xs font-semibold px-3 py-1 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50"
              >
                {busy[`regen-${r.id}`] ? '…' : 'Regenerate'}
              </button>
            )}
          />

          <DiagnosticGroup
            title="Expiring this week"
            description="Paid reports whose client access expires in the next 7 days."
            severity="blue"
            reports={data.expiringSoon}
            renderMeta={r => <span>Expires {formatUntil(r.expiresAt)} · {r.pricingTier}</span>}
            renderActions={r => (
              <button
                onClick={() => runAction(
                  `extend-${r.id}`,
                  () => adminService.extendInspectReport(r.id, 90),
                  'Expiration extended 90 days',
                )}
                disabled={busy[`extend-${r.id}`]}
                className="text-xs font-semibold px-3 py-1 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50"
              >
                {busy[`extend-${r.id}`] ? '…' : 'Extend 90d'}
              </button>
            )}
          />

          <DiagnosticGroup
            title="Zero-item reports"
            description="Parsed successfully but extracted 0 items in the last 14 days — bad PDF or prompt regression."
            severity="amber"
            reports={data.zeroItemReports}
            renderMeta={r => <span>Parsed {formatRelative(r.createdAt)}</span>}
            renderActions={r => (
              <button
                onClick={() => runAction(
                  `retry-${r.id}`,
                  () => adminService.retryInspectParse(r.id),
                  'Re-parse queued',
                )}
                disabled={busy[`retry-${r.id}`]}
                className="text-xs font-semibold px-3 py-1 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50"
              >
                {busy[`retry-${r.id}`] ? '…' : 'Retry parse'}
              </button>
            )}
          />
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-dark text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function DiagnosticGroup({
  title,
  description,
  severity,
  reports,
  renderMeta,
  renderActions,
}: {
  title: string;
  description: string;
  severity: 'red' | 'amber' | 'blue';
  reports: InspectDiagnosticReport[];
  renderMeta: (r: InspectDiagnosticReport) => React.ReactNode;
  renderActions: (r: InspectDiagnosticReport) => React.ReactNode;
}) {
  const borderColor = severity === 'red' ? 'border-l-red-500' : severity === 'amber' ? 'border-l-amber-500' : 'border-l-blue-500';

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-dark">{title}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            reports.length === 0
              ? 'bg-green-50 text-green-700'
              : severity === 'red' ? 'bg-red-50 text-red-700'
              : severity === 'amber' ? 'bg-amber-50 text-amber-700'
              : 'bg-blue-50 text-blue-700'
          }`}>
            {reports.length}
          </span>
        </div>
      </div>
      <div className="text-xs text-dark/50 mb-2">{description}</div>

      {reports.length === 0 ? (
        <div className="text-xs text-dark/40 italic py-2 pl-3">Nothing to see here</div>
      ) : (
        <div className="space-y-2">
          {reports.map(r => (
            <div
              key={r.id}
              className={`border-l-4 ${borderColor} bg-warm rounded-r-lg px-4 py-3 flex items-start justify-between gap-4`}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-dark truncate">{r.propertyAddress}</div>
                <div className="text-xs text-dark/60 truncate">
                  {r.clientName} · {r.clientEmail}
                </div>
                <div className="text-xs text-dark/50 mt-1">
                  {renderMeta(r)}
                </div>
              </div>
              <div className="flex-shrink-0">
                {renderActions(r)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Reports List + Detail ──────────────────────────────────────────────────

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['all', 'parsed', 'processing', 'failed', 'sent_to_client'];
const TIER_FILTERS = ['all', 'free', 'paid', 'essential', 'professional', 'premium'];

function ReportsSection() {
  const [rows, setRows] = useState<InspectReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<InspectReportDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminService.getInspectReports({
      limit: PAGE_SIZE,
      offset,
      q: search || undefined,
      status: statusFilter,
      tier: tierFilter,
    })
      .then(res => {
        setRows(res.data ?? []);
        setTotal((res.meta.total as number) ?? 0);
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [offset, search, statusFilter, tierFilter]);

  useEffect(() => { load(); }, [load]);

  async function selectReport(id: string) {
    if (selectedId === id) { setSelectedId(null); setDetail(null); return; }
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const res = await adminService.getInspectReportDetail(id);
      setDetail(res.data);
    } catch {
      setDetail(null);
    }
    setDetailLoading(false);
  }

  function refreshAfterAction() {
    load();
    if (selectedId) {
      adminService.getInspectReportDetail(selectedId).then(res => {
        if (res.data) setDetail(res.data);
      }).catch(() => {});
    }
  }

  return (
    <div className="bg-white rounded-xl border border-dark/10 p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <h2 className="text-lg font-bold text-dark">Reports</h2>
        <div className="text-xs text-dark/40">{total} total</div>
      </div>

      {/* Filters */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-dark/40 font-semibold uppercase tracking-wide">Status</span>
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setOffset(0); setSelectedId(null); }}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${
                statusFilter === s ? 'bg-dark text-white' : 'bg-dark/5 text-dark/50 hover:bg-dark/10'
              }`}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-dark/40 font-semibold uppercase tracking-wide">Tier</span>
          {TIER_FILTERS.map(t => (
            <button
              key={t}
              onClick={() => { setTierFilter(t); setOffset(0); setSelectedId(null); }}
              className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors capitalize ${
                tierFilter === t ? 'bg-dark text-white' : 'bg-dark/5 text-dark/50 hover:bg-dark/10'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setOffset(0); }}
        placeholder="Search by email, name, property address, or ID prefix…"
        className="w-full px-4 py-2.5 mb-3 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400 bg-white"
      />

      {error && <div className="text-red-600 text-sm py-3">{error}</div>}

      <div className="border border-dark/10 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b border-dark/10 bg-warm">
                <th className="text-left px-3 py-2.5 font-semibold text-dark/60">Uploaded</th>
                <th className="text-left px-3 py-2.5 font-semibold text-dark/60">Client</th>
                <th className="text-left px-3 py-2.5 font-semibold text-dark/60">Property</th>
                <th className="text-left px-3 py-2.5 font-semibold text-dark/60">Status</th>
                <th className="text-left px-3 py-2.5 font-semibold text-dark/60">Tier</th>
                <th className="text-left px-3 py-2.5 font-semibold text-dark/60">Mode</th>
                <th className="text-right px-3 py-2.5 font-semibold text-dark/60">Items</th>
                <th className="text-right px-3 py-2.5 font-semibold text-dark/60">Dispatch</th>
                <th className="text-right px-3 py-2.5 font-semibold text-dark/60">Quotes</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-dark/40">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-dark/40">No reports found</td></tr>
              ) : (
                rows.map(r => {
                  const isSelected = selectedId === r.id;
                  return (
                    <FragmentRow key={r.id}>
                      <tr
                        onClick={() => selectReport(r.id)}
                        className={`border-b border-dark/5 cursor-pointer transition-colors ${isSelected ? 'bg-orange-500/5' : 'hover:bg-warm/50'}`}
                      >
                        <td className="px-3 py-2.5 text-dark/60 whitespace-nowrap text-xs">
                          {new Date(r.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2.5 text-dark max-w-[180px]">
                          <div className="truncate">{r.clientName}</div>
                          <div className="truncate text-xs text-dark/50">{r.clientEmail}</div>
                        </td>
                        <td className="px-3 py-2.5 text-dark/70 max-w-[220px] truncate text-xs">
                          {r.propertyAddress}
                          <div className="text-dark/40">{r.propertyCity}, {r.propertyState}</div>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusBadgeClasses(r.parsingStatus)}`}>
                            {r.parsingStatus.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${tierBadgeClasses(r.pricingTier)} capitalize`}>
                            {r.pricingTier ?? 'free'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-dark/60 capitalize whitespace-nowrap text-xs">{r.reportMode}</td>
                        <td className="px-3 py-2.5 text-dark/60 text-right whitespace-nowrap">{r.itemsParsed}</td>
                        <td className="px-3 py-2.5 text-dark/60 text-right whitespace-nowrap">{r.itemsDispatched}</td>
                        <td className="px-3 py-2.5 text-dark/60 text-right whitespace-nowrap">
                          {r.itemsQuoted > 0 ? (
                            <>
                              <div>{r.itemsQuoted}</div>
                              <div className="text-xs text-dark/40">{formatCurrency(r.totalQuoteValueCents)}</div>
                            </>
                          ) : '—'}
                        </td>
                      </tr>
                      {isSelected && (
                        <tr>
                          <td colSpan={9} className="px-0 py-0 bg-warm/30">
                            {detailLoading ? (
                              <div className="px-6 py-8 text-center text-dark/40">Loading details…</div>
                            ) : detail ? (
                              <ReportDetailView detail={detail} onChange={refreshAfterAction} />
                            ) : (
                              <div className="px-6 py-8 text-center text-dark/40">Failed to load details</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </FragmentRow>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-4 mt-4">
          <button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0} className="text-sm font-semibold text-dark/50 hover:text-dark disabled:text-dark/20">Previous</button>
          <span className="text-sm text-dark/40">{offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of {total}</span>
          <button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total} className="text-sm font-semibold text-dark/50 hover:text-dark disabled:text-dark/20">Next</button>
        </div>
      )}
    </div>
  );
}

/** Wrapper that uses React.Fragment — lets us return a row + detail row from a .map */
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ── Report Detail View ──────────────────────────────────────────────────────

function ReportDetailView({ detail, onChange }: { detail: InspectReportDetailData; onChange: () => void }) {
  const { report, items, supportingDocuments, insights, severityCounts } = detail;
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [compOpen, setCompOpen] = useState(false);

  async function runAction(key: string, fn: () => Promise<unknown>, successMsg: string) {
    setBusy(b => ({ ...b, [key]: true }));
    try {
      await fn();
      setToast(successMsg);
      setTimeout(onChange, 1500);
    } catch (err) {
      setToast(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
      setTimeout(() => setToast(null), 3500);
    }
  }

  const homeownerUrl = `/inspect/${report.clientAccessToken}`;
  const daysToExpiry = Math.round((new Date(report.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));

  return (
    <div className="px-4 sm:px-6 py-5">
      {/* Admin actions bar */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <a
          href={homeownerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-orange-500 text-white hover:bg-orange-600"
        >
          Open homeowner view ↗
        </a>
        <button
          onClick={() => runAction('retry', () => adminService.retryInspectParse(report.id), 'Re-parse queued')}
          disabled={busy.retry || !report.reportFileUrl}
          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50"
        >
          {busy.retry ? '…' : 'Retry parse'}
        </button>
        <button
          onClick={() => runAction('regen', () => adminService.regenerateInspectInsights(report.id), 'Insights regeneration queued')}
          disabled={busy.regen}
          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50"
        >
          {busy.regen ? '…' : 'Regenerate insights'}
        </button>
        <button
          onClick={() => runAction('extend', () => adminService.extendInspectReport(report.id, 90), 'Expiration extended 90 days')}
          disabled={busy.extend}
          className="text-xs font-semibold px-3 py-1.5 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50"
        >
          {busy.extend ? '…' : 'Extend 90d'}
        </button>
        <div className="relative">
          <button
            onClick={() => setCompOpen(o => !o)}
            className="text-xs font-semibold px-3 py-1.5 rounded-md bg-green-600 text-white hover:bg-green-700"
          >
            Comp to paid tier ▾
          </button>
          {compOpen && (
            <div className="absolute right-0 mt-1 bg-white border border-dark/10 rounded-lg shadow-lg z-10 min-w-[160px]">
              {(['essential', 'professional', 'premium'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setCompOpen(false);
                    runAction(`comp-${t}`, () => adminService.compInspectReport(report.id, t), `Comped to ${t}`);
                  }}
                  disabled={!!busy[`comp-${t}`]}
                  className="block w-full text-left text-xs font-semibold px-3 py-2 hover:bg-warm capitalize disabled:opacity-50"
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <InfoCard label="Inspection date" value={new Date(report.inspectionDate).toLocaleDateString()} />
        <InfoCard label="Type" value={report.inspectionType} capitalize />
        <InfoCard label="Source" value={report.source.replace(/_/g, ' ')} capitalize />
        <InfoCard label="Expires" value={daysToExpiry < 0 ? `${Math.abs(daysToExpiry)}d ago` : `in ${daysToExpiry}d`} />
        <InfoCard label="Uploaded" value={new Date(report.createdAt).toLocaleString()} />
        <InfoCard label="Client notified" value={report.clientNotifiedAt ? new Date(report.clientNotifiedAt).toLocaleString() : '—'} />
        <InfoCard label="First action" value={report.clientFirstActionAt ? new Date(report.clientFirstActionAt).toLocaleString() : '—'} />
        <InfoCard label="Phone" value={report.clientPhone ?? '—'} />
      </div>

      {report.parsingError && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          <div className="text-xs font-semibold text-red-800 mb-1">Parsing error</div>
          <div className="text-xs text-red-700 font-mono break-words">{report.parsingError}</div>
        </div>
      )}

      {/* Severity breakdown */}
      {Object.keys(severityCounts).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs text-dark/50 font-semibold uppercase tracking-wide">Severity</span>
          {Object.entries(severityCounts).map(([sev, n]) => (
            <span key={sev} className={`text-xs px-2 py-0.5 rounded font-semibold ${severityBadgeClasses(sev)}`}>
              {sev.replace(/_/g, ' ')}: {n}
            </span>
          ))}
        </div>
      )}

      {/* Items table */}
      <Section title={`Items (${items.length})`}>
        {items.length === 0 ? (
          <div className="text-sm text-dark/40 italic py-3">No items parsed</div>
        ) : (
          <div className="border border-dark/10 rounded-lg overflow-hidden">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-dark/10 bg-warm/50">
                  <th className="text-left px-3 py-2 font-semibold text-dark/60 text-xs">Title</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/60 text-xs">Category</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/60 text-xs">Severity</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/60 text-xs">Location</th>
                  <th className="text-left px-3 py-2 font-semibold text-dark/60 text-xs">Dispatch</th>
                  <th className="text-right px-3 py-2 font-semibold text-dark/60 text-xs">Best quote</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => <ItemRow key={item.id} item={item} />)}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Supporting docs */}
      <Section title={`Supporting documents (${supportingDocuments.length})`}>
        {supportingDocuments.length === 0 ? (
          <div className="text-sm text-dark/40 italic py-3">None uploaded</div>
        ) : (
          <div className="space-y-2">
            {supportingDocuments.map(doc => (
              <DocRow key={doc.id} doc={doc} busy={busy[`doc-${doc.id}`]} onRetry={() =>
                runAction(`doc-${doc.id}`, () => adminService.retryInspectDocParse(doc.id), 'Doc re-parse queued')
              } />
            ))}
          </div>
        )}
      </Section>

      {/* Cross-reference insights */}
      <Section title={`Cross-reference insights${insights ? ` (${insights.length})` : ''}`}>
        {!insights || insights.length === 0 ? (
          <div className="text-sm text-dark/40 italic py-3">
            {supportingDocuments.length === 0
              ? 'None yet — upload a supporting doc to generate insights'
              : 'Not generated yet — click “Regenerate insights” above'}
          </div>
        ) : (
          <div className="space-y-2">
            {insights.map((ins, i) => (
              <div key={ins.id ?? i} className={`border-l-4 rounded-r-lg px-4 py-3 ${insightSeverityClasses(ins.severity)}`}>
                <div className="text-sm font-bold text-dark">{ins.title}</div>
                <div className="text-xs text-dark/70 mt-1">{ins.description}</div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* IDs and token */}
      <div className="mt-5 pt-4 border-t border-dark/10 text-xs text-dark/40 font-mono break-all space-y-1">
        <div><span className="text-dark/60 font-sans font-semibold">Report ID:</span> {report.id}</div>
        <div><span className="text-dark/60 font-sans font-semibold">Access token:</span> {report.clientAccessToken}</div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-dark text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-sm font-bold text-dark mb-2">{title}</div>
      {children}
    </div>
  );
}

function InfoCard({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="bg-white rounded-lg border border-dark/5 px-3 py-2">
      <div className="text-[10px] font-semibold text-dark/40 uppercase tracking-wide">{label}</div>
      <div className={`text-sm font-medium text-dark mt-0.5 ${capitalize ? 'capitalize' : ''}`}>{value}</div>
    </div>
  );
}

function ItemRow({ item }: { item: InspectReportItemRow }) {
  const bestQuoteCents = item.quoteAmountCents;
  const estimate = item.aiCostEstimateLowCents > 0 || item.aiCostEstimateHighCents > 0
    ? `~${formatCurrency(item.aiCostEstimateLowCents)}–${formatCurrency(item.aiCostEstimateHighCents)}`
    : '—';

  return (
    <tr className="border-b border-dark/5 last:border-b-0">
      <td className="px-3 py-2 text-dark max-w-[260px]">
        <div className="truncate font-medium">{item.title}</div>
        {item.isIncludedInRequest && (
          <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded mt-1 inline-block">
            In repair request
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-dark/60 capitalize whitespace-nowrap">
        {item.category.replace(/_/g, ' ')}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${severityBadgeClasses(item.severity)}`}>
          {item.severity.replace(/_/g, ' ')}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-dark/60 max-w-[140px] truncate">{item.locationInProperty ?? '—'}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${statusBadgeClasses(item.dispatchStatus)}`}>
          {item.dispatchStatus.replace(/_/g, ' ')}
        </span>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap text-xs">
        {bestQuoteCents != null ? (
          <>
            <div className="font-semibold text-dark">{formatCurrency(bestQuoteCents)}</div>
            <div className="text-dark/40 truncate max-w-[120px]">{item.providerName}</div>
          </>
        ) : (
          <span className="text-dark/40">{estimate}</span>
        )}
      </td>
    </tr>
  );
}

function DocRow({ doc, busy, onRetry }: { doc: InspectSupportingDocRow; busy: boolean | undefined; onRetry: () => void }) {
  const icon = doc.documentType === 'pest_report' ? '🐛' : doc.documentType === 'seller_disclosure' ? '📋' : '📄';

  return (
    <div className="border border-dark/10 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span>{icon}</span>
          <span className="text-sm font-medium text-dark truncate">{doc.fileName}</span>
          <span className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${statusBadgeClasses(doc.parsingStatus)}`}>
            {doc.parsingStatus}
          </span>
        </div>
        <div className="text-xs text-dark/50 mt-0.5 capitalize">
          {doc.documentType.replace(/_/g, ' ')} · {new Date(doc.createdAt).toLocaleDateString()}
        </div>
        {doc.parsingError && (
          <div className="text-xs text-red-700 font-mono mt-1 truncate" title={doc.parsingError}>
            {doc.parsingError}
          </div>
        )}
      </div>
      {doc.parsingStatus === 'failed' && (
        <button
          onClick={onRetry}
          disabled={busy}
          className="text-xs font-semibold px-3 py-1 rounded-md bg-dark text-white hover:bg-dark/80 disabled:opacity-50"
        >
          {busy ? '…' : 'Retry'}
        </button>
      )}
    </div>
  );
}
