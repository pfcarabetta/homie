import type { DiagnosisPayload, JobTier } from '@/services/api';

// ── Mock diagnosis ──────────────────────────────────────────────────────────

export const MOCK_DIAGNOSIS: DiagnosisPayload = {
  category: 'plumbing',
  severity: 'medium',
  summary:
    'Leaking kitchen faucet — likely caused by a worn-out cartridge or O-ring inside the handle assembly. Water is dripping from the base of the spout when the handle is in the off position, which is consistent with a cartridge seal failure.',
  recommendedActions: [
    'Turn off water supply valves under the sink',
    'Remove the faucet handle (pry off cap, remove screw)',
    'Pull out the cartridge and inspect O-rings',
    'Replace the cartridge or O-rings (take old one to hardware store to match)',
    'Reassemble and test for leaks',
  ],
  estimatedCost: { min: 150, max: 350 },
};

export const MOCK_DIAGNOSIS_CARD = {
  title: 'Leaking Kitchen Faucet',
  severity: 'moderate' as const,
  confidence: 0.87,
  summary: MOCK_DIAGNOSIS.summary,
  diyFeasible: true,
  diySteps: MOCK_DIAGNOSIS.recommendedActions,
  diyToolsNeeded: ['Adjustable wrench', 'Allen key set', 'Needle-nose pliers', 'Replacement cartridge (~$15-25)'],
  diyCostEstimate: '$15–$30',
  proCostEstimate: '$150–$350',
};

// ── Mock streaming response ─────────────────────────────────────────────────

const MOCK_RESPONSE_TEXT = `Based on what you're describing, it sounds like you have a **leaking kitchen faucet**. This is one of the most common plumbing issues — and the good news is, it's usually pretty straightforward to fix.

Here's what I think is going on: the dripping you're seeing at the base of the spout, especially when the faucet is off, is a classic sign of a **worn cartridge or O-ring** inside the handle assembly. Over time these rubber seals degrade and stop creating a watertight seal.

Let me put together a full diagnosis for you.

<diagnosis>${JSON.stringify(MOCK_DIAGNOSIS)}</diagnosis>

<job_summary>${JSON.stringify({
  title: 'Leaking Kitchen Faucet',
  category: 'plumbing',
  severity: 'medium',
  estimatedCost: { min: 150, max: 350 },
})}</job_summary>`;

/**
 * Simulates an SSE streaming response by emitting characters with a
 * realistic typing delay (fast bursts with small pauses at punctuation).
 */
