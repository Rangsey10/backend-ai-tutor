import { NextFunction, Request, Response } from 'express';
import { getAuth } from '../config/firebase';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { USER_ROLES, type UserRole } from '../types/user-role';

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authorizationHeader = req.header('authorization');

  if (!authorizationHeader?.startsWith('Bearer ')) {
    next(new AppError('Missing or invalid authorization header', 401));
    return;
  }

  const token = authorizationHeader.slice(7).trim();

  if (!token) {
    next(new AppError('Missing or invalid authorization header', 401));
    return;
  }

  if (env.firebase.allowDemoAuthentication && token === 'demo-token') {
    req.user = {
      uid: 'demo-student',
      email: 'student@example.com',
      role: 'student',
    };
    next();
    return;
  }

  try {
    const decodedToken = await getAuth().verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: typeof decodedToken.email === 'string' ? decodedToken.email : undefined,
      role: isUserRole(decodedToken.role) ? decodedToken.role : 'student',
    };
    next();
  } catch {
    next(new AppError('Invalid or expired authentication token', 401));
  }
}
