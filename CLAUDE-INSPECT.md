# CLAUDE.md — Homie Inspect

> **Project:** Homie Inspect — inspection report → real quotes from local pros
> **Parent product:** Homie ("Your home's best friend") — AI-powered home maintenance diagnostic and provider outreach
> **Founder:** Peter (Coast to Cactus Vacations — STR operator, San Diego & Phoenix)
> **Last updated:** April 2026

---

## What is Homie Inspect?

Homie Inspect is a standalone product within the Homie platform, targeted at home buyers and sellers during real estate transactions. It takes a home inspection report — uploaded by either the homeowner or a partnered inspector — and uses AI to parse every actionable item into a structured, dispatchable punch list. The homeowner can then get real quotes from local providers for any or all items, turning a dense PDF into a negotiation tool with documented repair costs.

The core insight: home inspections identify problems but leave the homeowner to figure out costs on their own. They call 6 different contractors, wait for callbacks, compare quotes with no context, and negotiate blind. Homie Inspect eliminates that entire process. Upload the report, the AI parses it, tap to get quotes, negotiate with real numbers.

### The three participants

1. **Homeowner** (buyer or seller) — the end customer who needs to know what repairs cost
2. **Inspector** (partner) — uploads reports on behalf of clients, earns referral revenue
3. **Real estate agent** (affiliate) — recommends Homie Inspect to clients, earns commission on dispatches

---

## Brand System

### Colors
```
Primary Orange:  #E8632B (Homie Orange — primary actions, CTAs)
Orange Dark:     #C8531E (hover states)
Orange Light:    #F0997B
Green:           #1B9E77 (success, earnings, confirmed states)
Green Light:     #E1F5EE (green tinted backgrounds)
Dark:            #2D2926 (primary text, dark sections)
Dark Mid:        #4A4543 (secondary text)
Gray:            #9B9490 (tertiary text, labels)
Gray Light:      #D3CEC9 (borders, dividers)
Warm:            #F9F5F2 (page backgrounds, cards)
White:           #FFFFFF
```

### Severity Colors
```
Safety hazard:   #E24B4A (red) — background: #FCEBEB
Urgent:          #E24B4A (red) — background: #FCEBEB
Recommended:     #EF9F27 (amber) — background: #FAEEDA
Monitor:         #9B9490 (gray) — background: #F1EFE8
Informational:   #D3CEC9 (light gray) — background: #F1EFE8
```

### Typography
- **Display/Headlines:** Fraunces (serif, Google Fonts) — weight 700 for headers, 400 for testimonials/italic
- **Body/UI:** DM Sans (sans-serif, Google Fonts) — weights 400, 500, 600, 700
- Google Fonts import: `https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,700;1,400&family=DM+Sans:wght@400;500;600;700&display=swap`

### Brand Voice
Warm, casual, confident, occasionally funny. Like a knowledgeable friend. Never corporate. The product sub-brand is "homie inspect" — lowercase Fraunces "homie" in orange + DM Sans "inspect" in gray.

---

## Product Architecture Overview

### Two Entry Points → One Experience

Regardless of how the inspection report enters the system, the homeowner ends up on the same client-facing report page with the same dispatch and quote experience.

```
PATH A: Homeowner Self-Upload
  Upload PDF → AI parses → Homeowner provides details → Reviews items → Dispatches → Quotes arrive

PATH B: Inspector Uploads on Behalf
  Inspector uploads in portal → AI parses → Inspector reviews/corrects → Sends to client →
  Homeowner receives email with token URL → Reviews items → Dispatches → Quotes arrive
                                                    ↑
                                          SAME EXPERIENCE FROM HERE
```

### Core System Flow
```
Inspection Report (PDF/Spectora/HomeGauge)
  → AI Report Parser (Claude API with vision)
    → Extracted Items (categorized, severity-rated, cost-estimated)
      → Trade-Category Merge (group items by trade for single-provider dispatch)
        → Outreach Engine (voice + SMS + web to providers)
          → Quote Aggregation
            → Client Report Page (items + quotes + total)
              → Summary PDF (for agent negotiation)
```

---

## The Complete Homeowner Flow

