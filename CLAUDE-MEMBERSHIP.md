# CLAUDE.md — Homie Membership

> **Project:** Homie Membership — subscription product for homeowners
> **Parent product:** Homie ("Your home's best friend") — AI-powered home maintenance ecosystem
> **Founder:** Peter (Coast to Cactus Vacations — STR operator, San Diego & Phoenix)
> **Last updated:** May 2026
> **Sibling specs:** `CLAUDE.md` (consumer), `CLAUDE-BUSINESS.md`, `CLAUDE-INSPECT.md`

---

## What is Homie Membership?

Homie Membership is a tiered subscription product that turns the existing consumer Homie experience into a recurring relationship. Free users get a meaningful product (recurring vendor management, AI concierge, pay-per-dispatch). Paying members at $29 ("Plus") and $99 ("Premier") unlock the Home Health Score, full Home IQ, warranty automation, seasonal walkthroughs, annual professional tune-ups, and human concierge escalation.

The product positions explicitly against Casa ($199/mo). Where Casa is human-mediated and serves a premium SF/LA segment, Homie Membership is AI-mediated and serves a much wider mass-market. Casa's cost structure forces a single high price; Homie's three-tier structure captures everyone from curious first-time homeowners to property collectors with multiple homes.

### Core insight

The existing consumer Homie product already does the hard part — chat, dispatch, Home IQ, provider outreach. Membership is the retention and monetization layer that makes those capabilities reason for someone to pay $29/month indefinitely. The features added by this spec do not replace existing functionality. They augment it.

### The three retention horizons

A single feature won't justify a monthly bill. Membership stacks three time horizons so the subscription always feels alive:

- **Daily/weekly:** Health Score updates, warranty alerts, recall notifications, recurring vendor activity, AI concierge
- **Quarterly:** Seasonal walkthroughs (homeowner-led, AI-parsed)
- **Annual:** Professional Tune-Up by partnered inspector (Premier only)

Plus quiet retention features that compound over time: tax export, vendor relationship history, multi-year score tracking, neighborhood comparisons.

### Strategic positioning vs Casa

| | Casa | Homie Membership |
|---|---|---|
| Price floor | $199/mo | $0 (Free) / $29 (Plus) / $99 (Premier) |
| Concierge | Human, unlimited | AI primary + human at Premier |
| Handyman labor included | 1.5 hrs/mo | None included; provider credit add-on at $49/mo |
| Geographic reach | SF Bay + LA | San Diego + Phoenix at launch |
| Home inventory method | Field-collected (sends humans) | Self-serve photo + Spectora/HomeGauge integration |
| Vendor stance | "No vendor kickbacks" | Marketplace economics — providers and homeowners both customers |
| Acquisition funnel | Direct only | Inspect (high-intent) + Business (B2B cross-sell) |

---

## Brand System

Identical to existing Homie products. See `CLAUDE.md` for full brand spec. Key tokens:

### Colors
```
Primary Orange:  #E8632B (Homie Orange — primary actions, CTAs)
Orange Dark:     #C8531E (hover states)
Orange Light:    #F0997B
Green:           #1B9E77 (success, earnings, confirmed states)
Green Light:     #E1F5EE
Dark:            #2D2926 (primary text, dark sections)
Dark Mid:        #4A4543 (secondary text)
Gray:            #9B9490 (tertiary text, labels)
Gray Light:      #D3CEC9 (borders, dividers)
Warm:            #F9F5F2 (page backgrounds, cards)
White:           #FFFFFF
```

### Health Score Severity Colors
```
Score 85-100:    #1B9E77 (green) — excellent
Score 70-84:     #E8632B (orange) — good, room to grow
Score 50-69:     #EF9F27 (amber) — work to do
Score 0-49:      #E24B4A (red) — concerning
```

### Typography
- **Display/headlines:** Fraunces (serif) — weight 700 for headers, 400 for testimonials/italic
- **Body/UI:** DM Sans (sans-serif) — weights 400, 500, 600, 700
- **Big numbers:** Fraunces 500 — Health Score, dollar amounts, stat tiles

### Sub-brand framing

"homie membership" — lowercase Fraunces "homie" in orange, DM Sans "membership" in gray. Tier badges use sentence case in pill format:

- Free — gray fill, dark text
- Plus — coral fill, coral-dark text
- Premier — dark fill, white text

### Brand voice

Warm, casual, confident. Like a knowledgeable friend. The Homie agent speaks in first person ("I'll text Maria for you"). Notifications and emails feel personal, not corporate. Never use "users" or "customers" in customer-facing copy — say "members."

---

## Integration Architecture

This is the most important section. Get the architecture right and Membership ships incrementally without breaking the existing app.

### The principle

**Membership is a layer on the existing consumer Homie codebase, not a separate product.** Three implications:

1. The existing consumer app continues to work for every user, regardless of tier
2. Membership unlocks new features and lifts limits within that app
3. New code is additive — no existing features are replaced

### What already exists (and stays)

The consumer codebase already has:
- Chat-based AI interface (the Homie agent)
- Dispatch flow (tap a category, AI contacts providers, quotes return)
- Home IQ (basic property profiles, appliance entry)
- Provider network (the marketplace being recruited)
- Authentication, user accounts
- Payment for one-off dispatches

None of this changes. Membership extends it.

### What's new

New modules added to the codebase:

1. **Subscription system** — Stripe integration, tier management, billing
2. **Health Score engine** — algorithm, history, surface
3. **Recurring Vendors module** — schedules, payments, vendor onboarding
4. **Walkthrough engine** — quarterly photo capture + AI parsing
5. **Warranty automation service** — recall monitor, claim filing
6. **Tune-Up integration** — pulls from existing Inspect partner network
7. **Auto-care templates** — pre-built recurring service flows
8. **Member dashboard** — new home screen for Plus/Premier users
9. **Concierge escalation** — Premier-only human handoff

### Routing strategy

The existing consumer app's home screen is currently chat-led. After membership launches:

```
Logged-in route /
  ├── Free user → Existing chat-led home screen (unchanged)
  ├── Plus user → New Member Dashboard (Health Score, Vendors, Activity)
  └── Premier user → Member Dashboard + Concierge inbox at top
```

The chat interface remains accessible to all tiers via a persistent "Ask Homie" button in the navigation. Free users hit it first; paying members tap it from the dashboard when needed.

### Tier gating

Tier limits are enforced at the API layer via a single middleware function `requireTier(min: TierLevel)`. UI components show locked states with upgrade prompts when a feature is gated.

```typescript
// Tier hierarchy:  free < plus < premier

// Middleware example
router.post('/api/health-score', requireTier('plus'), getHealthScore);
router.post('/api/walkthrough/start', requireTier('plus'), startWalkthrough);
router.post('/api/tune-up/schedule', requireTier('premier'), scheduleTuneUp);
router.post('/api/concierge/message', requireTier('premier'), sendConciergeMessage);

// Frontend hook
const { tier, hasAccess } = useTier();
if (!hasAccess('plus')) {
  return <UpgradePrompt feature="Home Health Score" requiredTier="plus" />;
}
```

