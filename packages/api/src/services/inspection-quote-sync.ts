/**
 * Syncs provider quote responses back to inspection report items.
 *
 * When a provider responds to a job that originated from an inspection
 * dispatch, this function updates the corresponding inspection_report_item
 * with the quote data and recalculates the report's totals.
 *
 * Called from the notifyWorkspaceOfQuote flow (which fires on every
 * provider response regardless of channel).
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { jobs } from '../db/schema/jobs';
import { inspectionReportItems, inspectionReports } from '../db/schema/inspector';
import { providers } from '../db/schema/providers';
import logger from '../logger';

export async function syncInspectionQuote(jobId: string, providerId: string, quotedPrice: string | null): Promise<void> {
  try {
    // Check if this job originated from an inspection dispatch
    const [job] = await db.select({ diagnosis: jobs.diagnosis }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return;

    const diag = job.diagnosis as Record<string, unknown> | null;
    if (!diag || diag.source !== 'inspection_report') return;

    const itemId = diag.inspectionItemId as string | undefined;
    if (!itemId) return;

    // Get provider info
    const [provider] = await db.select({
      name: providers.name,
      googleRating: providers.googleRating,
    }).from(providers).where(eq(providers.id, providerId)).limit(1);

    // Parse the price to cents
    let priceCents: number | null = null;
    if (quotedPrice) {
      const cleaned = quotedPrice.replace(/[^0-9.]/g, '');
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed)) priceCents = Math.round(parsed * 100);
    }

    // Get current item to append to quotes array
    const [currentItem] = await db.select({
      quotes: inspectionReportItems.quotes,
      quoteAmountCents: inspectionReportItems.quoteAmountCents,
    }).from(inspectionReportItems).where(eq(inspectionReportItems.id, itemId)).limit(1);

    const existingQuotes = (currentItem?.quotes ?? []) as Array<{
      providerId: string; providerName: string; providerRating: string | null;
      amountCents: number; availability: string | null; receivedAt: string;
    }>;

    // Add new quote to the array
    const newQuote = {
      providerId,
      providerName: provider?.name ?? 'Provider',
      providerRating: provider?.googleRating ?? null,
      amountCents: priceCents ?? 0,
      availability: null as string | null,
      receivedAt: new Date().toISOString(),
    };
    const allQuotes = [...existingQuotes, newQuote];

    // Best quote = lowest price (excluding $0)
    const validQuotes = allQuotes.filter(q => q.amountCents > 0);
    const best = validQuotes.length > 0
      ? validQuotes.reduce((a, b) => a.amountCents <= b.amountCents ? a : b)
      : newQuote;

    // Update the inspection item with all quotes + best quote as primary
    await db.update(inspectionReportItems).set({
      dispatchStatus: 'quotes_received',
      quotes: allQuotes,
      quoteAmountCents: best.amountCents || priceCents,
      providerName: best.providerName,
      providerRating: best.providerRating,
      updatedAt: new Date(),
    }).where(eq(inspectionReportItems.id, itemId));

    // Get the report ID from the item and update report totals
    const [item] = await db.select({ reportId: inspectionReportItems.reportId })
      .from(inspectionReportItems).where(eq(inspectionReportItems.id, itemId)).limit(1);

    if (item?.reportId) {
      // Recount quoted items and total value
      const quotedItems = await db.select({
        quoteAmountCents: inspectionReportItems.quoteAmountCents,
      }).from(inspectionReportItems).where(
        and(eq(inspectionReportItems.reportId, item.reportId), eq(inspectionReportItems.dispatchStatus, 'quotes_received'))
      );

      const totalQuoteCents = quotedItems.reduce((sum, i) => sum + (i.quoteAmountCents ?? 0), 0);

      await db.update(inspectionReports).set({
        itemsQuoted: quotedItems.length,
        totalQuoteValueCents: totalQuoteCents,
        updatedAt: new Date(),
      }).where(eq(inspectionReports.id, item.reportId));

      // Send email notification to client
      try {
        const [report] = await db.select({
          clientEmail: inspectionReports.clientEmail,
          clientName: inspectionReports.clientName,
          propertyAddress: inspectionReports.propertyAddress,
          clientAccessToken: inspectionReports.clientAccessToken,
        }).from(inspectionReports).where(eq(inspectionReports.id, item.reportId)).limit(1);

        if (report?.clientEmail) {
          const [fullItem] = await db.select({ title: inspectionReportItems.title })
            .from(inspectionReportItems).where(eq(inspectionReportItems.id, itemId)).limit(1);

          const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
          const reportUrl = `${APP_URL}/inspect/${report.clientAccessToken}`;
          const priceDisplay = priceCents ? `$${(priceCents / 100).toFixed(0)}` : 'See details';

          const { sendEmail } = await import('./notifications');
          await sendEmail(
            report.clientEmail,
            `Quote received: ${fullItem?.title ?? 'Inspection item'} — ${priceDisplay} from ${provider?.name ?? 'a provider'}`,
            `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#F9F5F2">
              <div style="background:#2D2926;padding:20px 32px;text-align:center">
                <span style="color:#E8632B;font-size:24px;font-weight:bold;font-family:Georgia,serif">homie</span>
                <span style="color:rgba(255,255,255,0.5);font-size:12px;margin-left:8px">inspect</span>
              </div>
              <div style="background:white;padding:32px">
                <p style="color:#2D2926;font-size:18px;font-weight:600;margin:0 0 4px">Quote received!</p>
                <p style="color:#9B9490;font-size:14px;margin:0 0 20px">${report.propertyAddress}</p>
                <div style="background:#E1F5EE;border-radius:12px;padding:16px;margin-bottom:20px">
                  <p style="color:#2D2926;font-size:15px;font-weight:600;margin:0 0 4px">${fullItem?.title ?? 'Item'}</p>
                  <p style="color:#1B9E77;font-size:22px;font-weight:700;margin:4px 0">${priceDisplay}</p>
                  <p style="color:#6B6560;font-size:13px;margin:0">${provider?.name ?? 'Provider'} · ${provider?.googleRating ? provider.googleRating + ' stars' : ''}</p>
                </div>
                <div style="text-align:center">
                  <a href="${reportUrl}" style="display:inline-block;background:#E8632B;color:white;padding:14px 32px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">View all quotes</a>
                </div>
              </div>
            </div>`,
          );
        }
      } catch (emailErr) {
        logger.warn({ err: emailErr, itemId }, '[inspection-quote-sync] Client email notification failed');
      }
    }

    logger.info({ jobId, itemId, providerId, priceCents }, '[inspection-quote-sync] Quote synced to inspection item');
  } catch (err) {
    logger.warn({ err, jobId }, '[inspection-quote-sync] Failed to sync quote');
  }
}
