/**
 * Normalize a free-form provider quote into a clean dollar string for display.
 *
 * Examples:
 *   "$150"                                            → "$150"
 *   "150 dollars"                                     → "$150"
 *   "150-200"                                         → "$150-$200"
 *   "between 100 and 200"                             → "$100-$200"
 *   "Charge about $220"                               → "~$220"
 *   "$70/hour, 3 hour minimum, possibly 4 hours"      → "$210-$280"
 *   "$70 an hour, 3-hour minimum"                     → "$210"
 *   "$70/hr 3 to 4 hours"                             → "$210-$280"
 *   "150 service fee plus 70 per hour, 2 hr minimum"  → "$290-$290" (150 + 70*2)
 *
 * Returns null for null/empty input. Returns the cleaned input verbatim if no
 * pattern matches (so the PM still sees something they can interpret).
 */
export function formatQuotedPrice(raw: string | null): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[.,!?]+$/g, '').trim();
  if (!cleaned) return null;

  // Format helper
  const fmt = (n: number) => Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
  const fmtRange = (low: number, high: number) =>
    high > low ? `${fmt(low)}-${fmt(high)}` : fmt(low);

  // Already clean: "$150", "$150.50", "$150-200", "$150-$200" — entire string
  // must be a dollar amount or simple range. Fix any leading "$$" too.
  if (/^\$+\d+(?:\.\d+)?(?:\s*[-–]\s*\$?\d+(?:\.\d+)?)?$/.test(cleaned)) {
    return cleaned.replace(/^\$+/, '$');
  }

  // Plain number: "150", "150 dollars", "200 bucks"
  const numMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?|usd)?$/i);
  if (numMatch) return fmt(parseFloat(numMatch[1]));

  // Range at start: "150 to 200", "150-200", "$150 - $200"
  const rangeMatch = cleaned.match(/^[\$]?(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*[\$]?(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?|usd)?$/i);
  if (rangeMatch) {
    return fmtRange(parseFloat(rangeMatch[1]), parseFloat(rangeMatch[2]));
  }

  // Range with "between": "between 100 and 200", "Estimate between 400 and 550"
  const betweenMatch = cleaned.match(/between\s+\$?(\d+(?:\.\d+)?)\s*(?:and|to|-|–)\s*\$?(\d+(?:\.\d+)?)/i);
  if (betweenMatch) {
    return fmtRange(parseFloat(betweenMatch[1]), parseFloat(betweenMatch[2]));
  }

  // Range anywhere in text: "it would be 100 to 200", "charge 150-250"
  const embeddedRange = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*\$?(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?)?/i);
  if (embeddedRange) {
    const low = parseFloat(embeddedRange[1]);
    const high = parseFloat(embeddedRange[2]);
    if (high > low && low >= 10 && high <= 100000) {
      return fmtRange(low, high);
    }
  }

  // Embedded $XXX-$YYY: "Charge $220-$300"
  const embeddedDollar = cleaned.match(/\$(\d+(?:\.\d+)?)\s*(?:to|-|–)\s*\$?(\d+(?:\.\d+)?)/);
  if (embeddedDollar) {
    return fmtRange(parseFloat(embeddedDollar[1]), parseFloat(embeddedDollar[2]));
  }

  // ── Hourly rate + min/max hours ──────────────────────────────────────────
  // Examples this catches:
  //   "$70/hr, 3 hour minimum, possibly 4 hours"
  //   "$70 an hour, 3-hour minimum"
  //   "$70/hr 3 to 4 hours"
  //   "70 dollars per hour, minimum 3 hours"
  // Also picks up an optional flat service fee added in front:
  //   "$150 service fee plus $70/hr 2hr min" → 150 + 70*2 = 290
  const hourlyRateMatch = cleaned.match(/\$?(\d+(?:\.\d+)?)\s*(?:dollars?\s*)?(?:\/|per|an?\s+|\s+)\s*(?:hr|hour|hourly)/i);
  if (hourlyRateMatch) {
    const rate = parseFloat(hourlyRateMatch[1]);

    // Optional flat fee in front (service charge / trip charge / call out fee)
    let flatFee = 0;
    const feeMatch = cleaned.match(/\$?(\d+(?:\.\d+)?)\s*(?:flat\b|service\s*fee|service\s*call|trip\s*(?:charge|fee)|call[- ]?out\s*(?:fee|charge)|diagnostic\s*fee)/i);
    if (feeMatch) flatFee = parseFloat(feeMatch[1]);

    // Hours range first ("3 to 4 hours", "3-4 hours")
    const hoursRangeMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*(?:[-–]|to)\s*(\d+(?:\.\d+)?)\s*(?:hour|hr)s?/i);
    // Min hours alone ("3 hour minimum", "3-hour minimum", "minimum 3 hours")
    const minHoursMatch = cleaned.match(/(\d+(?:\.\d+)?)\s*[-]?\s*(?:hour|hr)s?\s*(?:minimum|min\b)/i)
      || cleaned.match(/(?:minimum|min\.?|at\s+least)\s+(?:of\s+)?(\d+(?:\.\d+)?)\s*(?:hour|hr)s?/i);
    // Max hours hint ("possibly 4 hours", "up to 4 hours", "could be 4 hours")
    const maxHoursMatch = cleaned.match(/(?:possibly|possible|up\s*to|maybe|could\s*be|might\s*be|or)\s+(\d+(?:\.\d+)?)\s*(?:hour|hr)s?/i);

    let minHours: number | null = null;
    let maxHours: number | null = null;

    if (hoursRangeMatch) {
      minHours = parseFloat(hoursRangeMatch[1]);
      maxHours = parseFloat(hoursRangeMatch[2]);
    } else if (minHoursMatch) {
      minHours = parseFloat(minHoursMatch[1]);
      if (maxHoursMatch) {
        maxHours = parseFloat(maxHoursMatch[1]);
      }
    } else if (maxHoursMatch) {
      // Just an upper bound — treat as 1-hour low estimate
      minHours = 1;
      maxHours = parseFloat(maxHoursMatch[1]);
    }

    if (minHours !== null && minHours > 0) {
      const low = flatFee + rate * minHours;
      const high = maxHours !== null && maxHours > minHours ? flatFee + rate * maxHours : low;
      return fmtRange(low, high);
    }

    // Hourly rate alone with no hours info → return as hourly
    return `${fmt(rate)}/hr`;
  }

  // Single $XXX
  const singleDollar = cleaned.match(/\$(\d+(?:\.\d+)?)/);
  if (singleDollar) {
    const n = parseFloat(singleDollar[1]);
    const hasApprox = /about|around|approximately|roughly|maybe|like|estimate/i.test(cleaned);
    return hasApprox ? `~${fmt(n)}` : fmt(n);
  }

  // "about/around 150" at start
  const approxMatch = cleaned.match(/^(?:about|around|approximately|roughly|maybe|like|charge about|charge around)\s+(\d+(?:\.\d+)?)/i);
  if (approxMatch) {
    return `~${fmt(parseFloat(approxMatch[1]))}`;
  }

  // Extract bare number from phrase: "charge 220", "it would be 350 dollars"
  const embeddedNum = cleaned.match(/(?:charge|cost|price|estimate|quote|be|pay|is|are|run|runs)\s+(?:about|around|roughly)?\s*(\d+(?:\.\d+)?)\s*(?:dollars?|bucks?)?/i);
  if (embeddedNum) {
    const n = parseFloat(embeddedNum[1]);
    const hasApprox = /about|around|roughly/i.test(cleaned);
    return hasApprox ? `~${fmt(n)}` : fmt(n);
  }

  // Fallback: starts with digit
  if (/^\d/.test(cleaned)) return `$${cleaned.replace(/\s*(dollars?|bucks?|usd)\s*/gi, '')}`;

  return cleaned;
}
