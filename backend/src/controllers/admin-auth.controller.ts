import type { Request, Response } from 'express';
import {
  loginAdminWithFirebaseIdToken,
  loginUser,
  logoutWithRefreshToken,
  requestPasswordReset,
  resetPassword,
  rotateRefreshToken,
} from '../services/auth.service';
import { env } from '../config/env';
import { getFirestore, isFirebaseInitialized } from '../config/firebase';
import { userConverter } from '../config/firestore-converters';
import { normalizeUserRole } from '../types/user-role';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendNoContent, sendSuccess } from '../utils/ApiResponse';
import { AppError } from '../utils/AppError';
import { generateOpaqueToken, signAccessToken } from '../utils/auth-tokens';

const ACCESS_COOKIE = 'rean_admin_access';
const REFRESH_COOKIE = 'rean_admin_refresh';
const CSRF_COOKIE = 'rean_admin_csrf';
function setAdminCookies(res: Response, data: { tokens: { access_token: string; refresh_token: string } }) {
  const secure = env.isProductionLike;
  // Production deployment must serve Admin and API through the same origin/BFF.
  // Path `/` lets the Next server-side guard receive the HttpOnly access cookie.
  const base = { secure, sameSite: 'strict' as const, path: '/', httpOnly: true };
  res.cookie(ACCESS_COOKIE, data.tokens.access_token, { ...base, maxAge: env.auth.accessTokenTtlMinutes * 60_000 });
  res.cookie(REFRESH_COOKIE, data.tokens.refresh_token, { ...base, maxAge: env.auth.refreshTokenTtlDays * 86_400_000 });
  res.cookie(CSRF_COOKIE, generateOpaqueToken(24), { secure, sameSite: 'strict', path: '/', httpOnly: false, maxAge: env.auth.refreshTokenTtlDays * 86_400_000 });
}
function publicAuthResponse(data: ReturnType<typeof buildLocalAdminAuthResponse>) { return { user: data.user, expires_in_seconds: data.tokens.expires_in_seconds }; }
function readCookie(req: Request, name: string): string | undefined { return req.header('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1); }

async function recordAdminAuthAudit(req: Request, action: string, actorId?: string): Promise<void> {
  if (!isFirebaseInitialized()) return;
  // Deliberately omit credentials, refresh tokens, reset tokens, and headers.
  try {
    await getFirestore().collection('admin_audit_logs').doc().set({
      actor_id: actorId ?? null,
      action,
      resource_type: 'admin_auth',
      resource_id: actorId ?? null,
      ip_address: req.ip ?? null,
      created_at: new Date(),
    });
  } catch {
    // Authentication must remain available if the audit sink is temporarily
    // unavailable; production monitoring should alert on this condition.
  }
}

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

    const response = buildLocalAdminAuthResponse(); setAdminCookies(res, response); await recordAdminAuthAudit(req, 'admin_auth.login', response.user.user_id); sendSuccess(res, publicAuthResponse(response), 'Admin login successful');
    return;
  }

  const { ipAddress, userAgent } = extractClientMetadata(req);
  const data = await loginUser(req.body, ipAddress, userAgent);

  if (normalizeUserRole(data.user.role) !== 'admin') {
    await logoutWithRefreshToken(data.tokens.refresh_token);
    throw new AppError('Admin access is required', 403);
  }

  setAdminCookies(res, data); await recordAdminAuthAudit(req, 'admin_auth.login', data.user.user_id); sendSuccess(res, { user: data.user, expires_in_seconds: data.tokens.expires_in_seconds }, 'Admin login successful');
});

