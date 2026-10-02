import { closeRedis } from '../config/redis';
import { clearUserRateLimits } from '../middlewares/userRateLimit';
import { clearAuthRateLimits } from '../middlewares/auth-rate-limit';

beforeEach(async () => {
  await clearUserRateLimits();
  await clearAuthRateLimits();
});

afterEach(async () => {
  await clearUserRateLimits();
  await clearAuthRateLimits();
});

// REDIS_ENABLED=false keeps the suite off a real client today, so this is a
// no-op. It stays so that pointing the suite at a live Redis cannot leave a
// socket open and force-exit the worker.
afterAll(async () => {
  await closeRedis();
});

