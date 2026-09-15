import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError';

type Entry = { count: number; resetAt: number };
const buckets = new Map<string, Entry>();

/**
 * Authentication endpoints have no authenticated user yet, so limit by the
 * proxied client IP.  Production deployments must also enforce this at the
 * edge/shared rate-limit store; this is the application backstop.
 */
export function authRateLimit(operation: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = `${operation}:${req.ip || 'unknown'}`;
    const existing = buckets.get(key);
    const entry = !existing || existing.resetAt <= now ? { count: 0, resetAt: now + windowMs } : existing;
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
