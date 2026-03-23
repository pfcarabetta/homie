import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchAPI } from '@/services/api';
import { Spinner } from '@/components/Skeleton';

export default function ResetPassword() {
  useDocumentTitle('Reset Password');
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await fetchAPI('/api/v1/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email, new_password: newPassword }),
      });
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message || 'Something went wrong');
    } finally {
      setLoading(false);
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
          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-2">Password updated</h1>
              <p className="text-dark/50 text-sm mb-8">Your password has been reset successfully.</p>
              <button
                onClick={() => navigate('/login')}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-full transition-colors"
              >
                Sign in with new password
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-center mb-1">Reset your password</h1>
              <p className="text-dark/50 text-sm text-center mb-8">Enter your email and choose a new password</p>

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
                  <label htmlFor="new-password" className="block text-sm font-semibold text-dark mb-1.5">New password</label>
                  <input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                    className="w-full bg-white border border-dark/15 rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                    placeholder="At least 8 characters"
                  />
                </div>

                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-semibold text-dark mb-1.5">Confirm new password</label>
                  <input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                    className="w-full bg-white border border-dark/15 rounded-xl px-4 py-3 text-sm text-dark placeholder:text-dark/30 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500"
                    placeholder="Confirm password"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-orange-500 hover:bg-orange-600 disabled:bg-dark/20 text-white font-semibold py-3 rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <Spinner size="sm" />}
                  {loading ? 'Resetting...' : 'Reset password'}
                </button>
              </form>

              <p className="text-sm text-dark/50 text-center mt-6">
                Remember your password?{' '}
                <Link to="/login" className="text-orange-500 hover:text-orange-600 font-semibold transition-colors">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
