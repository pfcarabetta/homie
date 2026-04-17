/**
 * Parsers for supporting real-estate documents (pest reports, seller disclosures).
 * Each parser uses Claude Sonnet with native PDF document blocks to extract a
 * type-specific structured summary.
 */
import logger from '../logger';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

// ── Type-specific summary shapes ──────────────────────────────────────────

export interface PestReportSummary {
  inspectionDate: string | null;
  inspectorCompany: string | null;
  overallVerdict: 'clean' | 'minor' | 'active_infestation' | 'damage_present' | 'unknown';
  findings: Array<{
    pestType: string;
    severity: 'safety_hazard' | 'urgent' | 'recommended' | 'monitor' | 'informational';
    affectedArea: string;
    evidence: string;
    treatmentRecommended: string;
    sourcePages: number[];
  }>;
  treatmentEstimateRange: { lowCents: number; highCents: number } | null;
}

export interface SellerDisclosureSummary {
  disclosedIssues: Array<{
    category: string;
    description: string;
    dateOfIssue: string | null;
    status: 'fixed' | 'ongoing' | 'unknown';
    notes: string | null;
    sourcePages: number[];
  }>;
  knownDefects: string[];
  pastRepairs: Array<{ date: string | null; description: string; sourcePages: number[] }>;
  warrantiesOrServiceContracts: string[];
  notableOmissions: string[];
}

// ── Generic helpers ───────────────────────────────────────────────────────

async function fetchFileAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Invalid data URL');
    return { mimeType: match[1] || 'application/pdf', base64: match[2] };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch document: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('content-type') || 'application/pdf';
  return { mimeType, base64: buffer.toString('base64') };
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  // Find the JSON object boundaries
  const objStart = trimmed.indexOf('{');
  const arrStart = trimmed.indexOf('[');
  if (objStart === -1 && arrStart === -1) return trimmed;

  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    const objEnd = trimmed.lastIndexOf('}');
    return objEnd > objStart ? trimmed.slice(objStart, objEnd + 1) : trimmed;
  }
  const arrEnd = trimmed.lastIndexOf(']');
  return arrEnd > arrStart ? trimmed.slice(arrStart, arrEnd + 1) : trimmed;
}

async function callClaudeForDocument(systemPrompt: string, base64File: string, mimeType: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });

  let userContent: Array<unknown>;
  if (mimeType === 'application/pdf' || mimeType.includes('pdf')) {
    userContent = [{
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64File },
    }];
  } else {
    // Text fallback
    const text = Buffer.from(base64File, 'base64').toString('utf-8');
    userContent = [{ type: 'text', text }];
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent as never }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('AI returned no text');
  }
  return textBlock.text;
}

// ── Pest Report Parser ────────────────────────────────────────────────────

const PEST_REPORT_PROMPT = `You are analyzing a pest/wood-destroying-organism (WDO) inspection report (also called a Section 1/Section 2 report or termite report).

Extract a structured summary as JSON with exactly these keys:
- inspectionDate: ISO date (YYYY-MM-DD) or null if not stated
- inspectorCompany: text name of the inspecting company, or null
- overallVerdict: one of "clean", "minor", "active_infestation", "damage_present", "unknown"
  - clean = no infestation, no damage, no recommended treatment
  - minor = conducive conditions noted but no active issues
  - active_infestation = live pests currently present (termites, carpenter ants, rodents, etc.)
  - damage_present = past damage from pests requiring repair
  - unknown = report doesn't make a clear determination
- findings: array of findings, each with:
  - pestType: e.g. "Subterranean termites", "Carpenter ants", "Drywood termites", "Rodents", "Powder-post beetles", "Wood-decay fungus"
  - severity: one of "safety_hazard", "urgent", "recommended", "monitor", "informational"
  - affectedArea: e.g. "Crawl space, north wall", "Garage subfloor"
  - evidence: brief description of what the inspector observed
  - treatmentRecommended: brief description of recommended action
  - sourcePages: array of 1-indexed page numbers where this finding appears
- treatmentEstimateRange: object with lowCents and highCents (integer cents) for total recommended treatment cost. Use null if no estimate is given.

Return ONLY the JSON object. No preamble, no markdown code fences.`;

export async function parsePestReport(fileUrl: string): Promise<PestReportSummary> {
  const { base64, mimeType } = await fetchFileAsBase64(fileUrl);
  const raw = await callClaudeForDocument(PEST_REPORT_PROMPT, base64, mimeType);
  const json = extractJson(raw);
  try {
    return JSON.parse(json) as PestReportSummary;
  } catch (err) {
    logger.error({ err, rawPreview: raw.slice(0, 500) }, '[parsePestReport] Failed to parse JSON');
    throw new Error('Failed to parse pest report response');
  }
}

// ── Seller Disclosure Parser ──────────────────────────────────────────────

