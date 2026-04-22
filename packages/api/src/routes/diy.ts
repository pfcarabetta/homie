import { Router, Request, Response } from 'express';
import logger from '../logger';

/**
 * POST /api/v1/diy/analyze
 * Lazy-loaded, on-demand DIY analysis for the quote-chat DIY panel.
 *
 * Called when the homeowner taps "Or try fixing it yourself?" — so we
 * only pay the Claude cost for users who actually want DIY guidance,
 * not everyone who sees the diagnosis card. Returns a structured
 * DIYAnalysisPayload the frontend renders inline. If the AI deems the
 * repair unsafe to self-service (gas, major electrical, etc.),
 * `feasible` is false and the panel collapses into a "too involved"
 * state instead of showing steps.
 *
 * This route is intentionally unauthenticated so it works during the
 * pre-auth intake, matching /api/v1/diagnostic.
 */
const router = Router();

interface AnalyzeBody {
  /** The dispatch-ready diagnosis text produced earlier in the chat. */
  diagnosis?: unknown;
  /** Optional category hint ("plumbing", "electrical", etc.) */
  category?: unknown;
  /** Optional raw user description for extra context. */
  userDescription?: unknown;
}

const SYSTEM_PROMPT = `You are Homie, a home maintenance expert. A homeowner just received a diagnosis for a home issue and tapped a "try fixing it yourself" button in the app. Your job is to decide if this is safely DIYable by a typical homeowner, and if so, give them a focused repair guide.

SAFETY GATE — mark feasible: false for any of these, no exceptions:
- Anything involving natural gas lines, gas appliances with gas connections, gas leaks
- Main electrical panel work, meter work, anything behind the main breaker
- Work on sealed HVAC refrigerant systems (EPA 608 certification required)
- Roof work requiring ladders higher than 10 feet or active leaks in foul weather
- Structural repairs to load-bearing walls, foundation, framing
- Any repair requiring permits in most jurisdictions (water heater replacement, panel work, major plumbing re-pipes)
- Repairs involving asbestos-era materials, lead paint disturbance, or mold remediation >10 sq ft
- Anything presenting an active hazard (gas smell, sparking, burning smell, flooding)

When feasible is false, still return safetyWarnings explaining why, and whenToCallPro explaining what kind of pro + roughly how to describe the job.

When feasible is true:
- Keep steps concrete and numbered. 5-10 steps is ideal.
- Tools & supplies: use GENERIC product names that lead to good Amazon searches (e.g. "14-inch adjustable wrench", "PTFE thread seal tape", "universal faucet cartridge"). NEVER invent specific SKUs or model numbers. searchQuery should be 3-6 words, search-engine friendly.
- Flag essential: true for must-have items, false for "if needed" items.
- Time + cost estimates should be realistic for a confident beginner, not an expert.
- safetyWarnings is still required — turn off breaker, shut off valve, wear eye protection, etc.
- whenToCallPro: describe the symptom/situation that means "stop and call a pro" partway through the DIY attempt.

OUTPUT — respond with ONLY a JSON object, no markdown, no code blocks, no preamble:
{
  "feasible": boolean,
  "difficulty": "beginner" | "intermediate" | "advanced" | null,
  "timeEstimate": "30-60 min" | "1-2 hours" | etc or null,
  "costDiyCents": { "min": 500, "max": 3500 } or null,
  "costProCents": { "min": 15000, "max": 28500 } or null,
  "steps": ["step 1", "step 2", ...],
  "toolsSupplies": [{ "name": "14-inch adjustable wrench", "searchQuery": "14-inch adjustable wrench", "essential": true }, ...],
  "safetyWarnings": ["warning 1", "warning 2"],
  "whenToCallPro": "If you see greenish corrosion around..."
}

When feasible is false, leave steps, toolsSupplies, timeEstimate, costDiyCents, costProCents, difficulty empty/null — ONLY safetyWarnings + whenToCallPro matter.`;

router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as AnalyzeBody;
  const diagnosis = typeof body.diagnosis === 'string' ? body.diagnosis.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const userDescription = typeof body.userDescription === 'string' ? body.userDescription.trim() : '';

  if (!diagnosis && !userDescription) {
    res.status(400).json({ data: null, error: 'diagnosis or userDescription required', meta: null });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ data: null, error: 'AI not configured', meta: null });
    return;
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey });

    const userPrompt = `Category: ${category || 'unknown'}
${userDescription ? `\nHomeowner described it as: "${userDescription}"` : ''}

Diagnosis from prior chat:
${diagnosis || userDescription}

Return the DIY analysis JSON per the system prompt. Remember: safety-critical items get feasible: false with a clear whenToCallPro.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = message.content.find(b => b.type === 'text');
    let responseText = textBlock ? textBlock.text.trim() : '';
    responseText = responseText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    let parsed: unknown = null;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); } catch { /* fall through */ }
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      logger.warn({ responseText: responseText.slice(0, 200) }, '[diy] Failed to parse DIY analysis JSON');
      res.status(502).json({ data: null, error: 'AI returned unparseable response', meta: null });
      return;
    }

    // Normalize — trust-but-verify the AI output. Defaults keep the
    // frontend typesafe even if the model omits a field.
    const p = parsed as Record<string, unknown>;
    const payload = {
      feasible: p.feasible === true,
      difficulty: (['beginner', 'intermediate', 'advanced'].includes(p.difficulty as string)
        ? p.difficulty
        : null) as 'beginner' | 'intermediate' | 'advanced' | null,
      timeEstimate: typeof p.timeEstimate === 'string' ? p.timeEstimate : null,
      costDiyCents: normalizeMoney(p.costDiyCents),
      costProCents: normalizeMoney(p.costProCents),
      steps: Array.isArray(p.steps) ? p.steps.filter(s => typeof s === 'string') as string[] : [],
      toolsSupplies: normalizeTools(p.toolsSupplies),
      safetyWarnings: Array.isArray(p.safetyWarnings) ? p.safetyWarnings.filter(s => typeof s === 'string') as string[] : [],
      whenToCallPro: typeof p.whenToCallPro === 'string' ? p.whenToCallPro : null,
    };

    logger.info({
      feasible: payload.feasible,
      category,
      stepCount: payload.steps.length,
      toolCount: payload.toolsSupplies.length,
    }, '[diy] Generated DIY analysis');

    res.json({ data: payload, error: null, meta: null });
  } catch (err) {
    logger.error({ err }, '[diy] DIY analysis failed');
    res.status(500).json({ data: null, error: 'DIY analysis failed', meta: null });
  }
});

function normalizeMoney(v: unknown): { min: number; max: number } | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const min = typeof o.min === 'number' ? o.min : null;
  const max = typeof o.max === 'number' ? o.max : null;
  if (min == null || max == null) return null;
  return { min, max };
}

function normalizeTools(v: unknown): Array<{ name: string; searchQuery: string; essential: boolean }> {
  if (!Array.isArray(v)) return [];
  return v
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const name = typeof o.name === 'string' ? o.name : null;
      const searchQuery = typeof o.searchQuery === 'string' ? o.searchQuery : name;
      if (!name || !searchQuery) return null;
      return {
        name,
        searchQuery,
        essential: o.essential !== false, // default to essential unless explicitly false
      };
    })
    .filter((x): x is { name: string; searchQuery: string; essential: boolean } => x !== null);
}

export default router;
