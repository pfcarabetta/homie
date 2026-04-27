import { and, eq, lte, isNull } from 'drizzle-orm';
import { db } from '../db';
import { inspectionReports, inspectorPartners } from '../db/schema/inspector';
import { sendEmail } from './notifications';
import logger from '../logger';

/**
 * 5-day reminder sweep for sent inspection reports the homeowner
 * never opened. Fires once per report (homeownerReminderSentAt acts
 * as the idempotency flag). Suppressed when the homeowner already
 * opened the email — see the email tracking pixel route in
 * routes/inspector.ts which stamps homeownerOpenedAt.
 *
 * Polls every 60 minutes — finer cadence isn't worth it; the trigger
 * is "more than 5 days have passed", which doesn't move minute-to-minute.
 *
 * Keys off `clientNotifiedAt` — set when the inspector clicks Send to
 * Client in their portal. (The legacy auto-email-on-parse path stamped
 * `homeownerEmailedAt`; that path was removed when the inspector-
 * controlled send modal shipped.)
 */

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const REMINDER_DELAY_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export function startInspectionReminderWorker(): void {
  async function tick(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - REMINDER_DELAY_MS);

      // Pull every report that:
      //   • the inspector clicked Send to Client ≥ 5 days ago
      //     (clientNotifiedAt is the source of truth for "homeowner has
      //     received an email about this report")
      //   • homeowner has not opened (homeownerOpenedAt IS NULL)
      //   • we haven't already reminded (homeownerReminderSentAt IS NULL)
      const due = await db
        .select({
          id: inspectionReports.id,
          clientName: inspectionReports.clientName,
          clientEmail: inspectionReports.clientEmail,
          clientAccessToken: inspectionReports.clientAccessToken,
          inspectorPartnerId: inspectionReports.inspectorPartnerId,
        })
        .from(inspectionReports)
        .where(
          and(
            lte(inspectionReports.clientNotifiedAt, cutoff),
            isNull(inspectionReports.homeownerOpenedAt),
            isNull(inspectionReports.homeownerReminderSentAt),
          ),
        )
        .limit(100); // safety cap; loop next tick if backlog

      if (due.length === 0) return;
      logger.info({ count: due.length }, '[inspection-reminder] firing reminders');

      const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

      for (const r of due) {
        try {
          // Resolve inspector company name for branded copy. Fallback
          // is generic ("your inspector") if the join is empty —
          // shouldn't happen but guards against orphaned reports.
          let companyName = 'your inspector';
          if (r.inspectorPartnerId) {
            const [ip] = await db
              .select({ companyName: inspectorPartners.companyName })
              .from(inspectorPartners)
              .where(eq(inspectorPartners.id, r.inspectorPartnerId))
              .limit(1);
            companyName = ip?.companyName ?? companyName;
          }

          const reportUrl = `${APP_URL}/inspect/${r.clientAccessToken}`;
          const greeting = r.clientName ? `Hi ${r.clientName.split(' ')[0]},` : 'Hi,';
          const subject = `Reminder: your Homie inspection report from ${companyName} is still here`;
          const html = `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#2D2926;">
              <h2 style="font-family:Georgia,serif;font-size:22px;margin:0 0 12px;">Still here when you need it</h2>
              <p style="font-size:15px;line-height:1.5;color:#6B6560;">${greeting}</p>
              <p style="font-size:15px;line-height:1.5;color:#6B6560;">
                Just a quick note that your inspection report from ${companyName} is parsed and waiting.
                We've estimated repair costs for every item — open it whenever you're ready and pull
                real quotes from local pros in minutes.
              </p>
              <p style="text-align:center;margin:28px 0;">
                <a href="${reportUrl}" style="display:inline-block;background:#E8632B;color:#fff;text-decoration:none;padding:14px 28px;border-radius:100px;font-weight:600;font-size:15px;">View your report &rarr;</a>
              </p>
              <p style="font-size:13px;color:#9B9490;line-height:1.5;">
                Your link stays active for 90 days from the date of upload. We won't send another reminder.
              </p>
            </div>
          `.trim();

          await sendEmail(r.clientEmail, subject, html);
          await db.update(inspectionReports)
            .set({ homeownerReminderSentAt: new Date(), updatedAt: new Date() })
            .where(eq(inspectionReports.id, r.id));
        } catch (err) {
          // One failure shouldn't block the rest of the batch.
          logger.error({ err, reportId: r.id }, '[inspection-reminder] reminder send failed');
        }
      }
    } catch (err) {
      logger.error({ err }, '[inspection-reminder] tick failed');
    }
  }

  void tick();
  setInterval(() => { void tick(); }, CHECK_INTERVAL_MS);
}
