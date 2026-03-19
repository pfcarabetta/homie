import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAdminKey, adminService } from '@/services/admin-api';
import { Spinner } from '@/components/Skeleton';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      setAdminKey(key);
      await adminService.getStats();
      navigate('/admin/dashboard');
    } catch {
      setError('Invalid admin key');
      setAdminKey('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-warm flex flex-col">
      <header className="py-8 text-center">
        <span className="font-display font-bold text-3xl text-dark">homie <span className="text-dark/30 text-lg">admin</span></span>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 pt-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-center mb-1">Admin Access</h1>
          <p className="text-dark/50 text-sm text-center mb-8">Enter your admin secret key</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
            )}

            <div>
              <label htmlFor="admin-key" className="block text-sm font-semibold text-dark mb-1.5">Admin Key</label>
              <input
                id="admin-key"
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                required
                className="w-full bg-white border border-dark/15 rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                placeholder="Enter admin secret"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !key}
              className="w-full bg-dark hover:bg-dark/90 disabled:bg-dark/20 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Spinner size="sm" />}
              {loading ? 'Verifying...' : 'Enter Dashboard'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
