import { Timestamp } from 'firebase-admin/firestore';

/**
 * How a free-text maths answer was judged.
 *
 * `source` records who decided: the SymPy verifier, or the string fallback used
 * when the verifier could not answer. `needs_review` marks a grade the fallback
 * could not prove, so a reviewer can catch a student marked wrong unfairly.
 */
export interface QuizAnswerVerification {
  source: 'verifier' | 'fallback_exact_match' | 'option_match';
  status: 'equivalent' | 'different' | 'cannot_verify' | 'not_applicable';
  needs_review: boolean;
}

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
  /** Absent on answers graded before verification was recorded. */
  verification?: QuizAnswerVerification;
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
