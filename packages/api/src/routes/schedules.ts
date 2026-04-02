import { Router, Request, Response } from 'express';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import {
  dispatchSchedules,
  dispatchScheduleRuns,
  scheduleTemplates,
} from '../db/schema/schedules';
import { properties } from '../db/schema/properties';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace-auth';
import type { CadenceConfig } from '../db/schema/schedules';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Calculate the next dispatch date from a cadence type and optional config.
 */
export function calculateNextDispatch(
  cadenceType: string,
  cadenceConfig: CadenceConfig | null | undefined,
  fromDate?: Date,
): Date {
  const from = fromDate ?? new Date();
  const next = new Date(from);

  switch (cadenceType) {
    case 'daily':
      next.setDate(next.getDate() + 1);
      break;
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'biweekly':
      next.setDate(next.getDate() + 14);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'semi_annual':
      next.setMonth(next.getMonth() + 6);
      break;
    case 'annual':
      next.setFullYear(next.getFullYear() + 1);
      break;
    case 'custom': {
      const interval = cadenceConfig?.interval ?? 1;
      const unit = cadenceConfig?.unit ?? 'days';
      if (unit === 'days') next.setDate(next.getDate() + interval);
      else if (unit === 'weeks') next.setDate(next.getDate() + interval * 7);
      else if (unit === 'months') next.setMonth(next.getMonth() + interval);
      break;
    }
    case 'per_event':
      // per_event schedules don't auto-advance; set far future so they
      // don't get picked up by the cron until manually triggered
      next.setFullYear(next.getFullYear() + 100);
      break;
    default:
      // fallback: 30 days
      next.setDate(next.getDate() + 30);
  }

  // Apply preferred time of day if specified
  if (cadenceConfig?.timeOfDay) {
    const [hours, minutes] = cadenceConfig.timeOfDay.split(':').map(Number);
    if (!isNaN(hours) && !isNaN(minutes)) {
      next.setHours(hours, minutes, 0, 0);
    }
  }

  return next;
}

// ── Schedule routes (workspace-scoped, mounted in business router) ──────────

export const scheduleRouter = Router({ mergeParams: true });

// POST /:workspaceId/schedules — create schedule
scheduleRouter.post(
  '/',
  requireWorkspace,
  requireWorkspaceRole('admin', 'coordinator'),
  async (req: Request, res: Response) => {
    try {
      const {
        propertyId,
        templateId,
        category,
        title,
        description,
        cadenceType,
        cadenceConfig,
        preferredProviderId,
        agreedRateCents,
        autoBook,
        autoBookMaxCents,
        advanceDispatchHours,
        escalationWindowMinutes,
        fallbackToMarketplace,
        blackoutDates,
      } = req.body as Record<string, unknown>;

      if (!category || !title || !cadenceType) {
        res.status(400).json({ data: null, error: 'category, title, and cadenceType are required', meta: {} });
        return;
      }

      const nextDispatchAt = calculateNextDispatch(
        cadenceType as string,
        (cadenceConfig as CadenceConfig) ?? null,
      );

      const [schedule] = await db
        .insert(dispatchSchedules)
        .values({
          workspaceId: req.workspaceId,
          propertyId: (propertyId as string) ?? null,
          templateId: (templateId as string) ?? null,
          category: category as string,
          title: title as string,
          description: (description as string) ?? null,
          cadenceType: cadenceType as string,
          cadenceConfig: (cadenceConfig as CadenceConfig) ?? null,
          preferredProviderId: (preferredProviderId as string) ?? null,
          agreedRateCents: (agreedRateCents as number) ?? null,
          autoBook: autoBook !== undefined ? (autoBook as boolean) : true,
          autoBookMaxCents: (autoBookMaxCents as number) ?? null,
          advanceDispatchHours: (advanceDispatchHours as number) ?? 48,
          escalationWindowMinutes: (escalationWindowMinutes as number) ?? 120,
          fallbackToMarketplace: fallbackToMarketplace !== undefined ? (fallbackToMarketplace as boolean) : true,
          blackoutDates: (blackoutDates as string[]) ?? null,
          status: 'active',
          createdBy: req.homeownerId ?? null,
          nextDispatchAt,
        })
        .returning();

      // Increment template usage if linked
      if (templateId) {
        await db
          .update(scheduleTemplates)
          .set({ usageCount: sql`${scheduleTemplates.usageCount} + 1` })
          .where(eq(scheduleTemplates.id, templateId as string));
      }

      res.status(201).json({ data: schedule, error: null, meta: {} });
    } catch (err) {
      logger.error({ err }, '[POST schedules]');
      res.status(500).json({ data: null, error: 'Failed to create schedule', meta: {} });
    }
  },
);

