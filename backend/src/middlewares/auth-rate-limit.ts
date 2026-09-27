import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { evaluateRateLimit } from '../utils/rate-limiter';
import { getRedisClient } from '../config/redis';

export interface AuthRateLimitOptions {
  redisClient?: any;
}

/**
 * Authentication endpoints have no authenticated user yet, so limit by the
 * proxied client IP. State is shared across gateway replicas via Redis.
 * If Redis is unavailable, fails OPEN and logs a warning so users are never locked out.
 */
export function authRateLimit(
  operation: string,
  maxRequests: number,
  windowMs: number,
  options?: AuthRateLimitOptions
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip || 'unknown';
    const key = `ratelimit:auth:${operation}:${ip}`;
    const result = await evaluateRateLimit(
      key,
      maxRequests,
      windowMs,
      operation,
      options?.redisClient
    );

    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfter));
      next(new AppError('Too many requests. Please try again shortly.', 429, true, 'RATE_LIMITED'));
      return;
    }

    next();
  };
}

export async function clearAuthRateLimits(customClient?: any): Promise<void> {
  const client = customClient !== undefined ? customClient : getRedisClient();
  if (!client) return;
  try {
    const keys = await client.keys('ratelimit:auth:*');
    if (keys && keys.length > 0) {
      await client.del(...keys);
    }
  } catch {
    // Fail silently during cleanup if Redis is offline
  }
}
