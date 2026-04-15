import Anthropic from '@anthropic-ai/sdk';
import { ScriptBundle, ScriptTemplate, GenerateScriptsParams } from '../../types/scripts';

// ── Client ───────────────────────────────────────────────────────────────────

const client = new Anthropic();

// ── Template cache ────────────────────────────────────────────────────────────

interface CacheEntry {
  template: ScriptTemplate;
  expiresAt: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const templateCache = new Map<string, CacheEntry>();

function getCacheKey(category: string, severity: string): string {
  return `${category}:${severity}`;
}

function getCachedTemplate(key: string): ScriptTemplate | null {
  const entry = templateCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    templateCache.delete(key);
    return null;
  }
  return entry.template;
}

function setCachedTemplate(key: string, template: ScriptTemplate): void {
  templateCache.set(key, { template, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Tool definition ───────────────────────────────────────────────────────────

const GENERATE_SCRIPTS_TOOL: Anthropic.Tool = {
  name: 'generate_scripts',
  description:
    'Generate outreach script templates for voice call, SMS, and web message channels. ' +
    'Use {{placeholder}} syntax for job-specific values that will be interpolated at send time.',
  input_schema: {
    type: 'object',
    properties: {
      voice: {
        type: 'string',
        description:
          'Voice call script (20–30 seconds when read aloud). ' +
          'Greet the provider by name, briefly describe the job opportunity, and end by telling them they can respond right now on this call. ' +
          'Do NOT mention calling back a number or visiting a website — the system will automatically ask them to respond after the script plays. ' +
          'Keep it concise and conversational, like a real person calling. ' +
          'Use {{provider_name}}, {{category}}, {{summary}}, {{budget}}, {{zip_code}}.',
      },
      sms: {
        type: 'string',
        description:
          'SMS message (2-3 sentences, conversational and friendly). Start with "Hi {{provider_name}}! A homeowner near {{zip_code}} needs..." ' +
          'Briefly describe the job in plain language. End with something like "Would you be interested? Reply YES or NO." ' +
          'Tone: warm, professional, like a real person texting — not robotic or overly formal. ' +
          'Do NOT include any URLs or links. Use {{provider_name}}, {{category}}, {{summary}}, {{zip_code}}, {{budget}}.',
      },
      web: {
        type: 'string',
        description:
          'Web/email message body (2–4 sentences). Professional tone. Summarize the job for the provider. ' +
          'Do NOT include any URLs or links — they are added automatically. Use {{provider_name}}, {{category}}, {{summary}}, {{budget}}, {{zip_code}}.',
      },
    },
    required: ['voice', 'sms', 'web'],
  },
};

// ── Template generation via Claude ────────────────────────────────────────────

async function generateTemplateFromClaude(
  category: string,
  severity: string,
  summary: string,
  recommendedActions: string[],
): Promise<ScriptTemplate> {
  const systemPrompt = `You are an expert at writing outreach scripts for home service providers.
You write concise, professional scripts that clearly convey the job opportunity to service providers.
Severity level "${severity}" indicates ${
    severity === 'emergency'
      ? 'an urgent situation requiring immediate attention'
      : severity === 'high'
        ? 'a significant issue that needs prompt resolution'
        : severity === 'medium'
          ? 'a moderate issue that should be addressed soon'
          : 'a minor issue that can be scheduled at convenience'
  }.`;

  const userPrompt = `Generate outreach script templates for a ${severity}-severity ${category} job.

Job summary: ${summary}
Recommended actions: ${recommendedActions.join('; ')}

Create templates for all three channels using the generate_scripts tool.
Use {{placeholder}} syntax for dynamic values — do NOT hard-code specific names, dollar amounts, or zip codes.

Available placeholders: {{provider_name}}, {{category}}, {{severity}}, {{summary}}, {{budget}}, {{zip_code}}, {{timing}}

IMPORTANT rules:
- The SMS template MUST include the timing requirement using {{timing}} — e.g. "Timing: {{timing}}" or "Needed: {{timing}}". This tells the provider when the homeowner needs the work done.
- The voice script must NOT tell the provider to call a number or visit a website. After the script plays, the system will automatically ask "Are you interested?" and listen for their spoken response. End the script with something like "I'll give you a moment to respond."
- Do NOT use {{callback_number}} — it is not available.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    tools: [GENERATE_SCRIPTS_TOOL],
    tool_choice: { type: 'tool', name: 'generate_scripts' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'generate_scripts',
  );

  if (!toolUse) {
    throw new Error('Claude did not call the generate_scripts tool');
  }

  const input = toolUse.input as { voice: string; sms: string; web: string };

  if (!input.voice || !input.sms || !input.web) {
    throw new Error('generate_scripts tool response is missing required fields');
  }

  return { voice: input.voice, sms: input.sms, web: input.web };
}

// ── Placeholder interpolation ─────────────────────────────────────────────────

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateScripts(params: GenerateScriptsParams): Promise<ScriptBundle> {
  const {
    jobId,
    providerId,
    providerName,
    category,
    severity,
    summary,
    recommendedActions,
    budget,
    zipCode,
    timing,
  } = params;

  // Fetch or generate the template for this category+severity combination
  const cacheKey = getCacheKey(category, severity);
  let template = getCachedTemplate(cacheKey);

  if (!template) {
    template = await generateTemplateFromClaude(category, severity, summary, recommendedActions);
    setCachedTemplate(cacheKey, template);
  }

  // Interpolate job-specific values into the cached template
  // Format zip code with SSML digits tag for voice, plain for SMS/web
  const zipSpoken = zipCode.split('').join(' ');

  const vars: Record<string, string> = {
    provider_name: providerName,
    category: category.replace(/_/g, ' '),
    severity,
    summary,
    budget,
    zip_code: zipCode,
    timing,
  };

  const voiceVars: Record<string, string> = {
    ...vars,
    zip_code: zipSpoken,
  };

  return {
    job_id: jobId,
    provider_id: providerId,
    voice: interpolate(template.voice, voiceVars),
    sms: interpolate(template.sms, vars),
    web: interpolate(template.web, vars),
    generated_at: new Date().toISOString(),
  };
}

/** Exposed for testing — clears the in-memory template cache. */
export function clearTemplateCache(): void {
  templateCache.clear();
}
