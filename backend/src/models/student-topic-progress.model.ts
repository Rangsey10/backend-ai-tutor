import { Timestamp } from 'firebase-admin/firestore';

export interface StudentTopicProgress {
  progress_id: string;
  student_profile_id: string;
  topic_id: string;
  mastery_score: number;
  lessons_completed: number;
  quizzes_completed: number;
  average_quiz_score: number;
  correct_attempts: number;
  incorrect_attempts: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// TODO: confirm remaining fields with ERD
// Writes to mastery_score should go through a transaction, not a plain set.
export interface StudentTopicProgressCreateInput {
  student_profile_id: string;
  topic_id: string;
  mastery_score?: number;
  lessons_completed?: number;
  quizzes_completed?: number;
  average_quiz_score?: number;
  correct_attempts?: number;
  incorrect_attempts?: number;
}

export interface StudentTopicProgressUpdateInput {
  student_profile_id?: string;
  topic_id?: string;
  mastery_score?: number;
  lessons_completed?: number;
  quizzes_completed?: number;
  average_quiz_score?: number;
  correct_attempts?: number;
  incorrect_attempts?: number;
}
