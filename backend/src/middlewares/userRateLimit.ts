import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

type RateLimitEntry = { count: number; resetAt: number };
const buckets = new Map<string, RateLimitEntry>();

/**
 * Small in-process safety limit for authenticated expensive operations. Deployments
 * with multiple gateway instances should also enforce the equivalent limit at the
 * edge; this remains a safe local and single-instance backstop.
 */
export function userRateLimit(operation: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.user?.uid;
    if (!userId) {
      next(new AppError('Authentication required', 401));
      return;
    }
    const now = Date.now();
    const key = `${operation}:${userId}`;
    const current = buckets.get(key);
    const entry =
      !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    entry.count += 1;
    buckets.set(key, entry);
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));
    if (entry.count > maxRequests) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      next(new AppError('Too many requests. Please try again shortly.', 429, true, 'RATE_LIMITED'));
      return;
    }
    next();
  };
}

export function clearUserRateLimits(): void {
  buckets.clear();
}
