# Membership Phase 1 — Discovery Report

> **Session:** Phase 1, Session 1A — Discovery pass
> **Date:** 2026-05-06
> **Spec:** `CLAUDE-MEMBERSHIP.md` (root)
> **Sibling specs:** `CLAUDE.md`, `CLAUDE-INSPECT.md`
> **Output:** This document. No production code written.

This is a survey of what exists in the codebase as of today, mapped against the assumptions in `CLAUDE-MEMBERSHIP.md`. The goal is to surface conflicts, missing infrastructure, and conventions so the Phase 1 schema work in Session 1B builds on the right foundation.

The headline takeaway, before the ten sections: **the spec assumes a `users` table and a consumer-side `properties` table. Neither exists in those forms.** The consumer auth/account table is `homeowners` and consumer property data is embedded directly on the `homeowners` row. There is a `properties` table, but it belongs to B2B workspaces and is not a fit for the consumer membership product. This single architectural mismatch propagates into every table the spec defines and must be resolved before schema work begins. See **Recommendations** at the bottom.

---

## 1. Database & ORM

**Engine:** PostgreSQL.

**ORM:** Drizzle ORM `0.41.0` with Drizzle Kit `0.30.0` for migrations. The connection lives in `packages/api/src/db/index.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
const client = postgres(process.env.DATABASE_URL, { max: 10 });
export const db = drizzle(client, { schema });
```

**Schema location:** `packages/api/src/db/schema/` — one file per table, all re-exported from `schema/index.ts`. Drizzle `pgTable` definitions, with strong type inference (`typeof table.$inferSelect`, `$inferInsert`).

**Migration tool:** `drizzle-kit` via `npm run db:generate` (generates from schema diffs), `db:migrate` (applies), `db:check`, `db:studio`. Config in `packages/api/drizzle.config.ts`. Migrations live at `packages/api/src/db/migrations/` — 50 files numbered `NNNN_funky_name.sql` (e.g. `0046_inspection_report_referrer.sql`). The `meta/` subdirectory holds Drizzle's snapshot state for diffing.

**Migration naming convention:** Drizzle Kit auto-generates names like `0046_inspection_report_referrer.sql` — `NNNN` zero-padded sequence + a topic-or-random slug. Several manually-renamed files in the history (e.g. `0018_pricing_config.sql` next to `0018_icy_cloak.sql` — looks like a manual rename to make intent clear). Either pattern is acceptable per this codebase; topic-named is clearer for non-trivial features.

**Existing schemas relevant to Membership:**

- `homeowners` — consumer auth/account (acts as the "users" table for consumer side)
- `workspaces`, `workspace_members` — B2B accounts
- `properties` — B2B property records, **workspace-scoped, not homeowner-scoped**
- `providers` — service-provider directory (used by both consumer dispatch and B2B)
- `inspector_partners` (in `schema/inspector.ts`) — inspector accounts
- `dispatch_schedules`, `dispatch_schedule_runs` — recurring B2B service schedules (see Section 10)

A current `homeowners` table excerpt:

