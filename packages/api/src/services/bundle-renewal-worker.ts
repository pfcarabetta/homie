import cron from 'node-cron';
import { and, eq, isNotNull, isNull, lt, gt, or } from 'drizzle-orm';
import { db } from '../db';
import { homeowners } from '../db/schema/homeowners';
import { sendEmail } from './notifications';
import logger from '../logger';

/**
 * Inspect Premium bundle renewal worker (Membership Phase 5).
 *
 * Each Inspect Premium tier purchase grants the homeowner a year of
 * free Plus (membership_source='inspect_premium_bundle' +
 * membership_expires_at = now + 365d). This worker emails them at the
 * 30-day and 7-day out marks so they have a clear chance to convert
 * to paid Plus before the bundle expires and dispatch reverts to
 * pay-per-action.
 *
 * Idempotent via the bundle_renewal_30d_sent_at and
 * bundle_renewal_7d_sent_at timestamps on the homeowner row — once a
 * reminder is sent for a given bundle window, it won't fire again
 * unless an admin clears the column manually (e.g., to re-test).
 *
 * Schedule: every day at 09:00 UTC. The window logic uses date-range
 * filters so the worker is forgiving if a day's run fails — it'll
 * catch up the next day.
 *
 * The actual tier flip (plus → free at expiry) is NOT this worker's
 * job. That happens elsewhere (a separate sweep that runs at 00:30 UTC
 * — TODO if needed). Phase 5 ships only the email + in-app banner,
 * not the auto-downgrade. Worst case: a homeowner stays on plus tier
 * one day longer than expected, which is harmless.
 */

const DAILY_AT_9AM_UTC = '0 9 * * *';
const STARTUP_DELAY_MS = 90 * 1000;

const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'https://homiepro.ai';

export function startBundleRenewalWorker(): void {
  logger.info({ schedule: DAILY_AT_9AM_UTC }, '[bundle-renewal-worker] starting daily renewal sweep');

  setTimeout(() => {
    runRenewalSweep().catch((err) =>
      logger.error({ err }, '[bundle-renewal-worker] initial sweep failed'),
    );
  }, STARTUP_DELAY_MS);

  cron.schedule(DAILY_AT_9AM_UTC, () => {
    runRenewalSweep().catch((err) =>
      logger.error({ err }, '[bundle-renewal-worker] scheduled sweep failed'),
    );
  });
}

/**
 * Find Inspect Premium bundle holders with expirations in the 30-day
 * or 7-day windows that haven't been emailed yet, send the reminder,
 * and stamp the timestamp. Public for tests + admin tooling.
 */
