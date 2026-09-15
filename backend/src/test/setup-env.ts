// Jest loads this before application modules. Keep tests hermetic: do not
// inherit developer credentials, feature flags, or local service addresses.
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.ALLOW_DEVELOPMENT_FALLBACKS = 'false';
process.env.ALLOW_DEMO_AUTHENTICATION = 'false';
process.env.AI_SERVICE_USE_DEV_MOCK = 'false';
process.env.AI_SERVICE_BASE_URL = 'http://localhost:8001';
process.env.VISUAL_TUTOR_INTERNAL_TOKEN = 'test-internal-token';
process.env.CORS_ALLOWED_ORIGINS = 'http://test.local';
process.env.FIREBASE_PROJECT_ID = '';
process.env.FIREBASE_CLIENT_EMAIL = '';
process.env.FIREBASE_PRIVATE_KEY = '';
process.env.FIRESTORE_EMULATOR_HOST = '';
process.env.PORT = '4000';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-not-for-production';
process.env.JWT_ACCESS_TTL_MINUTES = '15';
process.env.JWT_REFRESH_TTL_DAYS = '30';
process.env.AUTH_ACTION_TOKEN_TTL_MINUTES = '30';
process.env.DEV_ADMIN_EMAIL = 'test-admin@example.test';
process.env.DEV_ADMIN_PASSWORD = 'test-only-password';
process.env.DEV_ADMIN_NAME = 'Test Admin';
process.env.SEED_ADMIN_EMAIL = '';
process.env.SEED_ADMIN_NAME = '';