### Step 1 — Upload (Path A: Self-Upload)
- Landing page at `/inspect` with no account required to start
- Drag-and-drop zone accepts PDF files (Spectora, HomeGauge, any format)
- Also accepts photos of report pages for paper reports
- Toggle at top switches messaging between "Buying a home" and "Selling a home"
- No email, no login, no friction — just the file

### Step 1 — Upload (Path B: Inspector-Sent)
- Inspector uploads report + client details in their partner portal
- Inspector reviews AI-parsed items and corrects mistakes before sending
- Inspector clicks "Send to client" → Homie emails homeowner a token-based URL
- Homeowner clicks link → lands directly on parsed report (skips to Step 4)
- Co-branded with inspector's company name and logo

### Step 2 — AI Parsing
- AI processes report in 30-60 seconds for a typical 30-page PDF
- Items appear one by one with animation as they're extracted
- Each item gets: title, description, category, severity, location, cost estimate range, confidence score
- Progress screen shows the Homie loading animation (spinning "h" with channel indicators)

### Step 3 — Details Capture (Path A only)
- Property address auto-populated from report (homeowner confirms)
- Name, email required. Phone optional (for SMS quote alerts)
- Account created via magic link — no password needed
- If homeowner came through agent affiliate link, attribution cookie is set
- If came through inspector partner link, attribution set to inspector

### Step 4 — Parsed Report (both paths converge here)
- Full item list organized by severity (urgent first)
- Summary banner: item count + severity breakdown + total estimated cost range
- Each item is a card with: severity badge, title, category pill, location pill, cost estimate, confidence score, "Get quote" button
- Homeowner can dismiss items, adjust severity, or add notes in a review step
- Inspector-uploaded reports show "Prepared by [Inspector Company]" with logo

### Step 5 — Pricing & Dispatch
Two options always visible:

**Bundle (primary CTA):** $6.99/item (minimum $49.99, maximum $199.99)
- 5 items = $49.99
- 11 items = $76.89
- 20 items = $139.80
- 30+ items = $199.99
- Includes priority outreach + shareable summary report

**Per-item:** $9.99 per item — cherry-pick specific items

Items are automatically merged by trade category before dispatch (see Trade-Category Merging section below).

### Step 6 — Quotes Arrive
- Real-time updates on the report page as providers respond
- Each item card transitions: "Dispatched" (orange) → "Quote received" (green)
- Quote shows: provider name, star rating, price, availability
- Email/SMS notification per quote received
- Running total at bottom tallies all received quotes
- Multiple quotes per item displayed if multiple providers respond

### Step 7 — Summary Report
- Downloadable PDF: property info, inspector details, each item with severity + quote, total
- Sections: "Urgent items" / "Recommended items" / "Monitor items"
- "Share with your agent" button generates read-only URL
- This document is the homeowner's negotiation ammunition

---

## Trade-Category Merging (Critical Design Decision)

When multiple inspection items share the same trade category, they are MERGED into a single dispatch sent to one provider. This mirrors how the industry works — one plumber quotes all plumbing items on a single visit.

### Why
- Providers want full scope so they can quote one trip with all items
- Homeowners save on multiple service call fees ($75-150 each)
- Homie's outreach cost is per dispatch, not per item — margin improves with merging

### Merge Rules
- Items with matching `category` field are grouped into one dispatch
- The outreach script presents all items in the group to the provider
- Provider can quote as a bundle total or with line-item breakdown
- Items in unique categories (only 1 item of that trade) dispatch individually
- Cross-category merging into "handyman" is NOT done automatically (licensing concerns)
- Homeowner can manually override grouping if desired

### Edge Cases
- **Staggered dispatch:** If homeowner dispatches a plumbing item Monday, then another plumbing item Wednesday, append the new item to the existing outreach rather than starting fresh. Contact the same provider: "The homeowner added another item — can you update your quote?"
- **Already-quoted item + new item:** Reach back to same provider: "You quoted $175 for the slow drain. The homeowner also needs a water heater assessment. What's the combined price?"

