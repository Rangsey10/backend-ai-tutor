import request from 'supertest';
import { createApp } from '../../app';
import { getAuth } from '../../config/firebase';
import {
  getDashboardSummary,
  getRecentActivity,
  getWeakTopicSummary,
  storeLessonCompletion,
  storeQuizAttemptSummary,
  storeStudentAnswerEvent,
  storeTutorSessionSummary,
} from '../../services/progress.service';
import { assertTutorSessionOwnership } from '../../services/tutor.service';
import { assertQuizAttemptOwnership } from '../../services/quiz.service';
import { AppError } from '../../utils/AppError';

jest.mock('../../config/firebase', () => ({
  getAuth: jest.fn(),
}));

jest.mock('../../services/progress.service', () => ({
  getDashboardSummary: jest.fn(),
  getRecentActivity: jest.fn(),
  getWeakTopicSummary: jest.fn(),
  storeLessonCompletion: jest.fn(),
  storeQuizAttemptSummary: jest.fn(),
  storeStudentAnswerEvent: jest.fn(),
  storeTutorSessionSummary: jest.fn(),
}));
jest.mock('../../services/tutor.service', () => ({
  assertTutorSessionOwnership: jest.fn(),
}));
jest.mock('../../services/quiz.service', () => ({
  assertQuizAttemptOwnership: jest.fn(),
}));

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockedAssertTutorSessionOwnership = assertTutorSessionOwnership as jest.MockedFunction<
  typeof assertTutorSessionOwnership
>;
const mockedAssertQuizAttemptOwnership = assertQuizAttemptOwnership as jest.MockedFunction<
  typeof assertQuizAttemptOwnership
>;
const mockedStoreTutorSessionSummary = storeTutorSessionSummary as jest.MockedFunction<
  typeof storeTutorSessionSummary
>;
const mockedStoreLessonCompletion = storeLessonCompletion as jest.MockedFunction<
  typeof storeLessonCompletion
>;
const mockedStoreStudentAnswerEvent = storeStudentAnswerEvent as jest.MockedFunction<
  typeof storeStudentAnswerEvent
>;
const mockedStoreQuizAttemptSummary = storeQuizAttemptSummary as jest.MockedFunction<
  typeof storeQuizAttemptSummary
>;
const mockedGetDashboardSummary = getDashboardSummary as jest.MockedFunction<
  typeof getDashboardSummary
>;
const mockedGetRecentActivity = getRecentActivity as jest.MockedFunction<typeof getRecentActivity>;
const mockedGetWeakTopicSummary = getWeakTopicSummary as jest.MockedFunction<
  typeof getWeakTopicSummary
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

