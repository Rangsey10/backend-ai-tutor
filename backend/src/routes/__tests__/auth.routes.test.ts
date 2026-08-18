import request from 'supertest';
import { createApp } from '../../app';
import * as authService from '../../services/auth.service';

jest.mock('../../middlewares/auth', () => ({
  authenticate: (
    req: { user?: unknown },
    _res: unknown,
    next: (error?: unknown) => void
  ) => {
    req.user = {
      uid: 'firebase-user-1',
      userId: 'user-1',
      email: 'student@example.com',
      role: 'student',
      normalizedRole: 'student',
    };
    next();
  },
}));

jest.mock('../../services/auth.service', () => ({
  registerUser: jest.fn(),
  loginUser: jest.fn(),
  rotateRefreshToken: jest.fn(),
  logoutWithRefreshToken: jest.fn(),
  logoutAllSessions: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
  requestEmailVerification: jest.fn(),
  verifyEmail: jest.fn(),
}));

const mockedAuthService = authService as jest.Mocked<typeof authService>;

describe('auth routes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid register payload', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      full_name: 'Student',
      email: 'invalid-email',
      password: 'Password123!',
    });

    expect(response.status).toBe(400);
    expect(mockedAuthService.registerUser).not.toHaveBeenCalled();
  });

  it('registers user with valid payload', async () => {
    mockedAuthService.registerUser.mockResolvedValue({
      user: {
        user_id: 'user-1',
        firebase_uid: 'local:user-1',
        email: 'student@example.com',
        full_name: 'Student',
        role: 'student',
        profile_image_url: null,
        preferred_language: null,
      },
      tokens: {
        access_token: 'access',
        refresh_token: 'refresh',
        expires_in_seconds: 900,
      },
    });

    const response = await request(app).post('/api/v1/auth/register').send({
      full_name: 'Student',
      email: 'student@example.com',
      password: 'Password123!',
      role: 'student',
    });

    expect(response.status).toBe(201);
    expect(mockedAuthService.registerUser).toHaveBeenCalledTimes(1);
  });

  it('rejects refresh request without refresh token', async () => {
    const response = await request(app).post('/api/v1/auth/refresh').send({});

    expect(response.status).toBe(400);
    expect(mockedAuthService.rotateRefreshToken).not.toHaveBeenCalled();
  });

  it('logs out all sessions for authenticated user', async () => {
    mockedAuthService.logoutAllSessions.mockResolvedValue();

    const response = await request(app).post('/api/v1/auth/logout-all').send({});

    expect(response.status).toBe(204);
    expect(mockedAuthService.logoutAllSessions).toHaveBeenCalledWith('user-1');
  });
});
