import { initSentry } from './sentry';
initSentry();

import { validateEnv } from './env';

// Validate env vars before importing modules that use them
validateEnv();

import path from 'path';
import url from 'url';
import http from 'http';
import jwt from 'jsonwebtoken';
import logger from './logger';
import { WebSocketServer } from 'ws';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './db';
import app from './app';
import { handleJobsWebSocket } from './ws/jobs';
import { startJobExpiryWorker } from './services/job-expiry';
import type { JwtPayload } from './middleware/auth';

const PORT = process.env.PORT ?? 3001;

async function start() {
  // Run pending database migrations
  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, 'db/migrations') });
    logger.info('Database migrations applied');
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '42P07' || pgErr.code === '42P06') {
      // "already exists" — safe to ignore (migrations previously applied outside Drizzle tracker)
      logger.warn({ err }, 'Migration skipped (relations already exist)');
    } else {
      logger.error({ err }, 'Failed to run database migrations');
      process.exit(1);
    }
  }

  const server = http.createServer(app);

  const wss = new WebSocketServer({ noServer: true });
  handleJobsWebSocket(wss);

  server.on('upgrade', (req, socket, head) => {
    if (!req.url?.startsWith('/ws/jobs/')) {
      socket.destroy();
      return;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET is not set — rejecting WebSocket upgrade');
      socket.destroy();
      return;
    }

    const parsed = url.parse(req.url, true);
    const token = parsed.query.token;

    if (!token || typeof token !== 'string') {
      logger.warn('WebSocket upgrade rejected: missing token');
      socket.destroy();
      return;
    }

    try {
      jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload;
    } catch {
      logger.warn('WebSocket upgrade rejected: invalid or expired token');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  server.listen(PORT, () => {
    logger.info(`API server running on http://localhost:${PORT}`);
    startJobExpiryWorker();
  });
}

start();

export default app;
