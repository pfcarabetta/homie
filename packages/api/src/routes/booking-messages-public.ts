import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { bookingMessages } from '../db/schema/booking-messages';
import logger from '../logger';

export const bookingMessagesPublicRouter = Router();

// Public photo serving endpoint — Twilio MMS fetches this URL to attach the
// image to the outgoing message, so it must not require auth.
// The booking_messages.id is a UUID, which is effectively unguessable.
bookingMessagesPublicRouter.get('/:msgId/photo', async (req: Request, res: Response) => {
  const { msgId } = req.params;

  // Basic UUID format check to avoid leaking errors for invalid IDs
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(msgId)) {
    res.status(404).send('Not found');
    return;
  }

  try {
    const [msg] = await db
      .select({ photoUrl: bookingMessages.photoUrl })
      .from(bookingMessages)
      .where(eq(bookingMessages.id, msgId))
      .limit(1);

    if (!msg || !msg.photoUrl) {
      res.status(404).send('Not found');
      return;
    }

    // Expect a data URL like "data:image/jpeg;base64,/9j/4AAQ..."
    const match = msg.photoUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      // Not a data URL — might be an external URL. Redirect.
      if (/^https?:\/\//.test(msg.photoUrl)) {
        res.redirect(msg.photoUrl);
        return;
      }
      res.status(415).send('Unsupported photo format');
      return;
    }

    const mimeType = match[1];
    const buffer = Buffer.from(match[2], 'base64');

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', buffer.length.toString());
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(buffer);
  } catch (err) {
    logger.error({ err, msgId }, '[booking-messages public] photo fetch failed');
    res.status(500).send('Server error');
  }
});
