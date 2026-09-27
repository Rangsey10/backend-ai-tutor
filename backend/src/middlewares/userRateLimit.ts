import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { evaluateRateLimit } from '../utils/rate-limiter';
import { getRedisClient } from '../config/redis';

export interface RateLimitOptions {
  redisClient?: any;
}

/**
 * Redis-backed rate limiter for authenticated operations.
 * State is shared across gateway replicas via Redis.
 * If Redis is unavailable, fails OPEN and logs a warning so students are never locked out.
 */
export function userRateLimit(
  operation: string,
  maxRequests: number,
  windowMs: number,
  options?: RateLimitOptions
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.uid;
    if (!userId) {
      next(new AppError('Authentication required', 401));
      return;
    }

    const key = `ratelimit:user:${operation}:${userId}`;
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

export async function clearUserRateLimits(customClient?: any): Promise<void> {
  const client = customClient !== undefined ? customClient : getRedisClient();
  if (!client) return;
  try {
    const keys = await client.keys('ratelimit:user:*');
    if (keys && keys.length > 0) {
      await client.del(...keys);
    }
  } catch {
    // Fail silently during cleanup if Redis is offline
  }
}
