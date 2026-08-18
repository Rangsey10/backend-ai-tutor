import bcrypt from 'bcryptjs';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase';
import { env } from '../config/env';
import {
  authActionTokenConverter,
  authCredentialConverter,
  refreshTokenConverter,
  userConverter,
} from '../config/firestore-converters';
import type { AuthActionTokenPurpose } from '../models/auth-action-tokens.model';
import type { AuthCredential } from '../models/auth-credentials.model';
import type { RefreshTokenRecord } from '../models/refresh-tokens.model';
import type { User } from '../models/users.model';
import type { UserRole } from '../types/user-role';
import { AppError } from '../utils/AppError';
import { generateOpaqueToken, hashToken, signAccessToken } from '../utils/auth-tokens';

type AuthTokensResponse = {
  access_token: string;
  refresh_token: string;
  expires_in_seconds: number;
};

type AuthUserResponse = Pick<
  User,
  'user_id' | 'firebase_uid' | 'email' | 'full_name' | 'role' | 'profile_image_url' | 'preferred_language'
>;

type RegisterPayload = {
  full_name: string;
  email: string;
  password: string;
  role?: UserRole;
  preferred_language?: string | null;
};

type LoginPayload = {
  email: string;
  password: string;
};

type AuthSuccessResponse = {
  user: AuthUserResponse;
  tokens: AuthTokensResponse;
};

const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MINUTES = 15;

function db(): Firestore {
  return getFirestore();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findUserByEmail(email: string): Promise<User | null> {
  const snapshot = await db()
    .collection('users')
    .withConverter(userConverter)
    .where('email', '==', normalizeEmail(email))
    .limit(1)
    .get();

  return snapshot.empty ? null : snapshot.docs[0].data();
}

async function requireUserByEmail(email: string): Promise<User> {
  const user = await findUserByEmail(email);
  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }
  return user;
}

async function requireCredential(userId: string): Promise<AuthCredential> {
  const credential = await db()
    .collection('auth_credentials')
    .withConverter(authCredentialConverter)
    .doc(userId)
    .get();

  if (!credential.exists) {
    throw new AppError('Authentication credentials are not configured for this account', 401);
  }

  return credential.data()!;
}

async function createRefreshToken(
  userId: string,
  ipAddress?: string,
  userAgent?: string
): Promise<string> {
  const refreshToken = generateOpaqueToken();
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + env.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000
  );
  const refreshTokenRef = db().collection('refresh_tokens').withConverter(refreshTokenConverter).doc();

  const refreshTokenRecord: RefreshTokenRecord = {
    refresh_token_id: refreshTokenRef.id,
    user_id: userId,
    token_hash: hashToken(refreshToken),
    created_at: now,
    expires_at: expiresAt,
    revoked_at: null,
    replaced_by_token_id: null,
    ip_address: ipAddress ?? null,
    user_agent: userAgent ?? null,
  };

  await refreshTokenRef.set(refreshTokenRecord);
  return refreshToken;
}

