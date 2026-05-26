import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { inspectionReports, inspectionReportItems } from '../db/schema/inspector';
import { recurringVendors } from '../db/schema/recurring-vendors';

/**
 * Dashboard Direction A — Next Step prioritizer.
 *
 * Surfaces ONE adaptive recommendation at a time, ranked from a stream
 * of candidate signals. The dashboard renders the result as the single
 * "Next Step" card. Tapping "Skip for now" pushes the current step's
 * stable key onto homeowners.skipped_next_steps with a timestamp; this
 * function filters out skips less than 24h old.
 *
 * Priority (top wins):
 *   1. Safety hazard inspection items
 *   2. Urgent inspection items, ranked by AI-estimated score impact
 *   3. Inspect Premium bundle expiry warning (< 30 days)
 *   4. Recommended inspection items by score impact
 *   5. "Add your first homie" if homeowner has zero recurring vendors
 *   6. "All clear" fallback
 *
 * Phase B+ will inject seasonal walkthrough nudges, Premier concierge
 * messages, and Smart Suggestion content into the stream as new
 * features ship. Each new source plugs in here with its own skipKey
 * prefix so the skip-tracking continues to work without changes.
 */

const SKIP_TTL_MS = 24 * 60 * 60 * 1000;

export type NextStepKind =
  | 'safety_hazard_item'
  | 'urgent_item'
  | 'recommended_item'
  | 'bundle_expiry'
  | 'add_vendor'
  | 'all_clear';

export type NextStepCtaAction =
  | 'dispatch_item'
  | 'continue_plus'
  | 'navigate_homies'
  | 'navigate_quote';

export interface NextStep {
  kind: NextStepKind;
  /** Stable identifier used by /skip — must round-trip the same value
   *  the client sends back so we can record the skip correctly. */
  skipKey: string;
  /** Whether this step should render with the urgent visual treatment
   *  (red top border, ⚠ chip). True for safety hazards and < 7 day
   *  bundle expiry. */
  urgent: boolean;
  /** Eyebrow label rendered above the title — e.g. 'NEXT STEP · SAFETY'. */
  eyebrow: string;
  title: string;
  description: string;
  /** Primary CTA. */
  ctaLabel: string;
  ctaAction: NextStepCtaAction;
  /** Free-form payload for the CTA — interpreted per ctaAction. For
   *  dispatch_item: { reportId, itemId }. For continue_plus: nothing. */
  ctaParams?: Record<string, unknown>;
  /** Secondary "Skip for now" button label. Null = no skip button
   *  (the all_clear state shouldn't be skippable). */
  skipLabel: string | null;
  /** Optional meta line under the description — e.g. "$450-$1,200 · +8 pts" */
  meta?: string;
}

interface InspectionItemRow {
  id: string;
  reportId: string;
  title: string;
  description: string | null;
  severity: string;
  category: string;
  location: string | null;
  costEstimateLow: number;
  costEstimateHigh: number;
}

interface Context {
  now: Date;
  homeownerId: string;
  membershipTier: string;
  membershipSource: string | null;
  membershipExpiresAt: Date | null;
  skipped: Record<string, string>;
}

export async function computeNextStep(homeownerId: string, now: Date = new Date()): Promise<NextStep> {
  const [ho] = await db
    .select({
      tier: homeowners.membershipTier,
      source: homeowners.membershipSource,
      expiresAt: homeowners.membershipExpiresAt,
      skipped: homeowners.skippedNextSteps,
    })
    .from(homeowners)
    .where(eq(homeowners.id, homeownerId))
    .limit(1);
  if (!ho) {
    return allClearStep();
  }
  const ctx: Context = {
    now,
    homeownerId,
    membershipTier: ho.tier as string,
    membershipSource: ho.source,
    membershipExpiresAt: ho.expiresAt,
    skipped: ho.skipped ?? {},
  };

  // Walk the prioritized stream. First non-skipped match wins.
  const candidates: Array<() => Promise<NextStep | null>> = [
    () => safetyHazardCandidate(ctx),
    () => urgentItemCandidate(ctx),
    () => bundleExpiryCandidate(ctx),
    () => recommendedItemCandidate(ctx),
    () => addVendorCandidate(ctx),
  ];
  for (const next of candidates) {
    const step = await next();
    if (step && !isSkipped(ctx.skipped, step.skipKey, ctx.now)) {
      return step;
    }
  }
  return allClearStep();
}

