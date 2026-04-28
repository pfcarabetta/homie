import { Router } from 'express';
import { getAudio } from '../services/audio-cache';

const router = Router();

/**
 * Public audio endpoint that serves MP3 buffers cached by audio-cache.ts.
 * Twilio fetches these via the `<Play>` verb during outreach calls. The
 * URL itself is the secret — IDs are random UUIDs minted at put time, so
 * no auth is required (and Twilio can't authenticate to us anyway).
 */
router.get('/:id.mp3', (req, res) => {
  const entry = getAudio(req.params.id);
  if (!entry) {
    res.status(404).end();
    return;
  }
  res.setHeader('Content-Type', entry.contentType);
  res.setHeader('Content-Length', entry.buffer.length.toString());
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(entry.buffer);
});

export default router;
