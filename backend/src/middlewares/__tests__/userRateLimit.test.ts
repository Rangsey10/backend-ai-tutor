import type { Request, Response } from 'express';
import { userRateLimit, clearUserRateLimits } from '../userRateLimit';
import { authRateLimit, clearAuthRateLimits } from '../auth-rate-limit';
import { logger } from '../../utils/logger';

function createMockReq(uid?: string, ip = '127.0.0.1'): Request {
  return {
    user: uid ? { uid } : undefined,
    ip,
    headers: {},
  } as unknown as Request;
}

function createMockRes(): { res: Response; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name.toLowerCase()] = value;
      headers[name] = value;
    }),
  } as unknown as Response;
  return { res, headers };
}

describe('Rate Limiter with Redis Shared Store', () => {
  let mockRedisData: Map<string, { value: number; expireAt: number }>;
  let mockRedisClient: any;

  beforeEach(() => {
    mockRedisData = new Map();
    mockRedisClient = {
      status: 'ready',
      async eval(_script: string, _numKeys: number, key: string, _maxRequests: string, windowMsStr: string) {
        const windowMs = parseInt(windowMsStr, 10);
        const now = Date.now();
        const entry = mockRedisData.get(key);
        if (!entry || entry.expireAt <= now) {
          const newEntry = { value: 1, expireAt: now + windowMs };
          mockRedisData.set(key, newEntry);
          return [1, windowMs];
        }
        entry.value += 1;
        const remainingTtl = Math.max(0, entry.expireAt - now);
        return [entry.value, remainingTtl];
      },
      async del(...keys: string[]) {
        let count = 0;
        for (const k of keys) {
          if (mockRedisData.delete(k)) count++;
        }
        return count;
      },
      async keys(_pattern: string) {
        return Array.from(mockRedisData.keys());
      },
      on: jest.fn(),
    };
  });

  afterEach(async () => {
    await clearUserRateLimits();
    await clearAuthRateLimits();
  });

  it('proves two independently constructed rate-limiter instances share one budget', async () => {
    // Construct two independent rate-limiter instances for the same operation
    // Both are configured with maxRequests = 2 in a 60-second window
    const limiterInstance1 = userRateLimit('turn-operation', 2, 60_000, { redisClient: mockRedisClient });
    const limiterInstance2 = userRateLimit('turn-operation', 2, 60_000, { redisClient: mockRedisClient });

    const reqUser = createMockReq('user-shared-budget');

    // 1. Request 1 handled by Instance 1 -> Allowed
    const res1 = createMockRes();
    const next1 = jest.fn();
    await limiterInstance1(reqUser, res1.res, next1);
    expect(next1).toHaveBeenCalledWith();
    expect(res1.headers['x-ratelimit-remaining']).toBe('1');

    // 2. Request 2 handled by Instance 2 -> Allowed (remaining goes to 0)
    const res2 = createMockRes();
    const next2 = jest.fn();
    await limiterInstance2(reqUser, res2.res, next2);
    expect(next2).toHaveBeenCalledWith();
    expect(res2.headers['x-ratelimit-remaining']).toBe('0');

    // 3. Request 3 handled by Instance 1 -> Exceeded budget! (Rejected with 429)
    const res3 = createMockRes();
    const next3 = jest.fn();
    await limiterInstance1(reqUser, res3.res, next3);
    expect(next3).toHaveBeenCalledTimes(1);
    const err3 = next3.mock.calls[0][0];
    expect(err3).toBeDefined();
    expect(err3.statusCode).toBe(429);
    expect(err3.code).toBe('RATE_LIMITED');

    // 4. Request 4 handled by Instance 2 -> Also rejected with 429!
    const res4 = createMockRes();
    const next4 = jest.fn();
    await limiterInstance2(reqUser, res4.res, next4);
    expect(next4).toHaveBeenCalledTimes(1);
    const err4 = next4.mock.calls[0][0];
    expect(err4).toBeDefined();
    expect(err4.statusCode).toBe(429);
  });

  it('fails OPEN when Redis is unavailable, logs a warning, and preserves headers', async () => {
    const failingRedisClient = {
      status: 'ready',
      async eval() {
        throw new Error('ECONNREFUSED: Connection to Redis failed');
      },
      on: jest.fn(),
    };

    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    const limiter = userRateLimit('failing-op', 2, 60_000, { redisClient: failingRedisClient });
    const req = createMockReq('user-fail-open');
    const { res, headers } = createMockRes();
    const next = jest.fn();

    // Must not throw or block the student
    await limiter(req, res, next);

    expect(next).toHaveBeenCalledWith(); // Failed OPEN!
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Redis rate limiter unavailable'),
      expect.anything()
    );
    expect(headers['x-ratelimit-limit']).toBe('2');
    expect(headers['x-ratelimit-remaining']).toBe('2');

    warnSpy.mockRestore();
  });

  it('proves two independently constructed auth-rate-limiter instances share one budget', async () => {
    const authLimiter1 = authRateLimit('admin-login', 2, 60_000, { redisClient: mockRedisClient });
    const authLimiter2 = authRateLimit('admin-login', 2, 60_000, { redisClient: mockRedisClient });

    const reqIp = createMockReq(undefined, '192.168.1.50');

    // Request 1 via Instance 1 -> Allowed
    const res1 = createMockRes();
    const next1 = jest.fn();
    await authLimiter1(reqIp, res1.res, next1);
    expect(next1).toHaveBeenCalledWith();
    expect(res1.headers['x-ratelimit-remaining']).toBe('1');

    // Request 2 via Instance 2 -> Allowed
    const res2 = createMockRes();
    const next2 = jest.fn();
    await authLimiter2(reqIp, res2.res, next2);
    expect(next2).toHaveBeenCalledWith();
    expect(res2.headers['x-ratelimit-remaining']).toBe('0');

    // Request 3 via Instance 1 -> Exceeded budget (429)!
    const res3 = createMockRes();
    const next3 = jest.fn();
    await authLimiter1(reqIp, res3.res, next3);
    const err3 = next3.mock.calls[0][0];
    expect(err3).toBeDefined();
    expect(err3.statusCode).toBe(429);
  });

  it('clears rate limits correctly using clearUserRateLimits and clearAuthRateLimits', async () => {
    const limiter = userRateLimit('clear-test', 2, 60_000, { redisClient: mockRedisClient });
    const req = createMockReq('user-clear');

    // Run 2 requests to exhaust limit
    await limiter(req, createMockRes().res, jest.fn());
    await limiter(req, createMockRes().res, jest.fn());

    // 3rd request should be blocked
    const nextBlocked = jest.fn();
    await limiter(req, createMockRes().res, nextBlocked);
    expect(nextBlocked.mock.calls[0][0]?.statusCode).toBe(429);

    // Clear rate limits
    await clearUserRateLimits(mockRedisClient);

    // After clearing, next request should be allowed again!
    const nextAllowed = jest.fn();
    const resAllowed = createMockRes();
    await limiter(req, resAllowed.res, nextAllowed);
    expect(nextAllowed).toHaveBeenCalledWith();
    expect(resAllowed.headers['x-ratelimit-remaining']).toBe('1');
  });

  it('requires authentication for userRateLimit', async () => {
    const limiter = userRateLimit('auth-required', 5, 60_000, { redisClient: mockRedisClient });
    const req = createMockReq(undefined); // No uid
    const { res } = createMockRes();
    const next = jest.fn();

    await limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]?.statusCode).toBe(401);
  });
});