function isSkipped(skipped: Record<string, string>, key: string, now: Date): boolean {
  const at = skipped[key];
  if (!at) return false;
  const ageMs = now.getTime() - new Date(at).getTime();
  return ageMs < SKIP_TTL_MS;
}

// ─── Candidate generators ─────────────────────────────────────────────

async function safetyHazardCandidate(ctx: Context): Promise<NextStep | null> {
  const item = await topOpenItemBySeverity(ctx.homeownerId, 'safety_hazard');
  if (!item) return null;
  const skipKey = `inspection_item:${item.id}`;
  return {
    kind: 'safety_hazard_item',
    skipKey,
    urgent: true,
    eyebrow: 'NEXT STEP · SAFETY',
    title: item.title,
    description: item.description
      ? `Inspector flagged this as a safety hazard. ${item.description}`
      : 'Inspector flagged this as a safety hazard. We recommend addressing this immediately.',
    ctaLabel: 'Get quotes now',
    ctaAction: 'dispatch_item',
    ctaParams: { reportId: item.reportId, itemId: item.id },
    skipLabel: "I'll handle it",
    meta: metaFor(item, 8),
  };
}

async function urgentItemCandidate(ctx: Context): Promise<NextStep | null> {
  const item = await topOpenItemBySeverity(ctx.homeownerId, 'urgent');
  if (!item) return null;
  const skipKey = `inspection_item:${item.id}`;
  return {
    kind: 'urgent_item',
    skipKey,
    urgent: false,
    eyebrow: 'NEXT STEP',
    title: `Fix your ${item.title.toLowerCase()}`,
    description:
      'This is the single biggest thing pulling your score down. ' +
      `Inspector flagged it as urgent${item.description ? ` — ${item.description.toLowerCase()}` : ''}.`,
    ctaLabel: 'Get quotes',
    ctaAction: 'dispatch_item',
    ctaParams: { reportId: item.reportId, itemId: item.id },
    skipLabel: 'Skip for now',
    meta: metaFor(item, 8),
  };
}

async function bundleExpiryCandidate(ctx: Context): Promise<NextStep | null> {
  if (ctx.membershipSource !== 'inspect_premium_bundle' || !ctx.membershipExpiresAt) return null;
  const msLeft = ctx.membershipExpiresAt.getTime() - ctx.now.getTime();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  if (daysLeft <= 0 || daysLeft > 30) return null;
  const urgent = daysLeft <= 7;
  const expiresLabel = ctx.membershipExpiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return {
    kind: 'bundle_expiry',
    skipKey: 'bundle_expiry',
    urgent,
    eyebrow: urgent ? 'NEXT STEP · URGENT' : 'NEXT STEP',
    title: urgent
      ? `Your Plus year ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`
      : `Your Plus year ends ${expiresLabel}`,
    description: urgent
      ? 'After your bundle ends, dispatch reverts to pay-per-action and your Health Score stops updating. Continue Plus to keep everything active.'
      : 'Your year of Plus came with your Premium inspection. Continue at $29/mo to keep your Health Score, dispatch allowance, and vendor management active.',
    ctaLabel: 'Continue Plus',
    ctaAction: 'continue_plus',
    skipLabel: 'Remind me later',
  };
}

async function recommendedItemCandidate(ctx: Context): Promise<NextStep | null> {
  const item = await topOpenItemBySeverity(ctx.homeownerId, 'recommended');
  if (!item) return null;
  const skipKey = `inspection_item:${item.id}`;
  return {
    kind: 'recommended_item',
    skipKey,
    urgent: false,
    eyebrow: 'NEXT STEP',
    title: `Address your ${item.title.toLowerCase()}`,
    description:
      'A small fix today saves a bigger repair later. ' +
      `Inspector recommended this${item.description ? ` — ${item.description.toLowerCase()}` : ''}.`,
    ctaLabel: 'Get quotes',
    ctaAction: 'dispatch_item',
    ctaParams: { reportId: item.reportId, itemId: item.id },
    skipLabel: 'Skip for now',
    meta: metaFor(item, 3),
  };
}

