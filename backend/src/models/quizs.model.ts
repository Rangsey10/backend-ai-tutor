import { Timestamp } from 'firebase-admin/firestore';

export type QuizDifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type QuizGenerationSource = string;

export interface Quiz {
  quiz_id: string;
  subject_id: string;
  topic_id: string;
  grade_level_id: string;
  generated_from_session_id: string | null;
  title: string;
  description: string | null;
  difficulty_level: QuizDifficultyLevel;
  generation_source: QuizGenerationSource;
  total_questions: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

// TODO: confirm remaining fields with ERD
export interface QuizCreateInput {
  subject_id: string;
  topic_id: string;
  grade_level_id: string;
  generated_from_session_id?: string | null;
  title: string;
  description?: string | null;
  difficulty_level?: QuizDifficultyLevel;
  generation_source: QuizGenerationSource;
  total_questions?: number;
}

export interface QuizUpdateInput {
  subject_id?: string;
  topic_id?: string;
  grade_level_id?: string;
  generated_from_session_id?: string | null;
  title?: string;
  description?: string | null;
  difficulty_level?: QuizDifficultyLevel;
  generation_source?: QuizGenerationSource;
  total_questions?: number;
}