async function buildAuthSuccessResponse(
  user: User,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthSuccessResponse> {
  const accessToken = signAccessToken({
    sub: user.user_id,
    role: user.role,
    email: user.email,
  });

  const refreshToken = await createRefreshToken(user.user_id, ipAddress, userAgent);

  return {
    user: {
      user_id: user.user_id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      profile_image_url: user.profile_image_url,
      preferred_language: user.preferred_language,
    },
    tokens: {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in_seconds: env.auth.accessTokenTtlMinutes * 60,
    },
  };
}

async function createAuthActionToken(userId: string, purpose: AuthActionTokenPurpose): Promise<string> {
  const token = generateOpaqueToken();
  const now = Timestamp.now();
  const tokenRef = db().collection('auth_action_tokens').withConverter(authActionTokenConverter).doc();

  await tokenRef.set({
    auth_action_token_id: tokenRef.id,
    user_id: userId,
    purpose,
    token_hash: hashToken(token),
    created_at: now,
    expires_at: Timestamp.fromMillis(now.toMillis() + env.auth.actionTokenTtlMinutes * 60 * 1000),
    consumed_at: null,
  });

  return token;
}

export async function registerUser(
  payload: RegisterPayload,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthSuccessResponse & { email_verification_token?: string }> {
  const normalizedEmail = normalizeEmail(payload.email);
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new AppError('Email already registered', 409);
  }

  const usersRef = db().collection('users').withConverter(userConverter).doc();
  const now = Timestamp.now();
  const role = payload.role ?? 'student';
  const passwordHash = await bcrypt.hash(payload.password, 12);
  const user: User = {
    user_id: usersRef.id,
    firebase_uid: `local:${usersRef.id}`,
    full_name: payload.full_name.trim(),
    email: normalizedEmail,
    role,
    profile_image_url: null,
    account_status: 'active',
    preferred_language: payload.preferred_language ?? null,
    created_at: now,
  };

  const credential: AuthCredential = {
    auth_credential_id: usersRef.id,
    user_id: usersRef.id,
    email: normalizedEmail,
    password_hash: passwordHash,
    email_verified: false,
    failed_login_attempts: 0,
    locked_until: null,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  };

  await db().runTransaction(async (transaction) => {
    transaction.set(usersRef, user);
    transaction.set(
      db().collection('auth_credentials').withConverter(authCredentialConverter).doc(usersRef.id),
      credential
    );
  });

  const authResponse = await buildAuthSuccessResponse(user, ipAddress, userAgent);
  const verificationToken = await createAuthActionToken(user.user_id, 'email_verification');

  return {
    ...authResponse,
    ...(env.isDev && { email_verification_token: verificationToken }),
  };
}

export async function loginUser(
  payload: LoginPayload,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthSuccessResponse> {
  const user = await requireUserByEmail(payload.email);
  const credential = await requireCredential(user.user_id);
  const now = Timestamp.now();

  if (credential.locked_until && credential.locked_until.toMillis() > now.toMillis()) {
    throw new AppError('Account is temporarily locked due to repeated failed logins', 423);
  }

  const isValidPassword = await bcrypt.compare(payload.password, credential.password_hash);

  if (!isValidPassword) {
    const failedAttempts = credential.failed_login_attempts + 1;
    await db()
      .collection('auth_credentials')
      .withConverter(authCredentialConverter)
      .doc(user.user_id)
      .update({
        failed_login_attempts: failedAttempts,
        locked_until:
          failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS
            ? Timestamp.fromMillis(now.toMillis() + LOGIN_LOCK_MINUTES * 60 * 1000)
            : null,
        updated_at: now,
      });

    throw new AppError('Invalid email or password', 401);
  }

  await db()
    .collection('auth_credentials')
    .withConverter(authCredentialConverter)
    .doc(user.user_id)
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: now,
      updated_at: now,
    });

  return buildAuthSuccessResponse(user, ipAddress, userAgent);
}

