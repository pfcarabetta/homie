import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { eq } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { propertyInventoryItems } from '../db/schema/property-scans';
import { optionalAuth } from '../middleware/auth';
import { ApiResponse } from '../types/api';

const router = Router();

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatBody {
  session_id?: unknown;
  message?: unknown;
  history?: unknown;
  images?: unknown;
}

const SYSTEM_PROMPT = `You are Homie, a friendly and knowledgeable AI home maintenance assistant. You're like a handy best friend who always knows what to do when something goes wrong at home. Your tagline is "Your home's best friend."

PERSONALITY:
- Talk like a knowledgeable friend, not a contractor or corporate bot
- Use casual, warm language: "Ah yeah, that's super common" not "Based on our diagnostic analysis"
- Be reassuring — homeowners are often stressed when things break
- Use light humor when appropriate, but stay helpful and focused
- Address the homeowner directly and personally

DIAGNOSTIC APPROACH:
1. After the homeowner describes their issue, acknowledge what they described briefly and reassuringly. Do NOT ask any follow-up diagnostic questions yet. Do NOT ask whether they want DIY or a pro — the app UI shows buttons for that automatically. Just acknowledge the issue and stop. Keep this first response short (1-2 sentences).
2. The homeowner will then tell you their preference (DIY, pro, or unsure). Based on that:
   - If they want to DIY: ask focused follow-up questions to diagnose the issue and help them fix it themselves. Provide tools, steps, and guidance.
   - If they want a pro: ask only the questions needed to understand the issue for matching (e.g. when did it start, how severe, any related symptoms). Do NOT ask for zip code, location, or budget — the app collects that separately. Move quickly toward a diagnosis.
   - If they're unsure: briefly explain both options and let them decide. Don't push either way.
3. Ask focused, specific follow-up questions ONE AT A TIME to narrow down the problem
4. If they upload an image, analyze it carefully and incorporate what you see into your diagnosis
5. After gathering enough information (usually 2-4 questions), provide your diagnosis
6. NEVER ask for zip code, location, address, or budget during the chat — the app handles that in a separate flow.

IMPORTANT - JOB SUMMARY:
After your FIRST follow-up question (i.e. once the homeowner has described their issue and you've responded with a question), include a <job_summary> block at the end of EVERY response. This is a running summary of what you know so far, used to match the homeowner with a Homie Pro if they want to skip ahead. Format:

<job_summary>
{
  "title": "Brief title of the issue",
  "category": "plumbing|electrical|hvac|appliance|structural|roofing|pest|landscaping|general",
  "description": "2-3 sentence summary of what's known so far about the issue",
  "severity_estimate": "low|medium|high|urgent|unknown",
  "details_gathered": ["detail 1", "detail 2"],
  "details_still_needed": ["what else would help"],
  "estimated_cost_pro": "$X-$Y"
}
</job_summary>

Do NOT include <job_summary> on your very first message (the greeting/first question). Only include it once the homeowner has described their issue.

DIAGNOSIS FORMAT:
When you have enough information to make a FULL diagnosis, respond with your diagnosis AND include a structured JSON block at the very end of your message wrapped in <diagnosis> tags like this:

<diagnosis>
{
  "issue": "Short title of the issue",
  "category": "plumbing|electrical|hvac|appliance|structural|roofing|pest|landscaping|general",
  "severity": "low|medium|high|urgent",
  "diy_feasible": true or false,
  "confidence": 0.0-1.0,
  "estimated_cost_diy": "$X-$Y",
  "estimated_cost_pro": "$X-$Y",
  "estimated_time_diy": "X hours/minutes",
  "tools_needed": ["tool1", "tool2"],
  "steps": ["step 1", "step 2", "step 3"],
  "safety_warnings": ["warning 1"],
  "when_to_call_pro": "Description of when this becomes a pro job"
}
</diagnosis>

When you provide a full <diagnosis>, you do NOT need to also include a <job_summary> — the diagnosis replaces it.

PROACTIVE MODEL SCAN — critical:
Once the homeowner has identified a SPECIFIC APPLIANCE, SYSTEM, or FIXTURE being discussed (a dishwasher, furnace, water heater, faucet, AC unit, etc.) AND the CONTEXT does not already list a BRAND + MODEL for that item, OFFER TO HAVE THEM SCAN THE MODEL-NUMBER LABEL. This is a one-time ask per item.

HOW TO DO IT:
1. In your NEXT conversational reply, include ONE line like: "If you can grab a quick photo of the model-number sticker (usually inside the door, on the back, or near the controls), I can pull up the exact specs, warranty, and any active recalls." Keep it casual and reassuring — "no worries if you can't find it."
2. In the SAME message, emit a machine-readable tag on its own line:
   <scan_request>{"itemType":"<snake_case_item_type>"}</scan_request>
   where itemType is one of: refrigerator, dishwasher, washer, dryer, oven, microwave, garbage_disposal, water_heater, furnace, hvac_ac_unit, heat_pump, thermostat, kitchen_faucet, bathroom_faucet, toilet, water_softener, pool_heater, pool_pump, hot_tub, garage_door_opener, irrigation_controller, generator, solar, ev_charger, sump_pump.
3. ONLY emit <scan_request> when:
   - The homeowner has explicitly mentioned a specific appliance/system/fixture class
   - AND brand OR model is missing from CONTEXT for that item
   - AND you haven't already asked for this item's label in the conversation
4. NEVER emit <scan_request> for ambiguous references ("the thing", "it's broken", "water is leaking"). The item class must be clear.
5. Once you emit <scan_request>, continue the conversation normally — don't block on the scan. The UI handles photo upload; whatever they scan (or skip) will come back to you as context.

HOMEOWNER COMFORT:
- If the homeowner says they're not comfortable doing a repair, don't feel handy, want someone else to handle it, or prefer a professional — NEVER suggest DIY from that point on
- If the homeowner says they "need help", "want help", "need someone", or similar phrasing that implies they want assistance — treat this as a preference for a professional. Do NOT suggest DIY. They're asking for help, not a tutorial.
- Once they've expressed a preference for a pro (explicitly or implicitly), set "diy_feasible" to false in the diagnosis and focus entirely on connecting them with a Homie Pro
- Don't try to convince them to DIY — respect their preference immediately and enthusiastically offer to match them with a pro
- This applies even if the repair is objectively simple — comfort level matters more than difficulty

RULES:
- Be conversational, warm, and reassuring — you're their Homie!
- Ask only ONE question at a time to keep the conversation flowing naturally
- Always consider safety first — if something involves gas, major electrical, structural, or could be dangerous, recommend a Homie Pro
- When analyzing images, describe specifically what you observe
- For DIY recommendations, be specific about tools, materials, and steps — but ONLY if the homeowner hasn't expressed discomfort with DIY
- For pro recommendations, explain WHY a professional is needed and that you'll connect them with a trusted Homie Pro
- Never diagnose without asking at least 1-2 clarifying questions first
- Keep responses concise but helpful — 2-4 sentences for questions, more detail for diagnoses
- Use **bold** for emphasis and keep paragraphs short`;

