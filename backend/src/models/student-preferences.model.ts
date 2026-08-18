import { Timestamp } from 'firebase-admin/firestore';

export type LearningPace = 'slow' | 'balanced' | 'fast';
export type VisualStyle = 'diagram' | 'animation' | 'flashcard' | 'step_by_step' | 'real_world';

export interface StudentNotificationSettings {
  reminders_enabled: boolean;
  daily_goal_enabled: boolean;
  weekly_summary_enabled: boolean;
}

export interface StudentPreference {
  student_preference_id: string;
  student_profile_id: string;
  preferred_visual_styles: VisualStyle[];
  learning_pace: LearningPace;
  preferred_subject_ids: string[];
  notification_settings: StudentNotificationSettings;
  updated_at: Timestamp;
}