// GET /:workspaceId/schedules — list schedules
scheduleRouter.get(
  '/',
  requireWorkspace,
  async (req: Request, res: Response) => {
    try {
      const { property_id, category, status } = req.query as Record<string, string | undefined>;

      const conditions = [eq(dispatchSchedules.workspaceId, req.workspaceId)];

      if (property_id) conditions.push(eq(dispatchSchedules.propertyId, property_id));
      if (category) conditions.push(eq(dispatchSchedules.category, category));
      if (status) conditions.push(eq(dispatchSchedules.status, status));
      else conditions.push(sql`${dispatchSchedules.status} != 'archived'`);

      const rows = await db
        .select()
        .from(dispatchSchedules)
        .where(and(...conditions))
        .orderBy(dispatchSchedules.nextDispatchAt);

      res.json({ data: rows, error: null, meta: { count: rows.length } });
    } catch (err) {
      logger.error({ err }, '[GET schedules]');
      res.status(500).json({ data: null, error: 'Failed to list schedules', meta: {} });
    }
  },
);

// GET /:workspaceId/schedules/:id — get schedule with last 5 runs
scheduleRouter.get(
  '/:id',
  requireWorkspace,
  async (req: Request, res: Response) => {
    try {
      const [schedule] = await db
        .select()
        .from(dispatchSchedules)
        .where(
          and(
            eq(dispatchSchedules.id, req.params.id),
            eq(dispatchSchedules.workspaceId, req.workspaceId),
          ),
        )
        .limit(1);

      if (!schedule) {
        res.status(404).json({ data: null, error: 'Schedule not found', meta: {} });
        return;
      }

      const runs = await db
        .select()
        .from(dispatchScheduleRuns)
        .where(eq(dispatchScheduleRuns.scheduleId, schedule.id))
        .orderBy(desc(dispatchScheduleRuns.scheduledFor))
        .limit(5);

      res.json({ data: { ...schedule, recentRuns: runs }, error: null, meta: {} });
    } catch (err) {
      logger.error({ err }, '[GET schedule/:id]');
      res.status(500).json({ data: null, error: 'Failed to get schedule', meta: {} });
    }
  },
);

// PUT /:workspaceId/schedules/:id — update schedule
scheduleRouter.put(
  '/:id',
  requireWorkspace,
  requireWorkspaceRole('admin', 'coordinator'),
  async (req: Request, res: Response) => {
    try {
      const allowedFields = [
        'propertyId', 'category', 'title', 'description', 'cadenceType',
        'cadenceConfig', 'preferredProviderId', 'agreedRateCents', 'autoBook',
        'autoBookMaxCents', 'advanceDispatchHours', 'escalationWindowMinutes',
        'fallbackToMarketplace', 'blackoutDates',
      ] as const;

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      // Recalculate nextDispatchAt if cadence changed
      if (updates.cadenceType || updates.cadenceConfig) {
        const cadenceType = (updates.cadenceType as string) ?? req.body.cadenceType;
        const cadenceConfig = (updates.cadenceConfig as CadenceConfig) ?? null;
        updates.nextDispatchAt = calculateNextDispatch(cadenceType, cadenceConfig);
      }

      const [updated] = await db
        .update(dispatchSchedules)
        .set(updates)
        .where(
          and(
            eq(dispatchSchedules.id, req.params.id),
            eq(dispatchSchedules.workspaceId, req.workspaceId),
          ),
        )
        .returning();

      if (!updated) {
        res.status(404).json({ data: null, error: 'Schedule not found', meta: {} });
        return;
      }

      res.json({ data: updated, error: null, meta: {} });
    } catch (err) {
      logger.error({ err }, '[PUT schedule/:id]');
      res.status(500).json({ data: null, error: 'Failed to update schedule', meta: {} });
    }
  },
);

