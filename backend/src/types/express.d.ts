import type { UserRole } from './user-role';

declare global {
  namespace Express {
    interface Request {
      user?: {
        uid: string;
        email?: string;
        role?: UserRole;
      };
    }
  }
}

export {};
