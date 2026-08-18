import { Timestamp } from 'firebase-admin/firestore';

export interface TutorActivityLog {
  tutor_activity_log_id: string;
  student_profile_id: string;
  tutor_session_id: string | null;
  topic_id: string | null;
  interaction_count: number;
  visual_aids_generated: number;
  duration_seconds: number;
  completed_at: Timestamp;
}
