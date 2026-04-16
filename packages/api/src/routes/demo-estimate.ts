import { Router, Request, Response } from 'express';
import { generateEstimatePDF } from '../services/estimate-pdf';

const router = Router();

// GET /api/v1/demo/estimate-summary — Demo PDF (no auth required)
router.get('/estimate-summary', async (_req: Request, res: Response) => {
  try {
    const pdfBuffer = await generateEstimatePDF({
      workspace: {
        name: 'Coastal Property Management',
        logoUrl: null,
        companyAddress: '123 Ocean Drive, Suite 200, Myrtle Beach, SC 29577',
        companyPhone: '(843) 555-0192',
        companyEmail: 'service@coastalpm.com',
      },
      property: {
        name: 'Beach House #4',
        address: '456 Shoreline Blvd',
        city: 'Myrtle Beach',
        state: 'SC',
        zipCode: '29577',
      },
      job: {
        id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        status: 'matched',
        createdAt: new Date('2026-03-20T14:30:00Z'),
        diagnosis: {
          category: 'plumbing',
          severity: 'high',
          summary: 'Water heater is leaking from the bottom, causing water damage to the utility closet floor. The unit is a 50-gallon gas water heater, approximately 12 years old. Rust visible on the tank base and the pressure relief valve is dripping. Immediate replacement recommended to avoid further water damage and potential mold growth.',
          confidence: 0.92,
        },
        preferredTiming: 'Within 48 hours',
        budget: '$800 - $1,500',
      },
      estimates: [
        {
          providerName: 'Atlantic Plumbing & Heating',
          providerPhone: '(843) 555-0234',
          providerEmail: 'service@atlanticplumbing.com',
          providerWebsite: 'atlanticplumbing.com',
          rating: '4.8',
          reviewCount: 247,
          channel: 'sms',
          isPreferred: true,
          quotedPrice: '$1,150',
          availability: 'Tomorrow morning, 8-10 AM',
          message: 'We can replace the water heater with a 50-gal Rheem ProTerra hybrid. Price includes removal of old unit, new installation, and code-compliant venting. 6-year warranty on parts and labor.',
          responseTimeSec: 420,
        },
        {
          providerName: 'Beachside Plumbing Co.',
          providerPhone: '(843) 555-0187',
          providerEmail: null,
          providerWebsite: 'beachsideplumbing.co',
          rating: '4.6',
          reviewCount: 183,
          channel: 'email',
          isPreferred: false,
          quotedPrice: '$975',
          availability: 'Wednesday afternoon',
          message: 'Standard 50-gal gas water heater replacement. Includes haul-away of old unit.',
          responseTimeSec: 1800,
        },
        {
          providerName: 'Grand Strand Mechanical',
          providerPhone: '(843) 555-0301',
          providerEmail: 'info@gsmechanical.com',
          providerWebsite: null,
          rating: '4.9',
          reviewCount: 312,
          channel: 'sms',
          isPreferred: false,
          quotedPrice: '$1,350',
          availability: 'Tomorrow, 2-4 PM',
          message: null,
          responseTimeSec: 180,
        },
      ],
      declinedCount: 2,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="demo-estimate-summary.pdf"');
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);
  } catch (err) {
    res.status(500).json({ data: null, error: 'Failed to generate demo PDF', meta: {} });
  }
});

export default router;
