import { getFirestore } from '../../config/firebase';
import {
  clearStoredDemoQuizAttempts,
  createOrRetrieveQuiz,
  getQuizByTopic,
  getStoredDemoQuizAttempt,
  submitQuizAnswers,
} from '../quiz.service';

jest.mock('../../config/firebase', () => ({
  getFirestore: jest.fn(),
}));

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

describe('quiz.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearStoredDemoQuizAttempts();
    mockedGetFirestore.mockImplementation(() => {
      throw new Error('Firestore unavailable in local test');
    });
  });

  it('returns a seeded quiz without exposing correct answers', async () => {
    const quiz = await getQuizByTopic('firebase-uid', 'linear-equations', {
      subject_id: 'math',
      grade_level_id: 'grade-10',
    });

    expect(quiz.quiz_id).toBe('quiz-grade-10-linear-equations-basic');
    expect(quiz.questions[0]).not.toHaveProperty('correct_option_id');
    expect(quiz.questions[1]).not.toHaveProperty('correct_answer');
  });

  it('calculates score and stores an attempt locally when Firestore is unavailable', async () => {
    const result = await submitQuizAnswers('firebase-uid', 'quiz-grade-10-linear-equations-basic', {
      answers: [
        { question_id: 'linear-q1', selected_option_id: 'linear-q1-a' },
        { question_id: 'linear-q2', answer: '5' },
        { question_id: 'linear-q3', selected_option_id: 'linear-q3-b' },
      ],
    });

    expect(result.score).toBe(67);
    expect(result.correct_count).toBe(2);
    expect(result.incorrect_count).toBe(1);
    expect(getStoredDemoQuizAttempt(result.quiz_attempt_id)).toEqual(result);
  });

  it('rejects duplicate quiz answers', async () => {
    await expect(
      submitQuizAnswers('firebase-uid', 'quiz-grade-10-linear-equations-basic', {
        answers: [
          { question_id: 'linear-q1', selected_option_id: 'linear-q1-a' },
          { question_id: 'linear-q1', selected_option_id: 'linear-q1-b' },
        ],
      })
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_QUIZ_SUBMISSION',
    });
  });

  it('persists validated generated practice privately and never returns its answer keys', async () => {
    const stored = new Map<string, unknown>();
    mockedGetFirestore.mockReturnValue({
      collection: jest.fn(() => ({
        doc: (id: string) => ({
          set: async (value: unknown) => stored.set(id, value),
          get: async () => ({ exists: stored.has(id), data: () => stored.get(id) }),
        }),
      })),
    } as never);
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        verified: true,
        topic: 'slope',
        metadata: { generator: 'test' },
        questions: [1, 2, 3].map((index) => ({
          id: `slope-${index}`,
          type: 'multiple_choice',
          question_text: `Slope question ${index}`,
          choices: [{ id: 'A', text: '2' }, { id: 'B', text: '3' }],
          correct_answer: 'A', expected_answer: '2', explanation: 'Rise over run.',
          problem_type: 'slope_from_points', metadata: { verified_by: 'deterministic' },
        })),
      }),
    }) as never;

    try {
      const quiz = await createOrRetrieveQuiz('student-a', {
        subject_id: 'math', topic_id: 'slope', grade_level_id: 'grade-10',
        difficulty_level: 'beginner', tutor_session_id: 'tutor-session-1', skill_tags: ['slope'], learning_goals: [], misconceptions: [],
        hint_count: 2, stuck_count: 0, verification_results: ['invalid'], verification_evidence: [],
      });

      expect(quiz.total_questions).toBe(3);
      expect(quiz.questions[0]).not.toHaveProperty('correct_option_id');
      expect(quiz.questions[0]).not.toHaveProperty('correct_answer');
      expect([...stored.values()][0]).toMatchObject({
        user_id: 'student-a', tutor_session_id: 'tutor-session-1',
      });
    } finally {
      global.fetch = originalFetch;
    }
  });
});
