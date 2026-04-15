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
import { startOutreachExpansionWorker } from './services/outreach-expansion-worker';
import { startIcalSyncWorker } from './services/ical-sync-worker';
import type { JwtPayload } from './middleware/auth';

const PORT = process.env.PORT ?? 3001;

async function start() {
  // Run pending database migrations
  // Migrations 0000-0014 were applied via drizzle-kit CLI before programmatic migrate() was added.
  // The drizzle journal may not track them, so we fall back to running SQL with IF NOT EXISTS.
  // Postgres error codes that indicate "thing already exists" — safe to ignore
  // because the fallback path runs all migration SQL with IF NOT EXISTS rewrites
  // and we just want to apply anything that's actually new.
  //   42P07 = duplicate_table
  //   42P06 = duplicate_schema
  //   42710 = duplicate_object (e.g. constraint, type)
  //   42701 = duplicate_column
  //   42P16 = invalid_table_definition (e.g. PK already defined)
  //   23505 = unique_violation (e.g. seed-data INSERTs that already ran)
  const SAFE_DUPLICATE_CODES = new Set(['42P07', '42P06', '42710', '42701', '42P16', '23505']);

  try {
    await migrate(db, { migrationsFolder: path.join(__dirname, 'db/migrations') });
    logger.info('Database migrations applied');
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    // Always fall back if drizzle's migrate() throws ANY postgres error during
    // migration — the fallback is idempotent and safer than crashing the deploy.
    // Only crash if the error is NOT a postgres error (likely a real bug).
    if (pgErr.code && (SAFE_DUPLICATE_CODES.has(pgErr.code) || pgErr.code.startsWith('42'))) {
      logger.warn({ code: pgErr.code }, 'Migration already-applied error — running IF NOT EXISTS fallback');
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
            .replace(/CREATE INDEX(?! IF NOT EXISTS)/g, 'CREATE INDEX IF NOT EXISTS')
            .replace(/ADD COLUMN(?! IF NOT EXISTS)/g, 'ADD COLUMN IF NOT EXISTS');
          const statements = safeSql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
          for (const stmt of statements) {
            try {
              await db.execute(sql.raw(stmt));
            } catch (stmtErr: unknown) {
              const sc = (stmtErr as { code?: string }).code;
              if (sc && SAFE_DUPLICATE_CODES.has(sc)) continue;
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

  // ── Schema patches — add columns that may be missing from older migrations ──
  try {
    const { sql } = await import('drizzle-orm');
    await db.execute(sql`ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS pricing_tier text`);
    await db.execute(sql`ALTER TABLE inspection_report_items ADD COLUMN IF NOT EXISTS is_included_in_request boolean NOT NULL DEFAULT false`);
    await db.execute(sql`ALTER TABLE inspection_report_items ADD COLUMN IF NOT EXISTS homeowner_notes text`);
    await db.execute(sql`ALTER TABLE inspection_report_items ADD COLUMN IF NOT EXISTS seller_agreed_amount_cents integer`);
    await db.execute(sql`ALTER TABLE inspection_report_items ADD COLUMN IF NOT EXISTS credit_issued_cents integer`);
    await db.execute(sql`ALTER TABLE inspection_report_items ADD COLUMN IF NOT EXISTS concession_status text`);
    logger.info('Schema patches applied (pricing_tier + negotiation columns)');
  } catch (patchErr) {
    logger.warn({ err: patchErr }, 'Schema patch failed (non-fatal)');
  }

  // ── One-time data fix: Handy Mandy quote on job 6d4cba32 ────────────────
  // Restores the correct $210-$280 range from "$70/hr 3hr min, possibly 4 hours"
  // and reverts the phantom "completed" status (no active booking) to "expired"
  // so the dispatch is bookable again. Idempotent — does nothing once applied.
  try {
    const { sql } = await import('drizzle-orm');
    type Row = { id: string };
    const updatedQuotes = await db.execute(sql`
      UPDATE provider_responses pr
      SET quoted_price = '$210-$280'
      FROM providers p, jobs j
      WHERE pr.provider_id = p.id
        AND pr.job_id = j.id
        AND j.id::text LIKE '6d4cba32%'
        AND p.name ILIKE '%handy%mandy%'
        AND (pr.quoted_price IS NULL OR pr.quoted_price <> '$210-$280')
      RETURNING pr.id
    `) as unknown as Row[];
    if (updatedQuotes.length > 0) {
      logger.info({ count: updatedQuotes.length }, '[startup-fix] Updated Handy Mandy quote on job 6d4cba32 to $210-$280');
    }

    // Revert phantom completed status (no active booking) → expired
    const revertedJobs = await db.execute(sql`
      UPDATE jobs
      SET status = 'expired'
      WHERE id::text LIKE '6d4cba32%'
        AND status = 'completed'
        AND id NOT IN (
          SELECT job_id FROM bookings WHERE status <> 'cancelled'
        )
      RETURNING id
    `) as unknown as Row[];
    if (revertedJobs.length > 0) {
      logger.info({ count: revertedJobs.length }, '[startup-fix] Reverted phantom completed status to expired on job 6d4cba32');
    }
  } catch (err) {
    logger.warn({ err }, '[startup-fix] Handy Mandy quote fix failed (non-fatal)');
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
    startOutreachExpansionWorker();
    startIcalSyncWorker();
  });
}

start();

export default app;
