import { Timestamp } from 'firebase-admin/firestore';

export type QuizQuestionType = 'multiple_choice' | 'short_answer' | 'numeric';
export type QuizQuestionDifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type QuizQuestionVerificationStatus = string;

export interface QuizQuestionVisualizationData extends Record<string, string | number | boolean | null | QuizQuestionVisualizationData | QuizQuestionVisualizationData[]> {}

export interface QuizQuestion {
  quiz_question_id: string;
  quiz_id: string;
  question_order: number;
  question_text: string;
  question_type: QuizQuestionType;
  visualization_data: QuizQuestionVisualizationData | null;
  difficulty_level: QuizQuestionDifficultyLevel;
  explanation: string | null;
  verification_status: QuizQuestionVerificationStatus;
  created_at: Timestamp;
}

// TODO: confirm remaining fields with ERD
// Service-layer TODO: math-answer quiz questions should route through mathematical_verifications before being marked correct.
export interface QuizQuestionCreateInput {
  quiz_id: string;
  question_order: number;
  question_text: string;
  question_type: QuizQuestionType;
  visualization_data?: QuizQuestionVisualizationData | null;
  difficulty_level?: QuizQuestionDifficultyLevel;
  explanation?: string | null;
  verification_status?: QuizQuestionVerificationStatus;
}

export interface QuizQuestionUpdateInput {
  quiz_id?: string;
  question_order?: number;
  question_text?: string;
  question_type?: QuizQuestionType;
  visualization_data?: QuizQuestionVisualizationData | null;
  difficulty_level?: QuizQuestionDifficultyLevel;
  explanation?: string | null;
  verification_status?: QuizQuestionVerificationStatus;
}
