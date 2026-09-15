import request from 'supertest';
import { createApp } from '../../app';
import { isFirebaseInitialized } from '../../config/firebase';

jest.mock('../../config/firebase', () => ({
  getAuth: jest.fn(),
  getFirestore: jest.fn(),
  isFirebaseInitialized: jest.fn(),
}));

const mockedIsFirebaseInitialized = isFirebaseInitialized as jest.MockedFunction<
  typeof isFirebaseInitialized
>;
const app = createApp();

describe('backend production readiness', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockedIsFirebaseInitialized.mockReturnValue(true);
  });

  it('reports a healthy backend only when Firestore and the private AI readiness probe are healthy', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'healthy' }),
    } as Response);

    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body).toMatchObject({
      success: true,
      status: 'healthy',
      dependencies: { firebase: 'healthy', visual_tutor_ai: 'healthy' },
    });
    expect(response.body).toHaveProperty('timestamp');
    expect(JSON.stringify(response.body)).not.toContain('visualTutorInternalToken');
  });

  it('keeps the API available but degraded when an optional AI dependency is degraded', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'degraded' }),
    } as Response);

    const response = await request(app).get('/api/v1/health').expect(200);

    expect(response.body.status).toBe('degraded');
    expect(response.body.dependencies).toEqual({
      firebase: 'healthy',
      visual_tutor_ai: 'degraded',
    });
  });
});
