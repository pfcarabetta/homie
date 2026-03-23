import { useEffect, useState } from 'react';
import { adminService } from '@/services/admin-api';

interface Homeowner {
  id: string;
  email: string;
  phone: string | null;
  zipCode: string;
  membershipTier: string;
  createdAt: string;
}

const PAGE_SIZE = 25;

export default function AdminHomeowners() {
  const [rows, setRows] = useState<Homeowner[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    adminService.getHomeowners({ limit: PAGE_SIZE, offset, q: search || undefined })
      .then((res) => {
        setRows(res.data ?? []);
        setTotal((res.meta.total as number) ?? 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [offset, search]);

  if (error) return <div className="text-red-600">{error}</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-dark">Homeowners</h1>
        <span className="text-sm text-dark/50">{total} total</span>
      </div>

      <input value={search} onChange={e => { setSearch(e.target.value); setOffset(0); }} placeholder="Search by email, phone, or zip..."
        className="w-full px-4 py-2.5 mb-4 rounded-lg border border-dark/10 text-sm outline-none focus:border-orange-400 bg-white" />

      <div className="bg-white rounded-xl border border-dark/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark/10 bg-warm">
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Email</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Phone</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Zip</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Tier</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-dark/40">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-dark/40">{search ? 'No matches' : 'No homeowners yet'}</td></tr>
            ) : (
              rows.map((h) => (
                <tr key={h.id} className="border-b border-dark/5 hover:bg-warm/50">
                  <td className="px-4 py-3 text-dark">{h.email}</td>
                  <td className="px-4 py-3 text-dark/60">{h.phone ?? '-'}</td>
                  <td className="px-4 py-3 text-dark/60">{h.zipCode}</td>
                  <td className="px-4 py-3"><span className="bg-dark/5 px-2 py-0.5 rounded text-xs font-semibold capitalize">{h.membershipTier}</span></td>
                  <td className="px-4 py-3 text-dark/60">{new Date(h.createdAt).toLocaleDateString()}</td>
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