// ── POST /api/v1/diagnostic/upload-image ────────────────────────────────────
// Upload a diagnostic photo to Cloudinary so it persists and can be included
// in outreach SMS/MMS and email to providers.
router.post('/upload-image', async (req: Request, res: Response) => {
  const { image_data_url } = req.body as { image_data_url?: string };
  if (!image_data_url || typeof image_data_url !== 'string' || !image_data_url.startsWith('data:image/')) {
    res.status(400).json({ data: null, error: 'image_data_url is required (data:image/* format)', meta: {} });
    return;
  }
  try {
    const { uploadImage } = await import('../services/image-upload');
    const result = await uploadImage(image_data_url, 'homie/diagnostics');
    if (!result) {
      // Cloudinary not configured — return a null result so the frontend
      // can gracefully skip image persistence without breaking the chat flow
      res.json({ data: null, error: null, meta: { reason: 'image_storage_not_configured' } });
      return;
    }
    res.json({ data: result, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /diagnostic/upload-image]');
    res.status(500).json({ data: null, error: 'Image upload failed', meta: {} });
  }
});

// ── POST /api/v1/diagnostic/scan-model-label ──────────────────────────────
// Proactive model identification: when the AI asks the user to snap a
// photo of the appliance's model-number sticker, this endpoint is what
// the UI posts it to. Focused Claude Vision call — reads BRAND, MODEL,
// SERIAL from a label photo only, no room-detection / damage-analysis
// bloat. If the user is authenticated, the result is saved to their
// Home IQ inventory so the next chat already has the context.
//
// Returns null-safe fields (brand/modelNumber/serialNumber may be null
// if the label wasn't readable). Frontend falls through to manual entry
// in that case.
router.post('/scan-model-label', optionalAuth, async (req: Request, res: Response) => {
  const body = req.body as {
    imageDataUrl?: unknown;
    itemTypeHint?: unknown;
  };

  const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
  const itemTypeHint = typeof body.itemTypeHint === 'string' ? body.itemTypeHint.trim().toLowerCase() : '';

  if (!imageDataUrl || !imageDataUrl.startsWith('data:image/')) {
    res.status(400).json({ data: null, error: 'imageDataUrl (data:image/*) required', meta: null });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ data: null, error: 'Vision not configured', meta: null });
    return;
  }

  // Decode the data URL into { mimeType, base64 } for the Anthropic SDK.
  const match = imageDataUrl.match(/^data:(image\/[a-z0-9+.-]+);base64,(.*)$/i);
  if (!match) {
    res.status(400).json({ data: null, error: 'Could not decode imageDataUrl', meta: null });
    return;
  }
  const mimeType = match[1] as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  const imageBase64 = match[2];

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });

    const systemPrompt = `You are an appliance model-number reader. The user just took a photo of a rating plate / model sticker / manufacturer label on a home appliance, system, or fixture. Extract the identifying fields and return JSON ONLY.

FIELDS TO EXTRACT (all optional — return null for any you can't read cleanly):
- brand: manufacturer name printed on the label (e.g. "Samsung", "Rheem", "Kohler"). NEVER guess. If the photo is blurry or you cannot read the brand confidently, return null.
- modelNumber: the model / product number exactly as printed. Keep hyphens and case. No extra text.
- serialNumber: the serial number exactly as printed, if visible.
- manufactureDate: ISO date (YYYY-MM-DD or YYYY-MM) if a date of manufacture is printed. Some labels print "MFG DATE" or "DOM". Return null if not present — do not infer from serial number (the frontend handles that).
- labelText: a short (< 200 char) summary of the other fields you can read on the label (voltage, capacity, etc.). Useful for debugging.
- confidence: 0.0–1.0 — your confidence the brand + model were read correctly.

RULES:
- NEVER invent a brand or model. Blurry → null.
- If the photo is NOT a label / rating plate (random photo, a leak, a broken part), return everything null with confidence 0 and reason "not_a_label".

OUTPUT: JSON object only, no markdown, no preamble.`;

    const userText = itemTypeHint
      ? `This should be the label for a ${itemTypeHint}. Read it.`
      : 'Read this appliance label.';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: userText },
        ],
      }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    let raw = textBlock && textBlock.type === 'text' ? textBlock.text.trim() : '';
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch { /* fall through */ }
      }
    }

    const brand = typeof parsed.brand === 'string' && parsed.brand.trim().length >= 2 ? parsed.brand.trim() : null;
    const modelNumber = typeof parsed.modelNumber === 'string' && parsed.modelNumber.trim().length >= 2 ? parsed.modelNumber.trim() : null;
    const serialNumber = typeof parsed.serialNumber === 'string' && parsed.serialNumber.trim().length >= 3 ? parsed.serialNumber.trim() : null;
    const manufactureDate = typeof parsed.manufactureDate === 'string' ? parsed.manufactureDate.trim() : null;
    const confidence = typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    const labelText = typeof parsed.labelText === 'string' ? parsed.labelText.slice(0, 200) : null;

    // If the user is authenticated, save to their Home IQ so the next
    // chat already has it. Non-fatal — we still return the extracted data
    // even if the save fails.
    let savedItemId: string | null = null;
    if (req.homeownerId && brand && modelNumber && itemTypeHint) {
      try {
        const { propertyInventoryItems } = await import('../db/schema/property-scans');
        const inserted = await db.insert(propertyInventoryItems).values({
          homeownerId: req.homeownerId,
          propertyId: null,
          roomId: null,
          scanId: null,
          category: guessCategory(itemTypeHint),
          itemType: itemTypeHint,
          brand,
          modelNumber,
          serialNumber,
          identificationMethod: 'label_ocr',
          confidenceScore: confidence.toFixed(2),
          status: 'ai_identified',
        }).returning({ id: propertyInventoryItems.id });
        savedItemId = inserted[0]?.id ?? null;
      } catch (err) {
        logger.warn({ err, homeownerId: req.homeownerId }, '[diagnostic] Failed to save scanned label to inventory');
      }
    }

    logger.info({
      homeownerId: req.homeownerId ?? null,
      itemTypeHint,
      brand, modelNumber, confidence, savedItemId,
    }, '[diagnostic] Scanned model label');

    res.json({
      data: {
        brand, modelNumber, serialNumber, manufactureDate,
        confidence, labelText, itemType: itemTypeHint || null,
        savedToHomeIQ: !!savedItemId,
        inventoryItemId: savedItemId,
      },
      error: null, meta: null,
    });
  } catch (err) {
    logger.error({ err }, '[diagnostic] scan-model-label failed');
    res.status(500).json({ data: null, error: 'Scan failed', meta: null });
  }
});

