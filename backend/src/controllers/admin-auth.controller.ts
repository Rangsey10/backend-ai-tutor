import type { Request, Response } from 'express';
import {
  loginAdminWithFirebaseIdToken,
  loginUser,
  logoutWithRefreshToken,
  requestPasswordReset,
  resetPassword,
} from '../services/auth.service';
import { env } from '../config/env';
import { getFirestore, isFirebaseInitialized } from '../config/firebase';
import { userConverter } from '../config/firestore-converters';
import { normalizeUserRole } from '../types/user-role';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendNoContent, sendSuccess } from '../utils/ApiResponse';
import { AppError } from '../utils/AppError';
import { generateOpaqueToken, signAccessToken } from '../utils/auth-tokens';

const localRefreshTokens = new Set<string>();
const localPasswordResetTokens = new Set<string>();
let localAdminEmail = env.devAdmin.email;
let localAdminFullName = env.devAdmin.fullName;
let localAdminPassword = env.devAdmin.password;

function shouldUseLocalAdminAuth(): boolean {
  return !isFirebaseInitialized() && env.firebase.allowLocalFallback && !env.isProductionLike;
}

function buildLocalAdminAuthResponse() {
  const refreshToken = generateOpaqueToken();
  localRefreshTokens.add(refreshToken);

  return {
    user: {
      user_id: 'local-admin',
      firebase_uid: 'local:admin',
      email: localAdminEmail,
      full_name: localAdminFullName,
      role: 'admin' as const,
      profile_image_url: null,
      preferred_language: null,
    },
    tokens: {
      access_token: signAccessToken({
        sub: 'local-admin',
        role: 'admin',
        email: localAdminEmail,
      }),
      refresh_token: refreshToken,
      expires_in_seconds: env.auth.accessTokenTtlMinutes * 60,
    },
  };
}

function extractClientMetadata(req: Request): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: req.ip,
    userAgent: req.header('user-agent'),
  };
}

export const loginAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (shouldUseLocalAdminAuth()) {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    const password = String(req.body.password ?? '');

    if (email !== localAdminEmail.toLowerCase() || password !== localAdminPassword) {
      throw new AppError('Invalid email or password', 401);
    }

    sendSuccess(res, buildLocalAdminAuthResponse(), 'Admin login successful');
    return;
  }

  const { ipAddress, userAgent } = extractClientMetadata(req);
  const data = await loginUser(req.body, ipAddress, userAgent);

  if (normalizeUserRole(data.user.role) !== 'admin') {
    await logoutWithRefreshToken(data.tokens.refresh_token);
    throw new AppError('Admin access is required', 403);
  }

  sendSuccess(res, data, 'Admin login successful');
});

export const loginAdminWithGoogle = asyncHandler(async (req: Request, res: Response) => {
  if (shouldUseLocalAdminAuth()) {
    throw new AppError('Configure Firebase credentials before using Google sign-in', 503);
  }

  const { ipAddress, userAgent } = extractClientMetadata(req);
  const data = await loginAdminWithFirebaseIdToken(req.body.id_token, ipAddress, userAgent);
  sendSuccess(res, data, 'Admin Google login successful');
});

export const registerAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (!shouldUseLocalAdminAuth()) {
    throw new AppError('Admin accounts must be provisioned by an existing admin', 403);
  }

  localAdminEmail = String(req.body.email ?? '').trim().toLowerCase();
  localAdminFullName = String(req.body.full_name ?? '').trim();
  localAdminPassword = String(req.body.password ?? '');
  localRefreshTokens.clear();
  localPasswordResetTokens.clear();

  sendCreated(res, buildLocalAdminAuthResponse(), 'Local admin registered successfully');
});

export const logoutAdmin = asyncHandler(async (req: Request, res: Response) => {
  if (shouldUseLocalAdminAuth()) {
    localRefreshTokens.delete(req.body.refresh_token);
    sendNoContent(res);
    return;
  }

  await logoutWithRefreshToken(req.body.refresh_token);
  sendNoContent(res);
});

export const requestAdminPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  if (shouldUseLocalAdminAuth()) {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    if (email !== localAdminEmail.toLowerCase()) {
      sendSuccess(res, {}, 'If the admin account exists, a reset token has been generated');
      return;
    }

    const resetToken = generateOpaqueToken();
    localPasswordResetTokens.add(resetToken);
    sendSuccess(res, { reset_token: resetToken }, 'If the admin account exists, a reset token has been generated');
    return;
  }

  const data = await requestPasswordReset(req.body.email);
  sendSuccess(res, data, 'If the admin account exists, a reset token has been generated');
});

export const confirmAdminPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  if (shouldUseLocalAdminAuth()) {
    if (!localPasswordResetTokens.has(req.body.token)) {
      throw new AppError('Invalid reset token', 400);
    }

    localPasswordResetTokens.delete(req.body.token);
    localAdminPassword = req.body.password;
    localRefreshTokens.clear();
    sendNoContent(res);
    return;
  }

  await resetPassword(req.body.token, req.body.password);
  sendNoContent(res);
});

export const getAdminSession = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user || normalizeUserRole(req.user.role ?? 'student') !== 'admin') {
    throw new AppError('Admin access is required', 403);
  }

  const userDocument = req.user.userId
    ? await getFirestore().collection('users').withConverter(userConverter).doc(req.user.userId).get()
    : null;
  const user = userDocument?.exists ? userDocument.data() : null;

  sendSuccess(
    res,
    {
      user: {
        user_id: user?.user_id ?? req.user.userId,
        firebase_uid: user?.firebase_uid ?? req.user.uid,
        email: user?.email ?? req.user.email,
        full_name: user?.full_name,
        role: user?.role ?? req.user.role,
        profile_image_url: user?.profile_image_url ?? null,
        preferred_language: user?.preferred_language ?? null,
      },
    },
    'Admin session active'
  );
});
