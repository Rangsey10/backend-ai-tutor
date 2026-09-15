import { Timestamp } from 'firebase-admin/firestore';

export type TopicDifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type TopicStatus = 'draft' | 'active' | 'inactive' | 'archived';

export interface TopicSubjectSnapshot {
  subject_id: string;
  subject_name: string;
  subject_code: string;
}

export interface TopicGradeLevelSnapshot {
  grade_level_id: string;
  grade_name: string;
  grade_number: number;
}

export interface Topic {
  topic_id: string;
  unit_id?: string | null;
  subject_id: string;
  grade_level_id: string;
  topic_name: string;
  topic_code: string;
  khmer_name: string | null;
  description: string | null;
  difficulty_level: TopicDifficultyLevel;
  learning_objective: string | null;
  learning_objectives: string[];
  prerequisites: string[];
  status: TopicStatus;
  subject_snapshot: TopicSubjectSnapshot | null;
  grade_level_snapshot: TopicGradeLevelSnapshot | null;
  created_at: Timestamp;
  updated_at: Timestamp;
  created_by: string;
  updated_by: string;
}

export interface TopicCreateInput {
  unit_id?: string | null;
  subject_id: string;
  grade_level_id: string;
  topic_name: string;
  topic_code: string;
  khmer_name?: string | null;
  description?: string | null;
  difficulty_level?: TopicDifficultyLevel;
  learning_objective?: string | null;
  learning_objectives?: string[];
  prerequisites?: string[];
  status?: TopicStatus;
  subject_snapshot?: TopicSubjectSnapshot | null;
  grade_level_snapshot?: TopicGradeLevelSnapshot | null;
}

export interface TopicUpdateInput {
  unit_id?: string | null;
  subject_id?: string;
  grade_level_id?: string;
  topic_name?: string;
  topic_code?: string;
  khmer_name?: string | null;
  description?: string | null;
  difficulty_level?: TopicDifficultyLevel;
  learning_objective?: string | null;
  learning_objectives?: string[];
  prerequisites?: string[];
  status?: TopicStatus;
  subject_snapshot?: TopicSubjectSnapshot | null;
  grade_level_snapshot?: TopicGradeLevelSnapshot | null;
}