// PUT /:workspaceId/schedules/:id/pause — pause schedule
scheduleRouter.put(
  '/:id/pause',
  requireWorkspace,
  requireWorkspaceRole('admin', 'coordinator'),
  async (req: Request, res: Response) => {
    try {
      const [updated] = await db
        .update(dispatchSchedules)
        .set({ status: 'paused', updatedAt: new Date() })
        .where(
          and(
            eq(dispatchSchedules.id, req.params.id),
            eq(dispatchSchedules.workspaceId, req.workspaceId),
            eq(dispatchSchedules.status, 'active'),
          ),
        )
        .returning();

      if (!updated) {
        res.status(404).json({ data: null, error: 'Active schedule not found', meta: {} });
        return;
      }

      res.json({ data: updated, error: null, meta: {} });
    } catch (err) {
      logger.error({ err }, '[PUT schedule/:id/pause]');
      res.status(500).json({ data: null, error: 'Failed to pause schedule', meta: {} });
    }
  },
);

// PUT /:workspaceId/schedules/:id/resume — resume schedule
scheduleRouter.put(
  '/:id/resume',
  requireWorkspace,
  requireWorkspaceRole('admin', 'coordinator'),
  async (req: Request, res: Response) => {
    try {
      // Fetch current to get cadence info
      const [current] = await db
        .select()
        .from(dispatchSchedules)
        .where(
          and(
            eq(dispatchSchedules.id, req.params.id),
            eq(dispatchSchedules.workspaceId, req.workspaceId),
            eq(dispatchSchedules.status, 'paused'),
          ),
        )
        .limit(1);

      if (!current) {
        res.status(404).json({ data: null, error: 'Paused schedule not found', meta: {} });
        return;
      }

      const nextDispatchAt = calculateNextDispatch(
        current.cadenceType,
        current.cadenceConfig,
      );

      const [updated] = await db
        .update(dispatchSchedules)
        .set({ status: 'active', nextDispatchAt, updatedAt: new Date() })
        .where(eq(dispatchSchedules.id, current.id))
        .returning();

      res.json({ data: updated, error: null, meta: {} });
    } catch (err) {
      logger.error({ err }, '[PUT schedule/:id/resume]');
      res.status(500).json({ data: null, error: 'Failed to resume schedule', meta: {} });
    }
  },
);

// DELETE /:workspaceId/schedules/:id — archive schedule
scheduleRouter.delete(
  '/:id',
  requireWorkspace,
  requireWorkspaceRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const [updated] = await db
        .update(dispatchSchedules)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(
          and(
            eq(dispatchSchedules.id, req.params.id),
            eq(dispatchSchedules.workspaceId, req.workspaceId),
          ),
        )
        .returning();

      if (!updated) {
        res.status(404).json({ data: null, error: 'Schedule not found', meta: {} });
        return;
      }

      res.json({ data: { id: updated.id, status: 'archived' }, error: null, meta: {} });
    } catch (err) {
      logger.error({ err }, '[DELETE schedule/:id]');
      res.status(500).json({ data: null, error: 'Failed to archive schedule', meta: {} });
    }
  },
);

// GET /:workspaceId/schedules/:id/runs — list runs
scheduleRouter.get(
  '/:id/runs',
  requireWorkspace,
  async (req: Request, res: Response) => {
    try {
      // Verify schedule belongs to workspace
      const [schedule] = await db
        .select({ id: dispatchSchedules.id })
        .from(dispatchSchedules)
        .where(
          and(
            eq(dispatchSchedules.id, req.params.id),
            eq(dispatchSchedules.workspaceId, req.workspaceId),
          ),
        )
        .limit(1);

      if (!schedule) {
        res.status(404).json({ data: null, error: 'Schedule not found', meta: {} });
        return;
      }

      const runs = await db
        .select()
        .from(dispatchScheduleRuns)
        .where(eq(dispatchScheduleRuns.scheduleId, schedule.id))
        .orderBy(desc(dispatchScheduleRuns.scheduledFor))
        .limit(20);

      res.json({ data: runs, error: null, meta: { count: runs.length } });
    } catch (err) {
      logger.error({ err }, '[GET schedule/:id/runs]');
      res.status(500).json({ data: null, error: 'Failed to list runs', meta: {} });
    }
  },
);

// ── Template routes (public, rate-limited) ──────────────────────────────────