### UI for Merged Items
- Group header above merged items: "Plumbing — 3 items (quoted together as one visit)"
- Item cards visually nested under the group with slight indent or connecting line
- Quote displayed on the group header, not individual items: "Rodriguez Plumbing — 4.9 stars — $450 total"
- Individual items show line-item breakdown if provider gave one, or "included in $450 bundle"
- "Book" button at group level, not individual item level
- Standalone items (only one of that trade) display normally with their own quote

### Data Model
- `dispatch_group_id` (uuid, nullable) on `inspection_report_items` — links items dispatched together
- Items with the same `dispatch_group_id` share one dispatch in the outreach system
- Quote response may include `line_items` JSON: `[{ item_id, amount_cents, notes }]` plus `total_cents` and `service_call_fee_cents`
- If provider gives lump sum, `line_items` is null — only `total_cents` populated

---

## Client-Facing Report Page

**URL:** `/inspect/:token` — no login required, token-based access

This is the single most important page. Both entry paths lead here. Every design decision optimizes for one action: getting the homeowner to tap "Get quotes."

### Layout (mobile-first, max-width 640px centered)

**Top bar:** "homie inspect" branding. If inspector-uploaded: co-branded with inspector logo.

**Property banner:** Address, inspection date, map thumbnail. If agent attributed: "Your agent: Sarah Martinez."

**Summary card:** Total items + severity pills (e.g., "3 urgent · 5 recommended · 2 monitor") + total estimated cost range.

**Pricing section:** Bundle card (highlighted, primary CTA) and per-item option side by side. Bundle shows per-item savings vs individual pricing.

**Items list:** Sorted by severity (urgent first). Each item is an expandable card:
- Collapsed: severity badge, title, category pill, location pill, cost estimate, "Get quote" button
- Expanded: full inspector description, photos, AI assessment, trade category explanation

**Item states:**
- Default: white background, "Get quote" button
- Dispatched: amber background, loading animation, "Contacting pros..."
- Quote received: green background, provider details (name, rating, price, availability), "Book" button
- Booked: green with checkmark, scheduled date/time

**Running total:** Sticky bar on mobile. "Quotes received: $4,850 across 8 items." "View summary" button.

**Summary section:** "Download summary report" (PDF) + "Share with your agent" (read-only link).

### Token Mechanics
- `client_access_token`: 64-character random string (crypto.randomBytes(32).toString('hex'))
- Expires 90 days after report upload
- No login required — token IS the access credential
- Expired tokens show friendly message: "This report has expired. Contact your inspector to request a new link."
- Homeowner can "lock" their report (require email verification to view) — off by default

---

## Inspector Partner Portal

### Portal Structure
Separate section of the app at `/inspector`. Own layout with sidebar nav and top bar. NOT the same layout as consumer or B2B dashboards.

**Top bar:** "homie" (Fraunces orange) + "partner" (DM Sans gray). Inspector company name + avatar on right.

**Sidebar nav:**
- Dashboard (home icon)
- Reports (document icon)
- Leads (inbox icon — only if `accepts_inbound_leads` is true)
- Earnings (dollar icon)
- Marketing (megaphone icon)
- Settings (gear icon)

### Signup Flow (under 3 minutes)
1. Basics: name, email, phone, company name, website (optional)
2. Service details: inspection software (dropdown), service area (zip codes), inspection types (checkboxes), avg inspections/month
3. Lead opt-in: receive inbound leads from homeowners in their area?
- Magic link email verification → account activated
- Auto-generates `partner_slug` from company name
- Welcome email with partner URL, QR code, quick-start guide

### Dashboard Page
Three metric cards:
- "This month's earnings" — total in Fraunces bold green, comparison to last month
- "Reports uploaded" — count + items dispatched by clients
- "Client dispatch rate" — percentage + network average comparison

6-month earnings sparkline chart (Recharts).

Recent reports list (5 most recent) with: date, address, client name, item count, status pill, earnings.

Quick actions: "Upload report" button, "View all reports" link, "Download marketing materials" link.

