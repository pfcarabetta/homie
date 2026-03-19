import { useEffect, useState } from 'react';
import { adminService } from '@/services/admin-api';

interface Job {
  id: string;
  homeownerEmail: string | null;
  diagnosis: { category?: string; severity?: string; summary?: string } | null;
  tier: string;
  status: string;
  zipCode: string;
  preferredTiming: string | null;
  budget: string | null;
  createdAt: string;
}

const PAGE_SIZE = 25;
const STATUSES = ['all', 'open', 'dispatching', 'collecting', 'completed', 'expired', 'refunded'];

export default function AdminJobs() {
  const [rows, setRows] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminService.getJobs({ limit: PAGE_SIZE, offset, status: status === 'all' ? undefined : status })
      .then((res) => {
        setRows(res.data ?? []);
        setTotal((res.meta.total as number) ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [offset, status]);

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-dark">Jobs</h1>
        <div className="flex items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setOffset(0); }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors capitalize ${
                status === s ? 'bg-dark text-white' : 'bg-dark/5 text-dark/50 hover:bg-dark/10'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-dark/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark/10 bg-warm">
              <th className="text-left px-4 py-3 font-semibold text-dark/60">ID</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Homeowner</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Category</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Tier</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Zip</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Created</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-dark/40">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-dark/40">No jobs found</td></tr>
            ) : (
              rows.map((j) => (
                <tr key={j.id} className="border-b border-dark/5 hover:bg-warm/50">
                  <td className="px-4 py-3 text-dark/60 font-mono text-xs">{j.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-dark">{j.homeownerEmail ?? '-'}</td>
                  <td className="px-4 py-3 text-dark/60 capitalize">{j.diagnosis?.category ?? '-'}</td>
                  <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                  <td className="px-4 py-3 capitalize text-dark/60">{j.tier}</td>
                  <td className="px-4 py-3 text-dark/60">{j.zipCode}</td>
                  <td className="px-4 py-3 text-dark/60">{new Date(j.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    dispatching: 'bg-amber-100 text-amber-700',
    collecting: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    expired: 'bg-dark/10 text-dark/50',
    refunded: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold capitalize ${colors[status] ?? 'bg-dark/5 text-dark/50'}`}>
      {status}
    </span>
  );
}
