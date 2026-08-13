import request from 'supertest';
import { createApp } from '../../app';
import { getAuth, isFirebaseInitialized } from '../../config/firebase';
import {
  createCurrentUserProfile,
  getCurrentUserPreferences,
  getCurrentUserProfile,
  updateCurrentUserPreferences,
  updateCurrentUserProfile,
  type UserProfileResponse,
} from '../../services/profile.service';

jest.mock('../../config/firebase', () => ({
  getAuth: jest.fn(),
  isFirebaseInitialized: jest.fn(() => false),
}));

jest.mock('../../services/profile.service', () => ({
  addCurrentUserSubject: jest.fn(),
  createCurrentUserProfile: jest.fn(),
  getCurrentUserPreferences: jest.fn(),
  getCurrentUserProfile: jest.fn(),
  getCurrentUserSubjects: jest.fn(),
  removeCurrentUserSubject: jest.fn(),
  updateCurrentUserPreferences: jest.fn(),
  updateCurrentUserProfile: jest.fn(),
}));

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockedIsFirebaseInitialized = isFirebaseInitialized as jest.MockedFunction<
  typeof isFirebaseInitialized
>;
const mockedGetCurrentUserProfile = getCurrentUserProfile as jest.MockedFunction<
  typeof getCurrentUserProfile
>;
const mockedCreateCurrentUserProfile = createCurrentUserProfile as jest.MockedFunction<
  typeof createCurrentUserProfile
>;
const mockedUpdateCurrentUserProfile = updateCurrentUserProfile as jest.MockedFunction<
  typeof updateCurrentUserProfile
>;
const mockedGetCurrentUserPreferences = getCurrentUserPreferences as jest.MockedFunction<
  typeof getCurrentUserPreferences
>;
const mockedUpdateCurrentUserPreferences = updateCurrentUserPreferences as jest.MockedFunction<
  typeof updateCurrentUserPreferences
>;

const app = createApp();

function mockToken(role = 'student') {
  mockedGetAuth.mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'firebase-uid',
      email: 'student@example.com',
      role,
    }),
  } as never);
}

function authHeader(token = 'valid-token') {
  return { Authorization: `Bearer ${token}` };
}

const profileResponse: UserProfileResponse = {
  student_profile: {
    student_profile_id: 'profile-1',
    user_id: 'firebase-uid',
    grade_level_id: 'grade-10',
    account_status: 'active',
    explanation_level: 'beginner',
    learning_goal: 'Master algebra',
    onboarding_completed: true,
    current_streak: 0,
    longest_streak: 0,
    total_learning_time: 0,
  },
  user: {
    full_name: 'Student One',
    email: 'student@example.com',
    preferred_language: 'en',
  },
  student_subjects: [],
};