### Reused infrastructure

Several existing systems are reused, not duplicated:

| New feature | Reuses |
|---|---|
| Recurring Vendors | Existing provider profiles, dispatch comms infra, AI agent |
| Annual Tune-Up | Existing Homie Inspect inspector partner network |
| Warranty automation | Existing Home IQ inventory, AI agent for claim filing |
| Walkthrough parsing | Existing Inspect AI parser (with new prompt) |
| Auto-care plans | Existing dispatch system + new schedule layer |
| Member dashboard | Existing Home IQ data, new aggregation layer |
| Concierge escalation | Existing chat + new ops dashboard |
| Score boosters | Existing dispatch flow with score-impact metadata |

This reuse is what keeps the build manageable. Most new features are 60-70% leverage of existing infrastructure. The new code is mostly the orchestration layer that sits between existing systems.

### File structure (additions)

> **Discovery delta (May 2026):** the codebase has no `src/modules/` tree — data access lives in `packages/api/src/services/*.ts` files called directly from route handlers. Phase 1 follows the existing `services/` pattern; we don't introduce a new module convention.

```
packages/api/src/
  db/
    schema/
      homeowner-properties.ts          [NEW — Phase 1]
      recurring-vendors.ts             [NEW — Phase 1: recurringVendors + vendorVisits + vendorPayments]
    migrations/
      00NN_homeowner_membership_columns.sql       [NEW]
      00NN_homeowner_properties.sql                [NEW]
      00NN_recurring_vendors.sql                   [NEW]
      00NN_vendor_visits.sql                       [NEW]
      00NN_vendor_payments.sql                     [NEW]
  services/
    homeowner-properties.ts            [NEW — Phase 1 data access]
    recurring-vendors.ts               [NEW — Phase 1 data access]
    vendor-visits.ts                   [NEW — Phase 1 data access]
    vendor-payments.ts                 [NEW — Phase 1 data access]
    # (later phases) home-health-score.ts, walkthroughs.ts, warranty.ts, etc.
  middleware/
    require-tier.ts                    [NEW — later phase; analog of existing middleware/plan-gate.ts for homeowners]
  routes/                              [later phases — additive]

packages/web/src/
  pages/
    dashboard/                          [NEW — Plus/Premier home screen, later phase]
  components/
    TierGate.tsx                        [NEW — later phase]
  hooks/
    useTier.ts                          [NEW — later phase]
```

---

## Subscription Tiers

### Free — $0/month

The acquisition tier. Designed to get households into the ecosystem with no commitment. Specifically structured to outflank Casa, which has no free tier.

**Includes:**
- AI Concierge for home questions (rate-limited: 10 messages/month)
- Home IQ Lite — manual entry of up to 10 appliances
- Recurring Vendors — 1 vendor max
- Pay-per-dispatch ($9.99 per quote search)
- Inspect single-item dispatch ($9.99 each)

**Excludes:**
- Home Health Score
- Seasonal walkthroughs
- Warranty automation
- Annual Tune-Up
- Human concierge

**Strategic role:** Captures low-intent homeowners. Once they're using Recurring Vendors and have a few appliances inventoried in Home IQ, the upgrade to Plus is materially obvious — they've already invested setup work.

### Plus — $29/month

The flagship tier. Software-led, AI-mediated. Where most retention should happen and where most members should land.

**Includes:**
- Everything in Free, with all limits removed except provider credits
- Home Health Score (live, neighborhood comparison, trend)
- Home IQ Full — unlimited appliances, AI photo intake, warranty tracking
- Recurring Vendors — 2 vendors max
- Seasonal walkthroughs (4/year, AI-parsed)
- Warranty automation — recall monitoring, auto-filed claims
- AI Concierge unlimited
- 3 free dispatches/month (then $9.99 each)
- Inspect bundle pricing reduced 25% for members
- Annual tax export

**Excludes:**
- Annual professional Tune-Up
- Human concierge
- Project management
- Same-day handyman labor

**Margin model:** Software margin throughout. AI handles concierge load at near-zero marginal cost. Recurring vendor payment processing yields 1-2% take rate. Dispatch upsell on score-driven items.

### Premier — $99/month

The full-service tier. Includes professional services. Designed for homeowners shopping Casa at $199 — half the price, comparable scope (with handyman as a separate add-on rather than included).

**Includes:**
- Everything in Plus, with all limits removed
- Annual Homie Tune-Up — professional inspection by partnered inspector
- Recurring Vendors — unlimited
- Human concierge — text/email/voice escalation from AI agent
- Project management — assigned concierge handles bigger projects start to finish
- Priority dispatch — AI agent calls vendors first, faster quotes
- 10 free dispatches/month
- Multi-property pricing — second home at 50% off

**Add-on available:**
- Provider hour credit — $49/mo for 1 hour of partner provider time, rolls over

**Margin model:** Annual Tune-Up at wholesale via inspector partner network ($150 wholesale = $12.50/mo amortized). Human concierge handled by small in-house ops team (~$25-30/mo per active member). Total embedded cost ~$40-45/mo, gross margin ~55%.

### Add-ons (any paid tier)

- **Provider hour credit** — $49/mo for 1 hour of partner provider time, rolls over
- **Multi-property** — 50% off second home, 60% off third+
- **Family share** — additional household member access — $5/mo

---

## Pricing & Feature Matrix

| Feature | Free | Plus | Premier |
|---|---|---|---|
| **Pricing** | $0/mo | $29/mo | $99/mo |
| AI Concierge messages | 10/mo | Unlimited | Unlimited |
| Human concierge | — | — | Unlimited |
| Home IQ — appliances | 10 | Unlimited | Unlimited |
| Home IQ — AI photo intake | — | ✓ | ✓ |
| Home IQ — warranty tracking | — | ✓ | ✓ |
| Home Health Score | — | ✓ | ✓ |
| Recurring Vendors | 1 | 2 | Unlimited |
| Vendor payment processing | ✓ | ✓ | ✓ |
| Seasonal walkthroughs | — | 4/year | 4/year |
| Warranty automation | — | ✓ | ✓ |
| Recall monitoring | — | ✓ | ✓ |
| Annual Tune-Up | — | — | ✓ |
| Project management | — | — | ✓ |
| Priority dispatch | — | — | ✓ |
| Free dispatches/mo | 0 | 3 | 10 |
| Per-dispatch cost | $9.99 | $9.99 | $9.99 |
| Inspect bundle discount | — | 25% off | 25% off |
| Tax export | — | ✓ | ✓ |
| Multi-property | — | — | 50% off 2nd home |

---

## Feature Specs

### Home Health Score

