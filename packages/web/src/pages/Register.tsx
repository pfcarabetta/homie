import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Spinner } from '@/components/Skeleton';

export default function Register() {
  useDocumentTitle('Create account');
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (!/^\d{5}$/.test(zipCode)) {
      setError('Enter a valid 5-digit zip code');
      return;
    }

    setLoading(true);
    const err = await register({ email, password, zipCode, phone: phone || undefined });
    setLoading(false);
    if (err) {
      setError(err);
    } else {
      navigate('/');
    }
  }

  return (
    <div className="min-h-screen bg-warm flex flex-col">
      <header className="py-8 text-center">
        <Link to="/" className="font-display font-bold text-3xl text-orange-500">
          homie
        </Link>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 pt-4">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-center mb-1">Create your account</h1>
          <p className="text-dark/50 text-sm text-center mb-8">Get started with Homie in seconds</p>

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
                autoComplete="new-password"
                minLength={8}
                className="w-full bg-white border border-dark/15 rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                placeholder="At least 8 characters"
              />
            </div>

            <div>
              <label htmlFor="zip" className="block text-sm font-semibold text-dark mb-1.5">Zip code</label>
              <input
                id="zip"
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value.replace(/\D/g, ''))}
                required
                className="w-full bg-white border border-dark/15 rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                placeholder="90210"
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-semibold text-dark mb-1.5">
                Phone <span className="text-dark/30 font-normal">(optional)</span>
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                className="w-full bg-white border border-dark/15 rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                placeholder="(555) 123-4567"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-dark/20 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Spinner size="sm" />}
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-sm text-dark/50 text-center mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-orange-500 hover:text-orange-600 font-semibold transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
