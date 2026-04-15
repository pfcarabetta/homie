/**
 * Extract inspection items from parsed supporting documents.
 *
 * Pest reports and seller disclosures often surface issues the inspector
 * missed. This service creates inspection items from the structured parser
 * output so those findings can be quoted and negotiated alongside the
 * inspector's own items.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { inspectionReportItems, inspectionSupportingDocuments } from '../db/schema/inspector';
import logger from '../logger';
import type { PestReportSummary, SellerDisclosureSummary } from './document-parsers';

type ItemSeverity = 'safety_hazard' | 'urgent' | 'recommended' | 'monitor' | 'informational';

function mapPestSeverity(s: string): ItemSeverity {
  switch (s) {
    case 'safety_hazard': return 'safety_hazard';
    case 'urgent': return 'urgent';
    case 'recommended': return 'recommended';
    case 'monitor': return 'monitor';
    default: return 'informational';
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + '\u2026';
}

export async function extractItemsFromDoc(docId: string): Promise<number> {
  const [doc] = await db.select().from(inspectionSupportingDocuments)
    .where(eq(inspectionSupportingDocuments.id, docId)).limit(1);
  if (!doc || !doc.parsedSummary) return 0;

  // Find the current max sortOrder for the report so new items go to the end
  const existing = await db.select({ sortOrder: inspectionReportItems.sortOrder })
    .from(inspectionReportItems)
    .where(eq(inspectionReportItems.reportId, doc.reportId));
  const baseSortOrder = existing.length > 0
    ? Math.max(...existing.map(e => e.sortOrder)) + 1
    : 0;

  const summary = doc.parsedSummary as Record<string, unknown>;
  const toInsert: Array<{
    reportId: string;
    title: string;
    description: string;
    category: string;
    severity: ItemSeverity;
    locationInProperty: string | null;
    sortOrder: number;
    sourceDocumentId: string;
    sourcePages: number[] | null;
    aiCostEstimateLowCents: number;
    aiCostEstimateHighCents: number;
  }> = [];

  if (doc.documentType === 'pest_report') {
    const pest = summary as unknown as PestReportSummary;
    const findings = Array.isArray(pest.findings) ? pest.findings : [];
    // Distribute the total estimate evenly across findings that need treatment
    const actionable = findings.filter(f => f.severity !== 'informational');
    const perItemLow = pest.treatmentEstimateRange && actionable.length > 0
      ? Math.round((pest.treatmentEstimateRange.lowCents || 0) / actionable.length)
      : 0;
    const perItemHigh = pest.treatmentEstimateRange && actionable.length > 0
      ? Math.round((pest.treatmentEstimateRange.highCents || 0) / actionable.length)
      : 0;

    actionable.forEach((finding, idx) => {
      const title = truncate(
        [finding.pestType, finding.affectedArea].filter(Boolean).join(' \u2014 '),
        120,
      );
      const descParts: string[] = [];
      if (finding.evidence) descParts.push(finding.evidence);
      if (finding.treatmentRecommended) descParts.push(`Recommended treatment: ${finding.treatmentRecommended}`);
      toInsert.push({
        reportId: doc.reportId,
        title,
        description: descParts.join('\n\n'),
        category: 'pest_control',
        severity: mapPestSeverity(finding.severity),
        locationInProperty: finding.affectedArea || null,
        sortOrder: baseSortOrder + idx,
        sourceDocumentId: doc.id,
        sourcePages: Array.isArray(finding.sourcePages) && finding.sourcePages.length > 0
          ? finding.sourcePages
          : null,
        aiCostEstimateLowCents: perItemLow,
        aiCostEstimateHighCents: perItemHigh,
      });
    });
  } else if (doc.documentType === 'seller_disclosure') {
    const disc = summary as unknown as SellerDisclosureSummary;
    const issues = Array.isArray(disc.disclosedIssues) ? disc.disclosedIssues : [];
    // Only create items for ongoing / unknown status. "fixed" issues don't need action.
    const actionable = issues.filter(i => i.status !== 'fixed');
    actionable.forEach((issue, idx) => {
      const title = truncate(issue.description || `Disclosed ${issue.category}`, 120);
      const descParts: string[] = [];
      if (issue.description) descParts.push(issue.description);
      if (issue.notes) descParts.push(`Notes: ${issue.notes}`);
      if (issue.dateOfIssue) descParts.push(`Date of issue: ${issue.dateOfIssue}`);
      if (issue.status === 'ongoing') descParts.push('Seller indicates this issue is still present.');
      else if (issue.status === 'unknown') descParts.push('Seller status unknown \u2014 recommend independent verification.');
      toInsert.push({
        reportId: doc.reportId,
        title,
        description: descParts.join('\n\n'),
        category: issue.category || 'general_repair',
        severity: issue.status === 'ongoing' ? 'recommended' : 'monitor',
        locationInProperty: null,
        sortOrder: baseSortOrder + idx,
        sourceDocumentId: doc.id,
        sourcePages: Array.isArray(issue.sourcePages) && issue.sourcePages.length > 0
          ? issue.sourcePages
          : null,
        aiCostEstimateLowCents: 0,
        aiCostEstimateHighCents: 0,
      });
    });
  } else {
    return 0;
  }

  if (toInsert.length === 0) return 0;
  await db.insert(inspectionReportItems).values(toInsert);
  logger.info({ docId, count: toInsert.length, docType: doc.documentType }, '[doc-item-extractor] Items created');
  return toInsert.length;
}
