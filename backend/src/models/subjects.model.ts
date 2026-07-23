import { Timestamp } from 'firebase-admin/firestore';

export type SubjectStatus = 'active' | 'inactive';

export interface Subject {
  subject_id: string;
  subject_name: string;
  subject_code: string;
  icon_url: string | null;
  description: string | null;
  status: SubjectStatus;
  display_order: number;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export interface SubjectCreateInput {
  subject_name: string;
  subject_code: string;
  icon_url?: string | null;
  description?: string | null;
  status?: SubjectStatus;
  display_order?: number;
}

export interface SubjectUpdateInput {
  subject_name?: string;
  subject_code?: string;
  icon_url?: string | null;
  description?: string | null;
  status?: SubjectStatus;
  display_order?: number;
}
