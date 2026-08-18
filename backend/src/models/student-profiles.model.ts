export type ExplanationLevel = 'beginner' | 'intermediate' | 'advanced';
export type StudentProfileAccountStatus = 'active' | 'inactive' | 'suspended' | 'pending';

export interface StudentProfile {
  student_profile_id: string;
  user_id: string;
  grade_level_id: string;
  display_name: string | null;
  avatar_url: string | null;
  account_status: StudentProfileAccountStatus;
  explanation_level: ExplanationLevel;
  learning_goal: string | null;
  learning_goals: string[];
  onboarding_completed: boolean;
  onboarding_current_step: string;
  onboarding_steps_completed: string[];
  current_streak: number;
  longest_streak: number;
  total_learning_time: number;
}

export interface StudentProfileCreateInput {
  user_id: string;
  grade_level_id: string;
  display_name?: string | null;
  avatar_url?: string | null;
  account_status?: StudentProfileAccountStatus;
  explanation_level?: ExplanationLevel;
  learning_goal?: string | null;
  learning_goals?: string[];
  onboarding_completed?: boolean;
  onboarding_current_step?: string;
  onboarding_steps_completed?: string[];
  current_streak?: number;
  longest_streak?: number;
  total_learning_time?: number;
}

export interface StudentProfileUpdateInput {
  user_id?: string;
  grade_level_id?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  account_status?: StudentProfileAccountStatus;
  explanation_level?: ExplanationLevel;
  learning_goal?: string | null;
  learning_goals?: string[];
  onboarding_completed?: boolean;
  onboarding_current_step?: string;
  onboarding_steps_completed?: string[];
  current_streak?: number;
  longest_streak?: number;
  total_learning_time?: number;
}
