import { Timestamp } from 'firebase-admin/firestore';
import { TutorVerificationStatus } from '@models/tutor-sessions.model';

export type ReportType =
  | 'incorrect_answer'
  | 'unclear_explanation'
  | 'broken_visualization'
  | 'repeated_response'
  | 'inappropriate_content'
  | 'unsupported_question'
  | 'voice_issue';

export type ReportSeverity = string;

export interface ReportedAiResponse {
  report_id: string;
  student_profile_id: string;
  tutor_session_id: string;
  tutor_turn_id: string;
  report_type: ReportType;
  description: string;
  severity: ReportSeverity;
  verification_status: TutorVerificationStatus;
  assigned_admin_id: string | null;
  created_at: Timestamp;
}

// TODO: confirm remaining fields with ERD
// Report types should be confirmed against the actual product spec.
export interface ReportedAiResponseCreateInput {
  student_profile_id: string;
  tutor_session_id: string;
  tutor_turn_id: string;
  report_type: ReportType;
  description: string;
  severity: ReportSeverity;
  verification_status?: TutorVerificationStatus;
  assigned_admin_id?: string | null;
}

export interface ReportedAiResponseUpdateInput {
  student_profile_id?: string;
  tutor_session_id?: string;
  tutor_turn_id?: string;
  report_type?: ReportType;
  description?: string;
  severity?: ReportSeverity;
  verification_status?: TutorVerificationStatus;
  assigned_admin_id?: string | null;
}
