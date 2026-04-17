import { useCallback, useEffect, useState } from 'react';
import {
  adminService,
  type InspectStatsData,
  type InspectDiagnosticsData,
  type InspectDiagnosticReport,
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
    </div>
  );
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
