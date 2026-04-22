/**
 * Shared TypeScript types — single source of truth for the API contract.
 *
 * Both packages/web and apps/homie-mobile import from here. Business-mobile
 * will import from here too once it's added.
 *
 * If a backend response shape changes, update the type HERE — both
 * frontends pick it up automatically.
 *
 * Server types are not yet sourced from here (the API package has its own
 * Drizzle-derived types). A future tightening would generate these from
 * a single OpenAPI / Zod schema, but for now the contract is duplicated
 * across server and shared, with TypeScript catching any drift at the
 * web/mobile boundary.
 */

// ── API envelope + errors ──────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  meta: Record<string, unknown>;
}

// ── Diagnosis ─────────────────────────────────────────────────────────────

export interface DiagnosisPayload {
  category: string;
  subcategory?: string;
  severity: 'low' | 'medium' | 'high' | 'emergency';
  summary: string;
  recommendedActions: string[];
  estimatedCost?: { min: number; max: number };
  source?: string;
}

/** Structured DIY analysis returned from POST /api/v1/diy/analyze.
 *  Lazy-loaded when the homeowner taps the DIY panel — if `feasible` is
 *  false, the panel renders a "call a pro" state instead of steps. */
export interface DIYToolSupply {
  name: string;
  /** Generic search query used to build the Amazon affiliate URL. */
  searchQuery: string;
  /** False means "only if needed" — rendered as a softer row. */
  essential: boolean;
}

export interface DIYAnalysisPayload {
  feasible: boolean;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  /** Human-readable: "30-60 min", "1-2 hours", etc. */
  timeEstimate: string | null;
  costDiyCents: { min: number; max: number } | null;
  costProCents: { min: number; max: number } | null;
  steps: string[];
  toolsSupplies: DIYToolSupply[];
  safetyWarnings: string[];
  whenToCallPro: string | null;
}

export interface JobSummary {
  title: string;
  category: string;
  severity: string;
  estimatedCost: { min: number; max: number };
}

// ── Jobs ──────────────────────────────────────────────────────────────────

export type JobTier = 'standard' | 'priority' | 'emergency';
export type JobTiming = 'asap' | 'this_week' | 'this_month' | 'flexible';
/** B2B audience toggle — see packages/api/src/types/jobs.ts */
export type JobAudience = 'preferred_only' | 'preferred_plus_marketplace';
export type JobStatus = 'created' | 'dispatching' | 'collecting' | 'completed' | 'expired' | 'refunded';

export interface ChannelStats {
  attempted: number;
  connected: number;
}

export interface CreateJobResponse {
  id: string;
  status: JobStatus;
  tier: string;
  expires_at: string;
  providers_contacted: number;
  estimated_results_at: string;
}

export interface JobStatusResponse {
  id: string;
  status: string;
  tier: string;
  providers_contacted: number;
  providers_responded: number;
  providers_accepted: number;
  outreach_channels: {
    voice: ChannelStats;
    sms: ChannelStats;
    web: ChannelStats;
  };
  expires_at: string | null;
  created_at: string;
}

export interface ProviderSummary {
  id: string;
  name: string;
  phone: string | null;
  google_rating: string | null;
  review_count: number;
  categories: string[] | null;
  google_place_id: string | null;
  yelp_url: string | null;
}

export interface ProviderResponseItem {
  id: string;
  provider: ProviderSummary;
  channel: string;
  quoted_price: string | null;
  availability: string | null;
  message: string | null;
  responded_at: string;
  /** True if this response arrived after the dispatch's auto-expire window */
  is_late?: boolean;
}

export interface JobResponsesResponse {
  responses: ProviderResponseItem[];
  pending_count: number;
  more_expected: boolean;
}

export interface BookJobResponse {
  booking_id: string;
  status: string;
  provider: { name: string; phone: string | null };
  scheduled: string | null;
  quoted_price: string | null;
}

// ── Payments ──────────────────────────────────────────────────────────────