```ts
export const homeowners = pgTable('homeowners', {
  id: uuid('id').primaryKey().defaultRandom(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  phone: text('phone'),
  zipCode: text('zip_code').notNull(),
  membershipTier: text('membership_tier').notNull().default('free'),  // ← already exists
  stripeCustomerId: text('stripe_customer_id'),                        // ← already exists
  homeAddress: text('home_address'),    // consumer property data on the row
  homeCity: text('home_city'),
  homeBedrooms: integer('home_bedrooms'),
  // ... and so on
  homeDetails: jsonb('home_details').$type<PropertyDetails>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Note `membershipTier` and `stripeCustomerId` are **already present** as text columns. Spec calls for adding them as enum and varchar respectively.

---

## 2. Auth & Users

**Authentication mechanism:** JWT bearer tokens (HS256, 7-day expiry). No sessions, no magic-link primary flow (though magic-link claim flow exists for Inspect). Login + register flows live in `packages/api/src/routes/auth.ts` and use `bcryptjs` for password hashing (12 rounds).

**Multi-product user model — there is no single `users` table.** Each product line has its own auth-bearing entity:

| Surface | Table | Middleware | Set on req |
|---|---|---|---|
| Consumer | `homeowners` | `requireAuth` / `optionalAuth` (`middleware/auth.ts`) | `req.homeownerId` |
| B2B | `workspace_members` | `requireWorkspace` (`middleware/workspace-auth.ts`) | `req.workspaceId` |
| Inspector | `inspector_partners` | `requireInspector` (`middleware/inspector-auth.ts`) | `req.inspectorId` |
| Provider | `providers` | `requireProviderAuth` (`middleware/provider-auth.ts`) | `req.providerId` |
| Admin | (homeowners with admin flag) | `middleware/admin.ts` | `req.adminId` |

Consumer auth example from `middleware/auth.ts`:

```ts
declare global {
  namespace Express {
    interface Request {
      homeownerId: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ data: null, error: '...', meta: {} });
    return;
  }
  const payload = jwt.verify(header.slice(7), secret, { algorithms: ['HS256'] }) as JwtPayload;
  req.homeownerId = payload.sub;
  next();
}
```

`requireAuth` is mounted per-router in `app.ts`:

```ts
app.use('/api/v1/account', apiLimiter, requireAuth, accountRouter);
app.use('/api/v1/payments', apiLimiter, requireAuth, paymentsRouter);
```

For Membership, since the product is consumer-side, `requireAuth` + `req.homeownerId` is the integration point. **There is no single "user_id" foreign key concept that spans products.**

---

## 3. Payment infrastructure

**Stripe is heavily integrated.** `packages/api/src/services/stripe.ts` holds shared helpers; payment-creating routes call into it. SDK version: `stripe@20.4.1`, API version pinned to `'2025-01-27.acacia'`.

**Existing capability:**

- `getOrCreateCustomer(homeownerId, email)` — creates and persists the Stripe customer ID on `homeowners.stripeCustomerId`
- `createCheckoutSession(...)` — one-shot consumer quote checkout
- `constructWebhookEvent(rawBody, sig)` — Stripe signature verification
- Canonical metadata schema (`HomieProduct = 'homie_quote' | 'inspect_report' | 'inspector_upload' | 'workspace_subscription'`) tagged on every Stripe object so the admin revenue dashboard can slice cleanly. **`workspace_subscription` already exists**, meaning a Stripe Subscription product/path is wired for B2B today; the consumer Membership subscription will need its own canonical product slug (e.g. `'homeowner_membership'`).

**Webhook handler:** `routes/stripe-webhook.ts` mounted with `express.raw({ type: 'application/json' })` (required for signature verification). Currently handles:

- `checkout.session.completed` for consumer quote dispatches (creates job, dispatches outreach)
- `checkout.session.completed` for B2B workspace subscription activation (sets `stripeSubscriptionId`, flips trial → active)
- `checkout.session.completed` for inspector wholesale uploads (kicks off the parser)

The pattern is: read `session.metadata.product`, route to the right handler. Adding membership subscription handling will follow the same pattern.

**Stripe Connect — NOT YET USED.** Searched `services/stripe.ts` and the route handlers; no `Stripe.accounts.create`, no `transfers.create`, no `accountLinks` calls anywhere. This is the single biggest piece of payment infrastructure Phase 1 will need to add. The spec's vendor payment rails (member's card → Homie's balance → transfer to vendor's Connect Express account) are entirely greenfield work. Estimate this at a full session of its own (Session 2).

**Stripe customer field:** `homeowners.stripeCustomerId` is `text` (not varchar(255) per spec). Functionally equivalent in Postgres but worth noting.

---

## 4. Notifications

**Email service:** SendGrid. `@sendgrid/mail@8.1.6`. Wrapper at `services/notifications.ts:sendEmail(to, subject, htmlOrText, options?)`. Configured via `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL`. Silently no-ops with a warning if not configured (good for local dev).

**SMS service:** Twilio. `twilio@5.13.0`. Wrapper at `services/notifications.ts:sendSms(to, body)` with E.164 normalization built in. Configured via `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`. Same silent-skip pattern.

**Both are already wired** — Phase 1 vendor SMS confirmations (the "Vendor taps the link, lands on a token-based page" flow in the spec) can call `sendSms` directly without new service work. The bottleneck is **template management**: there's no template/i18n system. Templates are inlined in the call sites. Examples: `services/email-verify.ts`, `services/quote-notifications.ts`, `services/inspection-reminder-worker.ts`. This is fine for Phase 1; a template service could be added later if it becomes worth it.

**Feed-style notifications:** Separate `notifications` table (`schema/notifications.ts`) for in-app notification feed (push-style). `services/notification-feed.ts` writes to it. Independent of email/SMS — those are channels, this is the in-app inbox.

---

## 5. Background jobs / scheduling

**No formal queue (BullMQ, Sidekiq, Inngest, etc.).** Jobs run as in-process workers started during API boot.

**Two patterns in use:**

1. **`setInterval`-based workers** — most common. Each worker is a service file that exports a `start()` function called from `app.ts` on boot. Examples:
   - `services/job-expiry.ts` — closes stale dispatches
   - `services/ical-sync-worker.ts` — pulls iCal feeds
   - `services/outreach-expansion-worker.ts` — retries dispatches with widened radius
   - `services/sms-notes-timeout-worker.ts` — closes stale SMS conversations
   - `services/inspection-reminder-worker.ts` — sends inspection report reminders

2. **`node-cron` (`node-cron@4.2.1`)** — used for fixed-schedule recurring work. Currently only `services/reservation-sync.ts:407` uses it, with `cron.schedule('*/15 * * * *', ...)` for a 15-minute reservation refresh.

**Implication for Phase 1:** the schedule engine (background job that computes the next 30 days of vendor visits) and the `vendor_visits` confirmation worker (sends SMS 24h before) fit naturally into either pattern. `setInterval` is simpler and matches the dominant style; `node-cron` is slightly more honest for "run nightly at 3am" semantics. Recommend `node-cron` for the schedule engine since the spec implies a daily cadence ("Background job runs nightly, computes the next 30 days of expected visits"). Workers do **not** belong in Session 1B — they're Session 3+ work after Stripe Connect lands.

---

## 6. Data access patterns

**No repository or service-class abstraction.** Drizzle ORM is called directly inside route handlers and in the cross-cutting service files. The pattern is:

- **Routes** (`packages/api/src/routes/*.ts`) — Express routers with handler functions. Direct `db.select(...).from(...).where(...)` calls inline. ~200-3000 line files for major routers like `account.ts` (3000+ lines).
- **Services** (`packages/api/src/services/*.ts`) — cross-cutting business logic and async work. Things like `orchestration.ts` (provider outreach), `stripe.ts` (payment helpers), `home-iq.ts` (Home IQ generation), `cross-reference.ts` (cross-doc insights). Services also call `db` directly.

Example route handler from `routes/account.ts`:

```ts
router.get('/', async (req: Request, res: Response) => {
  try {
    const [homeowner] = await db
      .select({ id: homeowners.id, firstName: homeowners.firstName, /* ... */ })
      .from(homeowners)
      .where(eq(homeowners.id, req.homeownerId))
      .limit(1);
    // ... shape response, return
  } catch (err) {
    logger.error({ err }, '[GET /account]');
    res.status(500).json({ data: null, error: 'Failed to load account', meta: {} });
  }
});
```

**No DI container, no testability layer.** Tests work by importing the route module and calling it via `supertest`, with a real-but-isolated test DB (env in `__tests__/env.test.ts`).

**Implication for Phase 1B:** the Session 1B prompt asks for "repository / service files in `src/modules/membership/recurring-vendors/`" with named functions like `create`, `findById`, etc. **This pattern doesn't exist anywhere else in the codebase.** Two options:

- **Option A (matches spec):** introduce a `modules/membership/` namespace with repository-style files. This is a new convention; it works fine but is the only place in the codebase that uses it.
- **Option B (matches existing code):** put the data access functions in `services/recurring-vendors.ts` (or split per entity: `services/membership/recurring-vendors.ts`, etc.), called inline from routes. Matches everything else.

Either works, but **Option B is closer to the existing style and lower friction** for the rest of the team. Worth deciding before Session 1B writes the files.

---

## 7. API patterns

**HTTP framework:** Express `4.19.2` + TypeScript. Plain Express routers, no tRPC, no Fastify.

**Mounting pattern (`packages/api/src/app.ts`):**

```ts
app.use('/api/v1/account',  apiLimiter, requireAuth, accountRouter);
app.use('/api/v1/payments', apiLimiter, requireAuth, paymentsRouter);
app.use('/api/v1/business', apiLimiter, requireAuth, businessRouter);
app.use('/api/v1/business/:workspaceId/schedules', apiLimiter, requireAuth, scheduleRouter);
```

Rate limiting (`middleware/rate-limit.ts`) and auth middleware applied at the mount point, then the router holds the per-path handlers.

**Response envelope:** every successful or failed JSON response uses `{ data, error, meta }`. From `CLAUDE.md`:

> All API responses follow `{ data, error, meta }` format

The shape is enforced by manual construction (no helper). Type lives at `packages/api/src/types/api.ts:ApiResponse`.

**Validation:** manual type-narrowing inline. No zod, joi, yup, or class-validator. Pattern:

```ts
interface RegisterBody {
  email?: unknown;
  password?: unknown;
  // ...
}
const body = req.body as RegisterBody;
if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email)) {
  res.status(400).json({ data: null, error: 'Invalid email', meta: {} });
  return;
}
```

**Error handling:** local `try/catch` in each handler, log via pino (`logger.error({ err }, '[ROUTE_TAG]')`), return 500 with a generic message. No global error middleware.

**For Phase 1B:** the prompt explicitly says "do NOT create any API endpoints" so this only matters for context. When endpoints land in a later session, mirror the existing pattern.

---

## 8. Frontend patterns

**Stack confirmed:** React 18.3.1, Vite 5.2.11, TypeScript 5.9.3, Tailwind 3.4.3.

**Routing:** `react-router-dom@7.13.1`. Routes declared in `packages/web/src/App.tsx` as a flat list of `<Route path="..." element={...} />`. SEO meta via `react-helmet-async@3.0.0` (HelmetProvider in `main.tsx`).

```tsx
<Routes>
  <Route path="/" element={<HomePage />} />
  <Route path="/account" element={<Account />} />
  <Route path="/business" element={<BusinessPortal />} />
  <Route path="/inspect-portal" element={<InspectPortal />} />
  {/* ... */}
