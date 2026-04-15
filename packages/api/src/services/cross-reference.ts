/**
 * Cross-reference insight generator.
 * Takes the inspection items + parsed supporting documents for a report,
 * and asks Claude to find correlations, contradictions, and gaps.
 * Also identifies pairs of items that correlate, and records those
 * links bidirectionally on each item's crossReferencedItemIds column.
 */
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { db } from '../db';
import { inspectionReports, inspectionReportItems, inspectionSupportingDocuments, inspectionCrossReferenceInsights } from '../db/schema/inspector';
import logger from '../logger';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

export interface CrossReferenceInsight {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'concern';
  relatedDocIds: string[];
  relatedItemIds: string[];
}

const SYSTEM_PROMPT = `You are a real estate analyst comparing a home inspection report against supporting documents (pest report, seller disclosure). Your job is to find:
- Correlations: findings that reinforce each other across documents
- Contradictions: where the seller's disclosure or pest report contradicts the inspection
- Gaps: things the seller didn't disclose that the inspection or pest report uncovered

Some inspection items may have been extracted from a supporting document (they show sourceDoc=<docId>). Identify when those items correlate with items from OTHER sources (inspector items or other docs).

Output a JSON object with exactly these keys:
- insights: array of insight objects. Each has:
  - title: short headline (under 80 characters)
  - description: 1-3 sentence explanation linking the findings together. Be specific about what was found in each document.
  - severity: "info" (informational connection), "warning" (worth noting but not urgent), or "concern" (potential red flag for the buyer)
  - relatedDocIds: array of supporting document IDs that contributed to this insight
  - relatedItemIds: array of inspection item IDs that contributed to this insight
- itemLinks: array of pairs of inspection item IDs that correlate — same issue found by different sources, or one issue that reinforces another. Each pair is { "itemIdA": "<uuid>", "itemIdB": "<uuid>" }. Only link items from DIFFERENT sources (one from inspector + one from doc, or two from different docs). Do not link two items that have the same sourceDoc value.

Rules:
- Maximum 8 insights, prioritize the most actionable
- Don't repeat findings — each insight should add new analytical value
- It's OK to have empty arrays if there's nothing meaningful to say
- Don't invent connections that aren't supported by the evidence
- Use the exact UUIDs from the input
- itemLinks should be conservative — only link when the correlation is clear

Return ONLY the JSON object. No preamble, no markdown code fences.`;

interface ItemLink { itemIdA: string; itemIdB: string }

export async function generateCrossReferenceInsights(reportId: string): Promise<CrossReferenceInsight[]> {
  // 1. Load the report
  const [report] = await db.select().from(inspectionReports)
    .where(eq(inspectionReports.id, reportId))
    .limit(1);
  if (!report) throw new Error('Report not found');

  // 2. Load inspection items
  const items = await db.select().from(inspectionReportItems)
    .where(eq(inspectionReportItems.reportId, reportId));

  // 3. Load supporting documents (parsed only)
  const docs = await db.select().from(inspectionSupportingDocuments)
    .where(eq(inspectionSupportingDocuments.reportId, reportId));
  const parsedDocs = docs.filter(d => d.parsingStatus === 'parsed' && d.parsedSummary);

  // No insights if no supporting docs. Also clear any stale cross-refs.
  if (parsedDocs.length === 0) {
    await upsertInsights(reportId, []);
    await clearAllItemLinks(reportId);
    return [];
  }

  // 4. Build the user message — include sourceDocumentId so AI knows what came from where
  const itemsBlock = items.length > 0
    ? items.map(i => {
        const source = i.sourceDocumentId ? `sourceDoc=${i.sourceDocumentId}` : 'sourceDoc=inspector';
        return `  - id=${i.id} | ${source} | severity=${i.severity} | category=${i.category} | location=${i.locationInProperty || 'unspecified'} | title=${i.title}${i.description ? ` | notes=${i.description.slice(0, 200)}` : ''}`;
      }).join('\n')
    : '  (none)';

  const docsBlock = parsedDocs.map(d => {
    const summaryStr = JSON.stringify(d.parsedSummary, null, 2);
    return `Document id=${d.id} | type=${d.documentType} | filename=${d.fileName}\nSummary:\n${summaryStr}`;
  }).join('\n\n---\n\n');

  const userMessage = `Property: ${report.propertyAddress}, ${report.propertyCity} ${report.propertyState}

INSPECTION ITEMS (${items.length}):
${itemsBlock}

SUPPORTING DOCUMENTS (${parsedDocs.length}):
${docsBlock}

Produce the JSON object now.`;

  // 5. Call Claude
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn({ reportId }, '[cross-reference] ANTHROPIC_API_KEY not configured, skipping');
    return [];
  }

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      logger.warn({ reportId }, '[cross-reference] AI returned no text');
      return [];
    }

    const raw = textBlock.text.trim();
    const objStart = raw.indexOf('{');
    const objEnd = raw.lastIndexOf('}');
    const jsonStr = objStart !== -1 && objEnd > objStart ? raw.slice(objStart, objEnd + 1) : raw;

    let parsed: { insights?: Array<Omit<CrossReferenceInsight, 'id'>>; itemLinks?: ItemLink[] };
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      logger.error({ err, rawPreview: raw.slice(0, 500), reportId }, '[cross-reference] Failed to parse JSON');
      return [];
    }

    // Add IDs and validate severity
    const insights: CrossReferenceInsight[] = (parsed.insights || []).map(p => ({
      id: randomUUID(),
      title: p.title || 'Untitled insight',
      description: p.description || '',
      severity: (['info', 'warning', 'concern'] as const).includes(p.severity) ? p.severity : 'info',
      relatedDocIds: Array.isArray(p.relatedDocIds) ? p.relatedDocIds : [],
      relatedItemIds: Array.isArray(p.relatedItemIds) ? p.relatedItemIds : [],
    }));

    await upsertInsights(reportId, insights);

    // Apply item cross-references
    const validItemIds = new Set(items.map(i => i.id));
    const links = Array.isArray(parsed.itemLinks) ? parsed.itemLinks : [];
    const validLinks = links.filter(l =>
      typeof l.itemIdA === 'string' && typeof l.itemIdB === 'string'
      && l.itemIdA !== l.itemIdB
      && validItemIds.has(l.itemIdA) && validItemIds.has(l.itemIdB),
    );
    await applyItemLinks(reportId, validLinks);

    logger.info({ reportId, insightCount: insights.length, linkCount: validLinks.length }, '[cross-reference] Insights + links generated');
    return insights;
  } catch (err) {
    logger.error({ err, reportId }, '[cross-reference] Failed to generate insights');
    return [];
  }
}

