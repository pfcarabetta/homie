import { pgTable, uuid, varchar, text, timestamp, boolean, integer, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

export const guestReporterSettings = pgTable(
  'guest_reporter_settings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .unique()
      .references(() => workspaces.id),
    isEnabled: boolean('is_enabled').default(false),
    whitelabelLogoUrl: varchar('whitelabel_logo_url', { length: 500 }),
    whitelabelCompanyName: varchar('whitelabel_company_name', { length: 255 }),
    showPoweredByHomie: boolean('show_powered_by_homie').default(true),
    defaultLanguage: varchar('default_language', { length: 5 }).default('en'),
    supportedLanguages: jsonb('supported_languages').$type<string[]>().default(['en']),
    slaUrgentMinutes: integer('sla_urgent_minutes').default(30),
    slaHighMinutes: integer('sla_high_minutes').default(60),
    slaMediumMinutes: integer('sla_medium_minutes').default(120),
    slaLowMinutes: integer('sla_low_minutes').default(240),
    requirePmApproval: boolean('require_pm_approval').default(true),
    supportEmail: text('support_email'),
    supportPhone: text('support_phone'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('guest_reporter_settings_workspace_id_idx').on(table.workspaceId),
  ],
);

export type GuestReporterSettings = typeof guestReporterSettings.$inferSelect;
export type NewGuestReporterSettings = typeof guestReporterSettings.$inferInsert;