</Routes>
```

**State management:** **Pure React Context + `useState`.** No zustand, no Redux, no React Query, no Jotai. Three context providers in `packages/web/src/contexts/`:

- `AuthContext.tsx` — exposes `homeowner` (consumer auth state) + `login`/`logout`. Persists via localStorage.
- `InspectorAuthContext.tsx` — same pattern for inspectors.
- `ProviderAuthContext.tsx` — same pattern for providers.

Each context loads from localStorage on mount, then exposes the typed entity via `useAuth()` / `useInspectorAuth()` / `useProviderAuth()` hooks.

**Auth-protected pages:** there is **no `<ProtectedRoute>` component**. Each page handles its own redirect. Common pattern (`pages/homeowner-inspect/index.tsx`):

```tsx
const { homeowner } = useAuth();
useEffect(() => {
  if (!homeowner) { navigate('/login?redirect=/inspect-portal'); return; }
  fetchReports();
}, [homeowner, navigate]);
if (!homeowner) return null;
```

**Implication for the spec's `<TierGate>` component:** it'll be a fresh component with no existing analog. The plan-gate component used in B2B (`packages/web/src/pages/business/...`) is per-feature inline checks rather than a wrapping component. The `TierGate` work is post-Phase-1 anyway.

**Shared components:** `packages/web/src/components/`. Some by-product subdirs (`packages/web/src/pages/business/`, `packages/web/src/pages/homeowner-inspect/`).

---

## 9. Testing

**API:** **Jest 30** + ts-jest. Config at `packages/api/jest.config.js`:

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
};
```

