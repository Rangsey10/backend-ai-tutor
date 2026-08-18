import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { UserRole } from '../types/user-role';

type AccessTokenClaims = {
  sub: string;
  role: UserRole;
  email: string;
};

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.auth.jwtAccessSecret, {
    expiresIn: `${env.auth.accessTokenTtlMinutes}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, env.auth.jwtAccessSecret) as AccessTokenClaims;
}

export function generateOpaqueToken(byteLength = 48): string {
  return crypto.randomBytes(byteLength).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