export function mockStreamResponse(
  callbacks: {
    onToken: (text: string) => void;
    onDiagnosis: (d: DiagnosisPayload) => void;
    onJobSummary: (s: { title: string; category: string; severity: string; estimatedCost: { min: number; max: number } }) => void;
    onDone: () => void;
    onError: (e: Error) => void;
  },
): AbortController {
  const controller = new AbortController();
  let cancelled = false;

  controller.signal.addEventListener('abort', () => {
    cancelled = true;
  });

  (async () => {
    // Characters to emit (strip tags from visible output, but parse them)
    const chars = MOCK_RESPONSE_TEXT.split('');
    let i = 0;
    let fullText = '';
    let insideTag = false;

    while (i < chars.length && !cancelled) {
      const ch = chars[i];
      fullText += ch;

      // Track whether we're inside an XML tag to hide it from visible output
      if (ch === '<' && i + 1 < chars.length && (chars[i + 1] === 'd' || chars[i + 1] === 'j' || chars[i + 1] === '/')) {
        insideTag = true;
        i++;
        continue;
      }

      if (insideTag) {
        if (ch === '>') {
          insideTag = false;
          // Check for complete tags
          const diagMatch = fullText.match(/<diagnosis>([\s\S]*?)<\/diagnosis>/);
          if (diagMatch) {
            try {
              callbacks.onDiagnosis(JSON.parse(diagMatch[1]) as DiagnosisPayload);
            } catch { /* skip */ }
          }
          const summaryMatch = fullText.match(/<job_summary>([\s\S]*?)<\/job_summary>/);
          if (summaryMatch) {
            try {
              callbacks.onJobSummary(JSON.parse(summaryMatch[1]));
            } catch { /* skip */ }
          }
        }
        i++;
        continue;
      }

      callbacks.onToken(ch);

      // Realistic typing speed: fast for letters, slower at punctuation
      let delay = 12 + Math.random() * 18;
      if (ch === '.' || ch === '!' || ch === '?') delay = 80 + Math.random() * 120;
      else if (ch === ',' || ch === ':' || ch === ';') delay = 40 + Math.random() * 60;
      else if (ch === '\n') delay = 60 + Math.random() * 80;
      else if (ch === '*') delay = 5;

      await sleep(delay);
      i++;
    }

    if (!cancelled) {
      callbacks.onDone();
    }
  })();

  return controller;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Mock provider responses ─────────────────────────────────────────────────

export interface MockProvider {
  id: string;
  responseId: string;
  name: string;
  googleRating: number;
  reviewCount: number;
  quotedPrice: string;
  availability: string;
  message: string;
  channel: 'voice' | 'sms' | 'web';
}

export const MOCK_PROVIDERS: MockProvider[] = [
  {
    id: 'prov-001',
    responseId: 'resp-001',
    name: 'Rivera Plumbing & Sons',
    googleRating: 4.9,
    reviewCount: 127,
    quotedPrice: '185',
    availability: 'Tomorrow 9–11 AM',
    message: "Kitchen faucet cartridges are my specialty — I keep all the major brands in my truck so we can usually get it done in one visit.",
    channel: 'voice',
  },
  {
    id: 'prov-002',
    responseId: 'resp-002',
    name: 'QuickFix Home Services',
    googleRating: 4.6,
    reviewCount: 83,
    quotedPrice: '220',
    availability: 'Today 3–5 PM',
    message: 'Can come by this afternoon. Price includes parts and a 90-day warranty on the repair.',
    channel: 'sms',
  },
  {
    id: 'prov-003',
    responseId: 'resp-003',
    name: 'Cascade Plumbing Co.',
    googleRating: 4.7,
    reviewCount: 215,
    quotedPrice: '165',
    availability: 'Thursday 8 AM–12 PM',
    message: "Happy to take a look — most faucet leaks are a quick fix. I'll bring a few replacement cartridges just in case.",
    channel: 'web',
  },
];

// ── Mock outreach simulation ────────────────────────────────────────────────

export interface OutreachState {
  providersContacted: number;
  channels: {
    voice: { attempted: number; responded: number };
    sms: { attempted: number; responded: number };
    web: { attempted: number; responded: number };
  };
  active: boolean;
  respondedProviders: MockProvider[];
}

const OUTREACH_TIMELINE: { delayMs: number; update: (s: OutreachState) => OutreachState }[] = [
  { delayMs: 800, update: (s) => ({ ...s, providersContacted: 2, channels: { ...s.channels, voice: { attempted: 2, responded: 0 } } }) },
  { delayMs: 1500, update: (s) => ({ ...s, providersContacted: 4, channels: { ...s.channels, sms: { attempted: 2, responded: 0 } } }) },
  { delayMs: 2200, update: (s) => ({ ...s, providersContacted: 6, channels: { ...s.channels, web: { attempted: 2, responded: 0 } } }) },
  { delayMs: 4000, update: (s) => ({ ...s, channels: { ...s.channels, voice: { attempted: 2, responded: 1 } }, respondedProviders: [MOCK_PROVIDERS[0]] }) },
  { delayMs: 6500, update: (s) => ({ ...s, providersContacted: 7, channels: { ...s.channels, voice: { attempted: 3, responded: 1 }, sms: { attempted: 2, responded: 1 } }, respondedProviders: [MOCK_PROVIDERS[0], MOCK_PROVIDERS[1]] }) },
  { delayMs: 9000, update: (s) => ({ ...s, channels: { ...s.channels, web: { attempted: 2, responded: 1 } }, respondedProviders: [MOCK_PROVIDERS[0], MOCK_PROVIDERS[1], MOCK_PROVIDERS[2]] }) },
  { delayMs: 11000, update: (s) => ({ ...s, active: false }) },
];

/**
 * Simulates the outreach process over ~12 seconds.
 * Calls onUpdate at each stage with the new state.
 */
export function simulateOutreach(
  _tier: JobTier,
  onUpdate: (state: OutreachState) => void,
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let state: OutreachState = {
    providersContacted: 0,
    channels: {
      voice: { attempted: 0, responded: 0 },
      sms: { attempted: 0, responded: 0 },
      web: { attempted: 0, responded: 0 },
    },
    active: true,
    respondedProviders: [],
  };

  onUpdate(state);

  for (const step of OUTREACH_TIMELINE) {
    const timer = setTimeout(() => {
      state = step.update(state);
      onUpdate({ ...state });
    }, step.delayMs);
    timers.push(timer);
  }

  return () => {
    for (const t of timers) clearTimeout(t);
  };
}
