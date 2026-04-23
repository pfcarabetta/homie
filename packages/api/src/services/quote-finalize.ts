import { eq } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { homeowners } from '../db/schema/homeowners';
import { sendEmail, sendSms } from './notifications';
import { formatQuotedPrice } from './quote-parser';
import { capturePayment } from './stripe';
import logger from '../logger';

/**
 * Shared finalization helpers for the moment a provider quote lands.
 * Originally lived inline in routes/webhooks.ts; extracted here so the
 * SMS-notes-timeout worker (which auto-finalizes stale "awaiting notes"
 * conversations) runs the exact same email/SMS/payment path as the
 * real-time webhook handler.
 */

const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';

/** Email + SMS the homeowner the moment a provider quote arrives. */
export async function notifyHomeownerOfQuote(
  jobId: string,
  providerName: string,
  quotedPrice: string | null,
  availability: string | null,
  message: string | null,
): Promise<void> {
  try {
    const [job] = await db
      .select({ homeownerId: jobs.homeownerId, diagnosis: jobs.diagnosis, workspaceId: jobs.workspaceId })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    if (!job) return;

    const [homeowner] = await db
      .select({
        email: homeowners.email,
        phone: homeowners.phone,
        firstName: homeowners.firstName,
        notifyEmailQuotes: homeowners.notifyEmailQuotes,
        notifySmsQuotes: homeowners.notifySmsQuotes,
      })
      .from(homeowners)
      .where(eq(homeowners.id, job.homeownerId))
      .limit(1);
    if (!homeowner) return;

    const displayPrice = formatQuotedPrice(quotedPrice);

    const diagnosis = job.diagnosis as { category?: string; summary?: string; source?: string } | null;
    const category = diagnosis?.category
      ? diagnosis.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'Home Service';
    const name = homeowner.firstName ?? 'there';
    const isInspectJob = diagnosis?.source === 'inspection_report';
    const quotesUrl = job.workspaceId
      ? `${APP_URL}/business?tab=dispatches`
      : isInspectJob
        ? `${APP_URL}/inspect-portal?tab=quotes`
        : `${APP_URL}/account?tab=quotes`;

    const subject = `You got a quote! ${providerName}${displayPrice ? ` quoted ${displayPrice}` : ''}`;

    const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;padding:0;background:#F9F5F2">
      <div style="background:#2D2926;padding:20px 32px;text-align:center">
        <span style="color:#E8632B;font-size:24px;font-weight:700;font-family:Georgia,serif">homie</span>
      </div>
      <div style="background:white;padding:32px">
        <p style="color:#2D2926;font-size:18px;font-weight:600;margin:0 0 4px">Hey ${name}!</p>
        <p style="color:#6B6560;font-size:14px;margin:0 0 24px">A provider responded to your ${category.toLowerCase()} request</p>

        <div style="background:#F9F5F2;border-radius:12px;padding:20px;margin-bottom:24px;border:1px solid rgba(0,0,0,0.04)">
          <div style="font-size:17px;font-weight:700;color:#2D2926;margin-bottom:12px">${providerName}</div>
          ${displayPrice ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6B6560;font-size:14px">Estimated Price</span><span style="color:#E8632B;font-size:18px;font-weight:700">${displayPrice}</span></div>` : ''}
          ${availability ? `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="color:#6B6560;font-size:14px">Availability</span><span style="color:#2D2926;font-size:14px;font-weight:600">${availability}</span></div>` : ''}
          ${message ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(0,0,0,0.06)"><span style="color:#9B9490;font-size:12px">Provider's note:</span><div style="color:#6B6560;font-size:14px;font-style:italic;margin-top:4px">"${message}"</div></div>` : ''}
        </div>

        <div style="text-align:center">
          <a href="${quotesUrl}" style="display:inline-block;background:#E8632B;color:white;padding:14px 36px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">${job.workspaceId ? 'View Dispatches' : 'View All Quotes'}</a>
        </div>
      </div>
      <div style="padding:20px 32px;text-align:center">
        <p style="color:#9B9490;font-size:12px;margin:0">&copy; ${new Date().getFullYear()} Homie Technologies, Inc.</p>
      </div>
    </div>`;

    if (homeowner.notifyEmailQuotes !== false) {
      await sendEmail(homeowner.email, subject, html);
      logger.info(`[notification] Quote email sent to ${homeowner.email} for job ${jobId}`);
    }

    if (homeowner.phone && homeowner.notifySmsQuotes !== false) {
      const smsText = `Homie: ${providerName} responded to your ${category.toLowerCase()} request!${displayPrice ? ` Quote: ${displayPrice}.` : ''}${availability ? ` Available: ${availability}.` : ''} ${job.workspaceId ? 'View dispatches' : 'View quotes'}: ${quotesUrl}`;
      await sendSms(homeowner.phone, smsText);
      logger.info(`[notification] Quote SMS sent to ${homeowner.phone} for job ${jobId}`);
    }
  } catch (err) {
    logger.error({ err }, `[notification] Failed to send quote email for job ${jobId}`);
  }
}

/** Capture the authorized Stripe PaymentIntent once a quote lands. */
export async function captureJobPayment(jobId: string): Promise<void> {
  try {
    const [job] = await db
      .select({ paymentStatus: jobs.paymentStatus, stripePaymentIntentId: jobs.stripePaymentIntentId })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (job?.paymentStatus === 'authorized' && job.stripePaymentIntentId) {
      await capturePayment(job.stripePaymentIntentId);
      await db.update(jobs).set({ paymentStatus: 'paid' }).where(eq(jobs.id, jobId));
      logger.info(`[payment] Captured payment for job ${jobId}`);
    }
  } catch (err) {
    logger.error({ err }, `[payment] Failed to capture payment for job ${jobId}`);
  }
}
