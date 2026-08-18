import { NextFunction, Request, Response } from 'express';
import { type UserRole } from '../types/user-role';
import { normalizeUserRole } from '../types/user-role';
import { AppError } from '../utils/AppError';

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user?.role) {
      next(new AppError('Authentication required', 401));
      return;
    }

    const allowedRoles = new Set(roles.map((role) => normalizeUserRole(role)));
    const currentRole = normalizeUserRole(req.user.role);

    if (!allowedRoles.has(currentRole)) {
      next(new AppError('You do not have permission to access this resource', 403));
      return;
    }

    next();
  };
}