Tests live in `__tests__/` subdirectories adjacent to source. Existing route tests:

- `routes/__tests__/auth.test.ts`
- `routes/__tests__/bookings.test.ts`
- `routes/__tests__/diagnostic.test.ts`
- `routes/__tests__/jobs.test.ts`
- `routes/__tests__/providers.test.ts`
- `routes/__tests__/webhooks.test.ts`

Pattern: integration tests with `supertest`, real Postgres test DB, env loaded from `src/__tests__/env.test.ts`. Some service-level unit tests in `services/__tests__/` (sparse).

**Web:** **Vitest 1.5.2**. Sparse tests in this codebase — most pages are not unit-tested. Acceptable for pure UI surfaces.

**Coverage approach:** integration-leaning. Route-level integration tests dominate. Pure unit tests exist where pure functions are nontrivial (e.g. computeSellerAction, schedule cadence math).

**Phase 1B test plan:** the prompt asks for unit tests on each repository/service function with happy path + 1+ error case. Given there's no prior repository/service unit-test pattern to match, **write them as plain function-level tests with a real test DB connection** (matching the supertest integration tests' DB plumbing). Don't introduce mock frameworks — they're not used elsewhere.

---

## 10. Existing recurring / scheduling code

**This is the most important section.** There is significant existing recurring-scheduling code that the spec doesn't mention — Phase 1's `recurring_vendors` + `vendor_visits` overlap conceptually with these tables and the build needs to either reuse, parallel, or refactor them.

