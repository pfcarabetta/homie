type Tier = 'standard' | 'priority' | 'emergency';

interface TierSelectorProps {
  selected: Tier;
  onSelect: (tier: Tier) => void;
}

interface TierOption {
  id: Tier;
  name: string;
  price: string;
  time: string;
  providers: string;
  popular?: boolean;
}

const TIERS: TierOption[] = [
  { id: 'standard', name: 'Standard', price: '$9.99', time: '~2 hours', providers: '5-8 providers' },
  { id: 'priority', name: 'Priority', price: '$19.99', time: '~30 min', providers: '10+ providers', popular: true },
  { id: 'emergency', name: 'Emergency', price: '$29.99', time: '~15 min', providers: '15+ providers' },
];

export default function TierSelector({ selected, onSelect }: TierSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {TIERS.map((tier) => {
        const isSelected = selected === tier.id;
        return (
          <button
            key={tier.id}
            onClick={() => onSelect(tier.id)}
            className={`relative text-left rounded-2xl border-2 p-4 transition-all ${
              isSelected
                ? 'border-orange-500 ring-2 ring-orange-500/20 bg-orange-500/5'
                : 'border-dark/10 hover:border-dark/20 bg-white'
            }`}
          >
            {tier.popular && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-semibold px-3 py-0.5 rounded-full whitespace-nowrap">
                Most popular
              </span>
            )}
            <p className="text-sm font-semibold text-dark mb-1">{tier.name}</p>
            <p className="text-2xl font-bold text-dark">{tier.price}</p>
            <div className="mt-3 space-y-1">
              <p className="text-xs text-dark/60 flex items-center gap-1.5">
                <ClockIcon />
                {tier.time}
              </p>
              <p className="text-xs text-dark/60 flex items-center gap-1.5">
                <UsersIcon />
                {tier.providers}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ClockIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}
