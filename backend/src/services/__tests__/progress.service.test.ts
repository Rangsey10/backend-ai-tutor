import { getFirestore, isFirebaseInitialized } from '../../config/firebase';
import {
  clearLocalProgressEvents,
  calculateCurrentStreak,
  getDashboardSummary,
  getWeakTopicSummary,
  storeLessonCompletion,
  storeQuizAttemptSummary,
  storeStudentAnswerEvent,
  storeTutorSessionSummary,
} from '../progress.service';
import { getDashboardLearnerProfile } from '../profile.service';

jest.mock('../../config/firebase', () => ({
  getFirestore: jest.fn(),
  isFirebaseInitialized: jest.fn(() => false),
}));
jest.mock('../profile.service', () => ({
  getDashboardLearnerProfile: jest.fn(),
}));

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;
const mockedIsFirebaseInitialized = isFirebaseInitialized as jest.MockedFunction<
  typeof isFirebaseInitialized
>;
const mockedGetDashboardLearnerProfile = getDashboardLearnerProfile as jest.MockedFunction<
  typeof getDashboardLearnerProfile
>;

describe('progress.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsFirebaseInitialized.mockReturnValue(false);
    clearLocalProgressEvents();
    mockedGetFirestore.mockImplementation(() => {
      throw new Error('Firestore unavailable in local test');
    });
    mockedGetDashboardLearnerProfile.mockResolvedValue({
      display_name: null,
      grade_label: null,
      subjects: [],
      learning_goal: null,
    });
  });

  it('returns an empty dashboard state before activity exists', async () => {
    const summary = await getDashboardSummary('firebase-uid');

    expect(summary.empty_state).toBe(true);
    expect(summary.total_sessions).toBe(0);
    expect(summary.weak_topic.confidence).toBe('none');
    expect(summary.persistence).toEqual({ mode: 'local_memory', durable: false });
  });

  it('returns the authenticated new learner profile without demo defaults', async () => {
    mockedGetDashboardLearnerProfile.mockResolvedValue({
      display_name: 'Sokha',
      grade_label: 'Grade 11',
      subjects: [
        { subject_id: 'physics', subject_name: 'Physics' },
        { subject_id: 'english', subject_name: 'English' },
      ],
      learning_goal: 'Prepare for exams',
    });

    const summary = await getDashboardSummary('sokha-uid');

    expect(summary.empty_state).toBe(true);
    expect(summary.learner).toEqual({
      display_name: 'Sokha',
      grade_label: 'Grade 11',
      subjects: [
        { subject_id: 'physics', subject_name: 'Physics' },
        { subject_id: 'english', subject_name: 'English' },
      ],
      learning_goal: 'Prepare for exams',
    });
  });

  it('stores progress events and aggregates dashboard summary', async () => {
    await storeTutorSessionSummary('firebase-uid', {
      tutor_session_id: 'session-1',
      subject_id: 'math',
      topic_id: 'linear-equations',
      original_question: '2x + 5 = 15',
      status: 'active',
      metadata: {},
    });
    await storeLessonCompletion('firebase-uid', {
      tutor_session_id: 'session-1',
      topic_id: 'linear-equations',
      completion_status: 'completed',
      metadata: {},
    });
    await storeQuizAttemptSummary('firebase-uid', {
      quiz_attempt_id: 'attempt-1',
      quiz_id: 'quiz-1',
      topic_id: 'linear-equations',
      score: 80,
      correct_count: 4,
      incorrect_count: 1,
      skipped_count: 0,
      metadata: {},
    });
    await storeStudentAnswerEvent('firebase-uid', {
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

    const summary = await getDashboardSummary('firebase-uid');

    expect(summary.empty_state).toBe(false);
    expect(summary.total_sessions).toBe(1);
    expect(summary.lessons_completed).toBe(1);
    expect(summary.quiz_attempts).toBe(1);
    expect(summary.recent_activity[0].tutor_session_id).toBe('session-1');
    expect(summary.average_quiz_score).toBe(80);
    expect(summary.correct_answers).toBe(1);
    expect(summary.subject_progress).toEqual([
      {
        subject_id: 'math',
        topic_id: 'linear-equations',
        progress_percent: 93,
        correct_answers: 1,
        total_answers: 1,
        lessons_completed: 1,
        quiz_attempts: 1,
        average_quiz_score: 80,
        evidence_count: 2,
        readiness: null,
      },
    ]);
    expect(summary.resume_lesson).toEqual(
      expect.objectContaining({ tutor_session_id: 'session-1', board_version: null })
    );
  });

  it('stores the Visual Tutor demo flow and updates dashboard recent activity', async () => {
    await storeTutorSessionSummary('demo-student', {
      tutor_session_id: 'session-demo-1',
      subject_id: 'math',
      topic_id: 'linear-equations',
      original_question: '2x + 5 = 15',
      status: 'active',
      mastery_signal: 'exploring',
      metadata: {
        screen_state: 'asking_question',
        source: 'backend',
      },
    });

    await storeStudentAnswerEvent('demo-student', {
      tutor_session_id: 'session-demo-1',
      tutor_turn_id: 'turn-step-1',
      topic_id: 'linear-equations',
      submitted_answer: '2x = 10',
      answer_format: 'text',
      is_correct: true,
      is_partially_correct: true,
      score: 1,
      metadata: {
        validation_result: 'correct_step',
        screen_state: 'speaking_writing',
      },
    });

    await storeStudentAnswerEvent('demo-student', {
      tutor_session_id: 'session-demo-1',
      tutor_turn_id: 'turn-final',
      topic_id: 'linear-equations',
      submitted_answer: 'x = 5',
      answer_format: 'text',
      is_correct: true,
      is_partially_correct: false,
      score: 1,
      metadata: {
        validation_result: 'correct_final_step',
        screen_state: 'final_verified_answer',
        verified_by: 'sympy',
      },
    });

    await storeLessonCompletion('demo-student', {
      tutor_session_id: 'session-demo-1',
      topic_id: 'linear-equations',
      completion_status: 'completed',
      mastery_signal: 'mastered',
      metadata: {
        screen_state: 'final_verified_answer',
        verified_by: 'sympy',
      },
    });

    const summary = await getDashboardSummary('demo-student');

    expect(summary.empty_state).toBe(false);
    expect(summary.total_sessions).toBe(1);
    expect(summary.lessons_completed).toBe(1);
    expect(summary.correct_answers).toBe(2);
    expect(summary.incorrect_answers).toBe(0);
    expect(summary.recent_activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'lesson_completion',
          title: 'Completed a lesson',
          topic_id: 'linear-equations',
        }),
        expect.objectContaining({
          event_type: 'student_answer',
          title: 'Answered correctly',
          topic_id: 'linear-equations',
        }),
        expect.objectContaining({
          event_type: 'tutor_session_summary',
          title: 'Started tutor session',
          topic_id: 'linear-equations',
        }),
      ])
    );
    expect(summary.subject_progress).toEqual([
      expect.objectContaining({
        subject_id: 'math',
        topic_id: 'linear-equations',
        correct_answers: 2,
        total_answers: 2,
        lessons_completed: 1,
      }),
    ]);
  });

  it('returns a weak-topic placeholder until enough answer data exists', async () => {
    await storeStudentAnswerEvent('firebase-uid', {
      tutor_session_id: 'session-1',
      tutor_turn_id: 'turn-1',
      topic_id: 'linear-equations',
      submitted_answer: 'wrong',
      answer_format: 'text',
      is_correct: false,
      is_partially_correct: false,
      score: 0,
      metadata: {},
    });

    const weakTopic = await getWeakTopicSummary('firebase-uid');

    expect(weakTopic.topic_id).toBeNull();
    expect(weakTopic.reason).toBe('Not enough answer history yet.');
  });

  it('calculates weak topics and keeps each learner’s events isolated', async () => {
    for (const turn of ['1', '2', '3']) {
      await storeStudentAnswerEvent('learner-a', {
        tutor_session_id: 'session-a',
        tutor_turn_id: `turn-${turn}`,
        topic_id: 'quadratics',
        subject_id: 'math',
        submitted_answer: 'wrong',
        answer_format: 'text',
        is_correct: false,
        is_partially_correct: false,
        score: 0,
        metadata: {},
      });
    }
    await storeStudentAnswerEvent('learner-b', {
      tutor_session_id: 'session-b',
      tutor_turn_id: 'turn-1',
      topic_id: 'physics-motion',
      subject_id: 'physics',
      submitted_answer: 'correct',
      answer_format: 'text',
      is_correct: true,
      is_partially_correct: false,
      score: 1,
      metadata: {},
    });

    const [first, second] = await Promise.all([
      getDashboardSummary('learner-a'),
      getDashboardSummary('learner-b'),
    ]);
    expect(first.weak_topic.topic_id).toBe('quadratics');
    expect(second.weak_topic.topic_id).toBeNull();
    expect(second.subject_progress).toHaveLength(1);
    expect(second.subject_progress[0].subject_id).toBe('physics');
  });

  it('counts consecutive active UTC days for the streak', () => {
    const events = ['2026-08-09', '2026-08-08', '2026-08-07', '2026-08-05'].map((day) => ({
      created_at: `${day}T08:00:00.000Z`,
    }));
    expect(calculateCurrentStreak(events, new Date('2026-08-09T12:00:00Z'))).toBe(3);
  });
});
