import { DiagnosisPayload } from '../db/schema/jobs';

export type JobTier = 'standard' | 'priority' | 'emergency';
export type JobTiming = 'asap' | 'this_week' | 'this_month' | 'flexible';
export type JobStatus = 'open' | 'created' | 'dispatching' | 'collecting' | 'completed' | 'expired' | 'refunded';
export type OutreachChannel = 'voice' | 'sms' | 'web';

/** B2B audience toggle on the dispatch summary card. PMs choose between
 *  keeping a job in-network ('preferred_only') or letting marketplace
 *  discovery fill remaining slots when no preferred provider responds
 *  ('preferred_plus_marketplace', the default). Consumer dispatches and
 *  jobs without workspace_id ignore this. */
export type JobAudience = 'preferred_only' | 'preferred_plus_marketplace';

export interface CreateJobBody {
  diagnosis: DiagnosisPayload;
  photo_urls?: string[];
  timing: JobTiming;
  budget: string;
  tier: JobTier;
  zip_code: string;
  consent: boolean;
  workspace_id?: string;
  property_id?: string;
  notify_guest?: boolean;
  audience?: JobAudience;
  /** Explicit list of preferred provider IDs to contact for this
   *  dispatch. Set by the PM via the AudienceSelector checklist on
   *  the dispatch summary card. When provided, replaces the
   *  category-auto-match — lets the PM include preferred vendors
   *  who don't normally serve this category, or exclude
   *  category-matched vendors they don't want for this job. */
  preferred_provider_ids?: string[];
}

export interface CreateJobResponse {
  id: string;
  status: JobStatus;
  tier: string;
  expires_at: string;
  providers_contacted: number;
  estimated_results_at: string;
}

export interface ChannelStats {
  attempted: number;
  connected: number;
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

export interface BookJobBody {
  response_id: string;
  provider_id: string;
  service_address?: string;
}

export interface BookJobResponse {
  booking_id: string;
  status: string;
  provider: {
    name: string;
    phone: string | null;
  };
  scheduled: string | null;
  quoted_price: string | null;
}

export interface BookingResponse {
  id: string;
  job_id: string;
  provider: {
    id: string;
    name: string;
    phone: string | null;
  };
  status: string;
  confirmed_at: string;
  quoted_price: string | null;
  scheduled: string | null;
}
