import { Timestamp } from 'firebase-admin/firestore';
import { UserRole } from '@types/user-role';

export type AccountStatus = 'active' | 'inactive' | 'suspended' | 'pending';

export interface User {
  user_id: string;
  firebase_uid: string;
  full_name: string;
  email: string;
  role: UserRole;
  profile_image_url: string | null;
  account_status: AccountStatus;
  preferred_language: string | null;
  created_at: Timestamp;
}

export interface UserCreateInput {
  firebase_uid: string;
  full_name: string;
  email: string;
  role: UserRole;
  profile_image_url?: string | null;
  account_status?: AccountStatus;
  preferred_language?: string | null;
}

export interface UserUpdateInput {
  firebase_uid?: string;
  full_name?: string;
  email?: string;
  role?: UserRole;
  profile_image_url?: string | null;
  account_status?: AccountStatus;
  preferred_language?: string | null;
}
