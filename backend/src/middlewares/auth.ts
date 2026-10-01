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
const USER_CACHE_TTL_MS = 15 * 60 * 1000;
const USER_FALLBACK_TTL_MS = 5 * 60 * 1000;
const cachedUsers = new Map<string, { user: User; expiresAt: number }>();

async function ensureUserDocument(
  uid: string,
  claims: { email?: string; name?: string }
): Promise<User> {
  const isTestEnv = process.env.NODE_ENV === 'test';
  const now = Date.now();
  if (!isTestEnv) {
    const cached = cachedUsers.get(uid);
    if (cached && now < cached.expiresAt) {
      return cached.user;
    }
  }

  const fallbackUser: User = {
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

  try {
    const usersCollection = getFirestore().collection('users').withConverter(userConverter);
    const existing = await usersCollection.doc(uid).get();
    if (existing.exists) {
      const existingUser = existing.data()!;
      if (!isTestEnv) {
        cachedUsers.set(uid, { user: existingUser, expiresAt: now + USER_CACHE_TTL_MS });
      }
      return existingUser;
    }

    await usersCollection.doc(uid).set(fallbackUser);
    if (!isTestEnv) {
      cachedUsers.set(uid, { user: fallbackUser, expiresAt: now + USER_CACHE_TTL_MS });
    }
    return fallbackUser;
  } catch (err) {
    if (!isTestEnv) {
      cachedUsers.set(uid, { user: fallbackUser, expiresAt: now + USER_FALLBACK_TTL_MS });
    }
    throw err;
  }
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
    const isLocalAdminClaim = claims.sub === 'local-admin';
    const isLocalFallbackAllowed = env.firebase.allowLocalFallback && !env.isProductionLike;

    if (isLocalAdminClaim || (!isFirebaseInitialized() && isLocalFallbackAllowed)) {
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
      if (isLocalFallbackAllowed) {
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
      let userRole: UserRole = 'student';
      try {
        const user = await ensureUserDocument(decodedToken.uid, { email, name });
        userRole = isUserRole(decodedToken.role) ? decodedToken.role : normalizeUserRole(user.role);
      } catch {
        // If Firestore is quota-limited or temporarily unreachable,
        // do not reject a cryptographically verified Firebase user!
        userRole = isUserRole(decodedToken.role) ? decodedToken.role : 'student';
      }

      req.user = {
        uid: decodedToken.uid,
        userId: decodedToken.uid,
        email,
        role: userRole,
        normalizedRole: normalizeUserRole(userRole),
      };
      next();
    } catch {
      next(new AppError('Invalid or expired authentication token', 401));
    }
  }
}