The score is a single number from 0–100 representing how well-maintained the property is. It's the central retention engine — visible on the Member Dashboard, updated continuously, framed financially via resale impact.

#### Algorithm

Score is a weighted composite across five factors. Recompute nightly via background job; expose latest value through `home_health_scores` table.

```
Composite =
  0.35 × Maintenance Compliance
  + 0.25 × Item Health (open vs resolved)
  + 0.20 × Asset Health (appliance ages vs lifespans)
  + 0.10 × Inspection Recency
  + 0.10 × Warranty Coverage
```

##### Maintenance Compliance (0-100)

Tracks whether scheduled maintenance has happened on time:
- HVAC servicing (every 6 months)
- Water heater flush (annual)
- Gutter cleaning (every 6 months)
- Pest control (per recurring schedule)
- Recurring vendor visits completed

Each scheduled maintenance item is on time (full credit), late (partial credit decaying linearly), or missed (zero). Items the property doesn't have don't count.

##### Item Health (0-100)

Computed from open inspection items vs resolved:
- Urgent items: -8 each
- Recommended items: -3 each
- Monitor items: -1 each
- Resolved items in last 90 days: +2 each

Bottom-clamped at 0, top-clamped at 100.

##### Asset Health (0-100)

For each major appliance/system in Home IQ:
- Age vs typical lifespan ratio
- Items past 90% of expected lifespan deduct points
- Items recently replaced add points

##### Inspection Recency (0-100)

- Inspection within 12 months: 100
- Within 24 months: 70
- Within 36 months: 40
- Older than 36 months: 0

Premier members hit the maximum because the Annual Tune-Up keeps this current.

##### Warranty Coverage (0-100)

- Percentage of major appliances/systems with active warranties
- Bonus points for tracked warranties Homie can auto-claim against

#### Display rules

- Live computation refresh: nightly (background job)
- Trend bar: last 6 months of scores, with current month highlighted in primary orange
- Delta indicator: compare this month to last month, show +/- in the score color band
- Neighborhood percentile: computed from anonymized scores of other Homie members in the same zip code; show only when ≥10 members in zip
- Resale impact: derived from a regional regression model relating score to comparable sales; displayed only when statistically meaningful

#### Score boosters

The "Boost your score" section on the Member Dashboard shows the top 3 open items (urgent first, then recommended) with their score impact. Tapping any item invokes the standard Homie dispatch flow with `source = 'health_score_booster'` for attribution.

#### Negative score events

When something happens that would meaningfully lower the score, surface a notification:
- "An item you tracked is now overdue — your score dropped 2 points"
- "Your dishwasher passed its expected lifespan — consider scheduling a check"

This creates engagement loops independent of homeowner-initiated activity.

---

### Recurring Vendors ("Your Team")

The retention moat. Once a homeowner is paying their gardener, cleaner, pool guy, and pest control through Homie, the switching cost is high enough to preempt most cancellation thoughts.

#### Two vendor types

Both appear in the same dashboard with identical UX:

**Bring-your-own (BYO)** — homeowner adds an existing vendor by name + phone + email. Vendor is invited via SMS to confirm payment details. No app required for the vendor — confirmations and completions happen by SMS.

**Network** — vendors already in the Homie Pro network. Pre-vetted, rated, available to other members. Vendor uses the Homie Pro app/portal.

A small "Network" badge differentiates them visually but the homeowner experience is identical.

#### Vendor onboarding (BYO flow)

Homeowner taps "Add vendor" and provides:
- Vendor name (business or individual)
- Service category (cleaning, landscaping, pool, pest, HVAC, other)
- Phone number
- Email
- Schedule pattern (weekly/biweekly/monthly + day + time)
- Amount per visit
- Payment method (auto-pay on completion vs manual approval)

System sends the vendor an SMS:
> "Hi [Name], David Thompson at 1247 Sunset Cliffs Blvd would like to pay you through Homie. Tap [link] to confirm your payment details (60 sec). It's free for you, you just enter how you'd like to be paid."

Vendor taps the link, lands on a token-based page (no login required), enters either:
- Bank account info for ACH transfer (Stripe Connect)
- Email/phone for receiving payment via Homie

Once confirmed, vendor is active. They receive SMS reminders 24h before each visit and a "tap to confirm completion" SMS after each visit — taps trigger payment.

#### Schedule engine

Each `recurring_vendor` has a schedule pattern:
- `weekly` — specific day of week
- `biweekly` — even or odd weeks of year
- `monthly` — specific date or "Nth weekday of month"
- `quarterly` — specific months and dates
- `custom` — explicit list of dates

Background job runs nightly, computes the next 30 days of expected visits, creates `vendor_visit` records in `scheduled` status. Visits within 24h get the confirmation SMS.

#### Schedule overrides

Homeowner can:
- Skip a single visit ("we're traveling May 5-12")
- Reschedule a visit
- Pause indefinitely
- Cancel the recurring relationship

Travel holds skip all vendors automatically when the homeowner enables a date range.

#### Confirmation states

A `vendor_visit` moves through:

```
scheduled → confirmation_sent → confirmed → completed → paid
                    ↓
                 skipped (homeowner cancellation)
                    ↓
                 missed (no completion within 24h of expected time)
```

The AI agent sends confirmations and follow-ups automatically. If a vendor doesn't confirm within 12h of the visit, the AI texts them a follow-up. If still no response, the homeowner is notified.

#### Payment processing

Three payment methods supported:
- **Card on file** — homeowner card charged on completion
- **ACH from bank** — homeowner bank debited (lower processing fee)
- **Homie credit** — drawn from add-on credit balance

Auto-pay rules (configurable per vendor):
- Auto-pay on completion (default)
- Auto-pay if amount ≤ threshold (default $200)
- Manual approval always

Payments to vendors via Stripe Connect (vendor receives ACH transfer next business day).

#### Visit logs

Each completed visit records:
- Date, time, duration
- Photo evidence (if vendor sends one)
- Notes (if vendor adds any)
- Payment amount and method
- Tip amount (homeowner can add)

Year-end tax export aggregates all vendor payments by category for Schedule E (rental properties), home office deductions, or general records.

---

### Annual Homie Tune-Up

Premier-only. The big anchor moment that justifies the price jump from Plus.

#### Workflow

1. **Scheduling** — Premier members choose a month for their annual Tune-Up at signup. Reminder sent 30 days before; Homie auto-suggests dates based on inspector availability.
2. **Inspector matching** — System pulls from existing Homie Inspect partner network in the member's zip code. Prioritizes inspectors with high ratings and Tune-Up volume.
3. **Inspection** — Inspector performs a Homie-branded walkthrough using the existing Inspect partner portal. Same parsing pipeline as Inspect (Spectora/HomeGauge sync where available).
4. **Report generation** — Inspector reviews AI-parsed items and corrects mistakes. Member receives an email with their Tune-Up report.
5. **Score update** — Inspection items flow into the Health Score system. The "Inspection Recency" factor resets to 100. Open items become score boosters.
6. **Optional dispatch** — Member can tap any item to get quotes (this is the upsell path; dispatches are extra revenue).

