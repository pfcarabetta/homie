import PDFDocument from 'pdfkit';

interface EstimatePDFOptions {
  workspace: {
    name: string;
    logoUrl: string | null;
    companyAddress: string | null;
    companyPhone: string | null;
    companyEmail: string | null;
  };
  property: {
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  };
  job: {
    id: string;
    status: string;
    createdAt: Date;
    diagnosis: {
      category: string;
      severity: string;
      summary: string;
      confidence?: number;
    } | null;
    preferredTiming: string | null;
    budget: string | null;
  };
  estimates: Array<{
    providerName: string;
    googleRating: string | null;
    reviewCount: number;
    channel: string;
    isPreferred: boolean;
    quotedPrice: string | null;
    availability: string | null;
    message: string | null;
    responseTimeSec: number | null;
  }>;
  declinedCount: number;
}

const ORANGE = '#E8632B';
const DARK = '#2D2926';
const GRAY = '#6B6560';
const LIGHT_GRAY = '#9B9490';
const WARM_BG = '#F9F5F2';
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatResponseTime(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  const hours = Math.floor(sec / 3600);
  const mins = Math.round((sec % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function severityLabel(s: string): string {
  const colors: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', emergency: 'Emergency' };
  return colors[s] || titleCase(s);
}

function roundedRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, r: number): void {
  doc.moveTo(x + r, y)
    .lineTo(x + w - r, y)
    .quadraticCurveTo(x + w, y, x + w, y + r)
    .lineTo(x + w, y + h - r)
    .quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    .lineTo(x + r, y + h)
    .quadraticCurveTo(x, y + h, x, y + h - r)
    .lineTo(x, y + r)
    .quadraticCurveTo(x, y, x + r, y)
    .closePath();
}

async function resolveLogoBuffer(logoUrl: string): Promise<Buffer | null> {
  try {
    if (logoUrl.startsWith('data:image')) {
      const match = logoUrl.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (match) return Buffer.from(match[1], 'base64');
      return null;
    }
    if (logoUrl.startsWith('http')) {
      const res = await fetch(logoUrl);
      if (!res.ok) return null;
      const arrayBuf = await res.arrayBuffer();
      return Buffer.from(arrayBuf);
    }
    return null;
  } catch {
    return null;
  }
}

function drawHeader(doc: PDFKit.PDFDocument, workspace: EstimatePDFOptions['workspace'], jobId: string, date: Date, isFirstPage: boolean): number {
  let y = MARGIN;

  if (isFirstPage) {
    // Company name
    doc.font('Helvetica-Bold').fontSize(20).fillColor(DARK);
    doc.text(workspace.name, MARGIN, y, { width: CONTENT_WIDTH / 2 });
    y += 26;

    // Company details
    const details: string[] = [];
    if (workspace.companyAddress) details.push(workspace.companyAddress);
    if (workspace.companyPhone) details.push(workspace.companyPhone);
    if (workspace.companyEmail) details.push(workspace.companyEmail);
    if (details.length > 0) {
      doc.font('Helvetica').fontSize(9).fillColor(LIGHT_GRAY);
      for (const line of details) {
        doc.text(line, MARGIN, y, { width: CONTENT_WIDTH / 2 });
        y += 12;
      }
    }

    // Right side: title, date, job ID
    const rightX = MARGIN + CONTENT_WIDTH / 2;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(DARK);
    doc.text('Estimate Summary', rightX, MARGIN, { width: CONTENT_WIDTH / 2, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor(GRAY);
    doc.text(formatDate(date), rightX, MARGIN + 22, { width: CONTENT_WIDTH / 2, align: 'right' });
    doc.text(`Job ID: ${jobId.substring(0, 8)}`, rightX, MARGIN + 36, { width: CONTENT_WIDTH / 2, align: 'right' });

    y = Math.max(y, MARGIN + 52) + 10;
  } else {
    // Smaller header on subsequent pages
    doc.font('Helvetica-Bold').fontSize(12).fillColor(DARK);
    doc.text(workspace.name, MARGIN, y, { width: CONTENT_WIDTH / 2 });
    const rightX = MARGIN + CONTENT_WIDTH / 2;
    doc.font('Helvetica').fontSize(9).fillColor(GRAY);
    doc.text('Estimate Summary (cont.)', rightX, y, { width: CONTENT_WIDTH / 2, align: 'right' });
    y += 20;
  }

  // Orange line
  doc.save();
  doc.moveTo(MARGIN, y).lineTo(PAGE_WIDTH - MARGIN, y).lineWidth(2).strokeColor(ORANGE).stroke();
  doc.restore();

  return y + 12;
}

function drawFooter(doc: PDFKit.PDFDocument, pageNum: number): void {
  const footerY = PAGE_HEIGHT - 50;
  doc.save();
  doc.moveTo(MARGIN, footerY).lineTo(PAGE_WIDTH - MARGIN, footerY).lineWidth(0.5).strokeColor(LIGHT_GRAY).stroke();
  doc.restore();

  doc.font('Helvetica').fontSize(8).fillColor(LIGHT_GRAY);
  doc.text('Generated by Homie — homiepro.ai', MARGIN, footerY + 6, { width: CONTENT_WIDTH, align: 'left' });
  doc.text(`Page ${pageNum}`, MARGIN, footerY + 6, { width: CONTENT_WIDTH, align: 'right' });
  doc.font('Helvetica').fontSize(7).fillColor(LIGHT_GRAY);
  doc.text(
    'This estimate summary is for informational purposes only. Actual costs may vary. Homie does not guarantee provider pricing or availability.',
    MARGIN, footerY + 18, { width: CONTENT_WIDTH, align: 'center' },
  );
}

export async function generateEstimatePDF(options: EstimatePDFOptions): Promise<Buffer> {
  const { workspace, property, job, estimates, declinedCount } = options;

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN, bottom: 60, left: MARGIN, right: MARGIN },
    bufferPages: true,
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  // Embed logo if available
  let logoBuffer: Buffer | null = null;
  if (workspace.logoUrl) {
    logoBuffer = await resolveLogoBuffer(workspace.logoUrl);
  }

  let pageNum = 1;
  let y = drawHeader(doc, workspace, job.id, job.createdAt, true);

  // If logo was resolved, draw it next to the company name
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, MARGIN, MARGIN, { height: 30 });
    } catch {
      // Skip if image format is unsupported
    }
  }

  // ── Property Section ──────────────────────────────────────────────
  y += 4;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(DARK);
  doc.text(property.name, MARGIN, y, { width: CONTENT_WIDTH });
  y += 20;

  const addressParts: string[] = [];
  if (property.address) addressParts.push(property.address);
  const cityStateZip: string[] = [];
  if (property.city) cityStateZip.push(property.city);
  if (property.state) cityStateZip.push(property.state);
  if (property.zipCode) cityStateZip.push(property.zipCode);
  if (cityStateZip.length > 0) addressParts.push(cityStateZip.join(', '));

  if (addressParts.length > 0) {
    doc.font('Helvetica').fontSize(10).fillColor(GRAY);
    for (const line of addressParts) {
      doc.text(line, MARGIN, y, { width: CONTENT_WIDTH });
      y += 14;
    }
  }

  y += 8;

  // ── Job Summary Box ───────────────────────────────────────────────
  const diagnosis = job.diagnosis;
  const boxPadding = 14;
  // Pre-calculate box height
  let boxContentHeight = 0;
  const jobTitle = diagnosis ? titleCase(diagnosis.category) : 'Service Request';
  boxContentHeight += 20; // title
  if (diagnosis) {
    boxContentHeight += 16; // category + severity
    boxContentHeight += 14; // date
    // Summary text height estimate
    const summaryText = diagnosis.summary.replace(/\*\*(.+?)\*\*/g, '$1');
    const summaryLines = Math.ceil(summaryText.length / 80);
    boxContentHeight += summaryLines * 14 + 4;
    if (diagnosis.confidence) boxContentHeight += 14;
  }
  if (job.preferredTiming || job.budget) boxContentHeight += 16;

  const boxHeight = boxContentHeight + boxPadding * 2;

  doc.save();
  roundedRect(doc, MARGIN, y, CONTENT_WIDTH, boxHeight, 8);
  doc.fillColor(WARM_BG).fill();
  doc.restore();

  let by = y + boxPadding;

  doc.font('Helvetica-Bold').fontSize(13).fillColor(DARK);
  doc.text(jobTitle, MARGIN + boxPadding, by, { width: CONTENT_WIDTH - boxPadding * 2 });
  by += 20;

  if (diagnosis) {
    doc.font('Helvetica').fontSize(10).fillColor(GRAY);
    doc.text(`${titleCase(diagnosis.category)}  •  Severity: ${severityLabel(diagnosis.severity)}`, MARGIN + boxPadding, by, { width: CONTENT_WIDTH - boxPadding * 2 });
    by += 16;

    doc.font('Helvetica').fontSize(9).fillColor(LIGHT_GRAY);
    doc.text(`Reported: ${formatDate(job.createdAt)}`, MARGIN + boxPadding, by, { width: CONTENT_WIDTH - boxPadding * 2 });
    by += 14;

    const summaryText = diagnosis.summary.replace(/\*\*(.+?)\*\*/g, '$1');
    doc.font('Helvetica').fontSize(10).fillColor(DARK);
    const summaryHeight = doc.heightOfString(summaryText, { width: CONTENT_WIDTH - boxPadding * 2 });
    doc.text(summaryText, MARGIN + boxPadding, by, { width: CONTENT_WIDTH - boxPadding * 2 });
    by += summaryHeight + 4;

    if (diagnosis.confidence) {
      doc.font('Helvetica').fontSize(9).fillColor(LIGHT_GRAY);
      doc.text(`Diagnostic confidence: ${Math.round(diagnosis.confidence * 100)}%`, MARGIN + boxPadding, by, { width: CONTENT_WIDTH - boxPadding * 2 });
      by += 14;
    }
  }

  if (job.preferredTiming || job.budget) {
    const timingBudget: string[] = [];
    if (job.preferredTiming) timingBudget.push(`Timing: ${job.preferredTiming}`);
    if (job.budget) timingBudget.push(`Budget: ${job.budget}`);
    doc.font('Helvetica').fontSize(10).fillColor(GRAY);
    doc.text(timingBudget.join('    '), MARGIN + boxPadding, by, { width: CONTENT_WIDTH - boxPadding * 2 });
    by += 16;
  }

  y = y + boxHeight + 16;

  // ── Estimates Section ─────────────────────────────────────────────
  const totalResponses = estimates.length;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(DARK);
  const estimateHeaderText = `${totalResponses} estimate${totalResponses !== 1 ? 's' : ''} received`;
  doc.text(estimateHeaderText, MARGIN, y, { width: CONTENT_WIDTH });
  y += 20;

  if (declinedCount > 0) {
    doc.font('Helvetica').fontSize(9).fillColor(LIGHT_GRAY);
    doc.text(`${declinedCount} provider${declinedCount !== 1 ? 's' : ''} declined or did not respond`, MARGIN, y, { width: CONTENT_WIDTH });
    y += 14;
  }

  y += 4;

  // Draw each estimate
  for (const est of estimates) {
    // Estimate block height calculation
    let estHeight = 16 + 14 + 14; // provider name, rating line, channel line
    if (est.quotedPrice) estHeight += 24;
    if (est.availability) estHeight += 14;
    if (est.message) {
      const msgLines = Math.ceil(est.message.length / 70);
      estHeight += msgLines * 13 + 4;
    }
    if (est.responseTimeSec !== null) estHeight += 14;
    estHeight += 20; // padding

    // Check if we need a new page
    const maxY = PAGE_HEIGHT - 80;
    if (y + estHeight > maxY) {
      drawFooter(doc, pageNum);
      doc.addPage();
      pageNum++;
      y = drawHeader(doc, workspace, job.id, job.createdAt, false);
    }

    // Draw estimate border box
    doc.save();
    roundedRect(doc, MARGIN, y, CONTENT_WIDTH, estHeight, 6);
    doc.lineWidth(1).strokeColor('#E0DBD7').stroke();
    doc.restore();

    let ey = y + 10;
    const innerPad = 12;
    const innerWidth = CONTENT_WIDTH - innerPad * 2;

    // Provider name
    doc.font('Helvetica-Bold').fontSize(12).fillColor(DARK);
    doc.text(est.providerName, MARGIN + innerPad, ey, { width: innerWidth * 0.6 });

    // Preferred badge
    if (est.isPreferred) {
      const badgeX = MARGIN + CONTENT_WIDTH - innerPad - 70;
      doc.save();
      roundedRect(doc, badgeX, ey - 1, 60, 15, 4);
      doc.fillColor(ORANGE).fill();
      doc.restore();
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#FFFFFF');
      doc.text('PREFERRED', badgeX + 5, ey + 2, { width: 50, align: 'center' });
    }
    ey += 16;

    // Rating + reviews
    if (est.googleRating || est.reviewCount > 0) {
      doc.font('Helvetica').fontSize(9).fillColor(GRAY);
      const ratingParts: string[] = [];
      if (est.googleRating) ratingParts.push(`★ ${est.googleRating}`);
      if (est.reviewCount > 0) ratingParts.push(`${est.reviewCount} reviews`);
      doc.text(ratingParts.join('  •  '), MARGIN + innerPad, ey, { width: innerWidth });
    }
    ey += 14;

    // Channel badge
    doc.font('Helvetica').fontSize(8).fillColor(LIGHT_GRAY);
    doc.text(`Channel: ${est.channel.toUpperCase()}`, MARGIN + innerPad, ey, { width: innerWidth });
    ey += 14;

    // Quoted price
    if (est.quotedPrice) {
      doc.font('Helvetica-Bold').fontSize(16).fillColor(ORANGE);
      doc.text(est.quotedPrice, MARGIN + innerPad, ey, { width: innerWidth });
      ey += 24;
    }

    // Availability
    if (est.availability) {
      doc.font('Helvetica').fontSize(10).fillColor(GRAY);
      doc.text(`Availability: ${est.availability}`, MARGIN + innerPad, ey, { width: innerWidth });
      ey += 14;
    }

    // Message
    if (est.message) {
      doc.font('Helvetica-Oblique').fontSize(9).fillColor(GRAY);
      const msgHeight = doc.heightOfString(est.message, { width: innerWidth });
      doc.text(`"${est.message}"`, MARGIN + innerPad, ey, { width: innerWidth });
      ey += msgHeight + 4;
    }

    // Response time
    if (est.responseTimeSec !== null) {
      doc.font('Helvetica').fontSize(8).fillColor(LIGHT_GRAY);
      doc.text(`Response time: ${formatResponseTime(est.responseTimeSec)}`, MARGIN + innerPad, ey, { width: innerWidth });
      ey += 14;
    }

    y += estHeight + 10;
  }

  // Draw footer on the last page
  drawFooter(doc, pageNum);

  doc.end();

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}
