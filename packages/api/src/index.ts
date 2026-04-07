import { initSentry } from './sentry';
initSentry();

import { validateEnv } from './env';

// Validate env vars before importing modules that use them
validateEnv();

import path from 'path';
import http from 'http';
import logger from './logger';
import { WebSocketServer } from 'ws';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db';
import app from './app';
import { handleJobsWebSocket } from './ws/jobs';
import { startJobExpiryWorker } from './services/job-expiry';

const PORT = process.env.PORT ?? 3001;

async function start() {
  // Run pending database migrations
  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, 'db/migrations') });
    logger.info('Database migrations applied');
  } catch (err) {
    logger.error({ err }, 'Failed to run database migrations');
    process.exit(1);
  }

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
}

start();

export default app;
