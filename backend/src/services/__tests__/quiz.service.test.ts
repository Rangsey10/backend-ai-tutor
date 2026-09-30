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
        problem_type: 'slope_from_points',
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

  it('rejects a generated quiz that changes the requested practice topic', async () => {
    mockedGetFirestore.mockReturnValue({
      collection: jest.fn(() => ({ doc: () => ({ set: jest.fn() }) })),
    } as never);
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        verified: true,
        topic: 'percentages',
        problem_type: 'linear_equation_one_variable',
        questions: [],
      }),
    }) as never;

    try {
      await expect(createOrRetrieveQuiz('student-a', {
        subject_id: 'math', topic_id: 'percentages', grade_level_id: 'grade-8',
        difficulty_level: 'beginner', skill_tags: [], learning_goals: [], misconceptions: [],
        hint_count: 0, stuck_count: 0, verification_results: [], verification_evidence: [],
      })).rejects.toMatchObject({ code: 'INVALID_GENERATED_QUIZ' });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('generates and scores practice quizzes for all Grade 10-12 STEM curriculum lessons', async () => {
    const lessonPayloads = [
      { subject_id: 'physics', topic_id: 'physics-g12-kinematics', grade_level_id: 'grade-12' },
      { subject_id: 'physics', topic_id: 'physics-g12-optics', grade_level_id: 'grade-12' },
      { subject_id: 'physics', topic_id: 'physics-g12-thermodynamics', grade_level_id: 'grade-12' },
      { subject_id: 'physics', topic_id: 'dynamics-g12', grade_level_id: 'grade-12' },
      { subject_id: 'physics', topic_id: 'work-energy-g12', grade_level_id: 'grade-12' },
      { subject_id: 'physics', topic_id: 'waves-g12', grade_level_id: 'grade-12' },
      { subject_id: 'physics', topic_id: 'electromagnetism-g12', grade_level_id: 'grade-12' },
      { subject_id: 'math', topic_id: 'math-g12-limits-of-functions', grade_level_id: 'grade-12' },
      { subject_id: 'math', topic_id: 'math-g12-derivatives', grade_level_id: 'grade-12' },
      { subject_id: 'math', topic_id: 'math-g12-integrals', grade_level_id: 'grade-12' },
      { subject_id: 'math', topic_id: 'topic-grade-12-mathematics-complex-numbers', grade_level_id: 'grade-12' },
      { subject_id: 'math', topic_id: 'topic-grade-12-mathematics-differential-equations', grade_level_id: 'grade-12' },
      { subject_id: 'math', topic_id: 'topic-grade-12-mathematics-function-analysis-and-curve-sketching', grade_level_id: 'grade-12' },
      { subject_id: 'math', topic_id: 'topic-grade-12-mathematics-probability-and-combinatorics', grade_level_id: 'grade-12' },
      { subject_id: 'math', topic_id: 'topic-grade-12-mathematics-vectors-in-3d-space-and-conic-sections', grade_level_id: 'grade-12' },
      { subject_id: 'chemistry', topic_id: 'chem-g12-stoichiometry', grade_level_id: 'grade-12' },
      { subject_id: 'chemistry', topic_id: 'chem-g12-acids-bases', grade_level_id: 'grade-12' },
      { subject_id: 'chemistry', topic_id: 'chem-g12-organic', grade_level_id: 'grade-12' },
      { subject_id: 'chemistry', topic_id: 'kinetics-g12', grade_level_id: 'grade-12' },
      { subject_id: 'chemistry', topic_id: 'equilibrium-g12', grade_level_id: 'grade-12' },
      { subject_id: 'math', topic_id: 'math-g11-trigonometry', grade_level_id: 'grade-11' },
      { subject_id: 'physics', topic_id: 'physics-g11-newton-laws', grade_level_id: 'grade-11' },
      { subject_id: 'chemistry', topic_id: 'chem-g11-solutions-molarity', grade_level_id: 'grade-11' },
      { subject_id: 'physics', topic_id: 'physics-g10-uniform-motion', grade_level_id: 'grade-10' },
      { subject_id: 'chemistry', topic_id: 'chem-g10-atomic-structure', grade_level_id: 'grade-10' },
    ];

    for (const item of lessonPayloads) {
      const quiz = await createOrRetrieveQuiz('student-stem', {
        subject_id: item.subject_id,
        topic_id: item.topic_id,
        grade_level_id: item.grade_level_id,
        difficulty_level: 'beginner',
        tutor_session_id: `lesson-${item.topic_id}`,
        skill_tags: [],
        learning_goals: [],
        misconceptions: [],
        hint_count: 0,
        stuck_count: 0,
        verification_results: [],
        verification_evidence: [],
      });

      expect(quiz.topic_id).toBe(item.topic_id);
      expect(quiz.total_questions).toBe(3);
      expect(quiz.questions).toHaveLength(3);
      expect(quiz.questions[0]).not.toHaveProperty('correct_option_id');
      expect(quiz.questions[0]).not.toHaveProperty('correct_answer');
    }

    const kinematicsAttempt = await submitQuizAnswers('student-stem', 'quiz-grade-12-kinematics', {
      answers: [
        { question_id: 'kin-q1', answer: '10' },
        { question_id: 'kin-q2', answer: '25' },
        { question_id: 'kin-q3', selected_option_id: 'kin-q3-a' },
      ],
    });
    expect(kinematicsAttempt.score).toBe(100);
    expect(kinematicsAttempt.correct_count).toBe(3);
  });
});

