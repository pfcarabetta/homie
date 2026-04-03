import Anthropic from '@anthropic-ai/sdk';
import logger from '../../logger';

interface ConversationState {
  messages: { role: 'user' | 'assistant'; content: string }[];
  phase: 'intro' | 'interest' | 'quote' | 'availability' | 'notes' | 'done';
  accepted: boolean;
  quotedPrice: string | null;
  availability: string | null;
  notes: string | null;
}

// In-memory conversation state per attempt (TTL: 10 minutes)
const conversations = new Map<string, { state: ConversationState; expiresAt: number }>();
const TTL_MS = 10 * 60 * 1000;

// Cleanup expired conversations every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of conversations) {
    if (now > entry.expiresAt) conversations.delete(key);
  }
}, 5 * 60 * 1000);

export function getConversation(attemptId: string): ConversationState | null {
  const entry = conversations.get(attemptId);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.state;
}

function saveConversation(attemptId: string, state: ConversationState): void {
  conversations.set(attemptId, { state, expiresAt: Date.now() + TTL_MS });
}

export function initConversation(attemptId: string, jobScript: string): ConversationState {
  const state: ConversationState = {
    messages: [{ role: 'assistant', content: jobScript }],
    phase: 'interest',
    accepted: false,
    quotedPrice: null,
    availability: null,
    notes: null,
  };
  saveConversation(attemptId, state);
  return state;
}

const SYSTEM_PROMPT = `You are Homie's AI calling agent, making outreach calls to service providers about job opportunities. You are having a phone conversation.

ABOUT HOMIE:
- Homie is an AI-powered home services platform that connects homeowners with local service providers
- Homie's AI agent finds and contacts providers on behalf of homeowners who need help
- Providers receive job opportunities matched to their skills and location
- There is NO fee for providers — Homie is completely free for pros and service providers
- Homeowner referrals are free of charge to providers
- Providers are never charged for receiving job leads, accepting jobs, or using the platform
- The homeowner pays the provider directly — Homie does not handle any payments between homeowner and provider
- The provider keeps 100% of what they charge with no middleman
- Homie finds providers through public listings like Google Maps and reaches out with relevant jobs in their area

RULES:
- Be professional, friendly, and brief — this is a phone call
- Keep responses to 1-2 sentences max
- Never make up information about the job — only share what was in the initial script
- If asked about fees or costs for providers, make it clear that Homie is 100% free for providers
- If asked what Homie is, briefly explain (1 sentence) then redirect to the job opportunity
- If asked how Homie found them, explain we found them through their public business listing
- Your goal is to determine if the provider is interested, and if so, collect their price estimate, availability, and any notes

CONVERSATION FLOW:
1. You already introduced the job opportunity (the initial script was read). Now determine if they're interested.
2. If they seem interested or say yes: ask for their estimated price for this job
3. After getting a price: ask when they're available
4. After getting availability: ask if they have any additional notes or questions for the homeowner
5. After notes (or if they say none): thank them and confirm you'll pass their info along

If they decline or aren't interested, thank them politely and say goodbye.

When the conversation is DONE (after collecting notes or after a decline), mention that they can manage their Homie jobs anytime at homiepro.ai/portal

IMPORTANT: You must respond with ONLY what you would SAY on the phone. No actions, descriptions, or stage directions. Just the spoken words.

If a provider's response seems garbled, unclear, or doesn't make sense in context, politely ask them to repeat. For the notes phase, if they seem to be saying "no" or declining to add notes, just confirm and wrap up.

When collecting a price, note context like "service call and diagnosis" vs "full repair" — include that context when confirming back to them.`;

