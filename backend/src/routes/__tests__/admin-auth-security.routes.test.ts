import request from 'supertest';
import { createApp } from '../../app';
import { getFirestore, isFirebaseInitialized } from '../../config/firebase';
import * as authService from '../../services/auth.service';
import { AppError } from '../../utils/AppError';
import { signAccessToken } from '../../utils/auth-tokens';
import { logger } from '../../utils/logger';

jest.mock('../../config/firebase', () => ({
  getAuth: jest.fn(),
  getFirestore: jest.fn(),
  isFirebaseInitialized: jest.fn(() => true),
}));

jest.mock('../../services/auth.service', () => ({
  loginAdminWithFirebaseIdToken: jest.fn(),
  loginUser: jest.fn(),
  logoutWithRefreshToken: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
  rotateRefreshToken: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
  },
}));

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;
const mockedIsFirebaseInitialized = isFirebaseInitialized as jest.MockedFunction<
  typeof isFirebaseInitialized
>;
const mockedAuthService = authService as jest.Mocked<typeof authService>;
const mockedLogger = logger as jest.Mocked<typeof logger>;
const app = createApp();

const adminAuthResponse = {
  user: {
    user_id: 'admin-1',
    firebase_uid: 'firebase-admin-1',
    email: 'admin@example.com',
    full_name: 'Admin User',
    role: 'admin' as const,
    profile_image_url: null,
    preferred_language: null,
  },
  tokens: {
    access_token: 'access-token-that-must-stay-in-a-cookie',
    refresh_token: 'refresh-token-that-must-stay-in-a-cookie',
    expires_in_seconds: 900,
  },
};

function localAccessCookie(role: 'admin' | 'administrator' | 'student'): string {
  return `rean_admin_access=${signAccessToken({
    sub: `${role}-1`,
    role,
    email: `${role}@example.com`,
  })}`;
}

describe('Admin cookie authentication security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsFirebaseInitialized.mockReturnValue(false);
    mockedGetFirestore.mockReturnValue({
      collection: jest.fn(() => ({
        withConverter: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn(async () => ({ exists: false, data: () => null })),
          })),
        })),
      })),
    } as never);
  });

  it('rejects unauthenticated access to an Admin route before the route handler', async () => {
    await request(app).get('/api/v1/admin/curriculum/grades').expect(401);
  });

  it('rejects a student cookie on an Admin-only endpoint', async () => {
    await request(app)
      .get('/api/v1/admin/curriculum/grades')
      .set('Cookie', localAccessCookie('student'))
      .expect(403);
  });

  it('accepts the administrator alias through the server-side Admin authorization gate', async () => {
    const response = await request(app)
      .get('/api/v1/admin/auth/me')
      .set('Cookie', localAccessCookie('administrator'))
      .expect(200);

    expect(response.body.data.user.role).toBe('administrator');
  });

  it('rejects an unsafe Admin request without a matching CSRF header', async () => {
    await request(app)
      .post('/api/v1/admin/curriculum/grades')
      .set('Cookie', `${localAccessCookie('admin')}; rean_admin_csrf=csrf-value`)
      .send({ grade_number: 10, grade_name: 'Grade 10' })
      .expect(403);
  });

  it('stores login tokens only in secure cookie transport, never in JSON', async () => {
    mockedIsFirebaseInitialized.mockReturnValue(true);
    mockedAuthService.loginUser.mockResolvedValue(adminAuthResponse);

    const response = await request(app)
      .post('/api/v1/admin/auth/login')
      .send({ email: 'admin@example.com', password: 'Password123!' })
      .expect(200);

    const setCookie = response.headers['set-cookie'] as string[];
    expect(setCookie).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^rean_admin_access=.*HttpOnly/i),
        expect.stringMatching(/^rean_admin_refresh=.*HttpOnly/i),
        expect.stringMatching(/^rean_admin_csrf=/i),
      ])
    );
    expect(response.body.data).not.toHaveProperty('tokens');
    expect(JSON.stringify(response.body)).not.toContain(adminAuthResponse.tokens.access_token);
    expect(JSON.stringify(response.body)).not.toContain(adminAuthResponse.tokens.refresh_token);
  });

  it('rotates a refresh cookie silently and rejects expired or replayed refresh sessions', async () => {
    mockedIsFirebaseInitialized.mockReturnValue(true);
    mockedAuthService.rotateRefreshToken.mockResolvedValue({
      ...adminAuthResponse,
      tokens: {
        ...adminAuthResponse.tokens,
        access_token: 'rotated-access-token',
        refresh_token: 'rotated-refresh-token',
      },
    });

    const response = await request(app)
      .post('/api/v1/admin/auth/refresh')
      .set('Cookie', 'rean_admin_refresh=old-refresh; rean_admin_csrf=csrf-value')
      .set('X-CSRF-Token', 'csrf-value')
      .expect(200);

    expect(mockedAuthService.rotateRefreshToken).toHaveBeenCalledWith(
      'old-refresh',
      expect.anything(),
      undefined
    );
    expect(response.body.data).not.toHaveProperty('tokens');
    expect(JSON.stringify(response.body)).not.toContain('rotated-access-token');
    expect(JSON.stringify(response.body)).not.toContain('rotated-refresh-token');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringMatching(/^rean_admin_refresh=rotated-refresh-token;.*HttpOnly/i)])
    );

    mockedAuthService.rotateRefreshToken.mockRejectedValue(
      new AppError('Refresh token has expired', 401)
    );
    const expired = await request(app)
      .post('/api/v1/admin/auth/refresh')
      .set('Cookie', 'rean_admin_refresh=expired-refresh; rean_admin_csrf=csrf-value')
      .set('X-CSRF-Token', 'csrf-value')
      .expect(401);

    expect(JSON.stringify(expired.body)).not.toContain('expired-refresh');
    expect(JSON.stringify(expired.body)).not.toContain('rotated-refresh-token');
    expect(JSON.stringify(mockedLogger.error.mock.calls)).not.toContain('expired-refresh');
    expect(JSON.stringify(mockedLogger.info.mock.calls)).not.toContain('expired-refresh');
  });

  it('rejects an untrusted browser Origin instead of granting CORS credentials', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'https://untrusted.example');

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers['access-control-allow-origin']).not.toBe('https://untrusted.example');
  });
});