export interface ChargeResponse {
  payment_id: string;
  status: 'succeeded' | 'failed';
  amount: number;
  tier: JobTier;
}

// ── WebSocket events ─────────────────────────────────────────────────────

export type JobSocketEvent =
  | { type: 'outreach.started'; data: { provider_id: string; channel: string } }
  | { type: 'outreach.response'; data: { provider_id: string; channel: string; accepted: boolean } }
  | { type: 'outreach.voicemail'; data: { provider_id: string } }
  | { type: 'job.threshold_met'; data: { providers_accepted: number } }
  | { type: 'job.expired'; data: { job_id: string } }
  | { type: 'job.completed'; data: { job_id: string } };

// ── Image upload ─────────────────────────────────────────────────────────

export interface ImageUploadResult {
  url: string;
  thumbnailUrl: string;
  publicId: string;
}

// ── Auth ─────────────────────────────────────────────────────────────────

export interface AuthHomeowner {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  zip_code: string;
  membership_tier: string;
}

export interface AuthResponse {
  token: string;
  homeowner: AuthHomeowner;
}

// ── Account / consumer ───────────────────────────────────────────────────

export interface AccountProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  zip_code: string;
  membership_tier: string;
  title: string | null;
  notify_email_quotes: boolean;
  notify_sms_quotes: boolean;
  notify_email_bookings: boolean;
  notify_sms_bookings: boolean;
  created_at: string;
}

export interface AccountJob {
  id: string;
  status: string;
  payment_status: string;
  tier: string;
  zip_code: string;
  budget: string | null;
  preferred_timing: string | null;
  diagnosis: DiagnosisPayload | null;
  created_at: string;
  expires_at: string | null;
  has_booking: boolean;
}

export interface AccountBooking {
  id: string;
  job_id: string;
  provider: {
    id: string;
    name: string;
    phone: string | null;
    email?: string | null;
    rating?: string | null;
    review_count?: number;
  };
  status: string;
  confirmed_at: string;
  completed_at?: string | null;
  quoted_price: string | null;
  scheduled: string | null;
  response_message?: string | null;
  response_channel?: string | null;
  job_category?: string | null;
  job_severity?: string | null;
  job_summary?: string | null;
  unread_messages?: number;
}

