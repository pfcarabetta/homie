/**
 * Cross-reference insight generator.
 * Takes the inspection items + parsed supporting documents for a report,
 * and asks Claude to find correlations, contradictions, and gaps.
 */
import { eq } from 'drizzle-orm';
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

Output a JSON array of insights. Each insight has exactly these keys:
- title: short headline (under 80 characters)
- description: 1-3 sentence explanation linking the findings together. Be specific about what was found in each document.
- severity: "info" (informational connection), "warning" (worth noting but not urgent), or "concern" (potential red flag for the buyer)
- relatedDocIds: array of supporting document IDs that contributed to this insight
- relatedItemIds: array of inspection item IDs that contributed to this insight

Rules:
- Maximum 8 insights, prioritize the most actionable
- Don't repeat findings — each insight should add new analytical value
- It's OK to have an empty array if there's nothing meaningful to say
- Don't invent connections that aren't supported by the evidence
- Use the exact UUIDs from the input

Return ONLY the JSON array. No preamble, no markdown code fences.`;

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

  // No insights if no supporting docs
  if (parsedDocs.length === 0) {
    await upsertInsights(reportId, []);
    return [];
  }

  // 4. Build the user message
  const itemsBlock = items.length > 0
    ? items.map(i => `  - id=${i.id} | severity=${i.severity} | category=${i.category} | location=${i.locationInProperty || 'unspecified'} | title=${i.title}${i.description ? ` | notes=${i.description.slice(0, 200)}` : ''}`).join('\n')
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

Produce the cross-reference insights JSON array now.`;

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
    const arrStart = raw.indexOf('[');
    const arrEnd = raw.lastIndexOf(']');
    const jsonStr = arrStart !== -1 && arrEnd > arrStart ? raw.slice(arrStart, arrEnd + 1) : raw;

    let parsed: Array<Omit<CrossReferenceInsight, 'id'>>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      logger.error({ err, rawPreview: raw.slice(0, 500), reportId }, '[cross-reference] Failed to parse JSON');
      return [];
    }

    // Add IDs and validate severity
    const insights: CrossReferenceInsight[] = parsed.map(p => ({
      id: randomUUID(),
      title: p.title || 'Untitled insight',
      description: p.description || '',
      severity: (['info', 'warning', 'concern'] as const).includes(p.severity) ? p.severity : 'info',
      relatedDocIds: Array.isArray(p.relatedDocIds) ? p.relatedDocIds : [],
      relatedItemIds: Array.isArray(p.relatedItemIds) ? p.relatedItemIds : [],
    }));

    await upsertInsights(reportId, insights);
    logger.info({ reportId, insightCount: insights.length }, '[cross-reference] Insights generated');
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
