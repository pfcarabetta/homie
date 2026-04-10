import { and, eq, inArray, isNotNull, lte, sql, count } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { providerResponses } from '../db/schema/provider-responses';
import { expandJobOutreach } from './orchestration';
import logger from '../logger';

const ACTIVE_STATUSES = ['collecting', 'dispatching'];
const EXPANSION_INTERVAL_MINUTES = 30;
const MAX_EXPANSIONS = 3;
const CHECK_INTERVAL_MS = 60_000; // run every minute

export function startOutreachExpansionWorker(): void {
  async function tick() {
    try {
      const cutoff = new Date(Date.now() - EXPANSION_INTERVAL_MINUTES * 60_000);

      // Find candidate B2B jobs:
      // - active status
      // - has a workspace_id (B2B)
      // - lastOutreachAt is set and >= 30 min ago
      // - outreachExpansions < MAX_EXPANSIONS
      // - has zero provider_responses
      const candidates = await db
        .select({ id: jobs.id, expansions: jobs.outreachExpansions, lastOutreachAt: jobs.lastOutreachAt })
        .from(jobs)
        .where(and(
          inArray(jobs.status, ACTIVE_STATUSES),
          isNotNull(jobs.workspaceId),
          isNotNull(jobs.lastOutreachAt),
          lte(jobs.lastOutreachAt, cutoff),
          sql`${jobs.outreachExpansions} < ${MAX_EXPANSIONS}`,
        ));

      if (candidates.length === 0) return;

      for (const c of candidates) {
        // Skip jobs that already have a quote
        const [{ value: responseCount }] = await db
          .select({ value: count() })
          .from(providerResponses)
          .where(eq(providerResponses.jobId, c.id));

        if (responseCount > 0) continue;

        try {
          const result = await expandJobOutreach(c.id);
          if (result && result.expanded > 0) {
            logger.info(`[expansion-worker] expanded job ${c.id} wave ${result.wave} to ${result.expanded} new providers`);
          }
        } catch (err) {
          logger.error({ err, jobId: c.id }, '[expansion-worker] expansion failed');
        }
      }
    } catch (err) {
      logger.error({ err }, '[expansion-worker] tick failed');
    }
  }

  void tick();
  setInterval(tick, CHECK_INTERVAL_MS);
  logger.info(`[expansion-worker] started — checking every ${CHECK_INTERVAL_MS / 1000}s, expansion interval ${EXPANSION_INTERVAL_MINUTES}min, max ${MAX_EXPANSIONS} waves`);
}
