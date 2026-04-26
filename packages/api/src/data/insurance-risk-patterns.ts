/**
 * Known insurance-dealbreaker patterns that the Home IQ "insurance" smart
 * insight can flag from inspection-item descriptions.
 *
 * Each pattern matches against the title + description of an
 * inspectionReportItem. When a match fires for an item in the matching
 * category, Home IQ surfaces the insurance-impact insight on that
 * system's card.
 *
 * Sources for the dealbreaker classifications:
 *  - Federal Pacific Stab-Lok: documented fire risk, declined by Allstate,
 *    State Farm, USAA, Liberty for new policies
 *  - Polybutylene plumbing: known catastrophic failure mode
 *  - Knob-and-tube wiring: ungrounded, can't be in contact with insulation
 *  - Aluminum branch wiring: known to loosen at terminations, fire risk
 *  - Zinsco panels: same failure pattern as Federal Pacific
 *  - Galvanized steel water supply (older): corrosion-related dealbreaker
 *    for water-damage coverage in some markets
 *  - Cast iron drain: not a dealbreaker but worth flagging at end-of-life
 */

export interface InsuranceRiskPattern {
  pattern: RegExp;
  /** inspectionReportItems.category that this match should associate with */
  category: 'electrical' | 'plumbing' | 'roofing' | 'structural';
  /** Severity hint for the smart insight UI */
  severity: 'critical' | 'high' | 'moderate';
  insight: string;
}

export const INSURANCE_RISK_PATTERNS: InsuranceRiskPattern[] = [
  {
    pattern: /federal\s*pacific|stab[-\s]*lok|\bFPE\b/i,
    category: 'electrical',
    severity: 'critical',
    insight: 'Federal Pacific Stab-Lok panel — most major insurers (Allstate, State Farm, USAA, Liberty) decline new policies. Replacement is required for resale in most markets.',
  },
  {
    pattern: /\bzinsco\b|sylvania[\s-]*zinsco/i,
    category: 'electrical',
    severity: 'critical',
    insight: 'Zinsco electrical panel — same documented failure pattern as Federal Pacific (breakers may not trip under overload). Insurer dealbreaker; replace.',
  },
  {
    pattern: /knob[\s-]*and[\s-]*tube|\bk\s*&\s*t\b/i,
    category: 'electrical',
    severity: 'high',
    insight: 'Knob-and-tube wiring — ungrounded and cannot safely contact modern insulation. Most insurers require remediation or refuse coverage.',
  },
  {
    pattern: /aluminum\s+(branch\s+)?wiring|aluminum\s+conductor/i,
    category: 'electrical',
    severity: 'high',
    insight: 'Aluminum branch wiring — known to loosen at terminations and pose a fire risk. Many insurers require COPALUM crimps or AlumiConn connectors at every termination.',
  },
  {
    pattern: /polybutylene|\bpoly[\s-]*b\b|\bpb\s+(pipe|plumbing)/i,
    category: 'plumbing',
    severity: 'critical',
    insight: 'Polybutylene plumbing — known to fail catastrophically. Many insurers will not write new policies until full re-pipe is complete.',
  },
  {
    pattern: /galvanized\s+steel\s+(supply|water|pipe)/i,
    category: 'plumbing',
    severity: 'moderate',
    insight: 'Galvanized steel supply lines — internal corrosion reduces flow and can stain water. Some insurers exclude water-damage claims tied to galvanized pipe failures.',
  },
];
