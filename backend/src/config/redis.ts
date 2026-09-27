import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;
let isInitialized = false;

export function getRedisOptions(): RedisOptions {
  const isTest = process.env.NODE_ENV === 'test';
  const baseOptions: RedisOptions = {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    retryStrategy: (times) => {
      if (isTest) return null;
      return Math.min(times * 100, 2000);
    },
  };

  if (process.env.REDIS_URL) {
    return baseOptions;
  }

  return {
    ...baseOptions,
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
  };
}

export function getRedisClient(): Redis | null {
  if (process.env.REDIS_ENABLED === 'false') {
    return null;
  }

  if (!redisClient && !isInitialized) {
    try {
      if (process.env.REDIS_URL) {
        redisClient = new Redis(process.env.REDIS_URL, getRedisOptions());
      } else {
        redisClient = new Redis(getRedisOptions());
      }
      redisClient.on('error', (err) => {
        logger.warn('Redis client error:', { error: err.message });
      });
    } catch (err) {
      logger.warn('Failed to initialize Redis client:', {
        error: err instanceof Error ? err.message : String(err),
      });
      redisClient = null;
    }
    isInitialized = true;
  }

  return redisClient;
}

export function setRedisClient(client: Redis | null): void {
  redisClient = client;
  isInitialized = true;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
    redisClient = null;
    isInitialized = false;
  }
}
