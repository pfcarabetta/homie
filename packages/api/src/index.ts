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
import { startReservationSync } from './services/reservation-sync';
import type { JwtPayload } from './middleware/auth';

const PORT = process.env.PORT ?? 3001;

async function start() {
  // Run pending database migrations
  // Migrations 0000-0014 were applied via drizzle-kit CLI before programmatic migrate() was added.
  // The drizzle journal may not track them, so we fall back to running SQL with IF NOT EXISTS.
  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, 'db/migrations') });
    logger.info('Database migrations applied');
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr.code === '42P07' || pgErr.code === '42P06') {
      logger.warn('Some migrations already applied — running with IF NOT EXISTS fallback');
      try {
        const fs = await import('fs');
        const { sql } = await import('drizzle-orm');
        const migrationsDir = path.join(__dirname, 'db/migrations');
        const files = fs.readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql')).sort();
        for (const file of files) {
          const raw = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
          const safeSql = raw
            .replace(/CREATE TABLE(?! IF NOT EXISTS)/g, 'CREATE TABLE IF NOT EXISTS')
            .replace(/CREATE UNIQUE INDEX(?! IF NOT EXISTS)/g, 'CREATE UNIQUE INDEX IF NOT EXISTS')
            .replace(/CREATE INDEX(?! IF NOT EXISTS)/g, 'CREATE INDEX IF NOT EXISTS');
          const statements = safeSql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
          for (const stmt of statements) {
            try {
              await db.execute(sql.raw(stmt));
            } catch (stmtErr: unknown) {
              const sc = (stmtErr as { code?: string }).code;
              if (sc === '42P07' || sc === '42P06' || sc === '42710') continue;
              logger.warn({ err: stmtErr, file }, 'Migration statement failed (non-fatal)');
            }
          }
        }
        logger.info('Fallback migrations completed');
      } catch (fallbackErr) {
        logger.error({ err: fallbackErr }, 'Fallback migration failed');
      }
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
    startReservationSync();
  });
}

start();

export default app;
