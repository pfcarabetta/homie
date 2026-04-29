---
title: "Property IQ"
product: business
audience: pm
category: properties
tags: [property-iq, ai, inventory, maintenance]
order: 6
updated: 2026-04-28
---

Property IQ is the per-property intelligence layer — a per-system breakdown of every property in your workspace, populated automatically from the property's age, type, and region, then refined by what you and your team know.

It's how Homie answers questions before you have to ask them: "what's likely failing soon?", "what should we be inspecting now that summer's coming?", "is this brand of furnace known to fail at this age?"

## What's in Property IQ

For every property, you get a structured breakdown of:

- **HVAC** — age, brand/model if known, typical lifespan, refrigerant type, recommended servicing schedule
- **Plumbing** — pipe material (copper / PEX / galvanized), water heater age + type, fixture age
- **Roofing** — material, age, lifespan, regional weather risk
- **Electrical** — panel brand + amp rating (Federal Pacific? Zinsco? Square D?), known recalls
- **Exterior** — siding material, paint history, foundation type
- **Appliances** — refrigerator, dishwasher, range, washer, dryer, garbage disposal — brands, models, purchase dates, warranty windows
- **Regional risks** — radon zone (EPA), flood zone (FEMA), frost line, wildfire risk, hurricane exposure

## How it gets populated

- **From the property record** — year built, location, type drive the initial population
- **From inspector reports** — if you've uploaded an inspection PDF for the property, every fact in the report (HVAC age, water heater serial, panel brand) flows into Property IQ automatically
- **From your team's notes** — anyone with workspace access can edit fields with what they know
- **From inventory uploads** — point your phone at brand/model labels; AI extracts the data

## Why it matters in dispatch

When you dispatch a job, the relevant Property IQ data goes to the provider as context:

> "Plumbing leak at 1234 Oak St. Property: 1998 build, copper water lines, Bradford White water heater installed 2021 (still under warranty), basement utility room. Sediment buildup noted at last service in March 2025."

Pros bring the right parts on the first visit. Quotes are tighter because they understand what they're walking into. First-call-fix rates jump.

## Hazard alerts

Property IQ tracks regional + property-specific hazards:
- **Radon zone** — EPA classification, recommended testing cadence
- **Flood zone** — FEMA designation, last claim history if available
- **Recalled equipment** — auto-flagged if your inventory matches an active CPSC recall
- **Lifespan tracking** — equipment hitting 80% of typical lifespan gets a "monitor" tag

Each hazard surfaces as an alert in the Property IQ panel + the workspace dashboard. Click for the source data + recommended action.

## Editing Property IQ data

Open any property → **Property IQ** tab → click any row to edit. Your edits become ground truth for that property — they override the AI defaults on subsequent dispatches.

History is preserved: if you change the water heater entry from "2018 install" to "2024 replaced," the old entry stays as a historical record.

## Cohort comparisons

For each property, Property IQ compares to peer properties:
- "Average HVAC lifespan in your zip + decade-built: 18 years. Yours is 16 years old."
- "Median annual maintenance spend in your cohort: $3,400. You're at $2,100."

This is opinionated but useful — it tells you when you're under-maintaining vs the local norm.

## See also

- [Adding properties](business/adding-properties)
- [Setting up your workspace](business/getting-started)
- [Dispatching jobs](business/dispatching-jobs)