export interface TrackingStatus {
  property_name: string;
  job_title: string;
  job_category: string;
  severity: string;
  status: string;
  timeline: Array<{
    event_type: string;
    title: string;
    description: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
  provider: { name: string; rating: string | null; reviewCount?: number } | null;
  last_updated: string;
  brand_logo_url?: string | null;
  expired?: boolean;
}

export interface HomeData {
  address: string | null;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: string | null;
  sqft: number | null;
  details: PropertyDetails | null;
}

export interface SmartSuggestion {
  title: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  reason: string;
  /** seasonal | location | equipment — drives the chip color */
  kind?: string;
}

// ── Property details (used by both consumer + business) ──────────────────

export interface BedConfig {
  type: string;
  count: number;
}

export interface PropertyDetails {
  hvac?: {
    acType?: string; acBrand?: string; acModel?: string; acAge?: string;
    heatingType?: string; heatingBrand?: string; heatingModel?: string;
    thermostatBrand?: string; thermostatModel?: string;
    filterSize?: string;
  };
  waterHeater?: {
    type?: string; brand?: string; model?: string; age?: string;
    fuel?: string; capacity?: string; location?: string;
  };
  appliances?: {
    refrigerator?: { brand?: string; model?: string };
    washer?: { brand?: string; model?: string };
    dryer?: { brand?: string; model?: string; fuel?: string };
    dishwasher?: { brand?: string; model?: string };
    oven?: { brand?: string; model?: string; fuel?: string };
    disposal?: { brand?: string };
    microwave?: { brand?: string; type?: string };
  };
  plumbing?: {
    kitchenFaucetBrand?: string; bathroomFaucetBrand?: string;
    toiletBrand?: string; waterSoftener?: string;
    septicOrSewer?: string; mainShutoffLocation?: string;
  };
  electrical?: {
    breakerBoxLocation?: string; panelAmperage?: string;
    hasGenerator?: boolean; generatorType?: string;
    hasSolar?: boolean; solarSystem?: string;
    hasEvCharger?: boolean; evChargerBrand?: string;
  };
  poolSpa?: {
    poolType?: string; poolHeaterBrand?: string; poolPumpBrand?: string;
    hotTubBrand?: string; hotTubModel?: string;
  };
  exterior?: {
    roofType?: string; roofAge?: string; sidingMaterial?: string;
    fenceMaterial?: string; garageDoorBrand?: string;
    irrigationBrand?: string;
  };
  access?: {
    lockboxCode?: string; gateCode?: string;
    alarmBrand?: string; alarmCode?: string;
    wifiNetwork?: string; wifiPassword?: string;
  };
  general?: {
    yearBuilt?: string; hasHoa?: boolean; hoaContact?: string;
    pestControlProvider?: string; pestControlFrequency?: string;
    cleaningNotes?: string;
  };
}

// ── Property scans (consumer home scan + business property scan) ─────────

export interface PropertyScan {
  id: string;
  propertyId: string;
  workspaceId: string;
  scanType: 'full' | 'quick';
  scannedBy: string | null;
  status: 'in_progress' | 'processing' | 'review_pending' | 'completed' | 'failed';
  durationSeconds: number | null;
  roomsScanned: number;
  itemsCataloged: number;
  itemsConfirmed: number;
  itemsFlaggedForReview: number;
  changesDetected: number;
  scanNotes: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface PropertyInventoryItem {
  id: string;
  propertyId: string;
  roomId: string | null;
  scanId: string | null;
  category: 'appliance' | 'fixture' | 'system' | 'safety' | 'amenity' | 'infrastructure';
  itemType: string;
  brand: string | null;
  modelNumber: string | null;
  serialNumber: string | null;
  manufactureDate: string | null;
  estimatedAgeYears: string | null;
  fuelType: string | null;
  capacity: string | null;
  condition: string | null;
  identificationMethod: 'label_ocr' | 'visual_classification' | 'pm_manual';
  confidenceScore: string;
  photoFrameUrl: string | null;
  labelPhotoUrl: string | null;
  maintenanceFlags: string[] | null;
  notes: string | null;
  status: 'ai_identified' | 'pm_confirmed' | 'pm_corrected' | 'pm_dismissed';
  confirmedBy: string | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyRoomWithItems {
  id: string;
  propertyId: string;
  scanId: string | null;
  roomType: string;
  roomLabel: string;
  floorLevel: number;
  flooringType: string | null;
  generalCondition: string | null;
  photoUrl: string | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: PropertyInventoryItem[];
  /** Number of physical room rows merged into this group (>=1) */
  roomCount?: number;
  /** All underlying room ids that were collapsed into this group */
  mergedRoomIds?: string[];
}

export interface PropertyInventoryResponse {
  rooms: PropertyRoomWithItems[];
  unassignedItems: PropertyInventoryItem[];
  summary: {
    totalItems: number;
    averageAge: number | null;
    agingItems: number;
    safetyFlags: number;
  };
}

export interface MaintenanceFlag {
  itemId: string;
  itemType: string;
  brand: string | null;
  description: string;
  severity: 'info' | 'attention' | 'urgent';
}

// ── Notifications + booking messaging ────────────────────────────────────

export interface AccountNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  jobId: string | null;
  propertyId: string | null;
  guestIssueId: string | null;
  bookingId: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface BookingMessage {
  id: string;
  bookingId: string;
  /** 'team' | 'provider' | 'system' */
  senderType: string;
  senderId: string | null;
  senderName: string | null;
  content: string;
  photoUrl: string | null;
  readAt: string | null;
  createdAt: string;
}
