import { Timestamp } from 'firebase-admin/firestore';

export interface StudentAttempt {
  attempt_id: string;
  tutor_session_id: string;
  tutor_turn_id: string;
  student_profile_id: string;
  submitted_answer: string;
  answer_format: string;
  is_correct: boolean;
  is_partially_correct: boolean;
  score: number;
  created_at: Timestamp;
}

// TODO: confirm remaining fields with ERD
export interface StudentAttemptCreateInput {
  tutor_session_id: string;
  tutor_turn_id: string;
  student_profile_id: string;
  submitted_answer: string;
  answer_format: string;
  is_correct: boolean;
  is_partially_correct: boolean;
  score: number;
}

export interface StudentAttemptUpdateInput {
  tutor_session_id?: string;
  tutor_turn_id?: string;
  student_profile_id?: string;
  submitted_answer?: string;
  answer_format?: string;
  is_correct?: boolean;
  is_partially_correct?: boolean;
  score?: number;
}
