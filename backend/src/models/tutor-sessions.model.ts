import { Timestamp } from 'firebase-admin/firestore';

export type TutorSessionStatus = string;
export type TutorVerificationStatus = string;

export interface TutorSession {
  tutor_session_id: string;
  student_profile_id: string;
  subject_id: string;
  topic_id: string;
  lesson_id: string | null;
  original_question: string;
  detected_language: string;
  detected_intent: string;
  detected_problem_type: string;
  session_status: TutorSessionStatus;
  verification_status: TutorVerificationStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// TODO: confirm remaining fields with ERD
export interface TutorSessionCreateInput {
  student_profile_id: string;
  subject_id: string;
  topic_id: string;
  lesson_id?: string | null;
  original_question: string;
  detected_language: string;
  detected_intent: string;
  detected_problem_type: string;
  session_status?: TutorSessionStatus;
  verification_status?: TutorVerificationStatus;
}

export interface TutorSessionUpdateInput {
  student_profile_id?: string;
  subject_id?: string;
  topic_id?: string;
  lesson_id?: string | null;
  original_question?: string;
  detected_language?: string;
  detected_intent?: string;
  detected_problem_type?: string;
  session_status?: TutorSessionStatus;
  verification_status?: TutorVerificationStatus;
}
