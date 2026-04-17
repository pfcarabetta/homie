import { useEffect, useState } from 'react';
import { adminService } from '@/services/admin-api';
import RevenueSection from './RevenueSection';

interface Stats {
  total_homeowners: number;
  total_jobs: number;
  total_bookings: number;
  total_providers: number;
  total_outreach: number;
  jobs_by_status: Record<string, number>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminService.getStats()
      .then((res) => setStats(res.data))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!stats) return <div className="text-dark/40">Loading...</div>;

  const cards = [
    { label: 'Homeowners', value: stats.total_homeowners, color: 'bg-blue-500' },
    { label: 'Jobs', value: stats.total_jobs, color: 'bg-orange-500' },
    { label: 'Bookings', value: stats.total_bookings, color: 'bg-green-500' },
    { label: 'Providers', value: stats.total_providers, color: 'bg-purple-500' },
    { label: 'Outreach Attempts', value: stats.total_outreach, color: 'bg-amber-500' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-dark mb-6">Dashboard</h1>

      <RevenueSection />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-dark/10 p-5">
            <div className={`w-2 h-2 rounded-full ${c.color} mb-3`} />
            <div className="text-3xl font-bold text-dark">{c.value}</div>
            <div className="text-sm text-dark/50 mt-1">{c.label}</div>
          </div>
        ))}
      </div>

      {Object.keys(stats.jobs_by_status).length > 0 && (
        <div className="bg-white rounded-xl border border-dark/10 p-5">
          <h2 className="text-lg font-bold text-dark mb-4">Jobs by Status</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.jobs_by_status).map(([status, count]) => (
              <div key={status} className="bg-warm rounded-lg px-4 py-2">
                <span className="text-sm font-semibold text-dark capitalize">{status}</span>
                <span className="text-sm text-dark/50 ml-2">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
