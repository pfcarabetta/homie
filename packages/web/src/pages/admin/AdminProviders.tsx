import { useEffect, useState } from 'react';
import { adminService } from '@/services/admin-api';

interface Provider {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  googleRating: string | null;
  reviewCount: number;
  categories: string[] | null;
  discoveredAt: string;
  acceptanceRate: string | null;
  totalOutreach: number | null;
  totalAccepted: number | null;
}

const PAGE_SIZE = 25;

export default function AdminProviders() {
  const [rows, setRows] = useState<Provider[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminService.getProviders({ limit: PAGE_SIZE, offset })
      .then((res) => {
        setRows(res.data ?? []);
        setTotal((res.meta.total as number) ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [offset]);

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-dark">Providers</h1>
        <span className="text-sm text-dark/50">{total} total</span>
      </div>

      <div className="bg-white rounded-xl border border-dark/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark/10 bg-warm">
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Name</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Phone</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Rating</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Reviews</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Categories</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Acceptance</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Outreach</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Discovered</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-dark/40">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-dark/40">No providers yet</td></tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="border-b border-dark/5 hover:bg-warm/50">
                  <td className="px-4 py-3 text-dark font-medium">{p.name}</td>
                  <td className="px-4 py-3 text-dark/60">{p.phone ?? '-'}</td>
                  <td className="px-4 py-3 text-dark/60">{p.googleRating ?? '-'}</td>
                  <td className="px-4 py-3 text-dark/60">{p.reviewCount}</td>
                  <td className="px-4 py-3 text-dark/60 text-xs">{p.categories?.join(', ') ?? '-'}</td>
                  <td className="px-4 py-3 text-dark/60">{p.acceptanceRate ? `${(Number(p.acceptanceRate) * 100).toFixed(0)}%` : '-'}</td>
                  <td className="px-4 py-3 text-dark/60">{p.totalOutreach ?? 0}</td>
                  <td className="px-4 py-3 text-dark/60">{new Date(p.discoveredAt).toLocaleDateString()}</td>
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
