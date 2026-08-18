import { Timestamp } from 'firebase-admin/firestore';

export interface AuthCredential {
  auth_credential_id: string;
  user_id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  failed_login_attempts: number;
  locked_until: Timestamp | null;
  last_login_at: Timestamp | null;
  created_at: Timestamp;
  updated_at: Timestamp;
}