export async function runRenewalSweep(now?: Date): Promise<{ sent30d: number; sent7d: number }> {
  const today = now ?? new Date();
  const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sevenDaysFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

  let sent30d = 0;
  let sent7d = 0;

  // 30-day window: expires between 23 and 31 days from now AND no 30d
  // reminder yet sent. The widening before 30 catches anyone we missed
  // on a worker outage day.
  const upper30 = new Date(today.getTime() + 31 * 24 * 60 * 60 * 1000);
  const lower30 = new Date(today.getTime() + 23 * 24 * 60 * 60 * 1000);
  const candidates30 = await db
    .select({
      id: homeowners.id,
      email: homeowners.email,
      firstName: homeowners.firstName,
      expiresAt: homeowners.membershipExpiresAt,
    })
    .from(homeowners)
    .where(
      and(
        eq(homeowners.membershipSource, 'inspect_premium_bundle'),
        eq(homeowners.membershipTier, 'plus'),
        isNotNull(homeowners.membershipExpiresAt),
        gt(homeowners.membershipExpiresAt, lower30),
        lt(homeowners.membershipExpiresAt, upper30),
        isNull(homeowners.bundleRenewal30dSentAt),
      ),
    );

  for (const ho of candidates30) {
    try {
      await sendRenewalEmail(ho, '30');
      await db
        .update(homeowners)
        .set({ bundleRenewal30dSentAt: today })
        .where(eq(homeowners.id, ho.id));
      sent30d++;
    } catch (err) {
      logger.error({ err, homeownerId: ho.id }, '[bundle-renewal-worker] 30d email failed');
    }
  }

  // 7-day window: expires between 0 and 8 days from now AND no 7d
  // reminder yet sent. We deliberately include the day-of-expiry
  // (0 days) — if the bundle expires today, this is the last chance.
  const upper7 = new Date(today.getTime() + 8 * 24 * 60 * 60 * 1000);
  const candidates7 = await db
    .select({
      id: homeowners.id,
      email: homeowners.email,
      firstName: homeowners.firstName,
      expiresAt: homeowners.membershipExpiresAt,
    })
    .from(homeowners)
    .where(
      and(
        eq(homeowners.membershipSource, 'inspect_premium_bundle'),
        eq(homeowners.membershipTier, 'plus'),
        isNotNull(homeowners.membershipExpiresAt),
        gt(homeowners.membershipExpiresAt, today),
        lt(homeowners.membershipExpiresAt, upper7),
        isNull(homeowners.bundleRenewal7dSentAt),
      ),
    );

  for (const ho of candidates7) {
    try {
      await sendRenewalEmail(ho, '7');
      await db
        .update(homeowners)
        .set({ bundleRenewal7dSentAt: today })
        .where(eq(homeowners.id, ho.id));
      sent7d++;
    } catch (err) {
      logger.error({ err, homeownerId: ho.id }, '[bundle-renewal-worker] 7d email failed');
    }
  }

  logger.info(
    { sent30d, sent7d, candidates30: candidates30.length, candidates7: candidates7.length },
    '[bundle-renewal-worker] renewal sweep complete',
  );

  // Reference the unused operator import so TS doesn't complain when
  // we extend this worker later (e.g., a 0-day "your bundle ended" mail).
  void or;

  return { sent30d, sent7d };
}

interface RenewalRow {
  id: string;
  email: string | null;
  firstName: string | null;
  expiresAt: Date | null;
}

async function sendRenewalEmail(ho: RenewalRow, kind: '30' | '7'): Promise<void> {
  if (!ho.email || !ho.expiresAt) return;
  const days = kind === '30' ? 30 : 7;
  const greeting = ho.firstName ? `Hi ${ho.firstName},` : 'Hi,';
  const expiresLabel = ho.expiresAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const subject =
    kind === '30'
      ? 'Your Homie Plus year ends in 30 days'
      : `Your Homie Plus year ends in ${days} days — keep your dispatches`;

  const urgency =
    kind === '30'
      ? 'You have 30 days left to upgrade and keep your Health Score, dispatch allowance, and recurring vendor management.'
      : 'Just one week left. After your bundle ends, dispatch reverts to pay-per-action and your Health Score stops updating.';

  const html = `
    <div style="font-family: 'DM Sans', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #2D2926;">
      <h1 style="font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; margin: 0 0 16px;">
        ${subject}
      </h1>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 12px;">${greeting}</p>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        Your Homie Plus year — included with your Premium inspection — ends on
        <strong>${expiresLabel}</strong>. ${urgency}
      </p>
      <p style="font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Plus is $29/month. Renew now and your Health Score, vendor team, dispatch
        allowance, and seasonal walkthroughs stay active without interruption.
      </p>
      <p style="margin: 0 0 24px;">
        <a href="${APP_URL}/membership"
          style="display: inline-block; padding: 12px 24px; background: #E8632B; color: #fff; text-decoration: none; border-radius: 100px; font-weight: 700; font-size: 14px;">
          Continue Plus — $29/month
        </a>
      </p>
      <p style="font-size: 12px; color: #6B6560; line-height: 1.5; margin: 24px 0 0;">
        Not ready? You'll keep view-only access to your inspection report,
        Home Health Score history, and vendor list — Plus features just turn off
        on ${expiresLabel}.
      </p>
    </div>
  `;

  await sendEmail(ho.email, subject, html);
  logger.info({ homeownerId: ho.id, kind, email: ho.email }, '[bundle-renewal-worker] email sent');
}
