import { Timestamp } from 'firebase-admin/firestore';
export type ReportType =
  | 'incorrect_math'
  | 'confusing_explanation'
  | 'unsafe_unhelpful'
  | 'visual_problem'
  | 'other';

export type TutorReportReviewStatus = 'pending' | 'triaged' | 'resolved' | 'dismissed';

export interface ReportedAiResponse {
  report_id: string;
  student_profile_id: string;
  tutor_session_id: string;
  tutor_turn_id: string;
  report_type: ReportType;
  redacted_details: string | null;
  review_status: TutorReportReviewStatus;
  review_history: Array<{ status: TutorReportReviewStatus; changed_at: Timestamp; reviewer_id: string | null }>;
  created_at: Timestamp;
}