### Report Upload Flow
1. File upload: drag-and-drop PDF/HTML. Or "Connect Spectora/HomeGauge" for auto-sync.
2. Client details: name, email, phone (optional), property address/city/state/zip, inspection date, type.
3. Add-on: "Did you sell the Homie add-on?" toggle. If yes: price charged (default from settings), revenue split displayed.
4. Processing: AI parses in real time, items appear one by one.
5. Inspector reviews extracted items: can edit, delete, add items, adjust severity. This review step is what makes inspector-uploaded reports higher quality.
6. "Send to client" → email sent to homeowner with token URL.

### Spectora & HomeGauge Integration
- OAuth connection in settings
- Once connected, published reports auto-sync to Homie portal
- Spectora/HomeGauge APIs return STRUCTURED deficiency data (not just PDFs) — categories, descriptions, photos, severity already parsed
- This path gives near-100% parsing accuracy (no AI interpretation needed)
- Massive friction reduction — inspector doesn't manually upload anything

### Report Detail Page
- Property info, client info, status step bar (Upload → Processing → Review → Sent)
- Full item list with edit/delete capabilities (before client notification)
- Each item: severity badge, title, description, category, cost estimate, confidence, photos
- After sent to client: shows dispatch status, quotes received, earnings from this report
- "Nudge client" button (available 48+ hrs after send, max 2 nudges per report)

### Inbound Leads
- Homeowners in the inspector's service area who need an inspector get matched
- Lead card: homeowner name, property area, inspection type, preferred timing, expiration countdown
- Actions: "Accept" (reveals contact details) or "Pass" (lead goes to next partner)
- "Mark as converted" when accepted lead becomes a real inspection → $25 bonus earning

### Earnings Page
- Current month summary with breakdown (add-on fees vs referral commissions)
- Monthly breakdown table: month, reports, dispatches, add-on fees, commissions, total, payout status
- Payout history: dates, amounts, method, status
- Projected earnings calculator: "Based on your pace, you're on track to earn $X this year"

### Marketing Materials
- Partner URL with copy button and QR code
- Downloadable PDFs: client flyer, handout card
- Email templates (3): pre-inspection pitch, post-inspection delivery, client follow-up
- Social media post templates with copy buttons
- "Homie Inspection Partner" badge (SVG + PNG) for website/email signature
- QR code generator in multiple sizes

### Settings
- Business info: company name, logo, website, phone, license, certifications
- Service areas: add/remove zip codes with map preview
- Software connections: Spectora/HomeGauge OAuth connect/disconnect
- Pricing: default add-on price ($79-199 slider) with live revenue split display
- Payouts: Stripe Connect onboarding, payout method, minimum threshold
- Notifications: toggles for each notification type
- Partner URL: editable slug with live preview

### Inspector Tiers (earned by volume, never paid)
- **Standard** (0-10 reports/trailing 30 days): basic features, manual upload, monthly payouts
- **Preferred** (11-30 reports): + auto-sync, priority leads, bi-weekly payouts, co-branded emails
- **Elite** (31+ reports): + dedicated account manager, featured in directory, weekly payouts, early access

Tier recalculated weekly by background job.

---

## Real Estate Agent Affiliate Program

### Program Name: "Homie Agent Network"

Structured as an affiliate/marketing partnership — NOT a referral program. This distinction matters for RESPA compliance.

### RESPA Compliance (Critical)
- RESPA Section 8 prohibits kickbacks for referral of "settlement services" (title, mortgage, inspections)
- The home inspection IS a settlement service. Homie's quote-getting service is NOT.
- Agent commissions are tied to Homie's maintenance services (dispatches/quotes), never to the inspection itself
- Agent earns nothing when a report is uploaded — only when items are dispatched
- Agent does NOT earn for referring to a specific inspector
- Must have real estate attorney review affiliate agreement before launch
- Agents must disclose affiliate relationship to clients

### Commission Structure
- Standard search: $2.00 per dispatch ($9.99 price)
- Priority search: $4.00 ($19.99)
- Emergency search: $6.00 ($29.99)
- Inspect per-item dispatch: $1.50 ($9.99)
- Inspect bundle: $20.00 flat
- Membership conversion: $15.00 one-time bonus
- 90-day attribution cookie window