### `dispatch_schedules` + `dispatch_schedule_runs` (B2B)

Defined in `schema/schedules.ts`. The B2B side already has recurring-service infrastructure for property managers:

```ts
export const dispatchSchedules = pgTable('dispatch_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
  templateId: uuid('template_id').references(() => scheduleTemplates.id),
  category: varchar('category', { length: 50 }).notNull(),
  cadenceType: text('cadence_type').notNull(),
  cadenceConfig: jsonb('cadence_config').$type<CadenceConfig>(),
  preferredProviderId: uuid('preferred_provider_id').references(() => providers.id),
  agreedRateCents: integer('agreed_rate_cents'),
  autoBook: boolean('auto_book').notNull().default(true),
  autoBookMaxCents: integer('auto_book_max_cents'),
  // ...
  status: text('status').notNull().default('active'),
  nextDispatchAt: timestamp('next_dispatch_at', { withTimezone: true }),
});

export const dispatchScheduleRuns = pgTable('dispatch_schedule_runs', {
  scheduleId: uuid('schedule_id').notNull().references(() => dispatchSchedules.id),
  jobId: uuid('job_id').references(() => jobs.id),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('pending'),
  // ...
});
```

This is **conceptually 80% identical** to the spec's `recurring_vendors` + `vendor_visits` (workspace vs homeowner; dispatch-schedule vs recurring-vendor; dispatch-run vs vendor-visit). Differences worth flagging:

| Aspect | B2B `dispatch_schedules` | Spec `recurring_vendors` |
|---|---|---|
| Owner | `workspace_id` | `user_id` (consumer) |
| Property | `property_id` (B2B properties) | `property_id` (consumer property — does not exist) |
| Vendor type | "preferred provider" only | BYO + network |
| Vendor confirmation flow | None (B2B PM owns it) | SMS confirmation roundtrip |
| Auto-book threshold | `autoBookMaxCents` | `auto_pay_threshold_cents` |
| Cadence | jsonb-blob `cadenceConfig` | typed enum + columns |
| Travel hold | (not modeled) | `travel_hold_starts_at`/`ends_at` |
| Skip semantics | Not first-class | `skip_reason` on visit |

**Decision required:** Do we (a) build new tables that mirror the spec, accepting some duplication with B2B, or (b) refactor `dispatch_schedules` to support both contexts via polymorphism (`owner_type` + `owner_id`)?

Recommendation: **(a) — build new tables.** Reasons: 1) the consumer flow has BYO vendors with SMS confirmation, which dispatchSchedules doesn't model and would balloon the table; 2) the pricing model differs (Connect transfers vs B2B direct); 3) refactoring dispatch_schedules during a B2B-stable period is high-risk for low gain. Document the parallel in Recommendations and revisit unifying after both products are stable.

### `schedule_templates`

Predefined recurring service templates by `category` + `cadenceConfig`. Used by B2B today; **could be reused for the spec's "Auto-Care Plans"** (Phase 7 in the build phases). Worth a callout in the Auto-Care Plans phase prep, not Phase 1.

### `inspection-reminder-worker`

`services/inspection-reminder-worker.ts` runs a `setInterval` to send reminder emails for parsed inspection reports. Pattern reusable for the Premier Annual Tune-Up reminders.

### `reservation-sync.ts`

`node-cron` schedule sync for B2B property reservations (iCal feeds → DB). Demonstrates the in-process cron pattern Phase 1's vendor schedule engine can mirror.

---

## Recommendations

### Before Session 1B can proceed, three architectural questions must be answered.

#### 1. The `users` ↔ `homeowners` mismatch

**The spec's schema repeatedly references a `users` table.** It does not exist. The consumer-side analog is `homeowners` (already containing `membership_tier` and `stripe_customer_id` columns).

**Required spec changes:**

```diff
- ALTER TABLE users ADD COLUMN membership_tier ...
- ALTER TABLE users ADD COLUMN stripe_customer_id ...
+ -- both already exist on homeowners as text columns; only the
+ -- following 4 columns need to be added:
+ ALTER TABLE homeowners ADD COLUMN stripe_subscription_id text;
+ ALTER TABLE homeowners ADD COLUMN tier_started_at timestamptz;
+ ALTER TABLE homeowners ADD COLUMN tier_renews_at  timestamptz;
+ ALTER TABLE homeowners ADD COLUMN tier_cancels_at timestamptz;
```

