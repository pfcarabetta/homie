export type OutreachChannel = 'voice' | 'sms' | 'web';

export interface OutreachPayload {
  attemptId: string;
  jobId: string;
  providerId: string;
  providerName: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  script: string;
  channel: OutreachChannel;
}

/** Adapters return 'pending' when the interaction is async (webhook delivers the result later). */
export interface OutreachResult {
  status: 'pending' | 'failed';
  error?: string;
}

export interface ChannelAdapter {
  send(payload: OutreachPayload): Promise<OutreachResult>;
}
