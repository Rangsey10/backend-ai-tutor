import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const appEnv = process.env.APP_ENV ?? '';
const isDev = nodeEnv === 'development';
const isProductionLike = nodeEnv === 'production' || nodeEnv === 'staging';

export function allowsDevelopmentFallbacks(
  environment: string,
  enabled: boolean,
  applicationEnvironment = environment
): boolean {
  return environment === 'test' || (
    environment === 'development' &&
    applicationEnvironment === 'development' &&
    enabled
  );
}

/**
 * Demo credentials are more sensitive than ordinary local fallbacks because they
 * bypass Firebase verification. Keep them available to test fixtures, or to an
 * explicitly enabled local-development process only; staging must behave like
 * production.
 */
export function allowsDemoAuthentication(
  environment: string,
  enabled: boolean,
  applicationEnvironment = environment
): boolean {
  return environment === 'test' || (
    environment === 'development' &&
    applicationEnvironment === 'development' &&
    enabled
  );
}

const allowDevelopmentFallbacks = allowsDevelopmentFallbacks(
  nodeEnv,
  (process.env.ALLOW_DEVELOPMENT_FALLBACKS ?? 'false').toLowerCase() === 'true',
  appEnv
);
const allowDemoAuthentication = allowsDemoAuthentication(
  nodeEnv,
  (process.env.ALLOW_DEVELOPMENT_FALLBACKS ?? 'false').toLowerCase() === 'true',
  appEnv
);

function parseCorsOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function cleanEnvValue(value: string | undefined): string {
  return (value ?? '').trim().replace(/^["']|["'],?$/g, '');
}

const corsOrigins = parseCorsOrigins(process.env.CORS_ALLOWED_ORIGINS);
if (isProductionLike && (corsOrigins.length === 0 || corsOrigins.includes('*'))) {
  throw new Error('CORS_ALLOWED_ORIGINS must be a non-wildcard allow-list in staging and production');
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv,
  appEnv,
  port: parseInt(process.env.PORT ?? '4000', 10),

  // Firebase Admin SDK
  firebase: {
    projectId: cleanEnvValue(process.env.FIREBASE_PROJECT_ID),
    clientEmail: cleanEnvValue(process.env.FIREBASE_CLIENT_EMAIL),
    privateKey: cleanEnvValue(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n'),
    firestoreEmulatorHost: process.env.FIRESTORE_EMULATOR_HOST ?? '',
    allowLocalFallback: allowDevelopmentFallbacks,
    allowDemoAuthentication,
  },
  auth: {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
    accessTokenTtlMinutes: parseInt(process.env.JWT_ACCESS_TTL_MINUTES ?? '15', 10),
    refreshTokenTtlDays: parseInt(process.env.JWT_REFRESH_TTL_DAYS ?? '30', 10),
    actionTokenTtlMinutes: parseInt(process.env.AUTH_ACTION_TOKEN_TTL_MINUTES ?? '30', 10),
  },
  devAdmin: {
    email: process.env.DEV_ADMIN_EMAIL ?? 'admin@rean.ai',
    password: process.env.DEV_ADMIN_PASSWORD ?? 'Admin12345',
    fullName: process.env.DEV_ADMIN_NAME ?? 'Local Admin',
  },
  seedAdmin: {
    email: cleanEnvValue(process.env.SEED_ADMIN_EMAIL),
    fullName: cleanEnvValue(process.env.SEED_ADMIN_NAME) || 'Admin User',
  },

  aiService: {
    baseUrl: process.env.AI_SERVICE_BASE_URL ?? 'http://localhost:8001',
    visualTutorInternalToken: process.env.VISUAL_TUTOR_INTERNAL_TOKEN ?? '',
    useDevMock:
      allowDevelopmentFallbacks &&
      (process.env.AI_SERVICE_USE_DEV_MOCK ?? 'false').toLowerCase() === 'true',
    allowDevelopmentFallbacks,
  },

  cors: {
    // A missing value means no browser origin is trusted.  Local development
    // must opt in explicitly too, which prevents an accidental wildcard deploy.
    allowedOrigins: corsOrigins,
  },

  isProd: nodeEnv === 'production',
  isProductionLike,
  isDev,
};

if (env.isProductionLike && !env.aiService.visualTutorInternalToken) {
  throw new Error('Missing required environment variable: VISUAL_TUTOR_INTERNAL_TOKEN');
}

if (
  env.isProductionLike &&
  (!env.firebase.projectId || !env.firebase.clientEmail || !env.firebase.privateKey)
) {
  throw new Error(
    'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are required in staging and production'
  );
}

if (env.isProductionLike && env.firebase.firestoreEmulatorHost) {
  throw new Error('FIRESTORE_EMULATOR_HOST is development/test only');
}

export { required };