For all subsequent FKs:

```diff
- recurring_vendors.user_id  uuid FK → users
+ recurring_vendors.homeowner_id  uuid FK → homeowners
```

**Question for you:** confirm we use `homeowner_id` everywhere the spec says `user_id`, and update `CLAUDE-MEMBERSHIP.md` to match before Session 1B writes the migrations. (Or — alternative — introduce a `users` view over `homeowners`. I'd recommend against that. View-as-table compatibility creates more confusion than it removes.)

#### 2. The `properties` table is workspace-scoped, not consumer-scoped

**The spec's schema FKs to `properties` for `recurring_vendors`, `home_health_scores`, `walkthroughs`, etc.** But `properties` is workspace-scoped (`workspaceId NOT NULL FK → workspaces ON DELETE CASCADE`). It is not a fit for consumer membership data.

Consumer property data today lives **directly on the `homeowners` row** (`homeAddress`, `homeCity`, `homeBedrooms`, `homeBathrooms`, `homeSqft`, `homeDetails jsonb`).

**Three options:**

**A. Keep property data on the `homeowners` row.** FK Phase 1's tables to `homeowners.id` directly. Simple, matches today. Loses multi-property support (Premier's "second home at 50% off" perk needs multi-property).

**B. Introduce a new `homeowner_properties` table** (consumer-scoped) and migrate the property-data fields from `homeowners` to it. Cleaner long-term; supports multi-property natively. Larger migration, touches existing code that reads `homeAddress` etc.

**C. Make `properties.workspaceId` nullable and add a `properties.homeownerId` FK** — single `properties` table for both contexts. DRYest but introduces polymorphism that has to be carefully enforced everywhere.

**Recommendation: B.** The Premier multi-property pricing in the spec implies the long-term need for a separate consumer-property concept. Doing it as part of Phase 1 (small migration, touches ~20 call sites that read `homeowners.homeAddress`) is cheaper than rewriting later. **Spec needs to formalize this — the schema is silent on which option to pick.**

**Question for you:** confirm we go with option B and add a `homeowner_properties` table to the Phase 1 schema build, and that we'll backfill existing `homeowners.homeAddress` rows into it.

#### 3. Stripe Connect is greenfield

**No Stripe Connect integration exists.** Phase 1's vendor payment rails (Connect Express accounts for vendors, transfers from Homie's balance to vendor accounts) is entirely new infrastructure. This is its own session, expected to land in Session 2 per the original plan.

**Required additions before Session 3 (which would actually wire payments):**
- `services/stripe.ts` extension: account creation, account links, transfers, balance retrieval
- Webhook handlers: `account.updated`, `transfer.paid`, `payout.paid`, `payout.failed`
- A token-based "vendor confirms payment details" landing page (frontend route, no auth)

**For Session 1B (this next session), this is informational only** — the schema will reserve `stripe_payment_intent_id` and `stripe_transfer_id` columns on `vendor_payments`, but they'll sit empty until Session 2 wires payment processing.

### Other notes

#### Naming conventions to follow in Phase 1 schema migrations

