---
title: "Preferred vendors"
product: business
audience: pm
category: vendors
tags: [vendors, preferred, dispatch]
order: 4
updated: 2026-04-28
---

Your preferred vendor list is the people you actually trust to show up at your properties. Homie's dispatch flow contacts them first on every job, only opening to marketplace pros if your preferred network is unavailable or unresponsive.

## Adding vendors

In the **Vendors** tab, click **Add vendor**. You can:

- **Add manually** — name, phone, email, categories (the work types they handle), notes
- **Promote from a booking** — every booking has an "Add to preferred providers" button. One click and the pro you just used is in your network.
- **Import from CSV** — for bulk-onboarding an existing vendor list

Once added, vendors show up in dispatch dropdowns + auto-match for relevant jobs.

## Categories matter

Each vendor is tagged with the categories they cover (plumbing, electrical, HVAC, handyman, etc.). The cascading dispatch flow uses these tags to decide who to contact first. A plumber with only "plumbing" tagged won't get hit for an electrical job.

You can set categories to **null** ("handles every category") for generalist handymen who do a bit of everything.

## Property scope

Each preferred vendor can be:
- **Workspace-wide** (default) — eligible for all your properties
- **Property-specific** — only contacted for one property (use this for, say, the local handyman who only services your beach house)

Set property scope on the vendor card.

## Availability schedule

Optional but very useful: set per-day operating hours on each vendor. The cascading dispatch flow respects these — a vendor with "closed Sunday" set won't get pinged on a Sunday morning emergency.

Format is per-day: Mon 8am–6pm, Tue 8am–6pm, etc. Leave a day blank if they're closed that day.

## Skip-quote vendors

For your trusted in-house handyman or contracted vendor who you've pre-negotiated rates with, you can flag them **skip-quote**. When you dispatch a job, they get notified but Homie doesn't ask them to quote — they go straight to "accepted" so you save the back-and-forth.

Useful for: in-house maintenance, contracted cleaning service, captive HVAC company, etc.

## Priority order

Set a **priority** number per vendor (1 = highest). Within the matching set for a dispatch, higher-priority vendors get contacted first. If two have priority 1, both get hit simultaneously.

## Vendor scorecards

Once you've used a vendor across a few jobs, the **Scorecards** tab shows their performance — response rate, quote competitiveness, on-time arrival, completion quality. Use this to weed out underperformers and bump up the rockstars.

See [Vendor scorecards](business/vendor-scorecards) for the metrics breakdown.

## Removing vendors

Removing a vendor archives them — they stop showing up in dispatch dropdowns but their historical bookings stay intact. You can restore archived vendors from the **Vendors → Archived** view.

## See also

- [Dispatching jobs](business/dispatching-jobs)
- [Vendor scorecards](business/vendor-scorecards)
- [Setting up your workspace](business/getting-started)