### Agent Tiers
- **Agent** (0-5 referrals/mo): standard commissions
- **Top Agent** (6-15/mo): 25% commission boost + badge
- **Elite Agent** (16+/mo): 50% boost + featured placement + co-marketing

### Agent Gets
- Unique affiliate URL: `homie.com/agent/[name]`
- Co-branded landing page with photo, brokerage, custom note
- Simple dashboard: referral activity, searches completed, earnings
- Marketing materials: email templates, social posts, closing packet insert, QR code
- Monthly payouts via direct deposit ($25 minimum, 1099 at year-end)

### Financial Model Per Dispatch (with all parties)
Single item ($9.99):
- Outreach cost: ~$1.71
- Inspector commission: $1.50 (15%)
- Agent commission: $1.50 (if attributed)
- Stripe fee: ~$0.60
- Homie net: $4.68 (47% margin)

Bundle ($6.99/item × 11 items = $76.89):
- Outreach cost: ~$8.55 (5 merged dispatches × $1.71)
- Inspector referral: $20 flat
- Agent commission: $20
- Stripe: ~$2.53
- Homie net: $25.81 (34% margin)

---

## Database Schema

### inspector_partners
```sql
id                        uuid PK
user_id                   uuid FK → users
company_name              varchar(255)
company_logo_url          text, nullable
website                   varchar(255), nullable
phone                     varchar(20)
license_number            varchar(100), nullable
certifications            text[]  -- ["ASHI", "InterNACHI"]
service_area_zips         text[]  -- GIN index
inspection_software       enum(spectora, homegauge, palmtech, inspectit, other)
spectora_connected        boolean, default false
homegauge_connected       boolean, default false
addon_price_cents         integer, default 9900
partner_slug              varchar(100), unique
accepts_inbound_leads     boolean, default true
avg_inspections_per_month integer, nullable
stripe_connect_account_id varchar(255), nullable
payout_method             enum(stripe, paypal, check), default stripe
status                    enum(active, paused, deactivated, pending_verification)
tier                      enum(standard, preferred, elite), default standard
referred_by_partner_id    uuid FK → inspector_partners, nullable
joined_at                 timestamptz
created_at                timestamptz
updated_at                timestamptz
```

### inspection_reports
```sql
id                        uuid PK
inspector_partner_id      uuid FK → inspector_partners, nullable  -- null for self-uploads
agent_attribution_id      uuid FK → agent_affiliates, nullable
property_address          varchar(255)
property_city             varchar(100)
property_state            varchar(2)
property_zip              varchar(10)
client_name               varchar(255)
client_email              varchar(255)
client_phone              varchar(20), nullable
inspection_date           date
inspection_type           enum(general, pre_listing, new_construction, warranty_11mo, commercial, radon, mold, sewer_scope, pool_spa)
report_file_url           text, nullable  -- S3 URL
source                    enum(manual_upload, spectora_sync, homegauge_sync, homeowner_upload)
addon_sold                boolean, default false
addon_price_cents         integer, nullable
parsing_status            enum(uploading, processing, parsed, review_pending, sent_to_client, failed)
parsing_error             text, nullable
items_parsed              integer, default 0
items_dispatched          integer, default 0
items_quoted              integer, default 0
total_quote_value_cents   integer, default 0
inspector_earnings_cents  integer, default 0
client_notified_at        timestamptz, nullable
client_first_action_at    timestamptz, nullable
client_access_token       varchar(64), unique  -- 90-day access token
expires_at                timestamptz  -- 90 days after upload
created_at                timestamptz
updated_at                timestamptz
```
Indexes: `(inspector_partner_id, created_at DESC)`, `(client_access_token)` unique, `(parsing_status)`

