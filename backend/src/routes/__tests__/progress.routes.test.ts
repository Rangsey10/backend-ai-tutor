import request from 'supertest';
import { Timestamp } from 'firebase-admin/firestore';
import { createApp } from '../../app';
import * as progressService from '../../services/progress.service';

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

jest.mock('../../services/progress.service', () => ({
  submitQuizResult: jest.fn(),
  logTutorActivity: jest.fn(),
  getProgressDashboard: jest.fn(),
  getProgressHistory: jest.fn(),
}));

const mockedProgressService = progressService as jest.Mocked<typeof progressService>;

describe('progress routes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid quiz submission payload', async () => {
    const response = await request(app).post('/api/v1/progress/quiz-results').send({
      quiz_id: 'quiz-1',
      topic_id: 'topic-1',
      duration_seconds: 300,
      answers: [],
    });

    expect(response.status).toBe(400);
    expect(mockedProgressService.submitQuizResult).not.toHaveBeenCalled();
  });

  it('submits quiz result', async () => {
    mockedProgressService.submitQuizResult.mockResolvedValue({
      attempt: {
        quiz_attempt_id: 'attempt-1',
        quiz_id: 'quiz-1',
        student_profile_id: 'profile-1',
        score: 100,
        correct_count: 1,
        incorrect_count: 0,
        skipped_count: 0,
        started_at: Timestamp.now(),
        submitted_at: Timestamp.now(),
      },
      answers: [
        {
          quiz_answer_id: 'answer-1',
          quiz_attempt_id: 'attempt-1',
          quiz_question_id: 'question-1',
          selected_option_id: null,
          submitted_answer: '1/2',
          is_correct: true,
          is_partially_correct: false,
          score_awarded: 100,
          feedback: null,
          created_at: Timestamp.now(),
        },
      ],
    });

    const response = await request(app).post('/api/v1/progress/quiz-results').send({
      quiz_id: 'quiz-1',
      topic_id: 'topic-1',
      duration_seconds: 300,
      answers: [
        {
          quiz_question_id: 'question-1',
          submitted_answer: '1/2',
          is_correct: true,
          is_partially_correct: false,
          score_awarded: 100,
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(mockedProgressService.submitQuizResult).toHaveBeenCalledTimes(1);
  });

  it('returns dashboard metrics', async () => {
    mockedProgressService.getProgressDashboard.mockResolvedValue({
      total_quizzes: 5,
      average_quiz_score: 83,
      mastered_topics: 2,
      current_streak: 4,
      total_learning_time: 1200,
      total_tutor_sessions: 3,
      total_interactions: 42,
    });

    const response = await request(app).get('/api/v1/progress/dashboard-v2');

    expect(response.status).toBe(200);
    expect(mockedProgressService.getProgressDashboard).toHaveBeenCalledWith('firebase-user-1');
  });

  it('returns history collections', async () => {
    mockedProgressService.getProgressHistory.mockResolvedValue({
      quiz_attempts: [],
      topic_progress: [],
      tutor_activity_logs: [],
    });

    const response = await request(app).get('/api/v1/progress/history');

    expect(response.status).toBe(200);
    expect(mockedProgressService.getProgressHistory).toHaveBeenCalledWith('firebase-user-1');
  });
});