/** Map an itemType hint to the closest propertyInventoryItems.category
 *  value. Keeps the saved row aligned with the enum so Home IQ dedupe +
 *  rendering work correctly. */
function guessCategory(itemType: string): 'appliance' | 'fixture' | 'system' | 'safety' | 'amenity' | 'infrastructure' {
  const t = itemType.toLowerCase();
  if (/(fridge|refrig|washer|dryer|dishwash|oven|range|microwave|disposal)/.test(t)) return 'appliance';
  if (/(faucet|sink|toilet|shower|tub)/.test(t)) return 'fixture';
  if (/(alarm|camera|doorbell|smoke|detector)/.test(t)) return 'safety';
  if (/(pool|spa|hot.?tub)/.test(t)) return 'amenity';
  if (/(hvac|water.?heater|thermostat|furnace|ac|heat.?pump|boiler|mini.?split|softener|generator|solar|ev.?charger|irrigation|garage.?door)/.test(t)) return 'system';
  return 'system';
}

// ── POST /api/v1/diagnostic/chat ────────────────────────────────────────────

router.post('/chat', async (req: Request, res: Response) => {
  const body = req.body as ChatBody;

  if (!body.message || typeof body.message !== 'string' || !body.message.trim()) {
    const out: ApiResponse<null> = { data: null, error: 'message is required', meta: {} };
    res.status(400).json(out);
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const out: ApiResponse<null> = { data: null, error: 'Diagnostic service is not configured', meta: {} };
    res.status(503).json(out);
    return;
  }

  // Build message history for multi-turn conversation
  const messages: Anthropic.MessageParam[] = [];

  if (Array.isArray(body.history)) {
    for (const msg of body.history) {
      const m = msg as HistoryMessage;
      if (m.role === 'user' || m.role === 'assistant') {
        messages.push({ role: m.role, content: m.content });
      }
    }
  }

  // Build the current user message content
  const content: Anthropic.ContentBlockParam[] = [];

  if (Array.isArray(body.images)) {
    for (const img of body.images) {
      if (typeof img === 'string' && img.startsWith('data:image/')) {
        const match = img.match(/^data:(image\/\w+);base64,(.+)$/);
        if (match) {
          content.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: match[2],
            },
          });
        }
      }
    }
  }

  content.push({ type: 'text', text: body.message.trim() });
  messages.push({ role: 'user', content });

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Enrich the system prompt with the homeowner's equipment context if available.
  // This gives Homie knowledge about the specific appliances, systems, and fixtures
  // in the home so it can reference brands, models, and ages during diagnosis.
  let systemPrompt = SYSTEM_PROMPT;
  try {
    if (req.homeownerId) {
      const [ho] = await db
        .select({ homeDetails: homeowners.homeDetails })
        .from(homeowners)
        .where(eq(homeowners.id, req.homeownerId))
        .limit(1);
      const details = ho?.homeDetails as Record<string, unknown> | null;
      if (details && Object.keys(details).length > 0) {
        // Build a compact summary from the structured details
        const lines: string[] = [];
        for (const [section, fields] of Object.entries(details)) {
          if (!fields || typeof fields !== 'object') continue;
          const entries = Object.entries(fields as Record<string, unknown>)
            .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false)
            .map(([k, v]) => {
              if (typeof v === 'object') {
                // Nested appliance objects like { brand: "Samsung", model: "RF28..." }
                const sub = Object.entries(v as Record<string, string>).filter(([, sv]) => sv).map(([sk, sv]) => `${sk}: ${sv}`).join(', ');
                return sub ? `${k} (${sub})` : null;
              }
              return `${k}: ${v}`;
            })
            .filter(Boolean);
          if (entries.length > 0) {
            lines.push(`${section}: ${entries.join('; ')}`);
          }
        }
        if (lines.length > 0) {
          systemPrompt = `HOME EQUIPMENT PROFILE:\n${lines.join('\n')}\n\nUse this equipment profile when discussing issues — refer to specific brands, models, and ages. Don't ask the homeowner to identify equipment already listed above.\n\n${systemPrompt}`;
        }
      }

      // Also check scan inventory for more detailed info (brands, ages, conditions)
      const invItems = await db
        .select()
        .from(propertyInventoryItems)
        .where(eq(propertyInventoryItems.homeownerId, req.homeownerId));
      if (invItems.length > 0) {
        const itemLines = invItems
          .filter(i => i.status !== 'pm_dismissed')
          .slice(0, 20) // limit context size
          .map(i => {
            const parts: string[] = [];
            if (i.brand) parts.push(i.brand);
            if (i.modelNumber) parts.push(i.modelNumber);
            parts.push(i.itemType.replace(/_/g, ' '));
            if (i.estimatedAgeYears) parts.push(`${i.estimatedAgeYears}yr`);
            if (i.condition && i.condition !== 'good') parts.push(i.condition);
            return `- ${parts.join(' ')}`;
          });
        if (itemLines.length > 0) {
          systemPrompt = `KNOWN HOME INVENTORY (from AI scan):\n${itemLines.join('\n')}\n\n${systemPrompt}`;
        }
      }
    }
  } catch (err) {
    logger.warn({ err }, '[diagnostic/chat] Failed to load home equipment context');
  }

  try {
    const client = new Anthropic({ apiKey });

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    for await (const event of stream) {
      if (req.socket.destroyed) break;

      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        res.write(`data: ${JSON.stringify({ token: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    logger.error({ err }, '[POST /diagnostic/chat]');

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'Stream interrupted' })}\n\n`);
      res.end();
    } else {
      const out: ApiResponse<null> = { data: null, error: 'Diagnostic service error', meta: {} };
      res.status(500).json(out);
    }
  }
});

export default router;