- **Snake_case columns** (Drizzle's `text('first_name')` convention)
- **Singular table names? No — plural** (`homeowners`, `properties`, `dispatch_schedules`). Stick with plural.
- **Use `text` for short string columns**, not `varchar(N)`. The codebase uses `text` almost universally — it's a Postgres-specific habit. The spec's `varchar(255)` calls are non-binding; convert to `text` for consistency.
- **Use `text` for enum-like columns**, not Postgres native `ENUM` types. The codebase consistently uses `text` columns with allowed-value constants (e.g. `homeowners.membershipTier text NOT NULL DEFAULT 'free'`). Postgres native enums are a pain to evolve. Apply the same convention to the new tables: `vendor_type text NOT NULL` with values `'byo' | 'network'` enforced in app code (and optionally a CHECK constraint for safety).
- **Timestamps:** `timestamp with time zone` (which Drizzle generates for `timestamp(..., { withTimezone: true })`).
- **Money:** integer cents, never numeric. The codebase is consistent on this.
- **Indexes:** declared inline in the table definition's second-arg array, e.g. `(t) => [index('foo_idx').on(t.col)]`. Naming convention loose; prefer `<table_short>_<column>_idx`.
- **Foreign-key onDelete:** explicit per the spec. The existing codebase uses `onDelete: 'cascade'`, `'set null'`, and (rarely) restrict.

#### Module layout — repository vs service

The spec asks for `src/modules/membership/recurring-vendors/` with repository-style files. **No `modules/` directory exists today.** Two paths:

- **Adopt the new layout** in this PR. Document it in `CLAUDE.md`. Future Membership work follows.
- **Stick with `services/`.** Put data access in `services/membership-vendors.ts` (or split per entity). Matches existing code.

**Recommend the second** — fewer moving conventions, easier code review for the rest of the team. If you want a clean isolation boundary later, refactoring services into a module tree is mechanical.

**Question for you:** confirm we use `services/recurring-vendors.ts`, `services/vendor-visits.ts`, `services/vendor-payments.ts` (or one consolidated `services/membership-vendors.ts`) instead of the spec's `modules/membership/...` structure. If you prefer modules, that's fine — say so and the migration to that pattern is small, but we'll be the only product using it.

#### Phase 1 prompt 1B — items to revise after spec updates

- "Modify users table" → "Modify homeowners table; columns `membership_tier` and `stripe_customer_id` already exist as `text` (skip those); add the four `tier_*_at` columns and `stripe_subscription_id` only"
- "recurring_vendors.user_id → users.id" → "recurring_vendors.homeowner_id → homeowners.id"
- Decide on `properties` vs `homeowner_properties` and update FK destinations accordingly
- Confirm `varchar(N)` → `text` everywhere for column types

#### Things the spec assumes that aren't in place yet (not blocking 1B, but Session 2/3)

- Stripe Connect (entirely greenfield)
- A token-based vendor confirmation landing page (no anonymous + token route exists for this purpose; closest analog is the inspector's `/inspect/:token` flow)
- A UI route at `/dashboard` for the member dashboard (not present)
- `<TierGate>` component (not present; pattern doesn't yet exist on the frontend)
- A `requireTier(min)` middleware (not present; analog is `requirePlan` in `middleware/plan-gate.ts` for B2B — pattern is reusable)

#### Things the spec does *not* mention but probably should

- **There is significant pre-existing recurring-scheduling code** for B2B (`dispatch_schedules`, `dispatch_schedule_runs`, `schedule_templates`). The spec is silent on these. Phase 1 should explicitly call out the parallel and decide whether to unify later.
- **The `inspection_reminder_worker` pattern** is a clean template for the Premier Annual Tune-Up reminder mechanism (Phase 6).
- **The `notifications` table** + `services/notification-feed.ts` is the in-app feed — the spec's "Member notifications" table mentions push/email channels but not the in-app inbox path.
- **`req.homeownerId`** is the consumer auth identity. Spec uses `userId` — consistent rename, see #1.

---

## Summary for review

**What's solid:**
- Drizzle ORM setup is mature; migration tooling is strong; idiomatic
- Auth (consumer) is clean: JWT + middleware + `req.homeownerId`
- Stripe customer + checkout + webhook infra is robust; subscription path already exists for B2B
- SendGrid + Twilio wrappers exist and silently no-op when unconfigured
- B2B recurring-schedule code provides a working pattern to reference (not reuse)

**What's blocking Session 1B until the spec is reconciled:**
1. Table the spec calls `users` is actually `homeowners` (plus three other auth tables)
2. Table the spec calls `properties` for consumer-side use is workspace-scoped today
3. Decision needed: introduce `homeowner_properties` (recommended) or store on homeowner row

**What's required before Session 3 (payment processing):**
- Stripe Connect Express account creation
- Connect-related webhooks (account.updated, transfer.paid, etc.)
- Token-based vendor confirmation landing page

**What's nice to know but not blocking:**
- Convention: `text` over `varchar(N)`, `text` for enum-likes (no PG native enums), integer cents, snake_case, plural table names
- No formal job queue — `setInterval` workers + `node-cron` for scheduled work
- No repository pattern — Drizzle direct from routes/services
- React Context for state (no zustand, no React Query)
- React Router v7, manual auth-redirect pattern (no `<ProtectedRoute>`)

**Ready for your review.** Reply with decisions on the three architectural questions and any spec updates, and I'll proceed to Session 1B with the corrected schema.

---

*Phase 1, Session 1A — Discovery report — May 2026*
