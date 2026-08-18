import type { UserRole } from './user-role';

declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        userId?: string;
        email?: string;
        role?: UserRole;
        normalizedRole?: 'student' | 'tutor' | 'admin';
      };
    }
  }
}

export {};
