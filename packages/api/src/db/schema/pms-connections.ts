import { pgTable, uuid, text, timestamp, integer, jsonb, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { workspaces } from './workspaces';

/**
 * Stores PMS (Property Management System) connection credentials and sync
 * state per workspace. Each workspace can have multiple connections (e.g.
 * Track for some properties, Guesty for others).
 *
 * Credentials are stored as JSONB — shape varies by PMS type:
 *   - track:  { domain, apiKey, apiSecret }
 *   - guesty: { clientId, clientSecret, accessToken?, tokenExpiresAt? }
 */
export const workspacePmsConnections = pgTable('workspace_pms_connections', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  /** track | guesty */
  pmsType: text('pms_type').notNull(),
  /** PMS-specific credentials (shape depends on pmsType) */
  credentials: jsonb('credentials').notNull(),
  /** connected | error | disconnected */
  status: text('status').notNull().default('connected'),
  lastError: text('last_error'),
  lastPropertySyncAt: timestamp('last_property_sync_at', { withTimezone: true }),
  lastReservationSyncAt: timestamp('last_reservation_sync_at', { withTimezone: true }),
  propertiesSynced: integer('properties_synced').notNull().default(0),
  reservationsSynced: integer('reservations_synced').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('pms_conn_workspace_idx').on(t.workspaceId),
  uniqueIndex('pms_conn_workspace_type_idx').on(t.workspaceId, t.pmsType),
]);

export type WorkspacePmsConnection = typeof workspacePmsConnections.$inferSelect;
export type NewWorkspacePmsConnection = typeof workspacePmsConnections.$inferInsert;

/** Track PMS credentials shape */
export interface TrackCredentials {
  domain: string;
  apiKey: string;
  apiSecret: string;
}

/** Guesty PMS credentials shape */
export interface GuestyCredentials {
  clientId: string;
  clientSecret: string;
  /** Cached OAuth2 bearer token */
  accessToken?: string;
  /** ISO timestamp when the token expires */
  tokenExpiresAt?: string;
}
