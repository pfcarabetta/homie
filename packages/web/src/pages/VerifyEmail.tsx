import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { fetchAPI } from '@/services/api';

export default function VerifyEmail() {
  useDocumentTitle('Verify Email');
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setError('No verification token provided'); return; }

    fetchAPI<{ verified: boolean }>(`/api/v1/auth/verify-email?token=${token}`)
      .then(() => setStatus('success'))
      .catch((err) => { setStatus('error'); setError((err as Error).message || 'Verification failed'); });
  }, [token]);

  return (
    <div className="min-h-screen bg-warm flex flex-col">
      <header className="py-8 text-center">
        <Link to="/" className="font-display font-bold text-3xl text-orange-500">homie</Link>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 pt-12">
        <div className="w-full max-w-sm text-center">
          {status === 'loading' && (
            <>
              <div className="w-16 h-16 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-6" />
              <h1 className="text-2xl font-bold mb-2">Verifying your email...</h1>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-2">Email verified!</h1>
              <p className="text-dark/50 text-sm mb-8">Your account is now fully activated.</p>
              <Link to="/" className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-8 rounded-full transition-colors">
                Go to Homie
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 bg-red-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold mb-2">Verification failed</h1>
              <p className="text-dark/50 text-sm mb-8">{error || 'This link may be invalid or expired.'}</p>
              <Link to="/login" className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-8 rounded-full transition-colors">
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