#### Inspector economics

For Tune-Ups, inspectors are paid wholesale rates ($150-180/inspection) in exchange for:
- Steady, predictable monthly volume
- Access to all member homes in their service area
- Usual referral commissions on dispatches that flow from the Tune-Up report

Earnings show in the inspector partner portal under a new "Tune-Ups" section.

#### Co-branding

Tune-Up reports show "Tune-Up by [Inspector Company]" — leverages the inspector's local credibility. Inspector can include their logo and a personalized note for the member.

---

### Seasonal Walkthroughs

Plus and Premier. The quarterly engagement mechanism — keeps the score current and gives members a reason to open the app.

#### Cadence

Four per year:
- **Spring walkthrough** — March (focus: post-winter exterior, HVAC prep for cooling season)
- **Summer walkthrough** — June (focus: pool, hot tub, A/C performance, exterior shade items)
- **Fall walkthrough** — September (focus: heating prep, gutters, weatherstripping)
- **Winter walkthrough** — December (focus: insulation, pipes, indoor air quality)

Reminder sent 7 days before each season's walkthrough opens; available all month.

#### Photo capture flow

Member receives push notification:
> "Your spring walkthrough is ready. 5 minutes, 12 photos. Adds up to +6 to your score."

Tapping opens the walkthrough wizard:
1. Welcome screen with what's covered this season
2. Guided photo capture — Homie shows reference photos for each shot ("Take a photo of your HVAC unit", "Photo of the eaves on the south side")
3. Optional: voice notes alongside photos
4. Submit → AI parsing begins

#### AI parsing

Reuses the existing Inspect parser with a new prompt tuned for seasonal walkthroughs. Photos are sent to the Claude API with vision. The model:
- Identifies any new issues visible in the photos
- Compares against previous season's photos to flag changes
- Updates Home IQ inventory if new appliances/systems are visible
- Returns a structured punch list with severity, category, cost estimate, confidence

Items appear in the member's open items list and feed the Health Score. New items also surface as score boosters on the dashboard.

#### Score impact

A completed seasonal walkthrough adds points to the score in two ways:
- Direct "+3 points" reward for completing the walkthrough (engagement)
- Indirect impact via newly discovered items the member resolves

---

### Warranty Automation

Plus and Premier. The hidden value moment — most members never realize how much money this saves until it pays out.

#### Three components

**Warranty tracking** — Home IQ already captures appliance/system serial numbers, models, and purchase dates. The warranty automation service computes which warranties are still active, when they expire, what they cover.

**Recall monitoring** — Background service polls the CPSC database, manufacturer recall feeds, and NHTSA. Matches against Home IQ inventory by make/model/serial number range. When a match is found, member is notified.

**Class-action monitoring** — Periodic check of major class-action settlements relevant to home appliances and systems. When a member's items are eligible, surface the claim and offer to file.

#### Auto-claim filing

When a recall or settlement matches a member's inventory:

1. Notification sent: "Your [item] qualifies for [recall/settlement]. Estimated reimbursement: $X."
2. Member taps "Yes, file my claim"
3. AI agent fills out the claim form using Home IQ data (serial number, purchase date, etc.) — most claims are formulaic
4. For claims requiring proof of purchase, AI prompts member for receipt or purchase email
5. Submitted claim tracked in `warranty_claims` table
6. Status updates surfaced as they arrive

#### When something breaks

When a member dispatches a job for a category covered by an active warranty, the system flags it:

> "Wait — your KitchenAid dishwasher might still be under warranty (purchased 14 months ago, 24-month warranty). We can file a warranty claim instead of dispatching a repair. Want us to try that first?"

This prevents members from paying out-of-pocket for things that should be covered.

---

### Auto-Care Plans

Plus and Premier. Pre-built recurring service templates that convert one-off needs into ongoing vendor relationships.

#### Templates

Pre-built per home type:

- **Single-family home (no pool)** — quarterly HVAC service, biweekly cleaning, weekly landscaping, monthly pest control
- **Single-family home (with pool)** — above + weekly pool service
- **Condo/townhouse** — biweekly cleaning, quarterly HVAC, monthly pest control
- **Vacation rental (STR)** — turnover cleaning per booking, biweekly inspection, monthly pest control, quarterly HVAC

Templates are starting points — members customize from there.

#### One-tap subscribe

Member browses available auto-care plans. Tapping "Set up" walks through:
1. Confirm the schedule (default from template)
2. Set the budget per visit (Homie shows market range)
3. Match with vendors:
   - Member has an existing vendor for this category → use them
   - No existing vendor → Homie matches with verified network providers
4. Confirm payment method
5. Schedule activates

This is the path that converts a member's score booster ("Add quarterly HVAC service") into recurring revenue for both vendor and Homie.

---

### AI Concierge + Human Concierge (Premier)

#### AI Concierge (all tiers)

The existing Homie agent. Free tier rate-limited to 10 messages/month. Plus and Premier unlimited.

Capabilities:
- Answer home questions (using Home IQ context)
- Schedule dispatches
- Add to recurring vendor schedule
- Skip/reschedule visits
- Look up warranty status
- File warranty claims
- Update Home IQ inventory

The AI handles 90%+ of member requests without human involvement.

#### Human concierge escalation (Premier only)

When the AI determines a request needs human attention, or when the member explicitly asks for a person, the conversation routes to a small in-house ops team.

Escalation triggers:
- Vendor disputes
- Multi-step projects requiring planning ("redo my landscaping")
- Warranty disputes that need negotiation
- Time-sensitive coordination ("my fridge died, I have guests arriving Friday")
- Complex insurance interactions
- Member explicitly types "talk to a human"

The ops team works through a dedicated dashboard that shows:
- All escalated conversations across all members
- Member context (Home IQ, recent activity, score)
- SLA timer (target response: <15min business hours, <2hr off-hours)
- Internal note system for handoffs

Premier members see a "Talk to a person" button at the top of the chat. Members on lower tiers see "Upgrade to Premier for human concierge."

---

## Database Schema

> **Discovery delta (May 2026):** the codebase has no `users` table — consumer auth lives on `homeowners`. The codebase has a `properties` table but it's workspace-scoped (B2B). Consumer property data lives directly on `homeowners` rows today.
>
> Per `/docs/membership-phase-1-discovery.md`, the membership schema is built around:
> - `homeowner_id uuid → homeowners(id)` everywhere the original spec said `user_id → users(id)`
> - A NEW `homeowner_properties` table to hold consumer property data going forward (multi-property is a Premier perk; the existing single-property fields on the `homeowners` row are kept and backfilled into `homeowner_properties` for forward use)
> - `text` columns over PG-native enums and `varchar(N)`, matching codebase convention. Allowed values are documented + enforced in app code (and optionally a `CHECK` constraint).
> - `homeowners.membership_tier` and `homeowners.stripe_customer_id` already exist as `text` columns; the migrations only add the four `tier_*_at` columns + `stripe_subscription_id`.
>
> Later-phase tables (`home_health_scores`, `walkthroughs`, `warranty_claims`, etc.) carry the same rename: `user_id → homeowner_id`, `property_id → homeowner_property_id`. They'll be updated when their phase ships.

