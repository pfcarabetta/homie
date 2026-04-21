export interface ScriptTemplate {
  voice: string;
  sms: string;
  web: string;
}

export interface ScriptBundle {
  job_id: string;
  provider_id: string;
  voice: string;
  sms: string;
  web: string;
  generated_at: string;
}

export interface GenerateScriptsParams {
  jobId: string;
  providerId: string;
  providerName: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'emergency';
  summary: string;
  recommendedActions: string[];
  zipCode: string;
  timing: string;
}
