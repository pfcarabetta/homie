---
title: "DIY guides + parts lists"
product: inspect
audience: homeowner
category: items
tags: [diy, amazon, parts, diy-badge]
order: 9
updated: 2026-04-28
---

Some inspection items are absolutely DIY-friendly for a confident beginner — they just look intimidating in the report. Homie flags those with a 🔧 **DIY** badge and, when you ask, generates step-by-step instructions plus a parts list with Amazon search links.

Available on every paid tier (Essential included). Often pays for the report by itself.

## How items get the DIY badge

A client-side heuristic flags items where:
- **Severity** is monitor or recommended (never safety hazards or urgent)
- **Category** is fixable by a non-pro (not electrical panel work, not gas, not roofing, not structural)
- **Cost estimate** caps under ~$400 (above that, DIY rarely wins on time)
- **Title** doesn't include hard-stop keywords ("gas," "panel," "load-bearing," etc.)

That's the heuristic for the badge. The actual DIY analysis (when you tap "Try DIY") runs through a stricter AI safety gate that flags additional items as "feasible: false" — those still get a guide, but it explains why you should call a pro and what kind.

## What "Try DIY" gives you

Tap **AI Deep Dive** on a flagged item, then **🔧 Try DIY** below the AI summary. You'll get:

- **Difficulty** — beginner / intermediate / advanced
- **Time estimate** — "30–60 min", "1–2 hours"
- **DIY supply cost** vs **typical pro cost** (so you see the savings)
- **5–10 numbered steps** specific to this item
- **Tools & supplies list** — generic product names (e.g. "14-inch adjustable wrench") with Amazon search links pre-tagged with our affiliate ID
- **Safety warnings** — turn off the breaker, shut the valve, wear eye protection
- **When to stop and call a pro** — symptoms that mean DIY is no longer the right call

Each tool/supply link opens an Amazon search for the item. We don't recommend specific SKUs (because product availability changes); we recommend the right *category* of product. You pick.

## DIY savings on the negotiations + dashboard

If you're on Premium and using the **Negotiations** tab, items with a confirmed DIY analysis contribute to a "DIY Savings" tile in the totals row — showing how much you'd save by handling those items yourself instead of asking the seller for a credit.

The **Dashboard** also has a "DIY Opportunities" stat card aggregating the savings across all your reports. Click it to filter the Items tab to DIY-friendly items only.

## Affiliate disclosure

Homie earns a small commission from qualifying Amazon purchases. It doesn't change your price, and it's disclosed inline on every DIY panel. We use generic search links rather than specific products so the recommendation stays honest.

## When NOT to DIY

The AI is conservative on this — it'll mark "feasible: false" for anything involving:

- Natural gas appliances
- Main electrical panel work
- Sealed HVAC refrigerant systems (EPA cert required)
- Roof work needing ladders >10 ft
- Structural / load-bearing changes
- Permits in most jurisdictions
- Asbestos-era materials, lead paint, mold >10 sq ft
- Active hazards (gas smell, sparking, flooding)

If you see "Better to get a pro on this one," trust it.

## See also

- [AI Deep Dive](inspect/ai-deep-dive)
- [Reading severity flags](inspect/reading-severity-flags)
