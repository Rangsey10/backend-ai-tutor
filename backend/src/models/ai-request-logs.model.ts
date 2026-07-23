import { Timestamp } from 'firebase-admin/firestore';

export type AiRequestStatus = string;

export interface AiRequestLog {
  ai_request_log_id: string;
  tutor_session_id: string | null;
  request_type: string;
  provider: string;
  model_name: string;
  prompt_version: string;
  response_status: AiRequestStatus;
  response_latency_ms: number;
  token_input: number;
  created_at: Timestamp;
}

// TODO: confirm remaining fields with ERD
export interface AiRequestLogCreateInput {
  tutor_session_id?: string | null;
  request_type: string;
  provider: string;
  model_name: string;
  prompt_version: string;
  response_status: AiRequestStatus;
  response_latency_ms: number;
  token_input: number;
}

export interface AiRequestLogUpdateInput {
  tutor_session_id?: string | null;
  request_type?: string;
  provider?: string;
  model_name?: string;
  prompt_version?: string;
  response_status?: AiRequestStatus;
  response_latency_ms?: number;
  token_input?: number;
}