### Modifications to existing tables

```sql
-- homeowners (existing): the four tier-state columns plus stripe_subscription_id.
-- membership_tier (text) and stripe_customer_id (text) already exist — DO NOT
-- re-add or change types.
ALTER TABLE homeowners ADD COLUMN stripe_subscription_id text;
ALTER TABLE homeowners ADD COLUMN tier_started_at timestamp with time zone;
ALTER TABLE homeowners ADD COLUMN tier_renews_at  timestamp with time zone;
ALTER TABLE homeowners ADD COLUMN tier_cancels_at timestamp with time zone;

-- (later phases — unchanged from original spec, with the user_id/property_id
--  renames documented above)
-- ALTER TABLE properties ADD COLUMN current_health_score integer;
-- ALTER TABLE properties ADD COLUMN health_score_updated_at timestamptz;
-- ALTER TABLE home_iq_items ADD COLUMN warranty_expires_at date;
-- ALTER TABLE home_iq_items ADD COLUMN warranty_terms_url text;
-- ALTER TABLE home_iq_items ADD COLUMN purchase_proof_url text;
```

### homeowner_properties (NEW — Phase 1)
```sql
id                        uuid PK
homeowner_id              uuid FK → homeowners ON DELETE CASCADE
is_primary                boolean NOT NULL DEFAULT true   -- enforces "one primary" via partial unique idx
nickname                  text                            -- "main house", "vacation home"
address                   text
city                      text
state                     text
zip_code                  text
property_type             text NOT NULL DEFAULT 'single_family'
                                                          -- 'single_family' | 'condo' | 'townhouse' | 'multi_family' | 'other'
bedrooms                  integer
bathrooms                 numeric(3,1)
sqft                      integer
details                   jsonb                           -- mirrors PropertyDetails shape on homeowners.home_details
created_at                timestamp with time zone NOT NULL DEFAULT now()
updated_at                timestamp with time zone NOT NULL DEFAULT now()
```
Indexes:
- `homeowner_properties_homeowner_idx` ON `(homeowner_id)`
- `homeowner_properties_homeowner_primary_uniq` ON `(homeowner_id) WHERE is_primary = true` (partial unique — one primary per homeowner)

The migration **backfills** one row per existing homeowner that has any property data on the row (`home_address`, `home_city`, `home_bedrooms`, `home_bathrooms`, `home_sqft`, or `home_details` non-null), with `is_primary = true`. Existing fields on `homeowners` are left in place so legacy read paths keep working — a later contract-phase migration drops them.

### memberships
```sql
id                        uuid PK
user_id                   uuid FK → users
tier                      enum('free','plus','premier')
status                    enum('active','past_due','cancelled','paused')
stripe_subscription_id    varchar(255)
stripe_price_id           varchar(255)
billing_cycle             enum('monthly','annual')
amount_cents              integer
started_at                timestamptz
current_period_starts_at  timestamptz
current_period_ends_at    timestamptz
cancelled_at              timestamptz
cancellation_reason       text
created_at                timestamptz
updated_at                timestamptz
```

### home_health_scores
```sql
id                        uuid PK
property_id               uuid FK → properties
period_month              date  -- first day of month
score                     integer  -- 0-100
score_band                enum('excellent','good','needs_work','concerning')
delta_from_prev_month     integer
neighborhood_percentile   integer  -- 0-100, nullable
estimated_resale_impact   integer  -- cents, nullable
created_at                timestamptz
```
Indexes: `(property_id, period_month) UNIQUE`, `(property_id, period_month DESC)`

### home_health_score_factors
```sql
id                        uuid PK
score_id                  uuid FK → home_health_scores
factor_type               enum('maintenance_compliance','item_health','asset_health','inspection_recency','warranty_coverage')
factor_score              integer  -- 0-100
factor_weight             numeric(3,2)
contribution              numeric(5,2)  -- factor_score * factor_weight
notes                     text
```

### recurring_vendors
```sql
id                        uuid PK
homeowner_property_id     uuid FK → homeowner_properties ON DELETE CASCADE
homeowner_id              uuid FK → homeowners            ON DELETE CASCADE
vendor_name               text NOT NULL
vendor_phone              text
vendor_email              text
service_category          text NOT NULL  -- 'cleaning' | 'landscaping' | 'pool' | 'pest_control' | 'hvac' | 'window_cleaning' | 'trash_valet' | 'handyman' | 'other'
vendor_type               text NOT NULL  -- 'byo' | 'network'
network_provider_id       uuid FK → providers ON DELETE SET NULL  -- nullable; only set when vendor_type='network'
schedule_pattern          text NOT NULL  -- 'weekly' | 'biweekly_even' | 'biweekly_odd' | 'monthly_date' | 'monthly_nth_day' | 'quarterly' | 'custom'
schedule_day_of_week      integer        -- 0-6, nullable
schedule_day_of_month     integer        -- 1-31, nullable
schedule_nth_weekday      text           -- "first_tuesday", nullable
schedule_time             time
schedule_custom_dates     date[]         -- for custom pattern
amount_cents              integer NOT NULL
payment_method            text NOT NULL  -- 'card' | 'ach' | 'homie_credit'
payment_method_id         text
auto_pay_rule             text NOT NULL  -- 'always' | 'if_under_threshold' | 'manual_approval'
auto_pay_threshold_cents  integer        -- nullable
status                    text NOT NULL DEFAULT 'pending_vendor_confirmation'
                                         -- 'pending_vendor_confirmation' | 'active' | 'paused' | 'travel_hold' | 'cancelled'
travel_hold_starts_at     date           -- nullable
travel_hold_ends_at       date           -- nullable
vendor_confirmed_at       timestamp with time zone  -- nullable
total_paid_ytd_cents      integer NOT NULL DEFAULT 0
created_at                timestamp with time zone NOT NULL DEFAULT now()
updated_at                timestamp with time zone NOT NULL DEFAULT now()
```
Indexes:
- `recurring_vendors_property_status_idx` ON `(homeowner_property_id, status)`
- `recurring_vendors_homeowner_idx` ON `(homeowner_id)`
- `recurring_vendors_network_provider_idx` ON `(network_provider_id)`

