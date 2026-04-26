import logger from '../logger';
import type { DIYAnalysisPayload } from '@homie/shared';

/**
 * On-demand DIY analysis. Used by both the public /api/v1/diy/analyze
 * endpoint (quote-chat panel) and the per-item endpoint on the homeowner-
 * inspect portal. The same SAFETY GATE applies in both surfaces.
 */

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

interface AnalyzeArgs {
  diagnosis: string;
  category?: string | null;
  userDescription?: string | null;
}

export type DIYServiceResult =
  | { ok: true; payload: DIYAnalysisPayload }
  | { ok: false; status: number; error: string };

/**
 * Run the DIY analysis. Returns a discriminated union so callers don't
 * need to interpret HTTP status codes themselves.
 */
export async function analyzeDIY({ diagnosis, category, userDescription }: AnalyzeArgs): Promise<DIYServiceResult> {
  const trimmedDiagnosis = diagnosis.trim();
  const trimmedCategory = category?.trim() ?? '';
  const trimmedUserDescription = userDescription?.trim() ?? '';

  if (!trimmedDiagnosis && !trimmedUserDescription) {
    return { ok: false, status: 400, error: 'diagnosis or userDescription required' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: 'AI not configured' };
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey });

    const userPrompt = `Category: ${trimmedCategory || 'unknown'}
${trimmedUserDescription ? `\nHomeowner described it as: "${trimmedUserDescription}"` : ''}

Diagnosis from prior chat:
${trimmedDiagnosis || trimmedUserDescription}

Return the DIY analysis JSON per the system prompt. Remember: safety-critical items get feasible: false with a clear whenToCallPro.`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = message.content.find((b) => b.type === 'text');
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
      return { ok: false, status: 502, error: 'AI returned unparseable response' };
    }

    const p = parsed as Record<string, unknown>;
    const payload: DIYAnalysisPayload = {
      feasible: p.feasible === true,
      difficulty: (['beginner', 'intermediate', 'advanced'].includes(p.difficulty as string)
        ? p.difficulty
        : null) as 'beginner' | 'intermediate' | 'advanced' | null,
      timeEstimate: typeof p.timeEstimate === 'string' ? p.timeEstimate : null,
      costDiyCents: normalizeMoney(p.costDiyCents),
      costProCents: normalizeMoney(p.costProCents),
      steps: Array.isArray(p.steps) ? (p.steps.filter((s) => typeof s === 'string') as string[]) : [],
      toolsSupplies: normalizeTools(p.toolsSupplies),
      safetyWarnings: Array.isArray(p.safetyWarnings) ? (p.safetyWarnings.filter((s) => typeof s === 'string') as string[]) : [],
      whenToCallPro: typeof p.whenToCallPro === 'string' ? p.whenToCallPro : null,
    };

    logger.info({
      feasible: payload.feasible,
      category: trimmedCategory,
      stepCount: payload.steps.length,
      toolCount: payload.toolsSupplies.length,
    }, '[diy] Generated DIY analysis');

    return { ok: true, payload };
  } catch (err) {
    logger.error({ err }, '[diy] DIY analysis failed');
    return { ok: false, status: 500, error: 'DIY analysis failed' };
  }
}

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
    .map((item) => {
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