export async function processProviderSpeech(
  attemptId: string,
  providerSpeech: string,
  jobContext?: string,
): Promise<{ response: string; state: ConversationState }> {
  let conv = getConversation(attemptId);
  if (!conv) {
    // Auto-initialize if no state exists (e.g. server restarted or state expired)
    conv = initConversation(attemptId, jobContext ?? 'We called about a home service job opportunity.');
  }

  conv.messages.push({ role: 'user', content: providerSpeech });

  // Detect IVR / automated phone system / voicemail
  const speechLower = providerSpeech.toLowerCase();
  const ivrIndicators = [
    'press 1', 'press 2', 'press 3', 'press 4', 'press 5',
    'press one', 'press two', 'press three',
    'for english', 'for spanish', 'para español',
    'leave a message', 'leave your message', 'after the beep', 'after the tone',
    'mailbox is full', 'voicemail', 'not available',
    'our office hours', 'office is currently closed',
    'please hold', 'your call is important',
    'dial by name', 'extension', 'menu',
    'thanks for calling', 'thank you for calling',
    'if you know your party', 'if you are a',
  ];
  if (ivrIndicators.some(phrase => speechLower.includes(phrase))) {
    conv.phase = 'done';
    conv.accepted = false;
    logger.info(`[voice-conversation] Detected IVR/voicemail for attempt ${attemptId}`);
    const response = "It seems I've reached an automated system. We'll try to reach you through another channel. Goodbye.";
    conv.messages.push({ role: 'assistant', content: response });
    saveConversation(attemptId, conv);
    return { response, state: conv };
  }

  // Check for decline intent
  const lower = providerSpeech.toLowerCase();
  const declineWords = ['no', 'not interested', 'busy', 'pass', 'decline', 'can\'t', 'cannot', 'nope'];
  if (conv.phase === 'interest' && declineWords.some(w => lower.includes(w))) {
    conv.phase = 'done';
    conv.accepted = false;
    const response = "No problem at all. Thank you for your time, and we'll keep you in mind for future opportunities. Have a great day!";
    conv.messages.push({ role: 'assistant', content: response });
    saveConversation(attemptId, conv);
    return { response, state: conv };
  }

  // Extract structured data from speech based on phase
  const acceptWords = ['yes', 'yeah', 'yep', 'sure', 'interested', 'absolutely', 'definitely', 'ok', 'okay', 'i can', 'i could', 'sign me up'];
  const questionIndicators = ['what', 'who', 'how', 'why', 'where', 'when', 'is there', 'do i', 'can i', 'tell me', '?'];
  const isQuestion = questionIndicators.some(q => lower.includes(q));
  const isAccept = acceptWords.some(w => lower.includes(w));

  // Detect garbled/nonsensical speech (very short with no real words, or carrier messages)
  const garbledIndicators = ['powered by t-mobile', 'powered by verizon', 'powered by at&t', 'bds powered'];
  const isGarbled = garbledIndicators.some(g => lower.includes(g)) ||
    (providerSpeech.length < 4 && !/\b(yes|no|ok|yep|nah|nope)\b/i.test(providerSpeech));

  // Price detection: $ prefix or standalone number that looks like a price
  const hasPrice = /\$\d/.test(providerSpeech) || /(?:^|\s)(\d{2,5})(?:\s*(?:dollars?|bucks?|per|flat|total|each)|\s*[.,]?\s*$)/i.test(providerSpeech);

  if (conv.phase === 'interest') {
    if (isAccept && !isQuestion) {
      conv.accepted = true;
      conv.phase = 'quote';
    }
  } else if (conv.phase === 'quote') {
    if (hasPrice && !isQuestion) {
      conv.quotedPrice = providerSpeech;
      conv.phase = 'availability';
    }
  } else if (conv.phase === 'availability') {
    if (!isGarbled) {
      conv.availability = providerSpeech;
      conv.phase = 'notes';
    }
  } else if (conv.phase === 'notes') {
    if (isGarbled) {
      // Skip garbled speech — don't store it, stay in notes phase for one more try
      conv.notes = null;
      conv.phase = 'done';
    } else {
      const skipWords = ['no', 'none', 'nope', 'nothing', 'n a', 'that is all', "that's all", "that's it", 'nah'];
      conv.notes = skipWords.some(w => lower === w || lower.startsWith(w + ' ') || lower.startsWith(w + '.')) ? null : providerSpeech;
      conv.phase = 'done';
    }
  }

  try {
    const client = new Anthropic();
    const result = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      system: SYSTEM_PROMPT + `\n\nCurrent phase: ${conv.phase}. ${conv.phase === 'done' ? 'Wrap up the call with a thank you and goodbye.' : ''}`,
      messages: conv.messages.map(m => ({ role: m.role, content: m.content })),
    });

    const response = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join(' ')
      .trim();

    conv.messages.push({ role: 'assistant', content: response });
    saveConversation(attemptId, conv);

    return { response, state: conv };
  } catch (err) {
    logger.error({ err }, '[voice-conversation] Claude error');
    // Fallback based on phase
    let response: string;
    switch (conv.phase) {
      case 'quote': response = "Great, you're interested! What would you estimate for this job?"; break;
      case 'availability': response = "Got it. When would you be available to do this work?"; break;
      case 'notes': response = "Thanks! Any other notes or questions for the homeowner?"; break;
      case 'done': response = "Thank you so much! We'll pass your information along to the homeowner. Have a great day!"; break;
      default: response = "Thank you for your time. Goodbye!";
    }
    conv.messages.push({ role: 'assistant', content: response });
    saveConversation(attemptId, conv);
    return { response, state: conv };
  }
}
