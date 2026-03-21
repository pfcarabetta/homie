import { validateEnv } from './env';

// Validate env vars before importing modules that use them
validateEnv();

import http from 'http';
import logger from './logger';
import { WebSocketServer } from 'ws';
import app from './app';
import { handleJobsWebSocket } from './ws/jobs';
import { startJobExpiryWorker } from './services/job-expiry';

const PORT = process.env.PORT ?? 3001;

const server = http.createServer(app);

const wss = new WebSocketServer({ noServer: true });
handleJobsWebSocket(wss);

server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/ws/jobs/')) {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  logger.info(`API server running on http://localhost:${PORT}`);
  startJobExpiryWorker();
});

export default app;
