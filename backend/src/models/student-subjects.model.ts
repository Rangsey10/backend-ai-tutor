import { Timestamp } from 'firebase-admin/firestore';

export type StudentSubjectStatus = 'active' | 'completed' | 'archived';
export type MasteryLevel = 'not_started' | 'developing' | 'proficient' | 'mastered';

export interface StudentSubject {
  student_subject_id: string;
  student_profile_id: string;
  subject_id: string;
  selected_at: Timestamp;
  current_progress: number;
  mastery_level: MasteryLevel;
  status: StudentSubjectStatus;
}

export interface StudentSubjectCreateInput {
  student_profile_id: string;
  subject_id: string;
  selected_at?: Timestamp;
  current_progress?: number;
  mastery_level?: MasteryLevel;
  status?: StudentSubjectStatus;
}

export interface StudentSubjectUpdateInput {
  student_profile_id?: string;
  subject_id?: string;
  selected_at?: Timestamp;
  current_progress?: number;
  mastery_level?: MasteryLevel;
  status?: StudentSubjectStatus;
}