export async function rotateRefreshToken(
  refreshToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<AuthSuccessResponse> {
  const tokenHash = hashToken(refreshToken);
  const tokenSnapshot = await db()
    .collection('refresh_tokens')
    .withConverter(refreshTokenConverter)
    .where('token_hash', '==', tokenHash)
    .limit(1)
    .get();

  if (tokenSnapshot.empty) {
    throw new AppError('Invalid refresh token', 401);
  }

  const tokenDocument = tokenSnapshot.docs[0];
  const tokenRecord = tokenDocument.data();
  const now = Timestamp.now();

  if (tokenRecord.revoked_at) {
    throw new AppError('Refresh token has been revoked', 401);
  }

  if (tokenRecord.expires_at.toMillis() <= now.toMillis()) {
    throw new AppError('Refresh token has expired', 401);
  }

  const userSnapshot = await db().collection('users').withConverter(userConverter).doc(tokenRecord.user_id).get();

  if (!userSnapshot.exists) {
    throw new AppError('User account not found for token', 401);
  }

  const user = userSnapshot.data()!;
  const newRefreshToken = generateOpaqueToken();
  const newRefreshTokenRef = db().collection('refresh_tokens').withConverter(refreshTokenConverter).doc();

  await db().runTransaction(async (transaction) => {
    transaction.update(tokenDocument.ref, {
      revoked_at: now,
      replaced_by_token_id: newRefreshTokenRef.id,
    });

    transaction.set(newRefreshTokenRef, {
      refresh_token_id: newRefreshTokenRef.id,
      user_id: user.user_id,
      token_hash: hashToken(newRefreshToken),
      created_at: now,
      expires_at: Timestamp.fromMillis(now.toMillis() + env.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000),
      revoked_at: null,
      replaced_by_token_id: null,
      ip_address: ipAddress ?? null,
      user_agent: userAgent ?? null,
    });
  });

  return {
    user: {
      user_id: user.user_id,
      firebase_uid: user.firebase_uid,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      profile_image_url: user.profile_image_url,
      preferred_language: user.preferred_language,
    },
    tokens: {
      access_token: signAccessToken({
        sub: user.user_id,
        role: user.role,
        email: user.email,
      }),
      refresh_token: newRefreshToken,
      expires_in_seconds: env.auth.accessTokenTtlMinutes * 60,
    },
  };
}

export async function logoutWithRefreshToken(refreshToken: string): Promise<void> {
  const tokenHash = hashToken(refreshToken);
  const tokenSnapshot = await db()
    .collection('refresh_tokens')
    .withConverter(refreshTokenConverter)
    .where('token_hash', '==', tokenHash)
    .limit(1)
    .get();

  if (tokenSnapshot.empty) {
    throw new AppError('Refresh token not found', 404);
  }

  const tokenDocument = tokenSnapshot.docs[0];
  const tokenRecord = tokenDocument.data();

  if (tokenRecord.revoked_at) {
    return;
  }

  await tokenDocument.ref.update({ revoked_at: Timestamp.now() });
}

export async function logoutAllSessions(userId: string): Promise<void> {
  const tokenSnapshot = await db()
    .collection('refresh_tokens')
    .withConverter(refreshTokenConverter)
    .where('user_id', '==', userId)
    .get();

  const now = Timestamp.now();
  await Promise.all(
    tokenSnapshot.docs
      .filter((doc) => !doc.data().revoked_at)
      .map((doc) => doc.ref.update({ revoked_at: now }))
  );
}

export async function requestPasswordReset(email: string): Promise<{ reset_token?: string }> {
  const user = await findUserByEmail(email);

  if (!user) {
    return {};
  }

  const resetToken = await createAuthActionToken(user.user_id, 'password_reset');
  return env.isDev ? { reset_token: resetToken } : {};
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(token);
  const tokenSnapshot = await db()
    .collection('auth_action_tokens')
    .withConverter(authActionTokenConverter)
    .where('token_hash', '==', tokenHash)
    .where('purpose', '==', 'password_reset')
    .limit(1)
    .get();

  if (tokenSnapshot.empty) {
    throw new AppError('Invalid reset token', 400);
  }

  const tokenDoc = tokenSnapshot.docs[0];
  const tokenRecord = tokenDoc.data();
  const now = Timestamp.now();

  if (tokenRecord.consumed_at) {
    throw new AppError('Reset token has already been used', 400);
  }

  if (tokenRecord.expires_at.toMillis() <= now.toMillis()) {
    throw new AppError('Reset token has expired', 400);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db().runTransaction(async (transaction) => {
    transaction.update(
      db().collection('auth_credentials').withConverter(authCredentialConverter).doc(tokenRecord.user_id),
      {
        password_hash: passwordHash,
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: now,
      }
    );
    transaction.update(tokenDoc.ref, { consumed_at: now });
  });
}

export async function requestEmailVerification(userId: string): Promise<{ verification_token?: string }> {
  const token = await createAuthActionToken(userId, 'email_verification');
  return env.isDev ? { verification_token: token } : {};
}

export async function verifyEmail(token: string): Promise<void> {
  const tokenHash = hashToken(token);
  const tokenSnapshot = await db()
    .collection('auth_action_tokens')
    .withConverter(authActionTokenConverter)
    .where('token_hash', '==', tokenHash)
    .where('purpose', '==', 'email_verification')
    .limit(1)
    .get();

  if (tokenSnapshot.empty) {
    throw new AppError('Invalid verification token', 400);
  }

  const tokenDoc = tokenSnapshot.docs[0];
  const tokenRecord = tokenDoc.data();
  const now = Timestamp.now();

  if (tokenRecord.consumed_at) {
    throw new AppError('Verification token has already been used', 400);
  }

  if (tokenRecord.expires_at.toMillis() <= now.toMillis()) {
    throw new AppError('Verification token has expired', 400);
  }

  await db().runTransaction(async (transaction) => {
    transaction.update(
      db().collection('auth_credentials').withConverter(authCredentialConverter).doc(tokenRecord.user_id),
      {
        email_verified: true,
        updated_at: now,
      }
    );
    transaction.update(tokenDoc.ref, { consumed_at: now });
  });
}
