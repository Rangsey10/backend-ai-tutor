import { Timestamp } from 'firebase-admin/firestore';

export interface RefreshTokenRecord {
  refresh_token_id: string;
  user_id: string;
  token_hash: string;
  expires_at: Timestamp;
  created_at: Timestamp;
  revoked_at: Timestamp | null;
  replaced_by_token_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
}
