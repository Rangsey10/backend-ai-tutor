import { Timestamp } from 'firebase-admin/firestore';

export interface MathematicalVerificationDetails extends Record<string, string | number | boolean | null> {}

export interface MathematicalVerification {
  verification_id: string;
  tutor_session_id: string;
  tutor_turn_id: string;
  verification_type: string;
  input_expression: string;
  expected_result: string;
  generated_result: string;
  verification_status: string;
  verification_details: MathematicalVerificationDetails;
  created_at: Timestamp;
}

// TODO: confirm remaining fields with ERD
export interface MathematicalVerificationCreateInput {
  tutor_session_id: string;
  tutor_turn_id: string;
  verification_type: string;
  input_expression: string;
  expected_result: string;
  generated_result: string;
  verification_status: string;
  verification_details: MathematicalVerificationDetails;
}

export interface MathematicalVerificationUpdateInput {
  tutor_session_id?: string;
  tutor_turn_id?: string;
  verification_type?: string;
  input_expression?: string;
  expected_result?: string;
  generated_result?: string;
  verification_status?: string;
  verification_details?: MathematicalVerificationDetails;
}
