import { Timestamp } from 'firebase-admin/firestore';

export type GradeLevelStatus = 'active' | 'inactive';

export interface GradeLevel {
  grade_level_id: string;
  grade_name: string;
  grade_number: number;
  description: string | null;
  status: GradeLevelStatus;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface GradeLevelCreateInput {
  grade_name: string;
  grade_number: number;
  description?: string | null;
  status?: GradeLevelStatus;
}

export interface GradeLevelUpdateInput {
  grade_name?: string;
  grade_number?: number;
  description?: string | null;
  status?: GradeLevelStatus;
}
