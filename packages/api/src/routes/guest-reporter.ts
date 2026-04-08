import { Router, Request, Response } from 'express';
import { eq, and, desc, sql, lte, gte, ne, asc, count } from 'drizzle-orm';
import logger from '../logger';
import { db } from '../db';
import { workspaces } from '../db/schema/workspaces';
import { properties } from '../db/schema/properties';
import { reservations } from '../db/schema/reservations';
import { guestIssueCategories } from '../db/schema/guest-issue-categories';
import { guestTroubleshootFlows } from '../db/schema/guest-troubleshoot-flows';
import { guestIssues } from '../db/schema/guest-issues';
import { guestIssuePhotos } from '../db/schema/guest-issue-photos';
import { guestIssueTimeline } from '../db/schema/guest-issue-timeline';
import { guestAutoDispatchRules } from '../db/schema/guest-auto-dispatch-rules';
import { guestReporterSettings } from '../db/schema/guest-reporter-settings';
import { requireWorkspace, requireWorkspaceRole } from '../middleware/workspace-auth';

// ── Public guest-facing router (no auth) ────────────────────────────────────
export const guestPublicRouter = Router();

// ── PM-facing router (auth required, mounted under business) ────────────────
export const guestPmRouter = Router({ mergeParams: true });

// ═══════════════════════════════════════════════════════════════════════════════
// SEED DEFAULT CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════

interface DefaultCategory {
  name: string;
  icon: string;
  description: string;
  color: string;
  type: string;
  hasTroubleshooting: boolean;
  displayOrder: number;
  troubleshootSteps?: { stepOrder: number; question: string; options: string[]; isResolutionOption: string | null }[];
}

const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    name: 'WiFi / Internet',
    icon: '\uD83D\uDCF6',
    description: 'Internet connectivity issues',
    color: '#3B82F6',
    type: 'service',
    hasTroubleshooting: true,
    displayOrder: 1,
    troubleshootSteps: [
      { stepOrder: 1, question: 'Are you connected to the correct WiFi network listed in your check-in instructions?', options: ['Yes', 'No', 'I don\'t see the network'], isResolutionOption: null },
      { stepOrder: 2, question: 'Have you tried turning WiFi off and on again on your device?', options: ['Yes, still not working', 'That fixed it!'], isResolutionOption: 'That fixed it!' },
      { stepOrder: 3, question: 'Can you see the router? Does it have solid green lights?', options: ['Yes, lights are green', 'No lights or red lights', 'I can\'t find the router'], isResolutionOption: null },
      { stepOrder: 4, question: 'Try unplugging the router for 30 seconds, then plug it back in. Wait 2 minutes. Did that help?', options: ['Yes, it\'s working now!', 'Still not working'], isResolutionOption: 'Yes, it\'s working now!' },
    ],
  },
  {
    name: 'HVAC / Climate',
    icon: '\u2744\uFE0F',
    description: 'Heating, cooling, or thermostat issues',
    color: '#06B6D4',
    type: 'repair',
    hasTroubleshooting: true,
    displayOrder: 2,
    troubleshootSteps: [
      { stepOrder: 1, question: 'What is the issue with the climate?', options: ['Too hot', 'Too cold', 'AC not turning on', 'Heater not turning on', 'Strange noise'], isResolutionOption: null },
      { stepOrder: 2, question: 'Have you checked the thermostat? Is it set to the correct mode (cool/heat) and a reasonable temperature?', options: ['Yes, it\'s set correctly', 'I adjusted it and it\'s working now!', 'I can\'t figure out the thermostat'], isResolutionOption: 'I adjusted it and it\'s working now!' },
      { stepOrder: 3, question: 'Is the air filter visibly dirty or blocked?', options: ['Yes, it looks dirty', 'No, it looks clean', 'I don\'t know where the filter is'], isResolutionOption: null },
    ],
  },
  {
    name: 'Plumbing',
    icon: '\uD83D\uDEB0',
    description: 'Leaks, clogs, water pressure issues',
    color: '#0EA5E9',
    type: 'repair',
    hasTroubleshooting: true,
    displayOrder: 3,
    troubleshootSteps: [
      { stepOrder: 1, question: 'What type of plumbing issue are you experiencing?', options: ['Clogged drain', 'Leaking faucet', 'Toilet not flushing', 'No hot water', 'Low water pressure', 'Other'], isResolutionOption: null },
      { stepOrder: 2, question: 'For clogged drains: have you tried using the plunger (usually located near the toilet)?', options: ['Yes, still clogged', 'That fixed it!', 'Not a clog issue'], isResolutionOption: 'That fixed it!' },
      { stepOrder: 3, question: 'Is there active water leaking right now?', options: ['Yes, it\'s actively leaking', 'No, just dripping slowly', 'No leaking'], isResolutionOption: null },
    ],
  },
  {
    name: 'Electrical',
    icon: '\u26A1',
    description: 'Power outages, outlets, lighting issues',
    color: '#EAB308',
    type: 'repair',
    hasTroubleshooting: true,
    displayOrder: 4,
    troubleshootSteps: [
      { stepOrder: 1, question: 'What electrical issue are you experiencing?', options: ['No power in room', 'Outlet not working', 'Light not working', 'Breaker keeps tripping', 'Other'], isResolutionOption: null },
      { stepOrder: 2, question: 'Have you checked the breaker panel? Try flipping the tripped breaker fully off and then back on.', options: ['That fixed it!', 'Still not working', 'I can\'t find the breaker panel'], isResolutionOption: 'That fixed it!' },
      { stepOrder: 3, question: 'Is this affecting the entire property or just one area?', options: ['Entire property', 'Just one room', 'Just one outlet/light'], isResolutionOption: null },
    ],
  },
  {
    name: 'Appliances',
    icon: '\uD83C\uDF73',
    description: 'Kitchen or laundry appliance issues',
    color: '#8B5CF6',
    type: 'repair',
    hasTroubleshooting: true,
    displayOrder: 5,
    troubleshootSteps: [
      { stepOrder: 1, question: 'Which appliance is having issues?', options: ['Refrigerator', 'Oven/Stove', 'Dishwasher', 'Washer', 'Dryer', 'Microwave', 'Coffee maker', 'Other'], isResolutionOption: null },
      { stepOrder: 2, question: 'Is the appliance plugged in and getting power?', options: ['Yes', 'No, I plugged it in and it works now!', 'I\'m not sure'], isResolutionOption: 'No, I plugged it in and it works now!' },
      { stepOrder: 3, question: 'Is there an error code or blinking light on the appliance?', options: ['Yes', 'No', 'I\'m not sure'], isResolutionOption: null },
    ],
  },
  {
    name: 'Lockout / Access',
    icon: '\uD83D\uDD11',
    description: 'Key, lock, or access code issues',
    color: '#F97316',
    type: 'service',
    hasTroubleshooting: false,
    displayOrder: 6,
  },
  {
    name: 'Pest Control',
    icon: '\uD83D\uDC1B',
    description: 'Insects, rodents, or wildlife',
    color: '#84CC16',
    type: 'service',
    hasTroubleshooting: false,
    displayOrder: 7,
  },
  {
    name: 'Cleanliness',
    icon: '\u2728',
    description: 'Cleaning or hygiene concerns',
    color: '#EC4899',
    type: 'service',
    hasTroubleshooting: false,
    displayOrder: 8,
  },
  {
    name: 'Safety Concern',
    icon: '\u26A0\uFE0F',
    description: 'Safety hazards or emergencies',
    color: '#EF4444',
    type: 'safety',
    hasTroubleshooting: false,
    displayOrder: 9,
  },
  {
    name: 'Noise Complaint',
    icon: '\uD83D\uDD0A',
    description: 'Noise disturbances',
    color: '#A855F7',
    type: 'other',
    hasTroubleshooting: false,
    displayOrder: 10,
  },
  {
    name: 'Pool / Hot Tub',
    icon: '\uD83C\uDFCA',
    description: 'Pool or hot tub issues',
    color: '#14B8A6',
    type: 'repair',
    hasTroubleshooting: false,
    displayOrder: 11,
  },
  {
    name: 'Other',
    icon: '\uD83D\uDCDD',
    description: 'Any other issue not listed above',
    color: '#6B7280',
    type: 'other',
    hasTroubleshooting: false,
    displayOrder: 12,
  },
];