### vendor_visits
```sql
id                        uuid PK
recurring_vendor_id       uuid FK → recurring_vendors ON DELETE CASCADE
scheduled_at              timestamp with time zone NOT NULL
status                    text NOT NULL DEFAULT 'scheduled'
                                         -- 'scheduled' | 'confirmation_sent' | 'confirmed' | 'completed' | 'skipped' | 'missed' | 'disputed'
confirmation_sent_at      timestamp with time zone
confirmed_at              timestamp with time zone
completed_at              timestamp with time zone
completion_photo_url      text
completion_notes          text
amount_charged_cents      integer
tip_cents                 integer NOT NULL DEFAULT 0
payment_id                uuid FK → vendor_payments ON DELETE SET NULL  -- nullable
skip_reason               text   -- nullable
created_at                timestamp with time zone NOT NULL DEFAULT now()
updated_at                timestamp with time zone NOT NULL DEFAULT now()
```
Indexes:
- `vendor_visits_vendor_scheduled_idx` ON `(recurring_vendor_id, scheduled_at DESC)`
- `vendor_visits_status_scheduled_idx` ON `(status, scheduled_at)`

### vendor_payments
```sql
id                        uuid PK
vendor_visit_id           uuid FK → vendor_visits     ON DELETE SET NULL  -- nullable; visits can be deleted, payments stay for accounting
recurring_vendor_id       uuid FK → recurring_vendors ON DELETE CASCADE
amount_cents              integer NOT NULL
processing_fee_cents      integer NOT NULL DEFAULT 0
homie_take_cents          integer NOT NULL DEFAULT 0     -- our cut
net_to_vendor_cents       integer NOT NULL
payment_method            text NOT NULL                  -- 'card' | 'ach' | 'homie_credit'
stripe_payment_intent_id  text                            -- charge from member; populated in Session 3
stripe_transfer_id        text                            -- transfer to vendor's connect account; populated in Session 3
status                    text NOT NULL DEFAULT 'pending'
                                                         -- 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded'
failure_reason            text
processed_at              timestamp with time zone
created_at                timestamp with time zone NOT NULL DEFAULT now()
```
Indexes:
- `vendor_payments_visit_idx` ON `(vendor_visit_id)`
- `vendor_payments_vendor_idx` ON `(recurring_vendor_id)`
- `vendor_payments_status_idx` ON `(status)`

### walkthroughs
```sql
id                        uuid PK
property_id               uuid FK → properties
season                    enum('spring','summer','fall','winter')
year                      integer
status                    enum('available','in_progress','submitted','parsed','reviewed')
photos_uploaded           integer DEFAULT 0
items_found               integer DEFAULT 0
score_boost               integer DEFAULT 0
started_at                timestamptz
submitted_at              timestamptz
parsed_at                 timestamptz
created_at                timestamptz
```

### walkthrough_items
```sql
id                        uuid PK
walkthrough_id            uuid FK → walkthroughs
title                     varchar(255)
description               text
category                  enum  -- same as inspection categories
severity                  enum('safety_hazard','urgent','recommended','monitor','informational')
location                  varchar(255)
ai_cost_estimate_low_cents integer
ai_cost_estimate_high_cents integer
ai_confidence             numeric(3,2)
photo_url                 text
dispatch_status           enum('not_dispatched','dispatched','quoted','booked','completed')
dispatch_id               uuid FK → dispatches, nullable
created_at                timestamptz
```

### warranty_claims
```sql
id                        uuid PK
user_id                   uuid FK → users
home_iq_item_id           uuid FK → home_iq_items
claim_type                enum('manufacturer_warranty','recall','class_action','extended_warranty')
claim_source              enum('cpsc','manufacturer','class_action','member_initiated')
description               text
estimated_reimbursement_cents integer
filed_at                  timestamptz
filing_method             enum('automated','member_assisted','manual')
external_claim_id         varchar(255)
status                    enum('filed','in_review','approved','denied','paid','expired')
status_updated_at         timestamptz
amount_received_cents     integer  -- nullable
notes                     text
created_at                timestamptz
```

### auto_care_plans
```sql
id                        uuid PK
property_id               uuid FK → properties
template_key              varchar(100)  -- "sfh_with_pool" etc
status                    enum('active','paused','cancelled')
created_recurring_vendor_ids uuid[]
created_at                timestamptz
```

### tune_up_appointments
```sql
id                        uuid PK
property_id               uuid FK → properties
inspector_partner_id      uuid FK → inspector_partners
scheduled_for             date
status                    enum('scheduled','confirmed','completed','cancelled','rescheduled')
inspection_report_id      uuid FK → inspection_reports, nullable  -- created on completion
inspector_payout_cents    integer
created_at                timestamptz
```

### concierge_threads (Premier only)
```sql
id                        uuid PK
user_id                   uuid FK → users
status                    enum('open','waiting_member','waiting_homie','resolved','escalated')
priority                  enum('normal','high','urgent')
opened_at                 timestamptz
last_member_message_at    timestamptz
last_homie_message_at     timestamptz
sla_response_due_at       timestamptz
assigned_ops_user_id      uuid FK → users, nullable
resolved_at               timestamptz
created_at                timestamptz
```

---

## API Endpoints

New endpoints (mounted under `/api/membership/`):

### Subscription
- `POST /subscriptions/upgrade` — upgrade tier (creates Stripe subscription)
- `POST /subscriptions/downgrade` — downgrade tier (effective at period end)
- `POST /subscriptions/cancel` — cancel subscription (effective at period end)
- `POST /subscriptions/reactivate` — undo cancellation before period end
- `GET /subscriptions/current` — get current tier, billing info

### Health Score
- `GET /health-score/current` — latest score for member's property
- `GET /health-score/history?months=12` — score over time
- `GET /health-score/factors` — current breakdown of contributing factors
- `GET /health-score/boosters` — top open items by score impact
- `GET /health-score/neighborhood?zip=92107` — anonymized comparison data

### Recurring Vendors
- `GET /vendors` — list active recurring vendors
- `POST /vendors` — create new (sends vendor SMS confirmation)
- `PATCH /vendors/:id` — update vendor (schedule, amount, payment method)
- `DELETE /vendors/:id` — cancel relationship
- `POST /vendors/:id/skip-visit` — skip next or specific visit
- `POST /vendors/:id/travel-hold` — pause for date range
- `POST /vendors/:id/resume` — resume from pause
- `GET /vendors/:id/visits` — visit history
- `POST /vendors/visits/:id/approve-payment` — manual approval flow

### Walkthroughs
- `GET /walkthroughs` — list walkthroughs (current + past)
- `POST /walkthroughs/start` — start a new walkthrough
- `POST /walkthroughs/:id/photos` — upload photo
- `POST /walkthroughs/:id/submit` — finalize for AI parsing
- `GET /walkthroughs/:id/items` — items found

### Warranty
- `GET /warranties` — list active warranties from Home IQ
- `GET /warranty-claims` — list filed claims
- `POST /warranty-claims/file` — file a new claim (auto-fills from Home IQ)
- `GET /warranty-claims/:id/status` — current status

