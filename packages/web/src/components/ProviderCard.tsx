type Channel = 'voice' | 'sms' | 'web';

interface ProviderCardProps {
  name: string;
  googleRating: number;
  reviewCount: number;
  quotedPrice: string;
  availability: string;
  message?: string;
  channel: Channel;
  onBook: () => void;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.min(Math.max(rating - (star - 1), 0), 1);
          return (
            <svg key={star} className="w-4 h-4" viewBox="0 0 20 20">
              <path
                d="M10 1l2.39 4.84L17.82 6.8l-3.91 3.81.92 5.39L10 13.47 5.17 16l.92-5.39L2.18 6.8l5.43-.96L10 1z"
                fill="#D1D5DB"
              />
              <clipPath id={`clip-${star}`}>
                <rect x="0" y="0" width={fill * 20} height="20" />
              </clipPath>
              <path
                d="M10 1l2.39 4.84L17.82 6.8l-3.91 3.81.92 5.39L10 13.47 5.17 16l.92-5.39L2.18 6.8l5.43-.96L10 1z"
                fill="#FBBF24"
                clipPath={`url(#clip-${star})`}
              />
            </svg>
          );
        })}
      </div>
      <span className="text-xs text-dark/50 font-medium">{rating.toFixed(1)}</span>
    </div>
  );
}

const CHANNEL_ICONS: Record<Channel, { label: string; icon: string }> = {
  voice: { label: 'Phone', icon: '📞' },
  sms: { label: 'Text', icon: '💬' },
  web: { label: 'Web', icon: '🌐' },
};

export default function ProviderCard({
  name,
  googleRating,
  reviewCount,
  quotedPrice,
  availability,
  message,
  channel,
  onBook,
}: ProviderCardProps) {
  const ch = CHANNEL_ICONS[channel];

  return (
    <div className="bg-white rounded-2xl border border-dark/10 shadow-sm p-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold truncate">{name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <StarRating rating={googleRating} />
            <span className="text-xs text-dark/40">({reviewCount})</span>
          </div>
        </div>
        <span className="bg-dark/5 text-dark/60 text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1 shrink-0">
          <span>{ch.icon}</span>
          {ch.label}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
        <p className="text-3xl font-bold text-dark">${quotedPrice}</p>
        <p className="text-sm text-green-600 font-medium">{availability}</p>
      </div>

      {message && (
        <p className="text-sm text-dark/60 italic border-l-2 border-orange-500/30 pl-3 mb-4">
          "{message}"
        </p>
      )}

      <button
        onClick={onBook}
        className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-full transition-colors mt-2"
      >
        Book this pro
      </button>
    </div>
  );
}