async function seedDefaultCategories(workspaceId: string): Promise<void> {
  // Check if categories already exist for this workspace
  const existing = await db
    .select({ cnt: count() })
    .from(guestIssueCategories)
    .where(eq(guestIssueCategories.workspaceId, workspaceId));

  if (existing[0] && existing[0].cnt > 0) return;

  for (const cat of DEFAULT_CATEGORIES) {
    const [inserted] = await db
      .insert(guestIssueCategories)
      .values({
        workspaceId,
        name: cat.name,
        icon: cat.icon,
        description: cat.description,
        color: cat.color,
        type: cat.type,
        hasTroubleshooting: cat.hasTroubleshooting,
        displayOrder: cat.displayOrder,
        isActive: true,
      })
      .returning();

    if (cat.troubleshootSteps && cat.troubleshootSteps.length > 0) {
      for (const step of cat.troubleshootSteps) {
        await db.insert(guestTroubleshootFlows).values({
          categoryId: inserted.id,
          stepOrder: step.stepOrder,
          question: step.question,
          options: step.options,
          isResolutionOption: step.isResolutionOption,
        });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

const SEVERITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

function severityRank(severity: string): number {
  return SEVERITY_ORDER[severity] ?? 99;
}

function meetsMinSeverity(issueSeverity: string, minSeverity: string): boolean {
  return severityRank(issueSeverity) <= severityRank(minSeverity);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC GUEST ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /:workspaceId/:propertyId — Load guest reporter page data ───────────

guestPublicRouter.get('/:workspaceId/:propertyId', async (req: Request, res: Response) => {
  const { workspaceId, propertyId } = req.params;

  try {
    // Check if guest reporter is enabled
    const [settings] = await db
      .select()
      .from(guestReporterSettings)
      .where(eq(guestReporterSettings.workspaceId, workspaceId))
      .limit(1);

    if (!settings || !settings.isEnabled) {
      res.status(404).json({ data: null, error: 'Guest reporter not enabled', meta: {} });
      return;
    }

    // Get property
    const [property] = await db
      .select({ name: properties.name })
      .from(properties)
      .where(and(eq(properties.id, propertyId), eq(properties.workspaceId, workspaceId)))
      .limit(1);

    if (!property) {
      res.status(404).json({ data: null, error: 'Property not found', meta: {} });
      return;
    }

    // Get workspace
    const [workspace] = await db
      .select({ name: workspaces.name, logoUrl: workspaces.logoUrl })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);

    if (!workspace) {
      res.status(404).json({ data: null, error: 'Workspace not found', meta: {} });
      return;
    }

    // Find current reservation for this property
    const now = new Date();
    const [reservation] = await db
      .select({
        id: reservations.id,
        guestName: reservations.guestName,
        guestEmail: reservations.guestEmail,
        guestPhone: reservations.guestPhone,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.propertyId, propertyId),
          eq(reservations.workspaceId, workspaceId),
          lte(reservations.checkIn, now),
          gte(reservations.checkOut, now),
          ne(reservations.status, 'cancelled'),
        ),
      )
      .limit(1);

    const logoUrl = settings.whitelabelLogoUrl || workspace.logoUrl;
    const companyName = settings.whitelabelCompanyName || workspace.name;

    res.json({
      data: {
        property: {
          name: property.name,
          company: companyName,
          companyLogo: logoUrl,
          settings: {
            supportedLanguages: settings.supportedLanguages,
            defaultLanguage: settings.defaultLanguage,
            showPoweredBy: settings.showPoweredByHomie,
            slaUrgent: settings.slaUrgentMinutes,
            slaHigh: settings.slaHighMinutes,
            slaMedium: settings.slaMediumMinutes,
            slaLow: settings.slaLowMinutes,
          },
        },
        reservation: {
          matched: !!reservation,
          guestName: reservation?.guestName ?? null,
          checkIn: reservation?.checkIn ?? null,
          checkOut: reservation?.checkOut ?? null,
          reservationId: reservation?.id ?? null,
        },
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /guest/:workspaceId/:propertyId]');
    res.status(500).json({ data: null, error: 'Failed to load guest reporter', meta: {} });
  }
});

// ── GET /:workspaceId/:propertyId/categories — Get active categories ────────

guestPublicRouter.get('/:workspaceId/:propertyId/categories', async (req: Request, res: Response) => {
  const { workspaceId } = req.params;

  try {
    const categories = await db
      .select()
      .from(guestIssueCategories)
      .where(
        and(
          eq(guestIssueCategories.workspaceId, workspaceId),
          eq(guestIssueCategories.isActive, true),
        ),
      )
      .orderBy(asc(guestIssueCategories.displayOrder));

    // Fetch troubleshoot steps for each category
    const categoryIds = categories.map((c) => c.id);

    let flowsByCategory: Record<string, typeof allFlows> = {};
    let allFlows: (typeof guestTroubleshootFlows.$inferSelect)[] = [];
    if (categoryIds.length > 0) {
      allFlows = await db
        .select()
        .from(guestTroubleshootFlows)
        .where(
          sql`${guestTroubleshootFlows.categoryId} IN (${sql.join(
            categoryIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .orderBy(asc(guestTroubleshootFlows.stepOrder));

      flowsByCategory = {};
      for (const flow of allFlows) {
        if (!flowsByCategory[flow.categoryId]) {
          flowsByCategory[flow.categoryId] = [];
        }
        flowsByCategory[flow.categoryId].push(flow);
      }
    }

    const result = categories.map((cat) => {
      const steps = (flowsByCategory[cat.id] || []).map((s) => ({
        q: s.question,
        options: s.options as string[],
      }));
      return {
        id: cat.id,
        label: cat.name,
        icon: cat.icon ?? '',
        desc: cat.description ?? '',
        color: cat.color ?? '#9B9490',
        type: cat.type,
        troubleshootFlow: steps.length > 0 ? steps : undefined,
      };
    });

    res.json({ data: result, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[GET /guest/:workspaceId/:propertyId/categories]');
    res.status(500).json({ data: null, error: 'Failed to load categories', meta: {} });
  }
});

// ── POST /:workspaceId/:propertyId/issues — Create a guest issue ────────────

guestPublicRouter.post('/:workspaceId/:propertyId/issues', async (req: Request, res: Response) => {
  const { workspaceId, propertyId } = req.params;
  const body = req.body as Record<string, unknown>;
  const reservation_id = (body.reservationId ?? body.reservation_id) as string | undefined;
  const guest_name = (body.guestName ?? body.guest_name) as string;
  const guest_email = (body.guestEmail ?? body.guest_email) as string | undefined;
  const guest_phone = (body.guestPhone ?? body.guest_phone) as string | undefined;
  const category_id = (body.categoryId ?? body.category_id) as string;
  const description = body.description as string;
  const severity = body.severity as string;
  const troubleshoot_log = (body.troubleshootLog ?? body.troubleshoot_log) as unknown;
  const language = (body.language) as string | undefined;
  const self_resolved = (body.selfResolved ?? body.self_resolved) as boolean | undefined;

  if (!guest_name || !category_id || !description || !severity) {
    res.status(400).json({ data: null, error: 'guestName, categoryId, description, and severity are required', meta: {} });
    return;
  }

  const validSeverities = ['low', 'medium', 'high', 'urgent'];
  if (!validSeverities.includes(severity)) {
    res.status(400).json({ data: null, error: 'severity must be one of: low, medium, high, urgent', meta: {} });
    return;
  }

  try {
    // Get settings for this workspace
    const [settings] = await db
      .select()
      .from(guestReporterSettings)
      .where(eq(guestReporterSettings.workspaceId, workspaceId))
      .limit(1);

    if (!settings || !settings.isEnabled) {
      res.status(404).json({ data: null, error: 'Guest reporter not enabled', meta: {} });
      return;
    }

    // Check for recurring issues (same category + property in last 90 days)
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const [recurringCheck] = await db
      .select({ cnt: count() })
      .from(guestIssues)
      .where(
        and(
          eq(guestIssues.workspaceId, workspaceId),
          eq(guestIssues.propertyId, propertyId),
          eq(guestIssues.categoryId, category_id),
          gte(guestIssues.createdAt, ninetyDaysAgo),
        ),
      );

    const recurringCount = recurringCheck?.cnt ?? 0;
    const isRecurring = recurringCount > 0;

    // Determine status
    let status: string;
    let autoDispatched = false;
    let autoDispatchRuleId: string | null = null;

    if (self_resolved) {
      status = 'self_resolved';
    } else {
      // Check auto-dispatch rules
      const matchingRules = await db
        .select()
        .from(guestAutoDispatchRules)
        .where(
          and(
            eq(guestAutoDispatchRules.workspaceId, workspaceId),
            eq(guestAutoDispatchRules.categoryId, category_id),
            eq(guestAutoDispatchRules.isEnabled, true),
          ),
        );

      const matchedRule = matchingRules.find((rule) => meetsMinSeverity(severity, rule.minSeverity));

      if (matchedRule && !settings.requirePmApproval) {
        autoDispatched = true;
        autoDispatchRuleId = matchedRule.id;
        status = 'dispatching';
      } else {
        status = 'pm_reviewing';
      }
    }

    // Create the issue
    const [issue] = await db
      .insert(guestIssues)
      .values({
        workspaceId,
        propertyId,
        reservationId: reservation_id || null,
        categoryId: category_id,
        guestName: guest_name,
        guestEmail: guest_email || null,
        guestPhone: guest_phone || null,
        description,
        severity,
        status,
        troubleshootLog: troubleshoot_log || null,
        selfResolved: self_resolved || false,
        isRecurring: isRecurring,
        recurringCount: typeof recurringCount === 'number' ? recurringCount : 0,
        autoDispatched,
        autoDispatchRuleId,
        language: language || 'en',
      })
      .returning();

    // Create timeline events
    const timelineEvents: { issueId: string; eventType: string; title: string; description: string | null; metadata: unknown }[] = [];

    timelineEvents.push({
      issueId: issue.id,
      eventType: 'issue_created',
      title: 'Issue reported',
      description: `Guest reported a ${severity} severity issue`,
      metadata: { severity, self_resolved: self_resolved || false },
    });

    if (self_resolved) {
      timelineEvents.push({
        issueId: issue.id,
        eventType: 'self_resolved',
        title: 'Self-resolved by guest',
        description: 'Guest resolved the issue using troubleshooting steps',
        metadata: null,
      });
    } else if (autoDispatched) {
      timelineEvents.push({
        issueId: issue.id,
        eventType: 'auto_dispatched',
        title: 'Auto-dispatched',
        description: 'Issue matched an auto-dispatch rule and is being dispatched to a vendor',
        metadata: { rule_id: autoDispatchRuleId },
      });
    } else {
      timelineEvents.push({
        issueId: issue.id,
        eventType: 'pm_review_required',
        title: 'Awaiting PM review',
        description: 'Issue is waiting for property manager review',
        metadata: null,
      });
    }

    if (isRecurring) {
      timelineEvents.push({
        issueId: issue.id,
        eventType: 'recurring_flag',
        title: 'Recurring issue flagged',
        description: `This category has been reported ${recurringCount} time(s) at this property in the last 90 days`,
        metadata: { recurring_count: recurringCount },
      });
    }

    const insertedTimeline = [];
    for (const evt of timelineEvents) {
      const [entry] = await db.insert(guestIssueTimeline).values(evt).returning();
      insertedTimeline.push(entry);
    }

    res.status(201).json({
      data: {
        issueId: issue.id,
        status: issue.status,
        autoDispatched: issue.autoDispatched,
        timelineEvents: insertedTimeline.map((t) => ({
          id: t.id,
          eventType: t.eventType,
          title: t.title,
          description: t.description,
          createdAt: t.createdAt,
        })),
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[POST /guest/:workspaceId/:propertyId/issues]');
    res.status(500).json({ data: null, error: 'Failed to create issue', meta: {} });
  }
});

// ── GET /issues/:issueId/status — Get issue status and timeline ─────────────

guestPublicRouter.get('/issues/:issueId/status', async (req: Request, res: Response) => {
  const { issueId } = req.params;

  try {
    const [issue] = await db
      .select({
        id: guestIssues.id,
        status: guestIssues.status,
        severity: guestIssues.severity,
        categoryId: guestIssues.categoryId,
        propertyId: guestIssues.propertyId,
        createdAt: guestIssues.createdAt,
      })
      .from(guestIssues)
      .where(eq(guestIssues.id, issueId))
      .limit(1);

    if (!issue) {
      res.status(404).json({ data: null, error: 'Issue not found', meta: {} });
      return;
    }

    // Get category info
    const [category] = await db
      .select({ name: guestIssueCategories.name, icon: guestIssueCategories.icon })
      .from(guestIssueCategories)
      .where(eq(guestIssueCategories.id, issue.categoryId))
      .limit(1);

    // Get property info
    const [property] = await db
      .select({ name: properties.name })
      .from(properties)
      .where(eq(properties.id, issue.propertyId))
      .limit(1);

    // Get timeline
    const timeline = await db
      .select()
      .from(guestIssueTimeline)
      .where(eq(guestIssueTimeline.issueId, issueId))
      .orderBy(asc(guestIssueTimeline.createdAt));

    res.json({
      data: {
        status: issue.status,
        severity: issue.severity,
        category_name: category?.name ?? null,
        category_icon: category?.icon ?? null,
        property_name: property?.name ?? null,
        timeline_events: timeline.map((t) => ({
          id: t.id,
          event_type: t.eventType,
          title: t.title,
          description: t.description,
          created_at: t.createdAt,
        })),
        created_at: issue.createdAt,
      },
      error: null,
      meta: {},
    });
  } catch (err) {
    logger.error({ err }, '[GET /guest/issues/:issueId/status]');
    res.status(500).json({ data: null, error: 'Failed to get issue status', meta: {} });
  }
});

// ── POST /issues/:issueId/satisfaction — Submit satisfaction rating ──────────

guestPublicRouter.post('/issues/:issueId/satisfaction', async (req: Request, res: Response) => {
  const { issueId } = req.params;
  const { rating, comment } = req.body as { rating: string; comment?: string };

  if (!rating || !['positive', 'negative'].includes(rating)) {
    res.status(400).json({ data: null, error: 'rating must be positive or negative', meta: {} });
    return;
  }

  try {
    const [issue] = await db
      .select({ id: guestIssues.id })
      .from(guestIssues)
      .where(eq(guestIssues.id, issueId))
      .limit(1);

    if (!issue) {
      res.status(404).json({ data: null, error: 'Issue not found', meta: {} });
      return;
    }

    await db
      .update(guestIssues)
      .set({
        guestSatisfactionRating: rating,
        guestSatisfactionComment: comment || null,
        updatedAt: new Date(),
      })
      .where(eq(guestIssues.id, issueId));

    await db.insert(guestIssueTimeline).values({
      issueId,
      eventType: 'satisfaction_submitted',
      title: 'Guest feedback submitted',
      description: `Guest rated their experience as ${rating}`,
      metadata: { rating, comment: comment || null },
    });

    res.json({ data: { success: true }, error: null, meta: {} });
  } catch (err) {
    logger.error({ err }, '[POST /guest/issues/:issueId/satisfaction]');
    res.status(500).json({ data: null, error: 'Failed to submit satisfaction', meta: {} });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PM-FACING ENDPOINTS (auth required)
// ═══════════════════════════════════════════════════════════════════════════════

// ── GET /:workspaceId/guest-issues — List all guest issues ──────────────────

guestPmRouter.get(
  '/:workspaceId/guest-issues',
  requireWorkspace,
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const {
      status: filterStatus,
      property_id,
      category_id,
      severity: filterSeverity,
      page = '1',
      limit = '20',
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '20', 10)));
    const offset = (pageNum - 1) * limitNum;

    try {
      const conditions = [eq(guestIssues.workspaceId, workspaceId)];

      if (filterStatus) conditions.push(eq(guestIssues.status, filterStatus));
      if (property_id) conditions.push(eq(guestIssues.propertyId, property_id));
      if (category_id) conditions.push(eq(guestIssues.categoryId, category_id));
      if (filterSeverity) conditions.push(eq(guestIssues.severity, filterSeverity));

      // Get total count
      const [totalRow] = await db
        .select({ cnt: count() })
        .from(guestIssues)
        .where(and(...conditions));

      const total = totalRow?.cnt ?? 0;

      // Get issues with sorting: pm_reviewing first, then by severity, then newest
      const issues = await db
        .select({
          id: guestIssues.id,
          propertyId: guestIssues.propertyId,
          categoryId: guestIssues.categoryId,
          guestName: guestIssues.guestName,
          guestEmail: guestIssues.guestEmail,
          severity: guestIssues.severity,
          status: guestIssues.status,
          description: guestIssues.description,
          isRecurring: guestIssues.isRecurring,
          recurringCount: guestIssues.recurringCount,
          autoDispatched: guestIssues.autoDispatched,
          selfResolved: guestIssues.selfResolved,
          createdAt: guestIssues.createdAt,
          updatedAt: guestIssues.updatedAt,
          categoryName: guestIssueCategories.name,
          categoryIcon: guestIssueCategories.icon,
          propertyName: properties.name,
        })
        .from(guestIssues)
        .leftJoin(guestIssueCategories, eq(guestIssues.categoryId, guestIssueCategories.id))
        .leftJoin(properties, eq(guestIssues.propertyId, properties.id))
        .where(and(...conditions))
        .orderBy(
          // pm_reviewing first
          sql`CASE WHEN ${guestIssues.status} = 'pm_reviewing' THEN 0 ELSE 1 END`,
          // then by severity
          sql`CASE ${guestIssues.severity}
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'medium' THEN 2
            WHEN 'low' THEN 3
            ELSE 4 END`,
          desc(guestIssues.createdAt),
        )
        .limit(limitNum)
        .offset(offset);

      res.json({
        data: {
          issues: issues.map((i) => ({
            id: i.id,
            propertyId: i.propertyId,
            propertyName: i.propertyName,
            categoryId: i.categoryId,
            categoryName: i.categoryName,
            categoryIcon: i.categoryIcon,
            guestName: i.guestName,
            guestEmail: i.guestEmail,
            severity: i.severity,
            status: i.status,
            description: i.description,
            isRecurring: i.isRecurring,
            recurringCount: i.recurringCount,
            autoDispatched: i.autoDispatched,
            selfResolved: i.selfResolved,
            createdAt: i.createdAt,
            updatedAt: i.updatedAt,
          })),
          total,
        },
        error: null,
        meta: { page: pageNum, limit: limitNum },
      });
    } catch (err) {
      logger.error({ err }, '[GET /:workspaceId/guest-issues]');
      res.status(500).json({ data: null, error: 'Failed to list guest issues', meta: {} });
    }
  },
);

// ── GET /:workspaceId/guest-issues/:issueId — Full issue detail ─────────────

guestPmRouter.get(
  '/:workspaceId/guest-issues/:issueId',
  requireWorkspace,
  async (req: Request, res: Response) => {
    const { workspaceId, issueId } = req.params;

    try {
      const [issue] = await db
        .select()
        .from(guestIssues)
        .where(and(eq(guestIssues.id, issueId), eq(guestIssues.workspaceId, workspaceId)))
        .limit(1);

      if (!issue) {
        res.status(404).json({ data: null, error: 'Issue not found', meta: {} });
        return;
      }

      // Get category
      const [category] = await db
        .select()
        .from(guestIssueCategories)
        .where(eq(guestIssueCategories.id, issue.categoryId))
        .limit(1);

      // Get property
      const [property] = await db
        .select({ name: properties.name, address: properties.address })
        .from(properties)
        .where(eq(properties.id, issue.propertyId))
        .limit(1);

      // Get photos
      const photos = await db
        .select()
        .from(guestIssuePhotos)
        .where(eq(guestIssuePhotos.issueId, issueId))
        .orderBy(asc(guestIssuePhotos.uploadedAt));

      // Get timeline
      const timeline = await db
        .select()
        .from(guestIssueTimeline)
        .where(eq(guestIssueTimeline.issueId, issueId))
        .orderBy(asc(guestIssueTimeline.createdAt));

      res.json({
        data: {
          id: issue.id,
          propertyId: issue.propertyId,
          propertyName: property?.name ?? null,
          categoryId: issue.categoryId,
          categoryName: category?.name ?? null,
          categoryIcon: category?.icon ?? null,
          guestName: issue.guestName,
          guestEmail: issue.guestEmail,
          guestPhone: issue.guestPhone,
          description: issue.description,
          severity: issue.severity,
          status: issue.status,
          troubleshootLog: issue.troubleshootLog,
          selfResolved: issue.selfResolved,
          isRecurring: issue.isRecurring,
          recurringCount: issue.recurringCount,
          autoDispatched: issue.autoDispatched,
          dispatchedJobId: issue.dispatchedJobId,
          resolvedAt: issue.resolvedAt,
          guestSatisfactionRating: issue.guestSatisfactionRating,
          guestSatisfactionComment: issue.guestSatisfactionComment,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          photos: photos.map((p) => ({
            id: p.id,
            storageUrl: p.storageUrl,
            thumbnailUrl: p.thumbnailUrl,
          })),
          timeline: timeline.map((t) => ({
            eventType: t.eventType,
            title: t.title,
            description: t.description,
            createdAt: t.createdAt,
          })),
        },
        error: null,
        meta: {},
      });
    } catch (err) {
      logger.error({ err }, '[GET /:workspaceId/guest-issues/:issueId]');
      res.status(500).json({ data: null, error: 'Failed to get issue detail', meta: {} });
    }
  },
);

// ── POST /:workspaceId/guest-issues/:issueId/approve — PM approves ──────────

guestPmRouter.post(
  '/:workspaceId/guest-issues/:issueId/approve',
  requireWorkspace,
  async (req: Request, res: Response) => {
    const { workspaceId, issueId } = req.params;

    try {
      const [issue] = await db
        .select({ id: guestIssues.id, status: guestIssues.status })
        .from(guestIssues)
        .where(and(eq(guestIssues.id, issueId), eq(guestIssues.workspaceId, workspaceId)))
        .limit(1);

      if (!issue) {
        res.status(404).json({ data: null, error: 'Issue not found', meta: {} });
        return;
      }

      if (issue.status !== 'pm_reviewing') {
        res.status(400).json({ data: null, error: 'Issue is not in pm_reviewing status', meta: {} });
        return;
      }

      const now = new Date();

      await db
        .update(guestIssues)
        .set({
          status: 'dispatching',
          pmApprovedBy: req.homeownerId,
          pmApprovedAt: now,
          updatedAt: now,
        })
        .where(eq(guestIssues.id, issueId));

      // Create timeline events
      const [approvedEvent] = await db
        .insert(guestIssueTimeline)
        .values({
          issueId,
          eventType: 'pm_approved',
          title: 'Approved by property manager',
          description: 'Issue has been approved for dispatch',
          metadata: { approved_by: req.homeownerId },
        })
        .returning();

      const [dispatchingEvent] = await db
        .insert(guestIssueTimeline)
        .values({
          issueId,
          eventType: 'dispatching',
          title: 'Dispatching to vendor',
          description: 'Finding an available vendor for this issue',
          metadata: null,
        })
        .returning();

      res.json({
        data: {
          issueId: issueId,
          status: 'dispatching',
          timelineEvents: [approvedEvent, dispatchingEvent].map((t) => ({
            id: t.id,
            eventType: t.eventType,
            title: t.title,
            description: t.description,
            createdAt: t.createdAt,
          })),
        },
        error: null,
        meta: {},
      });
    } catch (err) {
      logger.error({ err }, '[POST /:workspaceId/guest-issues/:issueId/approve]');
      res.status(500).json({ data: null, error: 'Failed to approve issue', meta: {} });
    }
  },
);

// ── POST /:workspaceId/guest-issues/:issueId/reject — PM closes issue ───────

guestPmRouter.post(
  '/:workspaceId/guest-issues/:issueId/reject',
  requireWorkspace,
  async (req: Request, res: Response) => {
    const { workspaceId, issueId } = req.params;
    const { reason } = req.body as { reason?: string };

    if (!reason) {
      res.status(400).json({ data: null, error: 'reason is required', meta: {} });
      return;
    }

    try {
      const [issue] = await db
        .select({ id: guestIssues.id, status: guestIssues.status })
        .from(guestIssues)
        .where(and(eq(guestIssues.id, issueId), eq(guestIssues.workspaceId, workspaceId)))
        .limit(1);

      if (!issue) {
        res.status(404).json({ data: null, error: 'Issue not found', meta: {} });
        return;
      }

      const now = new Date();

      await db
        .update(guestIssues)
        .set({ status: 'closed', updatedAt: now })
        .where(eq(guestIssues.id, issueId));

      const [timelineEntry] = await db
        .insert(guestIssueTimeline)
        .values({
          issueId,
          eventType: 'pm_rejected',
          title: 'Closed by property manager',
          description: reason,
          metadata: { rejected_by: req.homeownerId, reason },
        })
        .returning();

      res.json({
        data: {
          issueId: issueId,
          status: 'closed',
          timelineEvents: [
            {
              id: timelineEntry.id,
              eventType: timelineEntry.eventType,
              title: timelineEntry.title,
              description: timelineEntry.description,
              createdAt: timelineEntry.createdAt,
            },
          ],
        },
        error: null,
        meta: {},
      });
    } catch (err) {
      logger.error({ err }, '[POST /:workspaceId/guest-issues/:issueId/reject]');
      res.status(500).json({ data: null, error: 'Failed to reject issue', meta: {} });
    }
  },
);

// ── GET /:workspaceId/guest-reporter/settings — Get settings ────────────────

guestPmRouter.get(
  '/:workspaceId/guest-reporter/settings',
  requireWorkspace,
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;

    try {
      const [settings] = await db
        .select()
        .from(guestReporterSettings)
        .where(eq(guestReporterSettings.workspaceId, workspaceId))
        .limit(1);

      if (!settings) {
        res.json({
          data: {
            isEnabled: false,
            whitelabelLogoUrl: null,
            whitelabelCompanyName: null,
            showPoweredByHomie: true,
            defaultLanguage: 'en',
            supportedLanguages: ['en'],
            slaUrgentMinutes: 30,
            slaHighMinutes: 60,
            slaMediumMinutes: 120,
            slaLowMinutes: 240,
            requirePmApproval: true,
          },
          error: null,
          meta: {},
        });
        return;
      }

      res.json({
        data: {
          id: settings.id,
          isEnabled: settings.isEnabled,
          whitelabelLogoUrl: settings.whitelabelLogoUrl,
          whitelabelCompanyName: settings.whitelabelCompanyName,
          showPoweredByHomie: settings.showPoweredByHomie,
          defaultLanguage: settings.defaultLanguage,
          supportedLanguages: settings.supportedLanguages,
          slaUrgentMinutes: settings.slaUrgentMinutes,
          slaHighMinutes: settings.slaHighMinutes,
          slaMediumMinutes: settings.slaMediumMinutes,
          slaLowMinutes: settings.slaLowMinutes,
          requirePmApproval: settings.requirePmApproval,
        },
        error: null,
        meta: {},
      });
    } catch (err) {
      logger.error({ err }, '[GET /:workspaceId/guest-reporter/settings]');
      res.status(500).json({ data: null, error: 'Failed to get settings', meta: {} });
    }
  },
);

// ── PUT /:workspaceId/guest-reporter/settings — Update settings (upsert) ────

guestPmRouter.put(
  '/:workspaceId/guest-reporter/settings',
  requireWorkspace,
  requireWorkspaceRole('admin'),
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const body = req.body as {
      // Accept camelCase (preferred)
      isEnabled?: boolean;
      whitelabelLogoUrl?: string;
      whitelabelCompanyName?: string;
      showPoweredByHomie?: boolean;
      defaultLanguage?: string;
      supportedLanguages?: string[];
      slaUrgentMinutes?: number;
      slaHighMinutes?: number;
      slaMediumMinutes?: number;
      slaLowMinutes?: number;
      requirePmApproval?: boolean;
      // Accept snake_case (legacy)
      is_enabled?: boolean;
      whitelabel_logo_url?: string;
      whitelabel_company_name?: string;
      show_powered_by_homie?: boolean;
      default_language?: string;
      supported_languages?: string[];
      sla_urgent_minutes?: number;
      sla_high_minutes?: number;
      sla_medium_minutes?: number;
      sla_low_minutes?: number;
      require_pm_approval?: boolean;
    };

    try {
      const [existing] = await db
        .select()
        .from(guestReporterSettings)
        .where(eq(guestReporterSettings.workspaceId, workspaceId))
        .limit(1);

      const now = new Date();

      const values = {
        workspaceId,
        isEnabled: body.isEnabled ?? body.is_enabled ?? false,
        whitelabelLogoUrl: body.whitelabelLogoUrl ?? body.whitelabel_logo_url ?? null,
        whitelabelCompanyName: body.whitelabelCompanyName ?? body.whitelabel_company_name ?? null,
        showPoweredByHomie: body.showPoweredByHomie ?? body.show_powered_by_homie ?? true,
        defaultLanguage: body.defaultLanguage ?? body.default_language ?? 'en',
        supportedLanguages: body.supportedLanguages ?? body.supported_languages ?? ['en'],
        slaUrgentMinutes: body.slaUrgentMinutes ?? body.sla_urgent_minutes ?? 30,
        slaHighMinutes: body.slaHighMinutes ?? body.sla_high_minutes ?? 60,
        slaMediumMinutes: body.slaMediumMinutes ?? body.sla_medium_minutes ?? 120,
        slaLowMinutes: body.slaLowMinutes ?? body.sla_low_minutes ?? 240,
        requirePmApproval: body.requirePmApproval ?? body.require_pm_approval ?? true,
        updatedAt: now,
      };

      let settings;
      if (existing) {
        [settings] = await db
          .update(guestReporterSettings)
          .set(values)
          .where(eq(guestReporterSettings.workspaceId, workspaceId))
          .returning();
      } else {
        [settings] = await db
          .insert(guestReporterSettings)
          .values(values)
          .returning();
      }

      // Seed default categories when enabling for the first time
      if ((body.isEnabled ?? body.is_enabled) && (!existing || !existing.isEnabled)) {
        await seedDefaultCategories(workspaceId);
      }

      res.json({
        data: {
          id: settings.id,
          isEnabled: settings.isEnabled,
          whitelabelLogoUrl: settings.whitelabelLogoUrl,
          whitelabelCompanyName: settings.whitelabelCompanyName,
          showPoweredByHomie: settings.showPoweredByHomie,
          defaultLanguage: settings.defaultLanguage,
          supportedLanguages: settings.supportedLanguages,
          slaUrgentMinutes: settings.slaUrgentMinutes,
          slaHighMinutes: settings.slaHighMinutes,
          slaMediumMinutes: settings.slaMediumMinutes,
          slaLowMinutes: settings.slaLowMinutes,
          requirePmApproval: settings.requirePmApproval,
        },
        error: null,
        meta: {},
      });
    } catch (err) {
      logger.error({ err }, '[PUT /:workspaceId/guest-reporter/settings]');
      res.status(500).json({ data: null, error: 'Failed to update settings', meta: {} });
    }
  },
);

// ── GET /:workspaceId/guest-reporter/auto-dispatch-rules — List rules ───────

guestPmRouter.get(
  '/:workspaceId/guest-reporter/auto-dispatch-rules',
  requireWorkspace,
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;

    try {
      const rules = await db
        .select({
          id: guestAutoDispatchRules.id,
          categoryId: guestAutoDispatchRules.categoryId,
          categoryName: guestIssueCategories.name,
          categoryIcon: guestIssueCategories.icon,
          minSeverity: guestAutoDispatchRules.minSeverity,
          preferredVendorId: guestAutoDispatchRules.preferredVendorId,
          isEnabled: guestAutoDispatchRules.isEnabled,
          createdBy: guestAutoDispatchRules.createdBy,
          createdAt: guestAutoDispatchRules.createdAt,
          updatedAt: guestAutoDispatchRules.updatedAt,
        })
        .from(guestAutoDispatchRules)
        .leftJoin(guestIssueCategories, eq(guestAutoDispatchRules.categoryId, guestIssueCategories.id))
        .where(eq(guestAutoDispatchRules.workspaceId, workspaceId))
        .orderBy(asc(guestAutoDispatchRules.createdAt));

      res.json({
        data: {
          rules: rules.map((r) => ({
            id: r.id,
            categoryId: r.categoryId,
            categoryName: r.categoryName,
            categoryIcon: r.categoryIcon,
            minSeverity: r.minSeverity,
            preferredVendorId: r.preferredVendorId,
            isEnabled: r.isEnabled,
          })),
        },
        error: null,
        meta: {},
      });
    } catch (err) {
      logger.error({ err }, '[GET /:workspaceId/guest-reporter/auto-dispatch-rules]');
      res.status(500).json({ data: null, error: 'Failed to list auto-dispatch rules', meta: {} });
    }
  },
);

// ── POST /:workspaceId/guest-reporter/auto-dispatch-rules — Create rule ─────

guestPmRouter.post(
  '/:workspaceId/guest-reporter/auto-dispatch-rules',
  requireWorkspace,
  requireWorkspaceRole('admin'),
  async (req: Request, res: Response) => {
    const { workspaceId } = req.params;
    const body = req.body as {
      categoryId?: string;
      minSeverity?: string;
      preferredVendorId?: string;
      isEnabled?: boolean;
      // Legacy snake_case support
      category_id?: string;
      min_severity?: string;
      preferred_vendor_id?: string;
      is_enabled?: boolean;
    };

    const categoryId = body.categoryId ?? body.category_id;

    if (!categoryId) {
      res.status(400).json({ data: null, error: 'categoryId is required', meta: {} });
      return;
    }

    try {
      const [rule] = await db
        .insert(guestAutoDispatchRules)
        .values({
          workspaceId,
          categoryId,
          minSeverity: (body.minSeverity ?? body.min_severity) || 'high',
          preferredVendorId: (body.preferredVendorId ?? body.preferred_vendor_id) || null,
          isEnabled: body.isEnabled ?? body.is_enabled ?? true,
          createdBy: req.homeownerId,
        })
        .returning();

      res.status(201).json({
        data: {
          id: rule.id,
          categoryId: rule.categoryId,
          minSeverity: rule.minSeverity,
          preferredVendorId: rule.preferredVendorId,
          isEnabled: rule.isEnabled,
          createdBy: rule.createdBy,
          createdAt: rule.createdAt,
          updatedAt: rule.updatedAt,
        },
        error: null,
        meta: {},
      });
    } catch (err) {
      logger.error({ err }, '[POST /:workspaceId/guest-reporter/auto-dispatch-rules]');
      res.status(500).json({ data: null, error: 'Failed to create auto-dispatch rule', meta: {} });
    }
  },
);

// ── PUT /:workspaceId/guest-reporter/auto-dispatch-rules/:ruleId — Update ───

guestPmRouter.put(
  '/:workspaceId/guest-reporter/auto-dispatch-rules/:ruleId',
  requireWorkspace,
  requireWorkspaceRole('admin'),
  async (req: Request, res: Response) => {
    const { workspaceId, ruleId } = req.params;
    const body = req.body as {
      categoryId?: string;
      minSeverity?: string;
      preferredVendorId?: string;
      isEnabled?: boolean;
      // Legacy snake_case support
      category_id?: string;
      min_severity?: string;
      preferred_vendor_id?: string;
      is_enabled?: boolean;
    };

    try {
      const [existing] = await db
        .select({ id: guestAutoDispatchRules.id })
        .from(guestAutoDispatchRules)
        .where(and(eq(guestAutoDispatchRules.id, ruleId), eq(guestAutoDispatchRules.workspaceId, workspaceId)))
        .limit(1);

      if (!existing) {
        res.status(404).json({ data: null, error: 'Rule not found', meta: {} });
        return;
      }

      const categoryId = body.categoryId ?? body.category_id;
      const minSeverity = body.minSeverity ?? body.min_severity;
      const preferredVendorId = body.preferredVendorId ?? body.preferred_vendor_id;
      const isEnabled = body.isEnabled ?? body.is_enabled;

      const updateValues: Record<string, unknown> = { updatedAt: new Date() };
      if (categoryId !== undefined) updateValues.categoryId = categoryId;
      if (minSeverity !== undefined) updateValues.minSeverity = minSeverity;
      if (preferredVendorId !== undefined) updateValues.preferredVendorId = preferredVendorId;
      if (isEnabled !== undefined) updateValues.isEnabled = isEnabled;

      const [rule] = await db
        .update(guestAutoDispatchRules)
        .set(updateValues)
        .where(eq(guestAutoDispatchRules.id, ruleId))
        .returning();

      res.json({
        data: {
          id: rule.id,
          categoryId: rule.categoryId,
          minSeverity: rule.minSeverity,
          preferredVendorId: rule.preferredVendorId,
          isEnabled: rule.isEnabled,
          createdBy: rule.createdBy,
          createdAt: rule.createdAt,
          updatedAt: rule.updatedAt,
        },
        error: null,
        meta: {},
      });
    } catch (err) {
      logger.error({ err }, '[PUT /:workspaceId/guest-reporter/auto-dispatch-rules/:ruleId]');
      res.status(500).json({ data: null, error: 'Failed to update auto-dispatch rule', meta: {} });
    }
  },
);

// ── DELETE /:workspaceId/guest-reporter/auto-dispatch-rules/:ruleId ─────────

guestPmRouter.delete(
  '/:workspaceId/guest-reporter/auto-dispatch-rules/:ruleId',
  requireWorkspace,
  requireWorkspaceRole('admin'),
  async (req: Request, res: Response) => {
    const { workspaceId, ruleId } = req.params;

    try {
      const [existing] = await db
        .select({ id: guestAutoDispatchRules.id })
        .from(guestAutoDispatchRules)
        .where(and(eq(guestAutoDispatchRules.id, ruleId), eq(guestAutoDispatchRules.workspaceId, workspaceId)))
        .limit(1);

      if (!existing) {
        res.status(404).json({ data: null, error: 'Rule not found', meta: {} });
        return;
      }

      await db
        .delete(guestAutoDispatchRules)
        .where(eq(guestAutoDispatchRules.id, ruleId));

      res.json({ data: { success: true }, error: null, meta: {} });
    } catch (err) {
      logger.error({ err }, '[DELETE /:workspaceId/guest-reporter/auto-dispatch-rules/:ruleId]');
      res.status(500).json({ data: null, error: 'Failed to delete auto-dispatch rule', meta: {} });
    }
  },
);
