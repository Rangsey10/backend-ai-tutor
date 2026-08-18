import type { Request, Response } from 'express';
import {
  loginUser,
  logoutAllSessions,
  logoutWithRefreshToken,
  registerUser,
  requestEmailVerification,
  requestPasswordReset,
  resetPassword,
  rotateRefreshToken,
  verifyEmail,
} from '../services/auth.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendNoContent, sendSuccess } from '../utils/ApiResponse';
import { AppError } from '../utils/AppError';

function extractClientMetadata(req: Request): { ipAddress?: string; userAgent?: string } {
  return {
    ipAddress: req.ip,
    userAgent: req.header('user-agent'),
  };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const { ipAddress, userAgent } = extractClientMetadata(req);
  const data = await registerUser(req.body, ipAddress, userAgent);
  sendCreated(res, data, 'User registered successfully');
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { ipAddress, userAgent } = extractClientMetadata(req);
  const data = await loginUser(req.body, ipAddress, userAgent);
  sendSuccess(res, data, 'Login successful');
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { ipAddress, userAgent } = extractClientMetadata(req);
  const data = await rotateRefreshToken(req.body.refresh_token, ipAddress, userAgent);
  sendSuccess(res, data, 'Token refreshed successfully');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await logoutWithRefreshToken(req.body.refresh_token);
  sendNoContent(res);
});

export const logoutAll = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.userId) {
    throw new AppError('Authenticated user id not available for logout-all', 400);
  }
  await logoutAllSessions(req.user!.userId!);
  sendNoContent(res);
});

export const requestPasswordResetToken = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestPasswordReset(req.body.email);
  sendSuccess(res, data, 'If the account exists, a reset token has been generated');
});

export const confirmPasswordReset = asyncHandler(async (req: Request, res: Response) => {
  await resetPassword(req.body.token, req.body.password);
  sendNoContent(res);
});

export const requestVerificationToken = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user?.userId) {
    throw new AppError('Authenticated user id not available for email verification request', 400);
  }
  const data = await requestEmailVerification(req.user!.userId!);
  sendSuccess(res, data, 'Verification token generated');
});

export const confirmEmailVerification = asyncHandler(async (req: Request, res: Response) => {
  await verifyEmail(req.body.token);
  sendNoContent(res);
});
