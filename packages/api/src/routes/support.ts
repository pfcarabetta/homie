import { Router, Request, Response } from 'express';
import logger from '../logger';
import { db } from '../db';
import { supportTickets } from '../db/schema/support-tickets';
import { sendEmail } from '../services/notifications';
import { getKnowledgeBasePrompt } from '../services/support-kb';

const router = Router();

const ALLOWED_PRODUCTS = new Set(['homie', 'inspect', 'business']);
const SUPPORT_TO_EMAIL = 'yo@homiepro.ai';

// ───────────────────────────────────────────────────────────────────────────
// POST /api/v1/support/contact
// ───────────────────────────────────────────────────────────────────────────
//
// Stores the contact submission in support_tickets and emails yo@homiepro.ai
// with a one-click reply ready to go. Public endpoint — auth optional. If
// the user IS authenticated, we attach their homeowner_id for context.
//
// Field validation kept defensive — this is public-facing.
router.post('/contact', async (req: Request, res: Response) => {
  const body = req.body as {
    product?: string;
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
    current_url?: string;
  };

  const product = typeof body.product === 'string' ? body.product.toLowerCase() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : null;
  const currentUrl = typeof body.current_url === 'string' ? body.current_url.slice(0, 500) : null;

  if (!ALLOWED_PRODUCTS.has(product)) {
    res.status(400).json({ data: null, error: 'Invalid product. Pick homie, inspect, or business.', meta: {} });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ data: null, error: 'A valid email is required.', meta: {} });
    return;
  }
  if (!subject || subject.length < 2) {
    res.status(400).json({ data: null, error: 'Subject is required.', meta: {} });
    return;
  }
  if (!message || message.length < 10) {
    res.status(400).json({ data: null, error: 'Please write at least a sentence so we can help.', meta: {} });
    return;
  }
  if (subject.length > 200 || message.length > 5000) {
    res.status(400).json({ data: null, error: 'Subject ≤ 200 chars, message ≤ 5000.', meta: {} });
    return;
  }

  // Auth-derived context (best-effort — middleware sets these when present)
  const homeownerId = (req as Request & { homeownerId?: string }).homeownerId ?? null;

  try {
    const [inserted] = await db.insert(supportTickets).values({
      product,
      name,
      email,
      subject,
      message,
      currentUrl,
      homeownerId,
      status: 'open',
    }).returning();

    // Send the email — best-effort; if SendGrid is misconfigured the row is
    // still saved and we can backfill from the DB.
    void (async () => {
      const productLabel = product === 'homie' ? 'Homie (consumer)' : product === 'inspect' ? 'Homie Inspect' : 'Homie Business';
      const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <h2 style="color:#2D2926;margin-bottom:6px">New support request</h2>
  <p style="color:#6B6560;margin-top:0;font-size:13px">Ticket ID: ${inserted.id}</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:6px 10px;color:#6B6560;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;width:120px">Product</td><td style="padding:6px 10px">${productLabel}</td></tr>
    <tr><td style="padding:6px 10px;color:#6B6560;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">From</td><td style="padding:6px 10px"><b>${escapeHtml(name || 'Anonymous')}</b> &lt;${escapeHtml(email)}&gt;</td></tr>
    ${currentUrl ? `<tr><td style="padding:6px 10px;color:#6B6560;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Page</td><td style="padding:6px 10px"><a href="${escapeHtml(currentUrl)}">${escapeHtml(currentUrl)}</a></td></tr>` : ''}
    ${homeownerId ? `<tr><td style="padding:6px 10px;color:#6B6560;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">User ID</td><td style="padding:6px 10px;font-family:monospace;font-size:12px">${homeownerId}</td></tr>` : ''}
  </table>
  <h3 style="color:#2D2926;margin-bottom:6px">${escapeHtml(subject)}</h3>
  <div style="white-space:pre-wrap;color:#2D2926;line-height:1.6;background:#F9F5F2;padding:14px 18px;border-radius:8px;border-left:3px solid #E8632B">${escapeHtml(message)}</div>
  <p style="color:#9B9490;font-size:12px;margin-top:24px">Reply directly to ${escapeHtml(email)} to respond.</p>
</div>`;
      try {
        await sendEmail(SUPPORT_TO_EMAIL, `[${productLabel}] ${subject}`, html, {
          replyTo: email,
        });
      } catch (err) {
        logger.error({ err, ticketId: inserted.id }, '[support/contact] Email failed (ticket still stored)');
      }
    })();

    res.json({ data: { id: inserted.id, ok: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /support/contact]');
    res.status(500).json({ data: null, error: 'Failed to submit. Please try again or email yo@homiepro.ai directly.', meta: {} });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/v1/support/chat — SSE streaming
// ───────────────────────────────────────────────────────────────────────────
//
// Streams a Claude response grounded in the support knowledge base. The
// KB is included in the system prompt with prompt caching, so each new
// chat pays full cost only on the first call within the 5-minute cache
// window — subsequent chats pay ~10% of input cost on the cached
// portion. Public endpoint — auth optional.
router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  const body = req.body as {
    messages?: Array<{ role?: string; content?: string }>;
    surface?: string;
    product?: string | null;
  };

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    res.status(400).json({ data: null, error: 'messages required' });
    return;
  }
  // Defensive trim — last message must be from user
  const cleaned = messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: (m.content as string).slice(0, 4000) }));
  if (cleaned.length === 0 || cleaned[cleaned.length - 1].role !== 'user') {
    res.status(400).json({ data: null, error: 'Last message must be from user.' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ data: null, error: 'AI not configured.' });
    return;
  }

  // Surface + product hints (light grounding context, NOT cached)
  const surface = typeof body.surface === 'string' ? body.surface : 'support';
  const product = typeof body.product === 'string' ? body.product : null;

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering
  res.flushHeaders?.();

  const sendEvent = (data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const anthropic = new Anthropic({ apiKey });

    const kb = await getKnowledgeBasePrompt();

    const systemPrompt = [
      // Cached: stable instructions + the entire KB. Prompt caching key.
      {
        type: 'text' as const,
        text: `You are Homie's support AI. You help users with three products: Homie (consumer quotes for home repairs), Homie Inspect (AI-parsed inspection reports for home buyers/sellers), and Homie Business (property management for PMs and short-term rental hosts).

Voice & style:
- Warm, direct, slightly enthusiastic. Talk like an inspector friend giving advice, not like a manual.
- Concrete examples beat abstractions. Specific numbers beat ranges.
- Concise — 1–4 short paragraphs is usually the sweet spot.
- Use markdown lightly: bold for emphasis, bullets for lists, no heavy formatting.

Grounding rules:
- Answer ONLY from the knowledge base below. If the answer isn't there, say so honestly and suggest emailing yo@homiepro.ai.
- When you reference a feature, mention which product + which tab when applicable ("In the Negotiations tab on Homie Inspect...").
- Never invent prices, features, or capabilities. If pricing is uncertain, point at the relevant article.
- If the user describes an active emergency (gas, flooding, safety hazard), tell them to call a pro immediately and hand off — don't try to walk them through the fix.

When helpful, point to a specific article using its slug — e.g. "see our [Building a repair request](inspect/building-a-repair-request) article for the step-by-step." The chat UI doesn't auto-link these but the user knows what to search.

Knowledge base:

${kb}`,
        cache_control: { type: 'ephemeral' as const },
      },
      // Not cached: per-request context (surface, product hint)
      {
        type: 'text' as const,
        text: `Current context: surface=${surface}${product ? `, product=${product}` : ''}. The user is on the ${surface === 'inspect-portal' ? 'Homie Inspect homeowner portal' : surface === 'business' ? 'Homie Business workspace' : 'public Homie support page'}.`,
      },
    ];

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: systemPrompt,
      messages: cleaned,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        sendEvent({ token: event.delta.text });
      }
    }

    sendEvent({ done: true });
    res.end();
  } catch (err) {
    logger.error({ err }, '[POST /support/chat]');
    try {
      sendEvent({ error: 'Chat failed. Try again or email yo@homiepro.ai.' });
      res.end();
    } catch {
      // already closed
    }
  }
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export default router;