describe('student progress API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToken();
    mockedAssertTutorSessionOwnership.mockResolvedValue(undefined);
    mockedAssertQuizAttemptOwnership.mockResolvedValue(undefined);
    mockedStoreTutorSessionSummary.mockResolvedValue({
      id: 'event-1',
      event_type: 'tutor_session_summary',
      status: 'recorded',
      created_at: '2026-07-27T00:00:00.000Z',
    });
    mockedStoreLessonCompletion.mockResolvedValue({
      id: 'event-2',
      event_type: 'lesson_completion',
      status: 'recorded',
      created_at: '2026-07-27T00:00:00.000Z',
    });
    mockedStoreStudentAnswerEvent.mockResolvedValue({
      id: 'event-3',
      event_type: 'student_answer',
      status: 'recorded',
      created_at: '2026-07-27T00:00:00.000Z',
    });
    mockedStoreQuizAttemptSummary.mockResolvedValue({
      id: 'event-4',
      event_type: 'quiz_attempt_summary',
      status: 'recorded',
      created_at: '2026-07-27T00:00:00.000Z',
    });
    mockedGetDashboardSummary.mockResolvedValue({
      user_id: 'firebase-uid',
      learner: {
        display_name: 'Dara',
        grade_label: 'Grade 11',
        subjects: [{ subject_id: 'physics', subject_name: 'Physics' }],
        learning_goal: null,
      },
      total_sessions: 1,
      lessons_completed: 1,
      quiz_attempts: 1,
      average_quiz_score: 80,
      correct_answers: 2,
      incorrect_answers: 1,
      current_streak: 0,
      resume_lesson: null,
      weak_topic: {
        topic_id: null,
        confidence: 'none',
        reason: 'Not enough answer history yet.',
      },
      practice_recommendations: [],
      completed_practice: 1,
      recent_activity: [],
      subject_progress: [
        {
          subject_id: 'math',
          topic_id: 'linear-equations',
          progress_percent: 80,
          correct_answers: 2,
          total_answers: 3,
          lessons_completed: 1,
          quiz_attempts: 1,
          average_quiz_score: 80,
          evidence_count: 2,
          readiness: null,
        },
      ],
      persistence: { mode: 'local_memory', durable: false },
      empty_state: false,
    });
    mockedGetRecentActivity.mockResolvedValue([]);
    mockedGetWeakTopicSummary.mockResolvedValue({
      topic_id: null,
      confidence: 'none',
      reason: 'Not enough answer history yet.',
    });
  });

  it('stores a tutor session summary progress event', async () => {
    const response = await request(app)
      .post('/api/v1/progress/tutor-sessions')
      .set(authHeader())
      .send({
        tutor_session_id: 'session-1',
        subject_id: 'math',
        topic_id: 'linear-equations',
        original_question: '2x + 5 = 15',
      })
      .expect(201);

    expect(response.body.data.status).toBe('recorded');
    expect(mockedStoreTutorSessionSummary).toHaveBeenCalledWith('firebase-uid', {
      tutor_session_id: 'session-1',
      subject_id: 'math',
      topic_id: 'linear-equations',
      original_question: '2x + 5 = 15',
      status: 'active',
      metadata: {},
    });
  });

  it('stores lesson completion', async () => {
    await request(app)
      .post('/api/v1/progress/lessons/complete')
      .set(authHeader())
      .send({
        tutor_session_id: 'session-1',
        topic_id: 'linear-equations',
      })
      .expect(201);

    expect(mockedStoreLessonCompletion).toHaveBeenCalledWith('firebase-uid', {
      tutor_session_id: 'session-1',
      topic_id: 'linear-equations',
      completion_status: 'completed',
      metadata: {},
    });
  });

  it('stores student answer and quiz attempt summaries', async () => {
    await request(app)
      .post('/api/v1/progress/answers')
      .set(authHeader())
      .send({
        tutor_session_id: 'session-1',
        tutor_turn_id: 'turn-1',
        topic_id: 'linear-equations',
        submitted_answer: '2x = 10',
        is_correct: true,
        score: 1,
      })
      .expect(201);

    expect(mockedStoreStudentAnswerEvent).toHaveBeenCalledWith('firebase-uid', {
      tutor_session_id: 'session-1',
      tutor_turn_id: 'turn-1',
      topic_id: 'linear-equations',
      submitted_answer: '2x = 10',
      answer_format: 'text',
      is_correct: true,
      is_partially_correct: false,
      score: 1,
      metadata: {},
    });

    await request(app)
      .post('/api/v1/progress/quiz-attempts')
      .set(authHeader())
      .send({
        quiz_attempt_id: 'attempt-1',
        quiz_id: 'quiz-1',
        topic_id: 'linear-equations',
        score: 80,
        correct_count: 4,
        incorrect_count: 1,
      })
      .expect(201);

    expect(mockedStoreQuizAttemptSummary).toHaveBeenCalledWith('firebase-uid', {
      quiz_attempt_id: 'attempt-1',
      quiz_id: 'quiz-1',
      topic_id: 'linear-equations',
      score: 80,
      correct_count: 4,
      incorrect_count: 1,
      skipped_count: 0,
      metadata: {},
    });
  });

  it('rejects progress writes for another learner’s tutor session or quiz attempt', async () => {
    mockedAssertTutorSessionOwnership.mockRejectedValue(
      new AppError(
        'You cannot access another user tutor session',
        403,
        true,
        'TUTOR_SESSION_FORBIDDEN'
      )
    );
    await request(app)
      .post('/api/v1/progress/answers')
      .set(authHeader())
      .send({
        tutor_session_id: 'other-session',
        tutor_turn_id: 'turn-1',
        submitted_answer: 'x = 2',
      })
      .expect(403);
    expect(mockedStoreStudentAnswerEvent).not.toHaveBeenCalled();

    mockedAssertQuizAttemptOwnership.mockRejectedValue(
      new AppError(
        'You cannot access another user quiz attempt',
        403,
        true,
        'QUIZ_ATTEMPT_FORBIDDEN'
      )
    );
    await request(app)
      .post('/api/v1/progress/quiz-attempts')
      .set(authHeader())
      .send({
        quiz_attempt_id: 'other-attempt',
        quiz_id: 'quiz-1',
        score: 0,
        correct_count: 0,
        incorrect_count: 1,
      })
      .expect(403);
    expect(mockedStoreQuizAttemptSummary).not.toHaveBeenCalled();
  });

  it('returns dashboard summary and supporting progress views', async () => {
    const dashboardResponse = await request(app)
      .get('/api/v1/progress/dashboard')
      .set(authHeader())
      .expect(200);

    expect(dashboardResponse.body.data.empty_state).toBe(false);
    expect(mockedGetDashboardSummary).toHaveBeenCalledWith('firebase-uid');

    await request(app).get('/api/v1/progress/recent-activity').set(authHeader()).expect(200);
    expect(mockedGetRecentActivity).toHaveBeenCalledWith('firebase-uid');

    await request(app).get('/api/v1/progress/weak-topic').set(authHeader()).expect(200);
    expect(mockedGetWeakTopicSummary).toHaveBeenCalledWith('firebase-uid');
  });

  it('rejects invalid auth', async () => {
    const response = await request(app).get('/api/v1/progress/dashboard').expect(401);

    expect(response.body.success).toBe(false);
    expect(mockedGetDashboardSummary).not.toHaveBeenCalled();
  });
});