export const templateRouter = Router();

// GET /templates — list all templates
templateRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { category, amenity_tags } = req.query as Record<string, string | undefined>;

    const conditions = [];
    if (category) conditions.push(eq(scheduleTemplates.category, category));

    const rows = await db
      .select()
      .from(scheduleTemplates)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(scheduleTemplates.sortPriority, scheduleTemplates.category);

    // Filter by amenity tags in JS if provided (array overlap)
    let filtered = rows;
    if (amenity_tags) {
      const tags = amenity_tags.split(',').map((t) => t.trim().toLowerCase());
      filtered = rows.filter((r) => {
        if (!r.amenityTags) return false;
        return tags.some((tag) => r.amenityTags!.includes(tag));
      });
    }

    res.json({ data: filtered, error: null, meta: { count: filtered.length } });
  } catch (err) {
    logger.error({ err }, '[GET templates]');
    res.status(500).json({ data: null, error: 'Failed to list templates', meta: {} });
  }
});

// GET /templates/recommended — get recommendations for a property
templateRouter.get('/recommended', async (req: Request, res: Response) => {
  try {
    const { property_id, workspace_id } = req.query as Record<string, string | undefined>;

    if (!workspace_id) {
      res.status(400).json({ data: null, error: 'workspace_id is required', meta: {} });
      return;
    }

    // Fetch property details if provided
    let propertyType: string | null = null;
    let amenityTags: string[] = [];

    if (property_id) {
      const [prop] = await db
        .select({
          propertyType: properties.propertyType,
          details: properties.details,
        })
        .from(properties)
        .where(
          and(
            eq(properties.id, property_id),
            eq(properties.workspaceId, workspace_id),
          ),
        )
        .limit(1);

      if (prop) {
        propertyType = prop.propertyType;
        // Derive amenity tags from property details
        if (prop.details) {
          const d = prop.details;
          if (d.poolSpa?.poolType) amenityTags.push('pool');
          if (d.exterior?.irrigationBrand) amenityTags.push('irrigation', 'sprinklers');
          if (d.general?.pestControlProvider) amenityTags.push('pest_control');
        }
      }
    }

    // Get all active templates
    const allTemplates = await db
      .select()
      .from(scheduleTemplates)
      .orderBy(scheduleTemplates.sortPriority);

    // Get existing schedules for this workspace/property to exclude
    const existingConditions = [eq(dispatchSchedules.workspaceId, workspace_id)];
    if (property_id) existingConditions.push(eq(dispatchSchedules.propertyId, property_id));
    existingConditions.push(sql`${dispatchSchedules.status} != 'archived'`);

    const existing = await db
      .select({ templateId: dispatchSchedules.templateId })
      .from(dispatchSchedules)
      .where(and(...existingConditions));

    const usedTemplateIds = new Set(existing.map((e) => e.templateId).filter(Boolean));

    // Score and filter templates
    const scored = allTemplates
      .filter((t) => !usedTemplateIds.has(t.id))
      .map((t) => {
        let score = 100 - t.sortPriority; // lower priority number = higher score

        // Boost if property type matches
        if (propertyType && t.propertyTypes?.includes(propertyType)) score += 20;

        // Boost if amenity tags overlap
        if (amenityTags.length > 0 && t.amenityTags) {
          const overlap = amenityTags.filter((a) => t.amenityTags!.includes(a)).length;
          score += overlap * 15;
        }

        // Boost seasonally relevant templates
        if (t.seasonalRelevance) {
          const now = new Date();
          const month = now.getMonth(); // 0-11
          const seasonMap: Record<string, number[]> = {
            spring: [2, 3, 4],
            summer: [5, 6, 7],
            fall: [8, 9, 10],
            winter: [11, 0, 1],
          };
          const isSeasonal = t.seasonalRelevance.some((s) => seasonMap[s]?.includes(month));
          if (isSeasonal) score += 10;
        }

        return { ...t, _score: score };
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 15);

    // Strip internal score
    const recommendations = scored.map(({ _score, ...rest }) => rest);

    res.json({ data: recommendations, error: null, meta: { count: recommendations.length } });
  } catch (err) {
    logger.error({ err }, '[GET templates/recommended]');
    res.status(500).json({ data: null, error: 'Failed to get recommendations', meta: {} });
  }
});