export const loginAdminWithGoogle = asyncHandler(async (req: Request, res: Response) => {
  if (shouldUseLocalAdminAuth()) {
    throw new AppError('Configure Firebase credentials before using Google sign-in', 503);
  }

  const { ipAddress, userAgent } = extractClientMetadata(req);
  const data = await loginAdminWithFirebaseIdToken(req.body.id_token, ipAddress, userAgent);
  setAdminCookies(res, data); await recordAdminAuthAudit(req, 'admin_auth.google_login', data.user.user_id); sendSuccess(res, { user: data.user, expires_in_seconds: data.tokens.expires_in_seconds }, 'Admin Google login successful');
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

  const response = buildLocalAdminAuthResponse();
  setAdminCookies(res, response);
  await recordAdminAuthAudit(req, 'admin_auth.register', response.user.user_id); sendCreated(res, publicAuthResponse(response), 'Local admin registered successfully');
});

export const logoutAdmin = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = readCookie(req, REFRESH_COOKIE) ?? req.body.refresh_token;
  if (shouldUseLocalAdminAuth()) {
    localRefreshTokens.delete(refreshToken);
    res.clearCookie(ACCESS_COOKIE, { path: '/' }); res.clearCookie(REFRESH_COOKIE, { path: '/' }); res.clearCookie(CSRF_COOKIE, { path: '/' });
    await recordAdminAuthAudit(req, 'admin_auth.logout', 'local-admin'); sendNoContent(res);
    return;
  }

  await logoutWithRefreshToken(refreshToken);
  await recordAdminAuthAudit(req, 'admin_auth.logout');
  res.clearCookie(ACCESS_COOKIE, { path: '/' }); res.clearCookie(REFRESH_COOKIE, { path: '/' }); res.clearCookie(CSRF_COOKIE, { path: '/' });
  sendNoContent(res);
});

export const refreshAdminSession = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = readCookie(req, REFRESH_COOKIE);
  if (!refreshToken) throw new AppError('Admin refresh session not found', 401);
  if (shouldUseLocalAdminAuth()) {
    if (!localRefreshTokens.delete(refreshToken)) throw new AppError('Admin refresh session is expired', 401);
    const data = buildLocalAdminAuthResponse();
    setAdminCookies(res, data);
    await recordAdminAuthAudit(req, 'admin_auth.refresh', data.user.user_id); sendSuccess(res, publicAuthResponse(data), 'Admin session refreshed');
    return;
  }
  const data = await rotateRefreshToken(refreshToken, req.ip, req.header('user-agent'));
  if (normalizeUserRole(data.user.role) !== 'admin') throw new AppError('Admin access is required', 403);
  setAdminCookies(res, data); await recordAdminAuthAudit(req, 'admin_auth.refresh', data.user.user_id); sendSuccess(res, { user: data.user, expires_in_seconds: data.tokens.expires_in_seconds }, 'Admin session refreshed');
});

export const requestAdminPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  if (shouldUseLocalAdminAuth()) {
    const email = String(req.body.email ?? '').trim().toLowerCase();
    if (email !== localAdminEmail.toLowerCase()) {
      await recordAdminAuthAudit(req, 'admin_auth.password_reset_requested'); sendSuccess(res, {}, 'If the admin account exists, a reset token has been generated');
      return;
    }

    const resetToken = generateOpaqueToken();
    localPasswordResetTokens.add(resetToken);
    await recordAdminAuthAudit(req, 'admin_auth.password_reset_requested', 'local-admin'); sendSuccess(res, { reset_token: resetToken }, 'If the admin account exists, a reset token has been generated');
    return;
  }

  const data = await requestPasswordReset(req.body.email);
  await recordAdminAuthAudit(req, 'admin_auth.password_reset_requested'); sendSuccess(res, data, 'If the admin account exists, a reset token has been generated');
});

export const confirmAdminPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  if (shouldUseLocalAdminAuth()) {
    if (!localPasswordResetTokens.has(req.body.token)) {
      throw new AppError('Invalid reset token', 400);
    }

    localPasswordResetTokens.delete(req.body.token);
    localAdminPassword = req.body.password;
    localRefreshTokens.clear();
    await recordAdminAuthAudit(req, 'admin_auth.password_reset_confirmed', 'local-admin'); sendNoContent(res);
    return;
  }

  await resetPassword(req.body.token, req.body.password);
  await recordAdminAuthAudit(req, 'admin_auth.password_reset_confirmed');
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
