import { Timestamp } from 'firebase-admin/firestore';

export type AuthActionTokenPurpose = 'password_reset' | 'email_verification';

export interface AuthActionToken {
  auth_action_token_id: string;
  user_id: string;
  purpose: AuthActionTokenPurpose;
  token_hash: string;
  expires_at: Timestamp;
  created_at: Timestamp;
  consumed_at: Timestamp | null;
}
