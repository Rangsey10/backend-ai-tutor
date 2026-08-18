import { Timestamp } from 'firebase-admin/firestore';

export type TutorSessionSnapshotType = 'canvas_state' | 'visual_cards' | 'diagram' | 'checkpoint';

export interface TutorSessionSnapshot {
  tutor_session_snapshot_id: string;
  tutor_session_id: string;
  tutor_turn_id: string | null;
  snapshot_type: TutorSessionSnapshotType;
  payload: Record<string, unknown>;
  created_at: Timestamp;
}