async function upsertInsights(reportId: string, insights: CrossReferenceInsight[]): Promise<void> {
  const existing = await db.select({ id: inspectionCrossReferenceInsights.id })
    .from(inspectionCrossReferenceInsights)
    .where(eq(inspectionCrossReferenceInsights.reportId, reportId))
    .limit(1);
  if (existing.length > 0) {
    await db.update(inspectionCrossReferenceInsights)
      .set({ insights: insights as never, generatedAt: new Date() })
      .where(eq(inspectionCrossReferenceInsights.reportId, reportId));
  } else {
    await db.insert(inspectionCrossReferenceInsights).values({
      reportId,
      insights: insights as never,
    });
  }
}

/**
 * Build a per-item set of cross-referenced IDs from the AI's pair list and
 * write them bidirectionally. Wipes previous cross-refs for the report first
 * so deletes/regenerations don't leave stale links.
 */
async function applyItemLinks(reportId: string, links: ItemLink[]): Promise<void> {
  // Build adjacency map
  const adjacency = new Map<string, Set<string>>();
  for (const { itemIdA, itemIdB } of links) {
    if (!adjacency.has(itemIdA)) adjacency.set(itemIdA, new Set());
    if (!adjacency.has(itemIdB)) adjacency.set(itemIdB, new Set());
    adjacency.get(itemIdA)!.add(itemIdB);
    adjacency.get(itemIdB)!.add(itemIdA);
  }

  // Clear all existing cross-refs for this report, then set fresh ones
  await db.update(inspectionReportItems)
    .set({ crossReferencedItemIds: null, updatedAt: new Date() })
    .where(eq(inspectionReportItems.reportId, reportId));

  for (const [itemId, relatedSet] of adjacency.entries()) {
    await db.update(inspectionReportItems)
      .set({ crossReferencedItemIds: Array.from(relatedSet) as never, updatedAt: new Date() })
      .where(eq(inspectionReportItems.id, itemId));
  }
}

async function clearAllItemLinks(reportId: string): Promise<void> {
  await db.update(inspectionReportItems)
    .set({ crossReferencedItemIds: null, updatedAt: new Date() })
    .where(eq(inspectionReportItems.reportId, reportId));
}

// Re-export for callers that want to wipe links on specific items
export async function clearItemLinks(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  await db.update(inspectionReportItems)
    .set({ crossReferencedItemIds: null, updatedAt: new Date() })
    .where(inArray(inspectionReportItems.id, itemIds));
}