### inspection_report_items
```sql
id                        uuid PK
report_id                 uuid FK → inspection_reports
title                     varchar(255)  -- "Missing GFCI outlets in bathrooms"
description               text  -- full inspector notes
category                  enum(plumbing, electrical, hvac, roofing, structural, general_repair, pest_control, safety, cosmetic, landscaping, appliance, insulation, foundation, windows_doors, fireplace)
severity                  enum(safety_hazard, urgent, recommended, monitor, informational)
location_in_property      varchar(255), nullable  -- "Master bathroom"
inspector_photos          text[]  -- S3 URLs
ai_cost_estimate_low_cents   integer
ai_cost_estimate_high_cents  integer
ai_confidence             numeric(3,2)  -- 0.00 to 1.00
dispatch_group_id         uuid, nullable  -- links items dispatched together by trade
dispatch_status           enum(not_dispatched, dispatched, quotes_received, booked, completed)
dispatch_id               uuid, nullable  -- links to main Homie dispatch system
quote_total_cents         integer, nullable  -- group total if merged
quote_line_item_cents     integer, nullable  -- this item's portion if provider gave breakdown
quote_line_items          jsonb, nullable  -- [{item_id, amount_cents, notes}] on the group leader
provider_name             varchar(255), nullable
provider_rating           numeric(2,1), nullable
provider_availability     varchar(100), nullable
service_call_fee_cents    integer, nullable  -- provider's trip charge (on group leader)
sort_order                integer, default 0
inspector_adjusted        boolean, default false  -- did inspector modify AI parse?
status                    enum(ai_identified, pm_confirmed, pm_corrected, pm_dismissed)
confirmed_by              uuid FK, nullable
created_at                timestamptz
updated_at                timestamptz
```
Indexes: `(report_id, sort_order)`, `(dispatch_status)`, `(dispatch_group_id)`, `(category)`

### inspector_earnings
```sql
id                        uuid PK
inspector_partner_id      uuid FK
report_id                 uuid FK, nullable
lead_id                   uuid FK, nullable
earning_type              enum(addon_fee, referral_commission, inbound_lead_bonus, partner_referral_bonus)
amount_cents              integer
description               text  -- "Referral commission: plumbing bundle dispatch"
period_month              date  -- first day of earning month
payout_id                 uuid FK, nullable
created_at                timestamptz
```
Indexes: `(inspector_partner_id, period_month)`, `(payout_id)`

### inspector_payouts
```sql
id                        uuid PK
inspector_partner_id      uuid FK
period_month              date
total_amount_cents        integer
earnings_count            integer
payout_method             enum(stripe, paypal, check)
stripe_transfer_id        varchar(255), nullable
status                    enum(pending, processing, paid, failed)
failure_reason            text, nullable
paid_at                   timestamptz, nullable
created_at                timestamptz
```

### inspector_inbound_leads
```sql
id                        uuid PK
inspector_partner_id      uuid FK
homeowner_name            varchar(255)
homeowner_email           varchar(255)
homeowner_phone           varchar(20), nullable
property_city             varchar(100)
property_state            varchar(2)
property_zip              varchar(10)
inspection_type_needed    enum(same as inspection_reports)
preferred_date_range      varchar(255), nullable
notes                     text, nullable
status                    enum(new, accepted, passed, converted, expired)
accepted_at               timestamptz, nullable
converted_at              timestamptz, nullable
lead_source               varchar(100)  -- "homie_directory", "homie_inspect_page"
created_at                timestamptz
expires_at                timestamptz  -- 7 days after creation
```

### agent_affiliates
```sql
id                        uuid PK
user_id                   uuid FK → users
agent_name                varchar(255)
email                     varchar(255)
phone                     varchar(20)
brokerage_name            varchar(255)
license_number            varchar(100)
license_state             varchar(2)
license_verified          boolean, default false
service_markets           text[]  -- cities/areas
affiliate_slug            varchar(100), unique  -- homie.com/agent/[slug]
headshot_url              text, nullable
custom_note               text, nullable  -- displayed on their landing page
audience_focus            enum(buyer, seller, both), default both
tier                      enum(agent, top_agent, elite_agent), default agent
attribution_window_days   integer, default 90
total_referrals           integer, default 0
total_earnings_cents      integer, default 0
payout_method             enum(stripe, paypal, check)
stripe_connect_account_id varchar(255), nullable
status                    enum(active, paused, deactivated, pending_verification)
created_at                timestamptz
updated_at                timestamptz
```

