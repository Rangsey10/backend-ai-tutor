import { Timestamp } from 'firebase-admin/firestore';

export interface QuizAttempt {
  quiz_attempt_id: string;
  quiz_id: string;
  student_profile_id: string;
  tutor_session_id?: string | null;
  score: number;
  correct_count: number;
  incorrect_count: number;
  skipped_count: number;
  started_at: Timestamp;
  submitted_at: Timestamp | null;
}

// TODO: confirm remaining fields with ERD
export interface QuizAttemptCreateInput {
  quiz_id: string;
  student_profile_id: string;
  tutor_session_id?: string | null;
  score?: number;
  correct_count?: number;
  incorrect_count?: number;
  skipped_count?: number;
  started_at?: Timestamp;
  submitted_at?: Timestamp | null;
}

export interface QuizAttemptUpdateInput {
  quiz_id?: string;
  student_profile_id?: string;
  tutor_session_id?: string | null;
  score?: number;
  correct_count?: number;
  incorrect_count?: number;
  skipped_count?: number;
  started_at?: Timestamp;
  submitted_at?: Timestamp | null;
}
