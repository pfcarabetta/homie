import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { ApiResponse } from '../types/api';

const router = Router();

interface ChatBody {
  session_id?: unknown;
  message?: unknown;
  images?: unknown;
}

const SYSTEM_PROMPT = `You are Homie, a friendly and knowledgeable AI home maintenance assistant. Your job is to help homeowners diagnose issues with their home, explain what's going on in plain language, and help them decide whether to fix it themselves or hire a professional.

When you have enough information to make a diagnosis, include it in your response using this exact XML format:

<diagnosis>
{
  "category": "plumbing|electrical|hvac|roofing|landscaping|painting|flooring|handyman|pest_control|cleaning",
  "severity": "low|medium|high|emergency",
  "summary": "A clear 2-3 sentence explanation of the issue",
  "recommendedActions": ["Step 1", "Step 2", "..."],
  "estimatedCost": {"min": 100, "max": 300}
}
</diagnosis>

After the diagnosis, also include a job summary:

<job_summary>
{
  "title": "Short title for the issue",
  "category": "same as diagnosis category",
  "severity": "same as diagnosis severity",
  "estimatedCost": {"min": 100, "max": 300}
}
</job_summary>

Guidelines:
- Be warm, conversational, and reassuring — homeowners are often stressed
- Ask clarifying questions if the description is vague (e.g., "Where exactly is the leak?", "When did it start?")
- Don't diagnose until you have enough detail — it's OK to ask 1-2 follow-up questions first
- When you do diagnose, be specific about likely causes
- Always mention both DIY and professional options
- Use **bold** for emphasis and keep paragraphs short
- Never invent prices — use reasonable ranges based on the issue type`;

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

  // Build the user message content
  const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

  // Add images if provided
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

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    const client = new Anthropic({ apiKey });

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
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
    console.error('[POST /diagnostic/chat]', err);

    // If headers already sent (mid-stream), send error in SSE format
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