### Tune-Up (Premier only)
- `GET /tune-up/next` — next scheduled appointment
- `POST /tune-up/schedule` — schedule annual Tune-Up
- `POST /tune-up/reschedule` — change date

### Concierge (Premier only)
- `POST /concierge/threads` — open a new escalation thread
- `GET /concierge/threads` — list member's threads
- `POST /concierge/threads/:id/messages` — send message

---

## Frontend Integration Points

### Member Dashboard

New top-level page at `/dashboard`. Plus and Premier members are redirected here on login. See `homie_member_dashboard_health_score` mockup.

Sections:
1. Header with tier badge
2. Property banner
3. Health Score hero (with trend bar, neighborhood comparison)
4. Stat strip (resale impact, active warranties)
5. Active alerts (warranty claim filed, recall detected)
6. Next Tune-Up card (Premier only)
7. Seasonal walkthrough prompt
8. "Boost your score" open items
9. Recent activity feed

### Recurring Vendors page

New page at `/vendors`. Free, Plus, and Premier all access — limited by tier. See `homie_recurring_vendors_hub` mockup.

### Tab navigation (member-only)

Plus and Premier members get a bottom nav (mobile) or left rail (desktop):
- Home (dashboard)
- Vendors (your team)
- Chat (existing AI agent)
- Activity (history of dispatches, vendor visits, claims)
- Profile

Free users keep the existing chat-led experience plus a single "Vendors" link in the menu.

### Locked-state components

A `<TierGate requiredTier="plus">` component that:
- Renders the feature normally if member is on the right tier
- Renders a locked state with upgrade CTA if not
- Tracks "tier-blocked impressions" for conversion analytics

Used everywhere a feature requires a paid tier. Single source of truth for upgrade prompts.

### Existing pages (changes)

- **Chat / AI agent** — no UI changes, but rate-limit middleware on Free
- **Dispatch flow** — small "members get 3 free/month" hint for Free users; "1 of 3 used this month" for Plus
- **Home IQ** — appliance limit (10) hint on Free; "Unlimited with Plus" upgrade prompt
- **Inspect bundle** — show 25% member discount on the pricing page

---

## Vendor Payment Rails

### Stripe architecture

- **Members** are Stripe customers with payment methods on file
- **Vendors** are Stripe Connect accounts (Express type — minimal vendor onboarding)
- **Homie** is the platform; takes a small fee on vendor payments

### Money flow

```
Member's card/bank
  → Charged for visit amount + processing fee
    → Homie's Stripe balance
      → Transfer to vendor's Connect account (minus Homie fee)
        → Vendor's bank (next-day ACH)
```

### Fee structure

| Method | Member pays | Vendor receives | Homie keeps |
|---|---|---|---|
| ACH (bank) | Visit amount + 0.5% | Visit amount × 99% | 1.5% |
| Card | Visit amount + 2.9% + $0.30 | Visit amount × 98% | 2% (after Stripe takes the rest) |
| Premier (vendor pays nothing) | Visit amount × 100% | Visit amount × 99% | 1% absorbed by subscription |

Free tier members pay processing fees themselves. Plus tier processing fees absorbed by Homie up to threshold. Premier tier all processing absorbed.

### Vendor onboarding via SMS

When a member adds a BYO vendor, system creates a Stripe Connect Express account placeholder and sends the vendor an SMS with a token URL. Vendor lands on a page that:
1. Confirms their identity (name, phone match)
2. Captures payment details (bank account)
3. Accepts Stripe's Connect terms
4. Activates the account

Once active, payments flow automatically. Vendor never installs an app.

---

## Notifications

### Member notifications

| Event | Channel | Notes |
|---|---|---|
| Score increased >2 points | Push | Celebrate the change |
| Score decreased >3 points | Push + email | Note the cause and how to recover |
| Vendor confirmed visit | Push | Quick read-only update |
| Vendor visit completed | Push | "Maria's Cleaning finished. $180 charged." |
| Vendor missed visit | Push + email | Suggest reschedule |
| Recall detected for your appliance | Push + email | Highlight the dollar value |
| Warranty claim filed | Email | Confirmation with claim ID |
| Warranty claim approved | Email | Reimbursement details |
| Seasonal walkthrough available | Push + email | Once per quarter, day-of |
| Tune-Up scheduled | Email | Calendar invite attached (Premier) |
| Tune-Up report ready | Email | Score updated, items in app |
| Subscription renewing | Email | 7 days before renewal |
| Payment failed | Push + email | Grace period, update card prompt |

### Vendor notifications (BYO)

| Event | Channel | Notes |
|---|---|---|
| Initial signup invitation | SMS | One-time link to complete setup |
| Visit confirmation request | SMS | 24h before scheduled visit |
| Visit completion prompt | SMS | After expected end time |
| Payment processed | SMS | Amount and ETA to bank |
| Travel hold / cancellation | SMS | If applicable |

---

## Edge Cases

### Subscription
- **Payment fails** — 3-day grace period, retry, downgrade to Free if all retries fail. Recurring vendor schedules continue (vendor relationships are sticky), but the member loses Health Score, walkthroughs, etc.
- **Mid-cycle upgrade** — proration via Stripe; new features immediately available
- **Mid-cycle downgrade** — effective at period end; member keeps current features until then
- **Cancellation** — recurring vendors continue (until member explicitly cancels them); Health Score frozen at last value; warranty automation paused

### Recurring Vendors
- **BYO vendor doesn't confirm setup within 7 days** — auto-cancel, notify member, prompt to re-add or switch to network vendor
- **Vendor charges different amount than scheduled** — vendor inputs custom amount via SMS; member gets push to approve before payment
- **Vendor visits during travel hold** — record as visit, prompt member to approve payment (vendor performed work despite hold)
- **Recurring vendor flagged for low quality** (3+ missed visits, dispute, etc.) — auto-suggest network alternative; preserve relationship at member's choice
- **Member moves to a property without an existing vendor** — recurring vendor pauses; reactivate or migrate to new property in settings

### Health Score
- **New member, no data yet** — show "Establishing your score" placeholder until 30 days of data; estimate based on similar properties
- **Score drops dramatically due to data event** — surface explanation ("Annual Tune-Up overdue: -8 points")
- **Property change (new home)** — score resets; member can carry over Home IQ inventory but score history starts over

### Walkthroughs
- **Member starts but doesn't finish** — saved for 14 days; reminder push after 3 days; auto-discarded after 14
- **AI parser fails on photos** — fall back to manual review by Homie ops; member gets the result delayed by 24h
- **Photos contain unrelated content** — AI flags irrelevant photos; prompts member to retake

### Warranty
- **Multiple warranties on same item** — track all, show longest active
- **Manufacturer disputes claim** — escalate to human concierge (Premier) or notify member to provide additional documentation
- **Class-action settlement requires proof of purchase member doesn't have** — AI checks Home IQ first, then prompts member; offers to skip if unavailable