describe('student API foundation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsFirebaseInitialized.mockReturnValue(false);
    global.fetch = jest.fn().mockRejectedValue(new Error('AI service unavailable'));
    mockToken();
    mockedGetCurrentUserProfile.mockResolvedValue(profileResponse);
    mockedCreateCurrentUserProfile.mockResolvedValue(profileResponse);
    mockedUpdateCurrentUserProfile.mockResolvedValue({
      ...profileResponse,
      student_profile: {
        ...profileResponse.student_profile,
        learning_goal: 'Prepare for final exam',
      },
    });
    mockedGetCurrentUserPreferences.mockResolvedValue({
      grade_level_id: 'grade-10',
      explanation_level: 'beginner',
      learning_goal: 'Master algebra',
    });
    mockedUpdateCurrentUserPreferences.mockResolvedValue({
      grade_level_id: 'grade-11',
      explanation_level: 'intermediate',
      learning_goal: 'Prepare for final exam',
    });
  });

  it('reports unavailable dependencies without requiring a user token', async () => {
    const response = await request(app).get('/api/v1/health').expect(503);

    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Backend is up and running');
    expect(response.body.status).toBe('unavailable');
    expect(response.body.dependencies.visual_tutor_ai).toBe('unavailable');
  });

  it('rejects missing auth', async () => {
    const response = await request(app).get('/api/v1/profile').expect(401);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('APP_ERROR');
  });

  it('rejects invalid token', async () => {
    mockedGetAuth.mockReturnValue({
      verifyIdToken: jest.fn().mockRejectedValue(new Error('bad token')),
    } as never);

    const response = await request(app)
      .get('/api/v1/profile')
      .set(authHeader('invalid-token'))
      .expect(401);

    expect(response.body.message).toBe('Invalid or expired authentication token');
  });

  it('accepts development demo token for local student demo flow', async () => {
    await request(app).get('/api/v1/profile').set(authHeader('demo-token')).expect(200);

    expect(mockedGetCurrentUserProfile).toHaveBeenCalledWith('demo-student');
  });

  it('rejects non-student role on student routes', async () => {
    mockToken('administrator');

    const response = await request(app)
      .get('/api/v1/profile')
      .set(authHeader())
      .expect(403);

    expect(response.body.message).toBe('You do not have permission to access this resource');
  });

  it('creates reads and updates profile', async () => {
    await request(app).get('/api/v1/profile').set(authHeader()).expect(200);

    expect(mockedGetCurrentUserProfile).toHaveBeenCalledWith('firebase-uid');

    const createResponse = await request(app)
      .post('/api/v1/profile')
      .set(authHeader())
      .send({
        grade_level_id: 'grade-10',
        explanation_level: 'beginner',
        learning_goal: 'Master algebra',
        subject_ids: ['math'],
      })
      .expect(201);

    expect(createResponse.body.data.student_profile.student_profile_id).toBe('profile-1');
    expect(mockedCreateCurrentUserProfile).toHaveBeenCalledWith('firebase-uid', {
      grade_level_id: 'grade-10',
      explanation_level: 'beginner',
      learning_goal: 'Master algebra',
      subject_ids: ['math'],
    });

    const updateResponse = await request(app)
      .patch('/api/v1/profile')
      .set(authHeader())
      .send({ learning_goal: 'Prepare for final exam' })
      .expect(200);

    expect(updateResponse.body.data.student_profile.learning_goal).toBe(
      'Prepare for final exam'
    );
    expect(mockedUpdateCurrentUserProfile).toHaveBeenCalledWith('firebase-uid', {
      learning_goal: 'Prepare for final exam',
    });
  });

  it('saves and reads learning preferences', async () => {
    const readResponse = await request(app)
      .get('/api/v1/profile/preferences')
      .set(authHeader())
      .expect(200);

    expect(readResponse.body.data.learning_goal).toBe('Master algebra');

    const saveResponse = await request(app)
      .put('/api/v1/profile/preferences')
      .set(authHeader())
      .send({
        grade_level_id: 'grade-11',
        explanation_level: 'intermediate',
        learning_goal: 'Prepare for final exam',
      })
      .expect(200);

    expect(saveResponse.body.data.grade_level_id).toBe('grade-11');
    expect(mockedUpdateCurrentUserPreferences).toHaveBeenCalledWith('firebase-uid', {
      grade_level_id: 'grade-11',
      explanation_level: 'intermediate',
      learning_goal: 'Prepare for final exam',
    });
  });

  it('returns subjects and topics catalog data', async () => {
    const subjectsResponse = await request(app)
      .get('/api/v1/catalog/subjects')
      .set(authHeader())
      .expect(200);

    expect(subjectsResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject_id: 'math', subject_name: 'Mathematics' }),
      ])
    );

    const topicsResponse = await request(app)
      .get('/api/v1/catalog/topics')
      .query({ subject_id: 'math', grade_level_id: 'grade-10' })
      .set(authHeader())
      .expect(200);

    expect(topicsResponse.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ topic_name: 'Linear Equations' }),
        expect.objectContaining({ topic_name: 'Equation of a Line' }),
      ])
    );
  });

  it('returns consistent validation errors', async () => {
    const response = await request(app)
      .post('/api/v1/profile')
      .set(authHeader())
      .send({
        grade_level_id: '',
        explanation_level: 'beginner',
        learning_goal: 'Master algebra',
        subject_ids: [],
      })
      .expect(400);

    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe('Request validation failed');
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'grade_level_id' }),
        expect.objectContaining({ path: 'subject_ids' }),
      ])
    );
  });
});
