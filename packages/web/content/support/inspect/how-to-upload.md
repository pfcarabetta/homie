---
title: "How to upload an inspection report (inspector flow)"
product: inspect
audience: inspector
category: inspector
tags: [upload, wholesale, stripe, inspector]
order: 21
updated: 2026-04-28
---

Three steps, ~2 minutes per report. Pay wholesale at the moment of upload — your client gets the parsed report in their inbox automatically once parsing finishes (usually 5–10 minutes later).

## Step 1 — drop the PDF

In your inspector portal at homiepro.ai/inspector, click **Upload Report**. Drag the PDF into the dropzone or click to browse. Supported formats: PDF (Spectora, HomeGauge, Palm-Tech, InspectIT, plain PDF — they all work). Up to 50MB.

## Step 2 — homeowner contact + property details

Enter:
- Homeowner name
- Homeowner email (this is who gets the parsed report link)
- Optional homeowner phone
- Property address, city, state, zip
- Inspection date
- Inspection type (general / pre-listing / new-construction / etc.)

You can also bundle supporting documents at this step — pest reports, sewer scopes, mold reports, etc. Up to 5 supporting docs per report. They parse alongside the main report and feed into cross-reference insights for your client.

## Step 3 — pick a tier and pay

Pick the tier you sold the client:
- **Essential** — $49 wholesale (you charged $99)
- **Professional** — $79 wholesale (you charged $199) — most common
- **Premium** — $99 wholesale (you charged $299)

Click **Pay & process** → Stripe Checkout opens. Pay with card or saved payment method. On success, you're redirected back to the report detail page with the parser already firing.

## What happens next

1. **Parsing fires** — Claude reads the PDF, extracts items, severity, location, cost estimates. Takes 2–10 minutes depending on report length.
2. **Homeowner gets an email** — automatic, sent to the email you entered. Subject: "Your inspection report is ready." Body has a one-tap claim link.
3. **You see "ready" status** in your portal. From there you can preview what the homeowner sees, edit any items the AI miscategorized, and resend the email if needed.

## Editing items after parse

Hop into the report detail view and you can:
- Fix item titles, severity, category, location
- Add or remove items
- Re-fire parsing if something looks off

The homeowner sees the latest version every time they open their portal — no "send updated link" needed.

## What if parsing fails?

Rare but it happens (low-confidence OCR on a scanned PDF, or a giant report past Claude's context). We auto-retry once. If it fails twice, the system auto-refunds your wholesale cost and emails you. You can re-upload after fixing the source PDF, or contact us at yo@homiepro.ai.

## Sending the report yourself

If you want to wait to send the email (e.g. you want to review parsing first), uncheck **"Email homeowner immediately"** on the upload form. The report parses but no email goes out — when you're ready, click **Send to client** in the report detail view.

## See also

- [Inspector partner program overview](inspect/inspector-partner-program)
- [Tier resale pricing](inspect/tier-resale-pricing)
- [Marketing tools](inspect/marketing-tools)
