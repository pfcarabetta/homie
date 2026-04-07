const O = '#E8632B';
const G = '#1B9E77';

function parsePriceRange(price: string): { low: number; high: number } | null {
  const cleaned = price.replace(/[,$\s~≈]/g, '');

  // Range: "$150-$200", "150-200"
  const rangeMatch = cleaned.match(/^(\d+(?:\.\d+)?)[-–](\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    return { low: Math.round(parseFloat(rangeMatch[1]) * 100), high: Math.round(parseFloat(rangeMatch[2]) * 100) };
  }

  // Single number
  const singleMatch = cleaned.match(/^(\d+(?:\.\d+)?)$/);
  if (singleMatch) {
    const cents = Math.round(parseFloat(singleMatch[1]) * 100);
    return { low: cents, high: cents };
  }

  // "Free estimate"
  if (/free/i.test(price)) return null;

  return null;
}

interface EstimateBadgeProps {
  quotedPrice: string;
  estimateLow: number;
  estimateHigh: number;
}

export default function EstimateBadge({ quotedPrice, estimateLow, estimateHigh }: EstimateBadgeProps) {
  const range = parsePriceRange(quotedPrice);
  if (range === null) return null;

  let label: string;
  let bg: string;
  let color: string;

  // For ranges: check if the quoted range overlaps with the estimate range
  if (range.high < estimateLow) {
    label = 'Below estimate';
    bg = `${G}15`;
    color = G;
  } else if (range.low > estimateHigh) {
    label = 'Above estimate';
    bg = `${O}15`;
    color = O;
  } else {
    label = 'Within range';
    bg = 'rgba(0,0,0,0.05)';
    color = '#6B6560';
  }

  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 100,
      fontSize: 10,
      fontWeight: 700,
      lineHeight: 1.6,
      background: bg,
      color,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}
