import { useEffect, useState } from 'react';
import { adminService, type RevenueData, type RevenuePeriod } from '@/services/admin-api';

const PERIODS: { id: RevenuePeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'all', label: 'All Time' },
];

const PRODUCT_COLORS = {
  homie: '#E8632B',
  inspect: '#1B9E77',
  business: '#2D2926',
  unknown: '#9B9490',
} as const;

function fmtDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1000000) return `$${(dollars / 1000000).toFixed(1)}M`;
  if (dollars >= 10000) return `$${Math.round(dollars / 1000)}K`;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}K`;
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function fmtDollarsFull(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pctDelta(current: number, previous: number): { text: string; positive: boolean } | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? '+' : '';
  return { text: `${sign}${pct.toFixed(0)}%`, positive: pct >= 0 };
}

export default function RevenueSection() {
  const [period, setPeriod] = useState<RevenuePeriod>('month');
  const [data, setData] = useState<RevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    adminService.getRevenue(period)
      .then(res => {
        if (res.data) setData(res.data);
        else setError(res.error ?? 'Failed to load');
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [period]);

  const grossDelta = data ? pctDelta(data.totals.grossCents, data.previousTotals.grossCents) : null;
  const txDelta = data ? pctDelta(data.totals.transactionCount, data.previousTotals.transactionCount) : null;

  const maxBucketCents = data
    ? Math.max(1, ...data.timeseries.map(b => b.homieCents + b.inspectCents + b.businessCents + b.unknownCents))
    : 1;

  return (
    <div className="bg-white rounded-xl border border-dark/10 p-5 mb-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h2 className="text-lg font-bold text-dark">Revenue</h2>
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
        <div className="text-dark/40 text-sm py-8 text-center">Loading revenue data…</div>
      )}

      {data && (
        <>
          {/* Hero tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <HeroTile
              label="Gross Revenue"
              value={fmtDollarsFull(data.totals.grossCents)}
              delta={grossDelta}
              previousLabel={data.previousPeriodLabel}
              color="bg-green-500"
            />
            <HeroTile
              label="Transactions"
              value={data.totals.transactionCount.toLocaleString()}
              delta={txDelta}
              previousLabel={data.previousPeriodLabel}
              color="bg-blue-500"
            />
            <HeroTile
              label="Avg Transaction"
              value={fmtDollarsFull(data.totals.avgTransactionCents)}
              delta={null}
              previousLabel=""
              color="bg-purple-500"
            />
            <HeroTile
              label="New Paying Customers"
              value={data.totals.newPayingCustomers.toLocaleString()}
              delta={null}
              previousLabel=""
              color="bg-orange-500"
            />
          </div>

          {/* Time-series chart */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-dark">Revenue over time</div>
              <Legend />
            </div>
            {data.timeseries.length === 0 ? (
              <div className="text-dark/40 text-sm py-8 text-center border border-dashed border-dark/10 rounded-lg">
                No revenue in this period
              </div>
            ) : (
              <div className="flex items-end gap-1 h-40 border-b border-dark/10 pb-2">
                {data.timeseries.map((b, i) => {
                  const total = b.homieCents + b.inspectCents + b.businessCents + b.unknownCents;
                  const heightPct = (total / maxBucketCents) * 100;
                  return (
                    <div key={i} className="flex-1 flex flex-col justify-end items-center min-w-0 group relative">
                      <div
                        className="w-full relative"
                        style={{ height: `${heightPct}%`, minHeight: total > 0 ? 2 : 0 }}
                      >
                        {b.homieCents > 0 && (
                          <div style={{ height: `${(b.homieCents / total) * 100}%`, background: PRODUCT_COLORS.homie }} />
                        )}
                        {b.inspectCents > 0 && (
                          <div style={{ height: `${(b.inspectCents / total) * 100}%`, background: PRODUCT_COLORS.inspect }} />
                        )}
                        {b.businessCents > 0 && (
                          <div style={{ height: `${(b.businessCents / total) * 100}%`, background: PRODUCT_COLORS.business }} />
                        )}
                        {b.unknownCents > 0 && (
                          <div style={{ height: `${(b.unknownCents / total) * 100}%`, background: PRODUCT_COLORS.unknown }} />
                        )}
                      </div>
                      {/* Tooltip on hover */}
                      <div className="absolute bottom-full mb-1 hidden group-hover:block bg-dark text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                        <div className="font-semibold">{b.label}</div>
                        <div>{fmtDollarsFull(total)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {data.timeseries.length > 0 && (
              <div className="flex gap-1 text-[10px] text-dark/50 mt-1">
                {data.timeseries.map((b, i) => {
                  // Only label every Nth bucket to avoid overlap
                  const n = Math.max(1, Math.ceil(data.timeseries.length / 12));
                  return (
                    <div key={i} className="flex-1 text-center truncate">
                      {i % n === 0 ? b.label : ''}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Product breakdown */}
          <div>
            <div className="text-sm font-semibold text-dark mb-2">Revenue by product</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ProductCard
                name="Homie"
                sublabel="Consumer quotes"
                color={PRODUCT_COLORS.homie}
                data={data.byProduct.homie_quote}
                totalCents={data.totals.grossCents}
              />
              <ProductCard
                name="Homie Inspect"
                sublabel="Inspection reports"
                color={PRODUCT_COLORS.inspect}
                data={data.byProduct.inspect_report}
                totalCents={data.totals.grossCents}
              />
              <ProductCard
                name="Homie Business"
                sublabel="Workspace subs"
                color={PRODUCT_COLORS.business}
                data={data.byProduct.workspace_subscription}
                totalCents={data.totals.grossCents}
              />
            </div>
            {data.byProduct.unknown.grossCents > 0 && (
              <div className="text-xs text-dark/40 mt-2">
                Note: {fmtDollarsFull(data.byProduct.unknown.grossCents)} ({data.byProduct.unknown.transactionCount} tx) from legacy charges without product metadata.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function HeroTile({ label, value, delta, previousLabel, color }: {
  label: string;
  value: string;
  delta: { text: string; positive: boolean } | null;
  previousLabel: string;
  color: string;
}) {
  return (
    <div className="bg-warm rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-2 h-2 rounded-full ${color}`} />
        <div className="text-xs text-dark/50 font-semibold uppercase tracking-wide">{label}</div>
      </div>
      <div className="text-2xl font-bold text-dark">{value}</div>
      {delta && (
        <div className={`text-xs mt-1 font-semibold ${delta.positive ? 'text-green-600' : 'text-red-600'}`}>
          {delta.text} <span className="text-dark/40 font-normal">vs {previousLabel}</span>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="flex gap-3 text-xs text-dark/60">
      <span className="flex items-center gap-1"><span className="w-2 h-2" style={{ background: PRODUCT_COLORS.homie }} /> Homie</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2" style={{ background: PRODUCT_COLORS.inspect }} /> Inspect</span>
      <span className="flex items-center gap-1"><span className="w-2 h-2" style={{ background: PRODUCT_COLORS.business }} /> Business</span>
    </div>
  );
}

function ProductCard({ name, sublabel, color, data, totalCents }: {
  name: string;
  sublabel: string;
  color: string;
  data: { grossCents: number; transactionCount: number };
  totalCents: number;
}) {
  const pctOfTotal = totalCents > 0 ? Math.round((data.grossCents / totalCents) * 100) : 0;
  return (
    <div className="bg-warm rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
        <div className="text-sm font-bold text-dark">{name}</div>
      </div>
      <div className="text-xs text-dark/50 mb-3">{sublabel}</div>
      <div className="text-xl font-bold text-dark">{fmtDollarsFull(data.grossCents)}</div>
      <div className="text-xs text-dark/50 mt-1">
        {data.transactionCount} {data.transactionCount === 1 ? 'transaction' : 'transactions'} {pctOfTotal > 0 && <span>· {pctOfTotal}% of total</span>}
      </div>
    </div>
  );
}