### agent_referral_events
```sql
id                        uuid PK
agent_affiliate_id        uuid FK
user_id                   uuid FK → users  -- the referred homeowner
event_type                enum(inspect_item_dispatch, inspect_bundle, consumer_search_standard, consumer_search_priority, consumer_search_emergency, membership_conversion)
source_report_id          uuid FK, nullable  -- if from an Inspect dispatch
amount_cents              integer  -- commission earned
period_month              date
payout_id                 uuid FK, nullable
created_at                timestamptz
```

---

## Report Parsing Service

### Location: `src/services/inspection-report-parser.ts`

### Input
Report file (PDF or HTML) + report metadata (property address, inspection type, source)

### Processing Paths

**Path 1: Spectora/HomeGauge sync (structured data)**
- Skip AI parsing entirely — use structured API data
- These platforms return: deficiency description, category, severity, photos, location
- Map their data format to `inspection_report_items` fields
- Near-100% accuracy
- This is the preferred path for partnered inspectors

**Path 2: PDF/HTML upload (AI parsing)**
- Extract text from PDF using a PDF parser
- Render pages as images for AI analysis (inspection reports have annotated photos)
- Send to Claude API with vision and structured JSON extraction prompt
- The prompt instructs Claude to extract every actionable deficiency with: title, description, category, severity, location, cost estimate, confidence
- Apply confidence scoring rules:
  - Item from structured API data: 0.95-0.99
  - Item from clear text extraction: 0.85-0.95
  - Item requiring interpretation: 0.70-0.85
  - Ambiguous item: 0.50-0.70

### Merge Logic (post-parse)
After items are extracted, group by `category`:
- Count items per category
- Categories with 2+ items are flagged for merged dispatch
- Set `dispatch_group_id` on grouped items when dispatch is triggered
- Generate merged outreach script presenting all items to one provider

### Cost Estimation
Each item gets an AI-estimated cost range based on:
- The repair type and category
- The property's city/state (regional pricing)
- Historical quote data from Homie's database (improves over time)

---

## Notifications

### Emails Sent by the System

1. **Report ready (to homeowner)** — sent when inspector clicks "Send to client" OR when self-uploaded parsing completes
   - Subject: "Your inspection report is ready — see what everything costs to fix"
   - Body: inspector branding (if applicable), property address, item count, severity breakdown, CTA button

2. **Quote received (to homeowner)** — per quote, not batched
   - Subject: "Quote received: [Item title] — $[amount] from [Provider]"
   - Body: provider details, price, availability, link to full report

3. **All quotes in (to homeowner)**
   - Subject: "All quotes are in — total: $[amount]"
   - Body: summary, download PDF CTA, share with agent CTA

4. **Client nudge (to homeowner)** — triggered by inspector, 48+ hrs after send, max 2
   - Subject: "Your inspection report has [X] items ready for quotes"

5. **Client dispatch (to inspector)** — when client dispatches an item
   - Subject: "[Client] dispatched [Item] — you'll earn a referral commission"

6. **Monthly earnings summary (to inspector)**
   - Subject: "Your Homie earnings for [Month]: $[amount]"

7. **New inbound lead (to inspector)**
   - Subject: "New inspection lead in [City]"

8. **Agent attribution notifications** — lightweight
   - When referred client starts using Homie Inspect
   - When all quotes are complete

---

## Mock Data

### Demo Inspector: Mike Chen
```
Company: Chen Home Inspections
Certifications: ASHI, CA license HI-8892
Service areas: 92101-92104, 92107, 92109, 92110, 92116, 92117
Software: Spectora (connected)
Addon price: $99
Slug: chen-home-inspections
Tier: preferred (18 reports/trailing 30 days)
Joined: January 2026
```

### Demo Reports

**Report 1:** 1234 Ocean Blvd, San Diego — David T. — General — Apr 10
- 8 items: 3 urgent, 3 recommended, 2 monitor
- 5 dispatched, 3 quoted. Total quote value: $795
- Earnings: $59.40 (addon) + $17.40 (commissions) = $76.80
- Status: Active

