import { Timestamp } from 'firebase-admin/firestore';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { getAuth, getFirestore, isFirebaseInitialized } from '../config/firebase';
import { userConverter } from '../config/firestore-converters';
import type { User } from '../models/users.model';
import { AppError } from '../utils/AppError';
import { USER_ROLES, normalizeUserRole, type UserRole } from '../types/user-role';
import { verifyAccessToken } from '../utils/auth-tokens';

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole);
}

/**
 * A Firebase ID token verifies identity on its own -- it does not imply a
 * Firestore `users` document exists. The Flutter client signs up directly
 * against the Firebase Auth SDK (never calling POST /auth/register, which is
 * this backend's own separate email/password system), so nothing else ever
 * creates that document for a Firebase-native account. Without this, every
 * first request from a freshly signed-up user 404s out of profile.service's
 * requireUser with "User not found for the authenticated account".
 */
async function ensureUserDocument(
  uid: string,
  claims: { email?: string; name?: string }
): Promise<User> {
  const usersCollection = getFirestore().collection('users').withConverter(userConverter);
  const existing = await usersCollection.doc(uid).get();
  if (existing.exists) {
    return existing.data()!;
  }

  const user: User = {
    user_id: uid,
    firebase_uid: uid,
    full_name: claims.name?.trim() || claims.email || 'Student',
    email: claims.email ?? '',
    role: 'student',
    profile_image_url: null,
    account_status: 'active',
    preferred_language: null,
    created_at: Timestamp.now(),
  };
  await usersCollection.doc(uid).set(user);
  return user;
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authorizationHeader = req.header('authorization');
  const cookieToken = req.header('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith('rean_admin_access='))?.slice('rean_admin_access='.length);
  const token = cookieToken ?? (authorizationHeader?.startsWith('Bearer ') ? authorizationHeader.slice(7).trim() : undefined);

  if (!token) {
    next(new AppError('Missing or invalid authorization header', 401));
    return;
  }

  if (env.firebase.allowDemoAuthentication && token === 'demo-token') {
    req.user = {
      uid: 'demo-student',
      userId: 'demo-student',
      email: 'student@example.com',
      role: 'student',
      normalizedRole: 'student',
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
      const email = typeof decodedToken.email === 'string' ? decodedToken.email : undefined;
      const name = typeof decodedToken.name === 'string' ? decodedToken.name : undefined;
      const user = await ensureUserDocument(decodedToken.uid, { email, name });
      const role = isUserRole(decodedToken.role) ? decodedToken.role : normalizeUserRole(user.role);

      req.user = {
        uid: decodedToken.uid,
        userId: decodedToken.uid,
        email,
        role,
        normalizedRole: normalizeUserRole(role),
      };
      next();
    } catch {
      next(new AppError('Invalid or expired authentication token', 401));
    }
  }
}