### Tune-Up
- **No inspector available in member's zip** — fall back to AI walkthrough version; refund pro-rated portion of subscription difference between Plus and Premier
- **Inspector cancels day-of** — auto-rebook with backup; notify member
- **Member misses appointment** — one free reschedule; second reschedule charged $50

---

## Build Phases

Sequenced to ship value early and de-risk the larger spec.

### Phase 0 — Foundations (1-2 weeks)
- Stripe subscription integration (test mode)
- `membership_tier` field on users
- `requireTier(min)` middleware
- `<TierGate>` component
- Subscription upgrade/downgrade flows
- Billing settings page

### Phase 1 — Recurring Vendors (3-4 weeks)
The wedge feature. Free tier acquisition driver. Ships before any paid tier.
- Database schema (recurring_vendors, vendor_visits, vendor_payments)
- BYO vendor onboarding flow (homeowner adds, vendor confirms via SMS)
- Stripe Connect Express setup for vendors
- Schedule engine (visit generation background job)
- AI confirmation flow (24h before)
- Auto-pay logic (configurable per vendor)
- "Your team" UI page
- Travel hold + skip/reschedule
- Year-end tax export

### Phase 2 — Member Dashboard scaffold (1-2 weeks)
- Tier-based routing
- Plus/Premier home screen layout
- Aggregation queries (latest score, active vendors, recent activity)
- Empty states for sections without data yet

### Phase 3 — Health Score (2-3 weeks)
- Score algorithm (background job)
- Score history table
- Score breakdown UI (factors, contributors)
- Score boosters (top open items integrated with dispatch flow)
- Neighborhood comparison (zip-level aggregation)
- Trend bar visualization

### Phase 4 — Warranty Automation (2 weeks)
- Recall data ingestion (CPSC API, manufacturer feeds)
- Match logic against Home IQ inventory
- Auto-claim filing service
- Notifications integration

### Phase 5 — Seasonal Walkthroughs (1-2 weeks)
- Photo capture wizard
- Photos → S3 pipeline
- AI parser (reuse Inspect parser with new prompt)
- Item integration with Health Score and dispatch
- Notification cadence (per season)

### Phase 6 — Annual Tune-Up (2 weeks)
- Integration with Inspect partner network
- Member scheduling flow
- Tune-Up appointment management
- Tune-Up report → Health Score boost
- Co-branded emails

### Phase 7 — Auto-Care Plans (1-2 weeks)
- Pre-built templates per home type
- One-tap subscribe flow
- Recurring vendor matching
- Score booster → recurring conversion path

### Phase 8 — Human Concierge (Premier launch) (3-4 weeks)
- Concierge inbox UI (member-side)
- Internal ops dashboard
- AI escalation routing
- SLA tracking
- Internal notes and handoffs

**Total estimated timeline: 16-22 weeks for full Membership launch.**

Free tier with Recurring Vendors is shippable in ~5-6 weeks (Phase 0 + Phase 1). Paid tiers can launch in ~10-12 weeks (through Phase 4). Premier in ~16-22 weeks.

---

## Mock Data

### Demo Member: David Thompson
```
Email:           david.thompson@email.com
Tier:            Plus
Property:        1247 Sunset Cliffs Blvd, San Diego, CA 92107
Property type:   Single-family home (no pool)
Joined:          February 2026
Health Score:    78 (band: good)
Current trend:   +3 this month
```

### Demo Recurring Vendors for David
```
1. Maria's Cleaning Co.       BYO       Biweekly Wednesdays  10am  $180
2. Coastal Greens Landscaping Network   Weekly Tuesdays      9am   $95
3. Oceanside Pool Service     BYO       Weekly Fridays       9am   $115 (currently travel-held)
4. PestRid SD                 Network   Monthly 1st          10am  $75
```

### Demo Health Score factors (David, May 2026)
```
Maintenance Compliance:  88 × 0.35 = 30.8
Item Health:             72 × 0.25 = 18.0
Asset Health:            70 × 0.20 = 14.0
Inspection Recency:      85 × 0.10 = 8.5
Warranty Coverage:       68 × 0.10 = 6.8
                                    ----
Composite Score:                    78
```

### Demo Warranty Claim
```
Item:           KitchenAid Dishwasher (S/N KDPM704KPS)
Claim type:     Recall (CPSC #25-742)
Filed:          May 1, 2026
Method:         Automated
Est. payout:    $245
Status:         In review
```

### Demo Open Score Boosters
```
1. Roof flashing near chimney         Roofing       Urgent       +5 pts
2. Water heater approaching EOL       Plumbing      Recommended  +4 pts
3. Replace HVAC filter                HVAC          Recommended  +2 pts
```

---

## Key Principles for Building Homie Membership

1. **Free is the wedge, not a loss leader.** The Recurring Vendors feature must be excellent on Free. That's how Homie wins acquisition against Casa, which has no free tier. The Free tier's job is to capture inventory data and create switching cost — Plus upgrade follows naturally.

2. **Membership is a layer, not a separate product.** All new code is additive. Existing chat, dispatch, Home IQ, and Inspect features keep working. The integration architecture matters more than any single feature.

3. **AI handles 90% of concierge load.** This is the structural cost advantage over Casa. Human concierge exists at Premier as escalation, not default. Anywhere a human-led process can be replaced with AI orchestration, do it.

4. **The Health Score is the dopamine.** It's what makes Plus retention work. It must be visible, current, financially meaningful (resale impact), and actionable (score boosters tied to dispatch). Don't hide it behind clicks.

5. **Recurring Vendors is the moat.** Once 4 vendors are paid through Homie, switching costs prevent churn. Treat this as critical infrastructure — payment reliability matters more than feature breadth.

6. **Inspect is the funnel.** Every Inspect customer who buys a home becomes a Membership prospect at closing. Surface the upgrade in the Inspect summary email. Conversion economics: a $149 Inspect bundle followed by 12 months of $29 Plus is a $497 LTV from a single inspection report.

7. **Warranty automation is hidden value that pays out.** It's quiet most months and massively impactful when it triggers. Build the recall/class-action ingestion pipeline early — it compounds in value as the member base grows.

8. **The annual Tune-Up justifies Premier.** Without it, Premier is "Plus + a person." With it, Premier is a tangible product. Lock the inspector partner economics early — wholesale rates, predictable volume, referral commissions.

9. **Tier gating must be cleanly enforced.** A single `requireTier` middleware and `<TierGate>` component. Don't scatter tier logic across the codebase — it'll calcify and become impossible to refactor when tiers change.

10. **Fraunces for big numbers, DM Sans for everything else. Orange for actions, green for earnings/success.** Consistent across Membership, Inspect, Business, Consumer. The brand system is one of Homie's strongest assets — defend it.

---

*Good looking out, Homie.*

CLAUDE-MEMBERSHIP — v1.0 — May 2026
