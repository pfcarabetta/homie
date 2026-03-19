import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { buildJobStatus } from '../routes/jobs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLL_INTERVAL_MS = 3_000;
const TERMINAL_STATUSES = new Set(['completed', 'expired', 'refunded']);

async function push(ws: WebSocket, jobId: string): Promise<void> {
  try {
    const status = await buildJobStatus(jobId);
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(status ?? { error: 'Job not found' }));
  } catch {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ error: 'Failed to fetch job status' }));
    }
  }
}

export function handleJobsWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url ?? '';
    const match = /^\/ws\/jobs\/([^/?]+)/.exec(url);
    const jobId = match?.[1];

    if (!jobId || !UUID_RE.test(jobId)) {
      ws.close(1008, 'Invalid job ID');
      return;
    }

    // Send initial state immediately
    void push(ws, jobId);

    const interval = setInterval(async () => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(interval);
        return;
      }
      const status = await buildJobStatus(jobId);
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify(status ?? { error: 'Job not found' }));

      // Stop polling once the job reaches a terminal state
      if (status && TERMINAL_STATUSES.has(status.status)) {
        clearInterval(interval);
        ws.close(1000, 'Job completed');
      }
    }, POLL_INTERVAL_MS);

    ws.on('close', () => clearInterval(interval));
    ws.on('error', () => clearInterval(interval));
  });
}
