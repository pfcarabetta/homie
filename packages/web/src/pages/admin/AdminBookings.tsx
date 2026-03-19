import { useEffect, useState } from 'react';
import { adminService } from '@/services/admin-api';

interface Booking {
  id: string;
  jobId: string;
  providerName: string | null;
  homeownerEmail: string | null;
  status: string;
  confirmedAt: string;
}

const PAGE_SIZE = 25;

export default function AdminBookings() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    adminService.getBookings({ limit: PAGE_SIZE, offset })
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
        <h1 className="text-2xl font-bold text-dark">Bookings</h1>
        <span className="text-sm text-dark/50">{total} total</span>
      </div>

      <div className="bg-white rounded-xl border border-dark/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark/10 bg-warm">
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Booking ID</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Job ID</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Homeowner</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Provider</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Status</th>
              <th className="text-left px-4 py-3 font-semibold text-dark/60">Confirmed</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-dark/40">Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-dark/40">No bookings yet</td></tr>
            ) : (
              rows.map((b) => (
                <tr key={b.id} className="border-b border-dark/5 hover:bg-warm/50">
                  <td className="px-4 py-3 text-dark/60 font-mono text-xs">{b.id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-dark/60 font-mono text-xs">{b.jobId.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-dark">{b.homeownerEmail ?? '-'}</td>
                  <td className="px-4 py-3 text-dark">{b.providerName ?? '-'}</td>
                  <td className="px-4 py-3"><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs font-semibold capitalize">{b.status}</span></td>
                  <td className="px-4 py-3 text-dark/60">{new Date(b.confirmedAt).toLocaleDateString()}</td>
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