const SELLER_DISCLOSURE_PROMPT = `You are analyzing a real estate seller's disclosure form (e.g. California TDS, NY Property Condition Disclosure, generic seller disclosure).

Extract a structured summary as JSON with exactly these keys:
- disclosedIssues: array of issues the seller acknowledged. Each:
  - category: closest of [plumbing, electrical, hvac, roofing, structural, foundation, windows_doors, appliance, pest_control, safety, insulation, fireplace, landscaping, general_repair]
  - description: what was disclosed (1-2 sentences)
  - dateOfIssue: ISO date or year (YYYY or YYYY-MM-DD) or null if not stated
  - status: "fixed" (repairs completed), "ongoing" (still present), or "unknown"
  - notes: optional extra context (e.g. who repaired it, whether under warranty)
  - sourcePages: array of 1-indexed page numbers
- knownDefects: array of plain-text defects the seller marked as currently present
- pastRepairs: array of past repairs the seller mentioned. Each: { date, description, sourcePages }
- warrantiesOrServiceContracts: array of plain-text mentions of active warranties or service contracts
- notableOmissions: array of items that were left blank or marked "Don't Know" on critical questions (roofing, foundation, water intrusion, etc.) — flag these as potential gaps

Return ONLY the JSON object. No preamble, no markdown code fences.`;

export async function parseSellerDisclosure(fileUrl: string): Promise<SellerDisclosureSummary> {
  const { base64, mimeType } = await fetchFileAsBase64(fileUrl);
  const raw = await callClaudeForDocument(SELLER_DISCLOSURE_PROMPT, base64, mimeType);
  const json = extractJson(raw);
  try {
    return JSON.parse(json) as SellerDisclosureSummary;
  } catch (err) {
    logger.error({ err, rawPreview: raw.slice(0, 500) }, '[parseSellerDisclosure] Failed to parse JSON');
    throw new Error('Failed to parse seller disclosure response');
  }
}

// ── Specialized inspections (round 2/3/4) ────────────────────────────────
// These all share a common parsed shape and a parameterized prompt — a single
// parser handles all of them with the doc type controlling the system prompt.

export interface SpecializedInspectionSummary {
  inspectionDate: string | null;
  inspectorCompany: string | null;
  overallVerdict: string;
  findings: Array<{
    category: string;
    severity: 'safety_hazard' | 'urgent' | 'recommended' | 'monitor' | 'informational';
    location: string;
    evidence: string;
    recommendation: string;
    sourcePages: number[];
  }>;
  estimatedCostRange: { lowCents: number; highCents: number } | null;
}

const SPEC_INSPECTION_DESCRIPTIONS: Record<string, string> = {
  sewer_scope: 'sewer line camera scope inspection (mainline from house to municipal connection)',
  roof_inspection: 'roof inspection or roofing certification report',
  foundation_report: 'foundation or structural engineer report',
  hvac_inspection: 'HVAC system inspection (heating, cooling, ductwork, refrigerant, age/efficiency)',
  electrical_inspection: 'electrical system inspection (panel, wiring, grounding, outlets, code compliance)',
  septic_inspection: 'septic system inspection (tank, drain field, perc/percolation testing)',
  mold_inspection: 'mold or indoor air quality inspection report',
  pool_inspection: 'pool/spa inspection (equipment, plumbing, leak detection, safety)',
  chimney_inspection: 'chimney/fireplace Level II inspection',
};

export function isSpecializedInspectionType(t: string): boolean {
  return Object.prototype.hasOwnProperty.call(SPEC_INSPECTION_DESCRIPTIONS, t);
}

function buildSpecializedPrompt(docType: string): string {
  const desc = SPEC_INSPECTION_DESCRIPTIONS[docType] ?? 'specialized residential inspection';
  return `You are analyzing a ${desc}.

Extract a structured summary as JSON with exactly these keys:
- inspectionDate: ISO date (YYYY-MM-DD) or null if not stated
- inspectorCompany: text name of the inspecting company, or null
- overallVerdict: short text — one of "clean", "minor", "concerns", "major_issues", or "unknown"
- findings: array of findings, each with:
  - category: short topic label (e.g. "Sewer mainline", "Compressor", "Outlet wiring", "Drain field")
  - severity: one of "safety_hazard", "urgent", "recommended", "monitor", "informational"
  - location: e.g. "Front yard near street", "Attic", "Master bath", "South side of house"
  - evidence: brief description of what the inspector observed
  - recommendation: brief description of recommended action
  - sourcePages: array of 1-indexed page numbers where this finding appears
- estimatedCostRange: object with lowCents and highCents (integer cents) for total recommended remediation cost. Use null if no estimate is given.

Return ONLY the JSON object. No preamble, no markdown code fences.`;
}

export async function parseSpecializedInspection(fileUrl: string, docType: string): Promise<SpecializedInspectionSummary> {
  const { base64, mimeType } = await fetchFileAsBase64(fileUrl);
  const raw = await callClaudeForDocument(buildSpecializedPrompt(docType), base64, mimeType);
  const json = extractJson(raw);
  try {
    return JSON.parse(json) as SpecializedInspectionSummary;
  } catch (err) {
    logger.error({ err, rawPreview: raw.slice(0, 500), docType }, '[parseSpecializedInspection] Failed to parse JSON');
    throw new Error(`Failed to parse ${docType} response`);
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────

export async function parseSupportingDoc(documentType: string, fileUrl: string): Promise<unknown> {
  switch (documentType) {
    case 'pest_report':
      return parsePestReport(fileUrl);
    case 'seller_disclosure':
      return parseSellerDisclosure(fileUrl);
    default:
      if (isSpecializedInspectionType(documentType)) {
        return parseSpecializedInspection(fileUrl, documentType);
      }
      throw new Error(`Unsupported document type: ${documentType}`);
  }
}
