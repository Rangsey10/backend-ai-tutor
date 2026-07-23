export type ExplanationLevel = 'beginner' | 'intermediate' | 'advanced';
export type StudentProfileAccountStatus = 'active' | 'inactive' | 'suspended' | 'pending';

export interface StudentProfile {
  student_profile_id: string;
  user_id: string;
  grade_level_id: string;
  account_status: StudentProfileAccountStatus;
  explanation_level: ExplanationLevel;
  learning_goal: string | null;
  onboarding_completed: boolean;
  current_streak: number;
  longest_streak: number;
  total_learning_time: number;
}

export interface StudentProfileCreateInput {
  user_id: string;
  grade_level_id: string;
  account_status?: StudentProfileAccountStatus;
  explanation_level?: ExplanationLevel;
  learning_goal?: string | null;
  onboarding_completed?: boolean;
  current_streak?: number;
  longest_streak?: number;
  total_learning_time?: number;
}

export interface StudentProfileUpdateInput {
  user_id?: string;
  grade_level_id?: string;
  account_status?: StudentProfileAccountStatus;
  explanation_level?: ExplanationLevel;
  learning_goal?: string | null;
  onboarding_completed?: boolean;
  current_streak?: number;
  longest_streak?: number;
  total_learning_time?: number;
}
