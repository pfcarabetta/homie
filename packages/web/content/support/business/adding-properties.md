---
title: "Adding properties"
product: business
audience: pm
category: properties
tags: [properties, setup, address]
order: 2
updated: 2026-04-28
---

Properties are the core unit of work in Homie Business — every dispatch, booking, and scheduled task is scoped to a property. Spend 15 minutes upfront getting them right and the rest of the system works without friction.

## Adding a property

In the **Properties** tab, click **Add property**. You'll need:

- **Property name** — internal label ("Maple St Unit 2," "Beach House A"). Show up in dispatch dropdowns and guest forms.
- **Full address** — street, city, state, zip. We use this for vendor matching and travel time estimation.
- **Property type** — single-family / multi-unit / condo / vacation rental. Drives the default maintenance schedule.
- **Bedroom + bathroom count** — used for vendor quote context ("3-bed 2-bath, leaky faucet in primary bath").
- **Year built** *(optional but helpful)* — drives Property IQ recommendations.
- **Square footage** *(optional)* — used for cleaning + paint quote estimates.

## Property IQ

Once you save a property, **Property IQ** auto-populates with a per-system breakdown — HVAC, plumbing, roofing, exterior, etc. — based on the property's age, type, and region. Each system shows:

- Typical lifespan + your property's likely age
- Common upcoming maintenance
- Regional risks (radon zones, flood zones, frost line for plumbing)

You can edit any of this with what you know specifically — your HVAC was replaced in 2022, your roof is original from 1998, etc. Property IQ uses your edits as ground truth on subsequent dispatches.

See [Property IQ](business/property-iq) for the full feature.

## Inventory tracking

Each property has an inventory tab — equipment, brands, models, serial numbers, warranty docs. This is gold for dispatches: "GE refrigerator, Model GFE28GMKES, serial 1234, purchased 2020 from Costco" gives the pro everything they need to bring the right parts on the first visit.

Add inventory items manually, or upload photos of brand/model labels and Homie's AI extracts the data.

## Bulk import

Got 50+ properties? Import via CSV. Template in **Properties → Import**. We support the common PMS export formats (Hostfully, Guesty, Streamline, OwnerRez) — drop the export, we map the fields.

## Editing or removing properties

Properties can be edited at any time — the address, type, year built, and inventory are all live-editable. **Removing** a property archives it (we don't hard-delete because you may have historical bookings tied to it). Archived properties stop appearing in dispatch dropdowns but their history is preserved.

## See also

- [Property IQ](business/property-iq)
- [Setting up your workspace](business/getting-started)
- [Preferred vendors](business/preferred-vendors)
