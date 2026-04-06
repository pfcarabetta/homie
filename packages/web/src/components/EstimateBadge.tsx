const O = '#E8632B';
const G = '#1B9E77';

function parsePriceToCents(price: string): number | null {
  // Handle "$185", "$150-200", "$150 - $200", "TBD", etc.
  const cleaned = price.replace(/[,$\s~≈]/g, '');

  // Range: take the midpoint
  const rangeMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/);
  if (rangeMatch) {
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    return Math.round(((low + high) / 2) * 100);
  }

  // Single number
  const singleMatch = cleaned.match(/^(\d+(?:\.\d+)?)$/);
  if (singleMatch) {
    return Math.round(parseFloat(singleMatch[1]) * 100);
  }

  return null;
}

interface EstimateBadgeProps {
  quotedPrice: string;
  estimateLow: number;
  estimateHigh: number;
}

export default function EstimateBadge({ quotedPrice, estimateLow, estimateHigh }: EstimateBadgeProps) {
  const cents = parsePriceToCents(quotedPrice);
  if (cents === null) return null;

  let label: string;
  let bg: string;
  let color: string;

  if (cents < estimateLow) {
    label = 'Below estimate';
    bg = `${G}15`;
    color = G;
  } else if (cents > estimateHigh) {
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
