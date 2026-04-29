---
title: "Dispatching jobs"
product: business
audience: pm
category: dispatches
tags: [dispatch, providers, jobs]
order: 3
updated: 2026-04-28
---

A dispatch is what happens when an issue at one of your properties needs a provider. Homie reaches out to your preferred vendors first, then opens up to local marketplace providers if needed, and pulls real quotes back into your dashboard.

## Three ways a dispatch starts

1. **Guest reporter form** — guest hits a public link, describes the issue, dispatch fires automatically (you approve, or auto-approve based on category).
2. **PM-submitted** — you create a job from the Dispatches tab when you spot an issue or hear from the owner.
3. **Scheduled maintenance** — recurring tasks (HVAC filter, water heater flush) fire on schedule and dispatch automatically.

## What you control on each dispatch

- **Audience** — preferred vendors only, preferred + marketplace, or marketplace only. Default is the cascading preferred-then-marketplace flow described below.
- **Specific vendors** — override the auto-match and pick exactly which preferred vendors to contact (the AudienceSelector checklist).
- **Tier** — Standard / Priority / Emergency, same as the consumer Homie product. Drives how many providers we contact and how aggressively we follow up.
- **Notify guest** — when checked, the guest who reported the issue gets a tracking link to follow the dispatch in real time.

## The cascading flow (default)

For B2B dispatches with preferred vendors:

1. **Phase 1** — your preferred vendors (matching the category + property) get contacted immediately.
2. **15-minute wait** for them to respond.
3. **Phase 2** — if no preferred vendor responded, marketplace pros get contacted automatically. If a preferred vendor DID respond, marketplace cascade is skipped.

This gives your preferred network first dibs without leaving you stranded if they're booked.

## Provider response loop

Each provider can respond by phone, SMS, or web link with:
- A quote (one number, or per-item if it's a bundle)
- Availability ("Tuesday morning")
- Optional message ("Need to see it first to confirm scope")

Their response shows up in the **Dispatches** tab in real time — you'll see it before they call you back.

## Dispatch expansion

If your job has zero responses for 30 minutes, Homie auto-expands outreach to:
- A wider radius
- Slightly lower minimum rating threshold
- More providers in the next wave

Up to 3 expansion waves. Pros who already responded never get re-contacted (we fixed that bug a while back — see [provider dedup](business/dispatching-jobs)).

## Booking

When you've got the quote you want, click **Accept** on the provider card. The booking lands in **Bookings**, the provider gets notified, and you're connected directly.

Same as consumer Homie: **the provider bills you (or the property owner) directly** for the work. Homie isn't in the middle of the repair payment.

## Cancellations

PMs can cancel a dispatch before any provider has accepted, in the Dispatches tab. Cancelled dispatches notify any provider we already reached out to so they don't waste time quoting a job that's gone.

## See also

- [Preferred vendors](business/preferred-vendors)
- [Vendor scorecards](business/vendor-scorecards)
- [Property IQ](business/property-iq)
