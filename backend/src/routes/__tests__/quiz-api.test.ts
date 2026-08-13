import request from 'supertest';
import { createApp } from '../../app';
import { getAuth } from '../../config/firebase';
import {
  createOrRetrieveQuiz,
  getQuizByTopic,
  submitQuizAnswers,
  type QuizAttemptResult,
  type QuizResponse,
} from '../../services/quiz.service';
import { AppError } from '../../utils/AppError';

jest.mock('../../config/firebase', () => ({
  getAuth: jest.fn(),
}));

jest.mock('../../services/quiz.service', () => ({
  createOrRetrieveQuiz: jest.fn(),
  getQuizByTopic: jest.fn(),
  submitQuizAnswers: jest.fn(),
}));

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockedGetQuizByTopic = getQuizByTopic as jest.MockedFunction<typeof getQuizByTopic>;
const mockedCreateOrRetrieveQuiz = createOrRetrieveQuiz as jest.MockedFunction<
  typeof createOrRetrieveQuiz
>;
const mockedSubmitQuizAnswers = submitQuizAnswers as jest.MockedFunction<
  typeof submitQuizAnswers
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

const quizResponse: QuizResponse = {
  quiz_id: 'quiz-grade-10-linear-equations-basic',
  subject_id: 'math',
  topic_id: 'linear-equations',
  grade_level_id: 'grade-10',
  title: 'Linear Equations Quick Practice',
  description: 'A short demo quiz.',
  difficulty_level: 'beginner',
  generation_source: 'local_seed',
  total_questions: 1,
  questions: [
    {
      question_id: 'linear-q1',
      order: 1,
      question_text: 'What is the first step?',
      question_type: 'multiple_choice',
      options: [{ option_id: 'linear-q1-a', label: 'A', text: 'Subtract 5' }],
    },
  ],
};

const attemptResult: QuizAttemptResult = {
  quiz_attempt_id: 'attempt-1',
  quiz_id: 'quiz-grade-10-linear-equations-basic',
  user_id: 'firebase-uid',
  score: 100,
  correct_count: 1,
  incorrect_count: 0,
  skipped_count: 0,
  total_questions: 1,
  submitted_at: '2026-07-27T00:00:00.000Z',
  answers: [
    {
      question_id: 'linear-q1',
      selected_option_id: 'linear-q1-a',
      submitted_answer: '',
      is_correct: true,
      score_awarded: 1,
      feedback: 'Correct.',
    },
  ],
};

describe('student quiz API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToken();
    mockedGetQuizByTopic.mockResolvedValue(quizResponse);
    mockedCreateOrRetrieveQuiz.mockResolvedValue(quizResponse);
    mockedSubmitQuizAnswers.mockResolvedValue(attemptResult);
  });

  it('gets a quiz by topic', async () => {
    const response = await request(app)
      .get('/api/v1/quizzes/topic/linear-equations?subject_id=math&grade_level_id=grade-10')
      .set(authHeader())
      .expect(200);

    expect(response.body.data.quiz_id).toBe('quiz-grade-10-linear-equations-basic');
    expect(mockedGetQuizByTopic).toHaveBeenCalledWith('firebase-uid', 'linear-equations', {
      subject_id: 'math',
      grade_level_id: 'grade-10',
    });
  });

  it('creates or retrieves a basic generated quiz', async () => {
    const response = await request(app)
      .post('/api/v1/quizzes/generate')
      .set(authHeader())
      .send({
        subject_id: 'math',
        topic_id: 'linear-equations',
        grade_level_id: 'grade-10',
      })
      .expect(201);

    expect(response.body.data.generation_source).toBe('local_seed');
    expect(mockedCreateOrRetrieveQuiz).toHaveBeenCalledWith('firebase-uid', {
      subject_id: 'math',
      topic_id: 'linear-equations',
      grade_level_id: 'grade-10',
      difficulty_level: 'beginner',
      skill_tags: [],
      learning_goals: [],
      misconceptions: [],
      hint_count: 0,
      stuck_count: 0,
      verification_results: [],
      verification_evidence: [],
    });
  });

  it('submits answers and returns a score summary', async () => {
    const response = await request(app)
      .post('/api/v1/quizzes/quiz-grade-10-linear-equations-basic/submit')
      .set(authHeader())
      .send({
        answers: [{ question_id: 'linear-q1', selected_option_id: 'linear-q1-a' }],
      })
      .expect(201);

    expect(response.body.data.score).toBe(100);
    expect(mockedSubmitQuizAnswers).toHaveBeenCalledWith(
      'firebase-uid',
      'quiz-grade-10-linear-equations-basic',
      {
        answers: [{ question_id: 'linear-q1', selected_option_id: 'linear-q1-a' }],
      }
    );
  });

  it('rejects invalid quiz submissions', async () => {
    const response = await request(app)
      .post('/api/v1/quizzes/quiz-grade-10-linear-equations-basic/submit')
      .set(authHeader())
      .send({ answers: [] })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockedSubmitQuizAnswers).not.toHaveBeenCalled();
  });

  it('returns useful errors when quiz generation is unavailable', async () => {
    mockedCreateOrRetrieveQuiz.mockRejectedValue(
      new AppError(
        'AI quiz generation is unavailable and no local demo quiz exists for this topic',
        503,
        true,
        'QUIZ_GENERATION_UNAVAILABLE'
      )
    );

    const response = await request(app)
      .post('/api/v1/quizzes/generate')
      .set(authHeader())
      .send({ topic_id: 'unknown-topic' })
      .expect(503);

    expect(response.body.error.code).toBe('QUIZ_GENERATION_UNAVAILABLE');
  });
});
