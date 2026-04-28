/**
 * Extract a normalized price string from a provider's spoken response.
 *
 * Outreach call transcripts come in as full sentences ("a service call is
 * about $150"), but the `quotedPrice` field downstream wants a clean
 * value like "$150" or "$150-$200" — that's what the homeowner sees.
 *
 * Returns null if no plausible price was found, in which case the caller
 * should fall back to storing the raw transcript so we don't drop data.
 */
export function extractPriceFromSpeech(speech: string): string | null {
  const candidates = new Set<number>();

  const addIfPriceLike = (raw: string): void => {
    const n = parseFloat(raw.replace(/,/g, ''));
    if (!isFinite(n)) return;
    if (n < 10 || n > 100000) return; // out of plausible service-quote range
    candidates.add(n);
  };

  // $-prefixed amounts: "$150", "$1,500", "$1500.50"
  for (const m of speech.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)) {
    addIfPriceLike(m[1]);
  }

  // Numbers followed by price words: "150 dollars", "150 flat", "150 per visit"
  for (const m of speech.matchAll(
    /([\d,]+(?:\.\d+)?)\s*(?:dollars?|bucks?|flat|per|total|each|fee|charge)/gi,
  )) {
    addIfPriceLike(m[1]);
  }

  // Numbers preceded by price-context words: "about 150", "charge 200", "is 150"
  for (const m of speech.matchAll(
    /(?:about|around|roughly|approximately|maybe|like|is|be|charge[sd]?|cost[sd]?|runs?|pay|usually|typically|that's|thats|i'd|id|i\s+would)\s+\$?([\d,]+(?:\.\d+)?)/gi,
  )) {
    addIfPriceLike(m[1]);
  }

  // Range pattern: "150 to 200", "150-200", "between 150 and 200"
  for (const m of speech.matchAll(
    /\$?([\d,]+(?:\.\d+)?)\s*(?:to|and|-|–|through)\s*\$?([\d,]+(?:\.\d+)?)/gi,
  )) {
    addIfPriceLike(m[1]);
    addIfPriceLike(m[2]);
  }

  // Last-resort: a bare 2–5-digit number on its own (e.g. "150.")
  if (candidates.size === 0) {
    for (const m of speech.matchAll(/\b(\d{2,5})\b/g)) {
      addIfPriceLike(m[1]);
    }
  }

  if (candidates.size === 0) return null;

  const sorted = [...candidates].sort((a, b) => a - b);
  if (sorted.length === 1) return `$${fmt(sorted[0])}`;
  return `$${fmt(sorted[0])}-$${fmt(sorted[sorted.length - 1])}`;
}

function fmt(n: number): string {
  return n % 1 === 0 ? n.toString() : n.toFixed(2);
}
