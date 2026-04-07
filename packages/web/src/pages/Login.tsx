import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Spinner } from '@/components/Skeleton';
import SEO from '@/components/SEO';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('redirect') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const err = await login(email, password);
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate(returnTo);
    }
  }

  return (
    <div className="min-h-screen bg-warm flex flex-col">
      <SEO
        title="Log In"
        description="Log in to your Homie account to manage quotes, bookings, and home maintenance."
        canonical="/login"
        noindex
      />
      {/* Simple header */}
      <header className="py-8 text-center">
        <Link to="/" className="font-display font-bold text-3xl text-orange-500">
          homie
        </Link>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 pt-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-center mb-1">Your Homie missed you</h1>
          <p className="text-dark/50 text-sm text-center mb-8">Sign in to your Homie account</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3" role="alert">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-dark mb-1.5">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-white border border-dark/15 rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-dark mb-1.5">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                minLength={8}
                className="w-full bg-white border border-dark/15 rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                placeholder="••••••••"
              />
            </div>

            <div className="flex justify-end">
              <Link to="/reset-password" className="text-xs text-orange-500 hover:text-orange-600 font-semibold transition-colors">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-dark/20 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Spinner size="sm" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="text-sm text-dark/50 text-center mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-orange-500 hover:text-orange-600 font-semibold transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
