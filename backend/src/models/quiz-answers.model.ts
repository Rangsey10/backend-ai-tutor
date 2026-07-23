import { Timestamp } from 'firebase-admin/firestore';

export interface QuizAnswer {
  quiz_answer_id: string;
  quiz_attempt_id: string;
  quiz_question_id: string;
  selected_option_id: string | null;
  submitted_answer: string;
  is_correct: boolean;
  is_partially_correct: boolean;
  score_awarded: number;
  feedback: string | null;
  created_at: Timestamp;
}

// TODO: confirm remaining fields with ERD
export interface QuizAnswerCreateInput {
  quiz_attempt_id: string;
  quiz_question_id: string;
  selected_option_id?: string | null;
  submitted_answer: string;
  is_correct: boolean;
  is_partially_correct: boolean;
  score_awarded?: number;
  feedback?: string | null;
}

export interface QuizAnswerUpdateInput {
  quiz_attempt_id?: string;
  quiz_question_id?: string;
  selected_option_id?: string | null;
  submitted_answer?: string;
  is_correct?: boolean;
  is_partially_correct?: boolean;
  score_awarded?: number;
  feedback?: string | null;
}