**Report 2:** 567 Sunset Cliffs Blvd — Rachel M. — Pre-listing — Apr 7
- 6 items: 1 urgent, 3 recommended, 2 monitor
- Bundle purchased ($149): all dispatched
- Total quote value: $3,200. Earnings: $89.20. Status: Completed

**Report 3:** 890 Garnet Ave — James L. — General — Apr 3
- 11 items: 3 urgent, 5 recommended, 3 monitor
- 4 dispatched individually. Total: $1,450. Status: Active

### Demo Report 1 Items (for UI development)
```
1. Missing GFCI outlets in bathrooms — Electrical — urgent — $150-280 — conf 0.94
2. Roof flashing lifted near chimney — Roofing — urgent — $300-600 — conf 0.91
3. Dryer vent not properly terminated — Safety — urgent — $120-200 — conf 0.93
4. Water heater approaching end of life — Plumbing — recommended — $1,200-1,800 — conf 0.96
5. Slow drain in master bathroom — Plumbing — recommended — $125-250 — conf 0.88
6. HVAC filter heavily soiled — HVAC — recommended — $65-120 — conf 0.90
7. Cracked caulking around tub surround — General — monitor — $80-150 — conf 0.85
8. Exterior paint peeling on south wall — Cosmetic — monitor — $200-400 — conf 0.82
```

Items 4 and 5 would merge into a single "Plumbing — 2 items" dispatch.

### Demo Agent: Sarah Martinez
```
Brokerage: Compass Real Estate
License: CA DRE 02089445
Slug: sarah-martinez
Tier: agent
Attributed clients: 3
```

---

## Edge Cases

### Report Parsing
- **Unreadable PDF:** set `parsing_status = 'failed'`, show: "Unable to read this file. Try a different format."
- **Zero items extracted:** show: "No actionable items found. This may be a clean inspection."
- **All items informational:** show items but note: "None require immediate attention."
- **Very large report (50+ items):** paginate client page, 15 items per page. Bundle pricing still applies to all.

### Dispatch
- **Same-day dispatch of items in already-dispatched category:** append to existing outreach, don't create new dispatch
- **Provider quotes lump sum for merged items:** store on group leader item, show "included in bundle" on others
- **Payment failure:** item NOT dispatched, clear error shown, other dispatches unaffected

### Access
- **Expired token (90+ days):** friendly message + option to re-dispatch with updated pricing
- **Homeowner returns weeks later:** token persists, previous quotes still shown, undispatched items still actionable
- **Inspector deactivates:** existing reports remain accessible to clients until expiration

### Financial
- **Client disputes charge:** refund per standard policy, inspector commission clawed back
- **Inspector uploads wrong file:** allow deletion within 1 hour if not yet sent to client

---

## Key Principles for Building Homie Inspect

1. **Show value before asking for anything.** The upload and parsing happen before account creation. The homeowner sees their parsed report before entering their email.

2. **Merge by trade category, always.** Never send separate outreach for items the same provider would handle on one visit. This is what makes Homie feel professional.

3. **Token-based access for homeowners.** No login required. The token URL IS the access credential. Magic link for account creation later.

4. **Inspector review improves quality.** The review step between parsing and client delivery is what makes inspector-uploaded reports more accurate. Inspector corrections also train the AI over time.

5. **Two CTAs on every screen: bundle and individual.** The bundle should always feel like the obvious choice. Price it so the math is unmistakable.

6. **The summary PDF is the product.** Everything leads to the downloadable report that the homeowner gives their agent. That document — with real quotes, provider details, and a total — is what closes the deal.

7. **Inspector economics must be obvious.** The partner portal should show earnings prominently. The signup flow should show projected revenue. The dashboard should celebrate milestones. If inspectors don't see money, they stop uploading.

8. **RESPA compliance is non-negotiable.** Agent commissions are tied to dispatch activity (home maintenance), never to the inspection (settlement service). Legal review before launch.

9. **Spectora/HomeGauge integration is the moat.** Once an inspector connects their software, every report auto-flows to Homie. Switching cost is high, accuracy is near-perfect.

10. **Fraunces for headlines and big numbers, DM Sans for everything else.** Orange for actions, green for earnings/success, warm for backgrounds. Consistent across portal, client page, and emails.