async function addVendorCandidate(ctx: Context): Promise<NextStep | null> {
  // Only nudge if the homeowner has zero recurring vendors on file.
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(recurringVendors)
    .where(and(eq(recurringVendors.homeownerId, ctx.homeownerId), sql`${recurringVendors.status} != 'cancelled'`));
  if (row && row.value > 0) return null;
  return {
    kind: 'add_vendor',
    skipKey: 'add_vendor',
    urgent: false,
    eyebrow: 'NEXT STEP',
    title: 'Add your first homie',
    description:
      'Your cleaner, gardener, pool service — any pro you pay regularly. Homie texts them, pays them, and tracks the spend for taxes. Takes about 60 seconds.',
    ctaLabel: 'Add a homie',
    ctaAction: 'navigate_homies',
    skipLabel: 'Maybe later',
  };
}

function allClearStep(): NextStep {
  return {
    kind: 'all_clear',
    skipKey: 'all_clear',
    urgent: false,
    eyebrow: 'YOU\'RE ALL CAUGHT UP',
    title: 'Your home looks great',
    description:
      'No urgent items, no overdue maintenance, no expiring warranties. Check back tomorrow — we\'ll surface anything new the moment it shows up.',
    ctaLabel: 'Ask Homie anything',
    ctaAction: 'navigate_quote',
    skipLabel: null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Pull the highest-priority open inspection item at a given severity.
 * "Open" = dispatch_status != 'completed'. Cross-references all the
 * homeowner's reports — the dashboard doesn't care which report an
 * item came from, only that something needs attention.
 */
async function topOpenItemBySeverity(homeownerId: string, severity: string): Promise<InspectionItemRow | null> {
  const rows = await db
    .select({
      id: inspectionReportItems.id,
      reportId: inspectionReportItems.reportId,
      title: inspectionReportItems.title,
      description: inspectionReportItems.description,
      severity: inspectionReportItems.severity,
      category: inspectionReportItems.category,
      location: inspectionReportItems.locationInProperty,
      costEstimateLow: inspectionReportItems.aiCostEstimateLowCents,
      costEstimateHigh: inspectionReportItems.aiCostEstimateHighCents,
    })
    .from(inspectionReportItems)
    .innerJoin(inspectionReports, eq(inspectionReportItems.reportId, inspectionReports.id))
    .where(
      and(
        eq(inspectionReports.homeownerId, homeownerId),
        eq(inspectionReportItems.severity, severity),
        // Open = not yet completed via dispatch
        sql`${inspectionReportItems.dispatchStatus} != 'completed' OR ${inspectionReportItems.dispatchStatus} IS NULL`,
        // Skip items already dispatched — we already kicked off outreach
        sql`${inspectionReportItems.dispatchStatus} = 'not_dispatched' OR ${inspectionReportItems.dispatchStatus} IS NULL`,
      ),
    )
    // Highest cost estimate first as a proxy for "biggest deal"
    .orderBy(sql`${inspectionReportItems.aiCostEstimateHighCents} DESC NULLS LAST`)
    .limit(1);
  return rows[0] ?? null;
}

function metaFor(item: InspectionItemRow, scoreImpact: number): string {
  const lo = Math.round(item.costEstimateLow / 100);
  const hi = Math.round(item.costEstimateHigh / 100);
  const price = lo > 0 && hi > 0 ? `$${lo}–$${hi}` : null;
  const parts: string[] = [];
  if (price) parts.push(price);
  parts.push(`+${scoreImpact} pts`);
  return parts.join(' · ');
}

// ─── Skip writes ──────────────────────────────────────────────────────

/**
 * Record a skip for the given step. Updates the homeowner's
 * skipped_next_steps blob. Idempotent — calling twice with the same
 * key just refreshes the timestamp (effectively extends the cooldown).
 */
export async function skipNextStep(homeownerId: string, skipKey: string, now: Date = new Date()): Promise<void> {
  const [ho] = await db
    .select({ skipped: homeowners.skippedNextSteps })
    .from(homeowners)
    .where(eq(homeowners.id, homeownerId))
    .limit(1);
  const current = ho?.skipped ?? {};
  const next = { ...current, [skipKey]: now.toISOString() };
  // Prune expired entries while we're touching the blob — keeps it
  // small for users who skip frequently. A homeowner who skips 20
  // items over 24h would otherwise carry 20 entries forever.
  for (const [k, v] of Object.entries(next)) {
    const ageMs = now.getTime() - new Date(v).getTime();
    if (ageMs >= SKIP_TTL_MS && k !== skipKey) delete next[k];
  }
  await db
    .update(homeowners)
    .set({ skippedNextSteps: next })
    .where(eq(homeowners.id, homeownerId));
}
