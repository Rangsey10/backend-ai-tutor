import { z } from 'zod';
import { USER_ROLES } from '../types/user-role';

export const registerRequestSchema = z
  .object({
    full_name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum(USER_ROLES).optional(),
    preferred_language: z.string().min(1).nullable().optional(),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
  })
  .strict();

export const refreshTokenRequestSchema = z
  .object({
    refresh_token: z.string().min(1),
  })
  .strict();

export const logoutRequestSchema = refreshTokenRequestSchema;

export const passwordResetRequestSchema = z
  .object({
    email: z.string().email(),
  })
  .strict();

export const passwordResetConfirmRequestSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8),
  })
  .strict();

export const emailVerificationRequestSchema = z
  .object({
    token: z.string().min(1),
  })
  .strict();
