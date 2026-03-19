// ── Types ────────────────────────────────────────────────────────────────────

export type JobTab = 'new' | 'accepted' | 'completed';

export type Severity = 'low' | 'moderate' | 'high' | 'critical';

export interface PortalJob {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  zipCode: string;
  distanceMiles: number;
  timing: string;
  budgetRange: string;
  confidence: number;
  status: JobTab;
  summary: string;
  recommendedActions: string[];
  photos: string[];
  homeownerNote?: string;
  // Filled once accepted / completed
  quotedPrice?: string;
  quotedAvailability?: string;
  quotedMessage?: string;
  review?: { rating: number; comment: string };
}

export interface ProviderStats {
  jobsCompleted: number;
  avgRating: number;
  responseRate: number;
  revenueThisMonth: number;
}

// ── Mock data ───────────────────────────────────────────────────────────────

export const MOCK_PROVIDER_NAME = 'Rivera Plumbing & Sons';

export const MOCK_STATS: ProviderStats = {
  jobsCompleted: 47,
  avgRating: 4.9,
  responseRate: 0.94,
  revenueThisMonth: 8_420,
};

export const MOCK_JOBS: PortalJob[] = [
  {
    id: 'job-001',
    title: 'Leaking Kitchen Faucet',
    category: 'plumbing',
    severity: 'moderate',
    zipCode: '90210',
    distanceMiles: 3.2,
    timing: 'ASAP',
    budgetRange: '$150–$350',
    confidence: 0.87,
    status: 'new',
    summary:
      'Homeowner reports a steady drip from the base of the kitchen faucet spout when the handle is off. Consistent with a worn cartridge or O-ring in a single-handle faucet. No water damage to cabinet below yet, but the drip has been worsening over the past week.',
    recommendedActions: [
      'Inspect cartridge and O-ring seals',
      'Replace cartridge if corroded or cracked',
      'Check supply lines for secondary leaks',
      'Test faucet under pressure after repair',
    ],
    photos: [],
    homeownerNote: 'It started about a week ago and is getting worse. Single-handle Moen faucet, maybe 8 years old.',
  },
  {
    id: 'job-002',
    title: 'AC Not Cooling',
    category: 'hvac',
    severity: 'high',
    zipCode: '90212',
    distanceMiles: 5.8,
    timing: 'This week',
    budgetRange: '$200–$600',
    confidence: 0.72,
    status: 'new',
    summary:
      'Central AC is running but blowing warm air. Thermostat is set to 72°F but indoor temp reads 81°F. System is a 3-ton Carrier unit installed in 2018. Homeowner has not changed the filter recently. Could be low refrigerant, a failing compressor, or a clogged condenser.',
    recommendedActions: [
      'Check and replace air filter',
      'Inspect condenser coils for debris',
      'Check refrigerant levels and look for leaks',
      'Test compressor and capacitor',
      'Verify thermostat wiring and calibration',
    ],
    photos: [],
    homeownerNote: 'The outside unit seems to run fine, it just doesn\'t cool. Haven\'t changed the filter in a while.',
  },
  {
    id: 'job-003',
    title: 'Flickering Lights',
    category: 'electrical',
    severity: 'moderate',
    zipCode: '90211',
    distanceMiles: 4.1,
    timing: 'This week',
    budgetRange: '$100–$300',
    confidence: 0.65,
    status: 'accepted',
    summary:
      'Multiple lights in the living room and kitchen flicker intermittently, especially when the HVAC kicks on. Could indicate a loose neutral connection, overloaded circuit, or a degrading breaker. The home was built in 1987 and may still have original panel wiring.',
    recommendedActions: [
      'Inspect panel for loose connections',
      'Check neutral bus bar',
      'Test voltage under load on affected circuits',
      'Evaluate breaker condition',
    ],
    photos: [],
    quotedPrice: '225',
    quotedAvailability: 'Thursday 2–4 PM',
    quotedMessage: 'I\'ll bring my circuit analyzer. Likely a loose neutral — common in homes from that era.',
  },
  {
    id: 'job-004',
    title: 'Running Toilet',
    category: 'plumbing',
    severity: 'low',
    zipCode: '90210',
    distanceMiles: 2.9,
    timing: 'Flexible',
    budgetRange: '$75–$175',
    confidence: 0.93,
    status: 'completed',
    summary:
      'Toilet runs intermittently — the classic "phantom flush" caused by a deteriorated flapper valve. Water slowly leaks from the tank to the bowl, triggering the fill valve every 10–15 minutes. Simple repair with a universal flapper kit.',
    recommendedActions: [
      'Replace flapper valve',
      'Inspect fill valve for wear',
      'Check flush handle chain length',
      'Test for silent leaks with dye tablet',
    ],
    photos: [],
    quotedPrice: '95',
    quotedAvailability: 'Last Tuesday',
    quotedMessage: 'Quick fix — replaced the flapper and adjusted the chain. Good as new.',
    review: {
      rating: 5,
      comment: 'Super fast and friendly. Fixed it in 20 minutes. Highly recommend!',
    },
  },
];
