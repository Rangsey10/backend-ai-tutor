import { Timestamp } from 'firebase-admin/firestore';

export type TutorTurnSenderType = 'student' | 'ai_tutor';

export interface TutorTurn {
  tutor_turn_id: string;
  tutor_session_id: string;
  turn_number: number;
  sender_type: TutorTurnSenderType;
  message_text: string;
  visual_state: Record<string, unknown> | null;
  stage: string;
  teaching_strategy: string;
  interaction_type: string;
  expected_answer: string | null;
  created_at: Timestamp;
}

// TODO: confirm remaining fields with ERD
export interface TutorTurnCreateInput {
  tutor_session_id: string;
  turn_number: number;
  sender_type: TutorTurnSenderType;
  message_text: string;
  visual_state?: Record<string, unknown> | null;
  stage: string;
  teaching_strategy: string;
  interaction_type: string;
  expected_answer?: string | null;
}

export interface TutorTurnUpdateInput {
  tutor_session_id?: string;
  turn_number?: number;
  sender_type?: TutorTurnSenderType;
  message_text?: string;
  visual_state?: Record<string, unknown> | null;
  stage?: string;
  teaching_strategy?: string;
  interaction_type?: string;
  expected_answer?: string | null;
}
