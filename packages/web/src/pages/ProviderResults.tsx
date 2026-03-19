import { useParams } from 'react-router-dom';
import HomieHeader from '@/components/HomieHeader';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Spinner } from '@/components/Skeleton';

export default function ProviderResults() {
  const { jobId } = useParams<{ jobId: string }>();
  useDocumentTitle('Provider Results');

  // Placeholder — will be wired to jobService.getJob + getResponses
  return (
    <div className="min-h-screen bg-warm">
      <HomieHeader />
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Spinner size="lg" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Provider Results</h1>
          <p className="text-dark/50 text-sm">
            Viewing results for job <code className="font-mono text-xs bg-dark/5 px-1.5 py-0.5 rounded">{jobId}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
