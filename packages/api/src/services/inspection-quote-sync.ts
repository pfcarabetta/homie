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

export async function syncInspectionQuote(jobId: string, providerId: string, quotedPrice: string | null, itemPrices?: Record<string, number>): Promise<void> {
  try {
    // Check if this job originated from an inspection dispatch
    const [job] = await db.select({ diagnosis: jobs.diagnosis }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) return;

    const diag = job.diagnosis as Record<string, unknown> | null;
    if (!diag || diag.source !== 'inspection_report') return;

    // Support both single-item (legacy) and grouped dispatches
    const itemIds: string[] = [];
    if (Array.isArray(diag.inspectionItemIds)) {
      itemIds.push(...(diag.inspectionItemIds as string[]));
    } else if (diag.inspectionItemId) {
      itemIds.push(diag.inspectionItemId as string);
    }
    if (itemIds.length === 0) return;

    // Get provider info
    const [provider] = await db.select({
      name: providers.name,
      rating: providers.rating,
    }).from(providers).where(eq(providers.id, providerId)).limit(1);

    // Parse the bundle price to cents (used as fallback when no per-item prices given)
    let bundleCents: number | null = null;
    if (quotedPrice) {
      const cleaned = quotedPrice.replace(/[^0-9.]/g, '');
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed)) bundleCents = Math.round(parsed * 100);
    }

    const isItemized = itemPrices && Object.keys(itemPrices).length > 0;
    // For bundle quotes spanning >1 item, mark each item's quote with bundleSize so the UI
    // can display "Bundle: $X (covers N items)" instead of misleading per-item totals.
    const bundleSize = !isItemized && itemIds.length > 1 ? itemIds.length : undefined;

    // Update all items in this group (single item for legacy, multiple for category groups)
    let reportId: string | null = null;
    for (const itemId of itemIds) {
      const [currentItem] = await db.select({
        quotes: inspectionReportItems.quotes,
        reportId: inspectionReportItems.reportId,
      }).from(inspectionReportItems).where(eq(inspectionReportItems.id, itemId)).limit(1);
      if (!currentItem) continue;

      reportId = currentItem.reportId;

      // Per-item price wins; otherwise fall back to the bundle total
      const thisItemCents = isItemized
        ? (itemPrices![itemId] ?? 0)
        : (bundleCents ?? 0);

      const newQuote = {
        providerId,
        providerName: provider?.name ?? 'Provider',
        providerRating: provider?.rating ?? null,
        amountCents: thisItemCents,
        availability: null as string | null,
        receivedAt: new Date().toISOString(),
        ...(bundleSize ? { bundleSize } : {}),
      };

      const existingQuotes = (currentItem.quotes ?? []) as Array<{
        providerId: string; providerName: string; providerRating: string | null;
        amountCents: number; availability: string | null; receivedAt: string; bundleSize?: number;
      }>;
      const allQuotes = [...existingQuotes, newQuote];

      const validQuotes = allQuotes.filter(q => q.amountCents > 0);
      const best = validQuotes.length > 0
        ? validQuotes.reduce((a, b) => a.amountCents <= b.amountCents ? a : b)
        : newQuote;

      await db.update(inspectionReportItems).set({
        dispatchStatus: 'quotes_received',
        quotes: allQuotes,
        quoteAmountCents: best.amountCents || thisItemCents,
        providerName: best.providerName,
        providerRating: best.providerRating,
        updatedAt: new Date(),
      }).where(eq(inspectionReportItems.id, itemId));
    }

    // Update report totals
    if (reportId) {
      const quotedItems = await db.select({
        quoteAmountCents: inspectionReportItems.quoteAmountCents,
      }).from(inspectionReportItems).where(
        and(eq(inspectionReportItems.reportId, reportId), eq(inspectionReportItems.dispatchStatus, 'quotes_received'))
      );

      const totalQuoteCents = quotedItems.reduce((sum, i) => sum + (i.quoteAmountCents ?? 0), 0);

      await db.update(inspectionReports).set({
        itemsQuoted: quotedItems.length,
        totalQuoteValueCents: totalQuoteCents,
        updatedAt: new Date(),
      }).where(eq(inspectionReports.id, reportId));

      // Send one email notification per category group quote
      try {
        const [report] = await db.select({
          clientEmail: inspectionReports.clientEmail,
          clientName: inspectionReports.clientName,
          propertyAddress: inspectionReports.propertyAddress,
          clientAccessToken: inspectionReports.clientAccessToken,
        }).from(inspectionReports).where(eq(inspectionReports.id, reportId)).limit(1);

        if (report?.clientEmail) {
          const itemTitles = await db.select({ title: inspectionReportItems.title })
            .from(inspectionReportItems).where(sql`${inspectionReportItems.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`);

          const category = (diag.category as string ?? 'repair').replace(/_/g, ' ');
          const APP_URL = process.env.CORS_ORIGIN?.split(',')[0]?.trim() ?? 'http://localhost:3000';
          const reportUrl = `${APP_URL}/inspect/${report.clientAccessToken}`;
          const totalCents = isItemized
            ? Object.values(itemPrices!).reduce((s, c) => s + c, 0)
            : bundleCents ?? 0;
          const priceDisplay = totalCents > 0 ? `$${(totalCents / 100).toFixed(0)}` : 'See details';
          const itemList = itemTitles.map(i => `• ${i.title}`).join('<br>');

          const { sendEmail } = await import('./notifications');
          await sendEmail(
            report.clientEmail,
            `Quote received: ${itemIds.length} ${category} item${itemIds.length !== 1 ? 's' : ''} — ${priceDisplay} from ${provider?.name ?? 'a provider'}`,
            `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;background:#F9F5F2">
              <div style="background:#2D2926;padding:20px 32px;text-align:center">
                <span style="color:#E8632B;font-size:24px;font-weight:bold;font-family:Georgia,serif">homie</span>
                <span style="color:rgba(255,255,255,0.5);font-size:12px;margin-left:8px">inspect</span>
              </div>
              <div style="background:white;padding:32px">
                <p style="color:#2D2926;font-size:18px;font-weight:600;margin:0 0 4px">Quote received!</p>
                <p style="color:#9B9490;font-size:14px;margin:0 0 20px">${report.propertyAddress} · ${category}</p>
                <div style="background:#E1F5EE;border-radius:12px;padding:16px;margin-bottom:20px">
                  <p style="color:#2D2926;font-size:15px;font-weight:600;margin:0 0 8px">${itemIds.length} ${category} item${itemIds.length !== 1 ? 's' : ''}</p>
                  <p style="color:#6B6560;font-size:13px;margin:0 0 8px;line-height:1.5">${itemList}</p>
                  <p style="color:#1B9E77;font-size:22px;font-weight:700;margin:4px 0">${priceDisplay}</p>
                  <p style="color:#6B6560;font-size:13px;margin:0">${provider?.name ?? 'Provider'}${provider?.rating ? ' · ' + provider.rating + ' stars' : ''}</p>
                </div>
                <div style="text-align:center">
                  <a href="${reportUrl}" style="display:inline-block;background:#E8632B;color:white;padding:14px 32px;border-radius:100px;text-decoration:none;font-weight:600;font-size:16px">View all quotes</a>
                </div>
              </div>
            </div>`,
          );
        }
      } catch (emailErr) {
        logger.warn({ err: emailErr, itemIds }, '[inspection-quote-sync] Client email notification failed');
      }
    }

    logger.info({ jobId, itemIds, providerId, bundleCents }, '[inspection-quote-sync] Quote synced to inspection items');
  } catch (err) {
    logger.warn({ err, jobId }, '[inspection-quote-sync] Failed to sync quote');
  }
}
