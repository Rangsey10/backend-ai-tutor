import { logger } from './logger';
import { getRedisClient } from '../config/redis';

export interface RateLimitEvaluator {
  eval(script: string, numberOfKeys: number, ...args: string[]): Promise<unknown>;
}

export interface RateLimitStore extends RateLimitEvaluator {
  keys(pattern: string): Promise<string[]>;
  del(...keys: string[]): Promise<number>;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfter: number;
  failedOpen: boolean;
}

export const RATE_LIMIT_LUA_SCRIPT = `
local key = KEYS[1]
local maxRequests = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])

local current = redis.call('INCR', key)
if current == 1 then
    redis.call('PEXPIRE', key, windowMs)
end
local ttl = redis.call('PTTL', key)
if ttl < 0 then
    redis.call('PEXPIRE', key, windowMs)
    ttl = windowMs
end

return {current, ttl}
`;

export async function evaluateRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  operation: string,
  customClient?: RateLimitEvaluator
): Promise<RateLimitResult> {
  const client = customClient !== undefined ? customClient : getRedisClient();

  if (!client) {
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('Redis rate limiter unavailable (client not initialized), failing open', {
        operation,
        key,
      });
    }
    return {
      allowed: true,
      count: 0,
      remaining: maxRequests,
      retryAfter: 0,
      failedOpen: true,
    };
  }

  try {
    const res = await client.eval(
      RATE_LIMIT_LUA_SCRIPT,
      1,
      key,
      String(maxRequests),
      String(windowMs)
    );

    const [current, ttl] = res as [number, number];
    const remaining = Math.max(0, maxRequests - current);
    const retryAfter = Math.max(1, Math.ceil(ttl / 1000));
    const allowed = current <= maxRequests;

    return {
      allowed,
      count: current,
      remaining,
      retryAfter,
      failedOpen: false,
    };
  } catch (error) {
    logger.warn('Redis rate limiter unavailable, failing open', {
      operation,
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      allowed: true,
      count: 0,
      remaining: maxRequests,
      retryAfter: 0,
      failedOpen: true,
    };
  }
}
