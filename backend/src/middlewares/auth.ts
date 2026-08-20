import { NextFunction, Request, Response } from 'express';
import { getAuth } from '../config/firebase';
import { env } from '../config/env';
import { getFirestore, isFirebaseInitialized } from '../config/firebase';
import { userConverter } from '../config/firestore-converters';
import { AppError } from '../utils/AppError';
import { USER_ROLES, normalizeUserRole, type UserRole } from '../types/user-role';
import { verifyAccessToken } from '../utils/auth-tokens';

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
    const claims = verifyAccessToken(token);
    if (!isFirebaseInitialized() && env.firebase.allowLocalFallback && !env.isProductionLike) {
      req.user = {
        uid: `local:${claims.sub}`,
        userId: claims.sub,
        email: claims.email,
        role: claims.role,
        normalizedRole: normalizeUserRole(claims.role),
      };
      next();
      return;
    }

    const userDocument = await getFirestore().collection('users').withConverter(userConverter).doc(claims.sub).get();

    if (!userDocument.exists) {
      next(new AppError('User account not found for access token', 401));
      return;
    }

    const user = userDocument.data()!;
    req.user = {
      uid: user.firebase_uid,
      userId: user.user_id,
      email: user.email,
      role: user.role,
      normalizedRole: normalizeUserRole(user.role),
    };
    next();
  } catch {
    try {
      const decodedToken = await getAuth().verifyIdToken(token);
      const role = isUserRole(decodedToken.role) ? decodedToken.role : 'student';

      req.user = {
        uid: decodedToken.uid,
        userId: decodedToken.uid,
        email: typeof decodedToken.email === 'string' ? decodedToken.email : undefined,
        role,
        normalizedRole: normalizeUserRole(role),
      };
      next();
    } catch {
      next(new AppError('Invalid or expired authentication token', 401));
    }
  }
}
