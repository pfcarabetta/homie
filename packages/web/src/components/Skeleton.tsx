interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`bg-dark/[0.06] rounded-lg animate-pulse ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Card-shaped skeleton for job cards / provider cards. */
export function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-dark/10 p-5 space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-4 w-32" />
      <div className="pt-3 border-t border-dark/5 flex justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
    </div>
  );
}

/** Full-width stat card skeleton. */
export function StatSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-dark/10 p-4 space-y-2">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-6 w-16" />
    </div>
  );
}

/** Spinner for inline loading. */
export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  return (
    <div
      className={`${dim} border-2 border-dark/15 border-t-orange-500 rounded-full animate-spin`}
      role="status"
      aria-label="Loading"
    />
  );
}
