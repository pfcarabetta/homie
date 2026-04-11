/**
 * Serial number decoder for major appliance and HVAC brands.
 *
 * Each rule defines how to extract a manufacture date from a serial number.
 * Decoders are matched against a normalized brand string and tried in order
 * until one returns a valid date.
 *
 * Returns null if no rule matches — callers should fall back to visual age
 * estimation in that case.
 */

export interface SerialDecodeResult {
  manufactureDate: Date;
  confidence: number;
  method: string;
}

interface DecoderRule {
  brands: string[]; // lowercase brand aliases this rule applies to
  description: string;
  match: (serial: string) => SerialDecodeResult | null;
}

function makeDate(year: number, month: number = 1, day: number = 1): Date | null {
  if (year < 1980 || year > new Date().getFullYear() + 1) return null;
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

const RULES: DecoderRule[] = [
  // ── Water heaters ────────────────────────────────────────────────────────
  {
    brands: ['rheem', 'ruud', 'richmond'],
    description: 'Rheem/Ruud: serial starts with WWYY (week, year). e.g. 1717... = week 17 of 2017',
    match: (s) => {
      const m = s.match(/^([A-Z]{0,2})(\d{2})(\d{2})/i);
      if (!m) return null;
      const week = parseInt(m[2], 10);
      const yy = parseInt(m[3], 10);
      // Rheem switched format in early 2010s — assume year is 20yy
      const year = yy + 2000;
      const date = makeDate(year, Math.min(12, Math.max(1, Math.ceil(week / 4.33))), 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.92, method: 'rheem_serial' };
    },
  },
  {
    brands: ['ao smith', 'ao', 'state', 'reliance', 'kenmore water'],
    description: 'AO Smith / State: serial starts with YYWW',
    match: (s) => {
      const m = s.match(/^(\d{2})(\d{2})/);
      if (!m) return null;
      const yy = parseInt(m[1], 10);
      const week = parseInt(m[2], 10);
      const year = yy < 50 ? 2000 + yy : 1900 + yy;
      if (week < 1 || week > 53) return null;
      const date = makeDate(year, Math.min(12, Math.max(1, Math.ceil(week / 4.33))), 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.90, method: 'ao_smith_serial' };
    },
  },
  {
    brands: ['bradford white', 'bradford'],
    description: 'Bradford White: first 2 chars are letters encoding year+month',
    match: (s) => {
      const m = s.match(/^([A-Z])([A-Z])/i);
      if (!m) return null;
      // Year code: A=1984, B=1985, ... cycles through 20-year alphabet
      const yearLetters = 'ABCDEFGHJKLMNPRSTWXY';
      const monthLetters = 'ABCDEFGHJKLM';
      const yLetter = m[1].toUpperCase();
      const mLetter = m[2].toUpperCase();
      const yIdx = yearLetters.indexOf(yLetter);
      const mIdx = monthLetters.indexOf(mLetter);
      if (yIdx < 0 || mIdx < 0) return null;
      // Most recent cycle: 2004 + idx (current cycle started 2004)
      const year = 2004 + yIdx;
      const date = makeDate(year, mIdx + 1, 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.85, method: 'bradford_white_serial' };
    },
  },

  // ── HVAC ─────────────────────────────────────────────────────────────────
  {
    brands: ['carrier', 'bryant', 'payne'],
    description: 'Carrier/Bryant: WWYY in positions 1-4 of serial',
    match: (s) => {
      const m = s.match(/^(\d{2})(\d{2})/);
      if (!m) return null;
      const week = parseInt(m[1], 10);
      const yy = parseInt(m[2], 10);
      if (week < 1 || week > 53) return null;
      const year = yy < 50 ? 2000 + yy : 1900 + yy;
      const date = makeDate(year, Math.min(12, Math.max(1, Math.ceil(week / 4.33))), 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.91, method: 'carrier_serial' };
    },
  },
  {
    brands: ['trane', 'american standard'],
    description: 'Trane: year encoded in 1st character (letter) or 5th-6th digits',
    match: (s) => {
      // Recent format: serial starts with year prefix Y/Z, but full date is in positions 5-8 as MMYY
      const m = s.match(/(\d{2})(\d{2})$/) || s.match(/(\d{2})(\d{2})/);
      if (!m) return null;
      const yy = parseInt(m[2], 10);
      const year = yy < 50 ? 2000 + yy : 1900 + yy;
      const month = parseInt(m[1], 10);
      const date = makeDate(year, month, 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.78, method: 'trane_serial' };
    },
  },
  {
    brands: ['lennox', 'armstrong air', 'ducane', 'aire-flo'],
    description: 'Lennox: characters 5-8 are YYWW or week+year',
    match: (s) => {
      if (s.length < 8) return null;
      const segment = s.substring(4, 8);
      const m = segment.match(/^(\d{2})(\d{2})$/);
      if (!m) return null;
      const yy = parseInt(m[1], 10);
      const week = parseInt(m[2], 10);
      if (week < 1 || week > 53) return null;
      const year = yy < 50 ? 2000 + yy : 1900 + yy;
      const date = makeDate(year, Math.min(12, Math.max(1, Math.ceil(week / 4.33))), 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.82, method: 'lennox_serial' };
    },
  },
  {
    brands: ['goodman', 'amana', 'janitrol', 'daikin'],
    description: 'Goodman/Amana: first 4 digits = YYMM',
    match: (s) => {
      const m = s.match(/^(\d{2})(\d{2})/);
      if (!m) return null;
      const yy = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      const year = yy < 50 ? 2000 + yy : 1900 + yy;
      const date = makeDate(year, month, 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.86, method: 'goodman_serial' };
    },
  },
  {
    brands: ['york', 'coleman', 'luxaire'],
    description: 'York: 2nd character is year (W=2008, X=2009, …)',
    match: (s) => {
      if (s.length < 2) return null;
      const yearLetters = 'WXYZABCDEFGHJKLMNPRSTU';
      const idx = yearLetters.indexOf(s.charAt(1).toUpperCase());
      if (idx < 0) return null;
      const year = 2008 + idx;
      const date = makeDate(year, 1, 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.72, method: 'york_serial' };
    },
  },

  // ── Major appliances ─────────────────────────────────────────────────────
  {
    brands: ['ge', 'general electric', 'ge appliances', 'hotpoint', 'haier'],
    description: 'GE: first 2 chars are letters encoding month+year',
    match: (s) => {
      const m = s.match(/^([A-Z])([A-Z])/i);
      if (!m) return null;
      const monthLetters = 'ABCDEFGHJKLM'; // I excluded
      const yearLetters = 'ABCDEFGHJKLMNPQRSTV'; // updated cycle
      const mIdx = monthLetters.indexOf(m[1].toUpperCase());
      const yIdx = yearLetters.indexOf(m[2].toUpperCase());
      if (mIdx < 0 || yIdx < 0) return null;
      // GE cycle: 2005 + (yIdx) — restart every ~12 years
      const year = 2005 + yIdx;
      const date = makeDate(year, mIdx + 1, 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.80, method: 'ge_appliance_serial' };
    },
  },
  {
    brands: ['whirlpool', 'maytag', 'kitchenaid', 'jenn-air', 'amana appliance', 'roper'],
    description: 'Whirlpool family: 2nd char = year letter',
    match: (s) => {
      if (s.length < 2) return null;
      const yearLetters = 'ABCDEFGHJKLMNPRSTVWXY';
      const idx = yearLetters.indexOf(s.charAt(1).toUpperCase());
      if (idx < 0) return null;
      // Cycle restarts ~every 20 yrs; assume current cycle started 2010
      const year = 2010 + idx;
      const date = makeDate(year, 1, 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.74, method: 'whirlpool_serial' };
    },
  },
  {
    brands: ['samsung'],
    description: 'Samsung: 8th character is year, 7th is month (newer format)',
    match: (s) => {
      if (s.length < 8) return null;
      const monthChar = s.charAt(6).toUpperCase();
      const yearChar = s.charAt(7).toUpperCase();
      const yearMap: Record<string, number> = { 'P': 2018, 'R': 2019, 'M': 2020, 'T': 2021, 'V': 2022, 'W': 2023, 'X': 2024, 'Y': 2025, 'Z': 2026 };
      const monthMap: Record<string, number> = { '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, 'A': 10, 'B': 11, 'C': 12 };
      const year = yearMap[yearChar];
      const month = monthMap[monthChar];
      if (!year || !month) return null;
      const date = makeDate(year, month, 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.83, method: 'samsung_serial' };
    },
  },
  {
    brands: ['lg', 'lg electronics', 'kenmore lg'],
    description: 'LG: first 3 digits are YMM (year digit, month) — last digit of year only',
    match: (s) => {
      const m = s.match(/^(\d)(\d{2})/);
      if (!m) return null;
      const yDigit = parseInt(m[1], 10);
      const month = parseInt(m[2], 10);
      // LG year digit cycles every 10 years — assume current decade
      const currentDecade = Math.floor(new Date().getFullYear() / 10) * 10;
      let year = currentDecade + yDigit;
      if (year > new Date().getFullYear()) year -= 10;
      const date = makeDate(year, month, 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.70, method: 'lg_serial' };
    },
  },
  {
    brands: ['bosch', 'thermador', 'gaggenau'],
    description: 'Bosch: production date encoded in characters 7-10 as YYWW',
    match: (s) => {
      if (s.length < 10) return null;
      const segment = s.substring(6, 10);
      const m = segment.match(/^(\d{2})(\d{2})$/);
      if (!m) return null;
      const yy = parseInt(m[1], 10);
      const week = parseInt(m[2], 10);
      if (week < 1 || week > 53) return null;
      const year = yy < 50 ? 2000 + yy : 1900 + yy;
      const date = makeDate(year, Math.min(12, Math.max(1, Math.ceil(week / 4.33))), 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.78, method: 'bosch_serial' };
    },
  },

  // ── Electrical ───────────────────────────────────────────────────────────
  {
    brands: ['square d', 'schneider electric', 'schneider'],
    description: 'Square D Homeline: date encoded in last 4 digits as WWYY',
    match: (s) => {
      const m = s.match(/(\d{2})(\d{2})$/);
      if (!m) return null;
      const week = parseInt(m[1], 10);
      const yy = parseInt(m[2], 10);
      if (week < 1 || week > 53) return null;
      const year = yy < 50 ? 2000 + yy : 1900 + yy;
      const date = makeDate(year, Math.min(12, Math.max(1, Math.ceil(week / 4.33))), 1);
      if (!date) return null;
      return { manufactureDate: date, confidence: 0.70, method: 'square_d_serial' };
    },
  },
];

/**
 * Decode the manufacture date from a serial number for a given brand.
 * Returns null if the brand isn't recognized or the format doesn't match.
 */
export function decodeSerial(brand: string | null | undefined, serialNumber: string | null | undefined): SerialDecodeResult | null {
  if (!brand || !serialNumber) return null;

  const normalizedBrand = brand.toLowerCase().trim();
  const normalizedSerial = serialNumber.toUpperCase().trim();

  for (const rule of RULES) {
    if (!rule.brands.some(b => normalizedBrand.includes(b))) continue;
    try {
      const result = rule.match(normalizedSerial);
      if (result) return result;
    } catch {
      // ignore — try next rule
    }
  }
  return null;
}

/**
 * Helper to compute years from a manufacture date.
 */
export function ageFromDate(date: Date | null | undefined): number | null {
  if (!date) return null;
  const ms = Date.now() - date.getTime();
  return Math.round((ms / (365.25 * 24 * 60 * 60 * 1000)) * 10) / 10;
}
