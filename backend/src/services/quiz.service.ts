import { Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { getFirestore } from '../config/firebase';
import { quizAnswerConverter, quizAttemptConverter } from '../config/firestore-converters';
import type { QuizAttempt } from '../models/quiz-attempts.model';
import type { QuizAnswer } from '../models/quiz-answers.model';
import type {
  CreateQuizRequestInput,
  GetQuizByTopicQueryInput,
  SubmitQuizRequestInput,
} from '../schemas/quiz-request.schema';
import { AppError } from '../utils/AppError';

type QuizOptionResponse = {
  option_id: string;
  label: string;
  text: string;
};

type QuizQuestionResponse = {
  question_id: string;
  order: number;
  question_text: string;
  question_type: 'multiple_choice' | 'numeric' | 'short_answer';
  options: QuizOptionResponse[];
  visualization_data?: Record<string, unknown> | null;
};

export type QuizResponse = {
  quiz_id: string;
  subject_id: string;
  topic_id: string;
  grade_level_id: string;
  title: string;
  description: string;
  difficulty_level: 'beginner' | 'intermediate' | 'advanced';
  generation_source: 'local_seed' | 'ai_service';
  total_questions: number;
  questions: QuizQuestionResponse[];
};

type InternalQuizQuestion = QuizQuestionResponse & {
  correct_option_id?: string;
  correct_answer?: string;
  explanation: string;
};

type InternalQuiz = Omit<QuizResponse, 'questions'> & {
  questions: InternalQuizQuestion[];
  user_id?: string;
  tutor_session_id?: string;
  provenance?: Record<string, unknown>;
};

type ScoredAnswer = {
  question_id: string;
  selected_option_id: string | null;
  submitted_answer: string;
  is_correct: boolean;
  score_awarded: number;
  feedback: string;
};

export type QuizAttemptResult = {
  quiz_attempt_id: string;
  quiz_id: string;
  user_id: string;
  tutor_session_id?: string;
  score: number;
  correct_count: number;
  incorrect_count: number;
  skipped_count: number;
  total_questions: number;
  answers: ScoredAnswer[];
  submitted_at: string;
};

const seededQuizzes: InternalQuiz[] = [
  {
    quiz_id: 'quiz-grade-10-linear-equations-basic',
    subject_id: 'math',
    topic_id: 'linear-equations',
    grade_level_id: 'grade-10',
    title: 'Linear Equations Quick Practice',
    description: 'A short demo quiz for one-variable linear equations.',
    difficulty_level: 'beginner',
    generation_source: 'local_seed',
    total_questions: 3,
    questions: [
      {
        question_id: 'linear-q1',
        order: 1,
        question_text: 'What is the first step to solve 2x + 5 = 15?',
        question_type: 'multiple_choice',
        options: [
          { option_id: 'linear-q1-a', label: 'A', text: 'Subtract 5 from both sides' },
          { option_id: 'linear-q1-b', label: 'B', text: 'Add 5 to both sides' },
          { option_id: 'linear-q1-c', label: 'C', text: 'Divide both sides by 5' },
        ],
        correct_option_id: 'linear-q1-a',
        explanation: 'Removing +5 from both sides gives 2x = 10.',
        visualization_data: { board_type: 'equation', equation: '2x + 5 = 15' },
      },
      {
        question_id: 'linear-q2',
        order: 2,
        question_text: 'After 2x = 10, what is x?',
        question_type: 'numeric',
        options: [],
        correct_answer: '5',
        explanation: 'Divide both sides by 2, so x = 5.',
      },
      {
        question_id: 'linear-q3',
        order: 3,
        question_text: 'Does x = 5 make 2x + 5 = 15 true?',
        question_type: 'multiple_choice',
        options: [
          { option_id: 'linear-q3-a', label: 'A', text: 'Yes' },
          { option_id: 'linear-q3-b', label: 'B', text: 'No' },
        ],
        correct_option_id: 'linear-q3-a',
        explanation: 'Substitute 5: 2(5) + 5 = 15.',
      },
    ],
  },
];
const SUPPORTED_PRACTICE_TOPICS = new Set([
  'linear-equations', 'linear_equation_one_variable', 'integer-arithmetic',
  'integer_arithmetic', 'slope', 'slope-from-points', 'slope_from_points',
]);

const storedDemoAttempts = new Map<string, QuizAttemptResult>();

function allowSeededQuizData(): boolean {
  return (
    env.nodeEnv === 'test' || (env.aiService.allowDevelopmentFallbacks && env.aiService.useDevMock)
  );
}

function publicQuiz(quiz: InternalQuiz): QuizResponse {
  return {
    ...quiz,
    questions: quiz.questions.map(
      ({ correct_option_id, correct_answer, explanation, ...question }) => question
    ),
  };
}

function internalTutorHeaders(userId: string): Record<string, string> {
  const token = env.aiService.visualTutorInternalToken || (env.nodeEnv === 'test' ? 'test-internal-token' : '');
  if (!token) {
    throw new AppError('Quiz generation is not configured', 503, true, 'QUIZ_GENERATION_UNAVAILABLE');
  }
  return { 'x-visual-tutor-user-id': userId, 'x-visual-tutor-internal-token': token };
}

function difficultyForAi(difficulty: CreateQuizRequestInput['difficulty_level']): string {
  return difficulty === 'beginner' ? 'easy' : difficulty === 'advanced' ? 'hard' : 'medium';
}

function parseGrade(value: string): number | undefined {
  const match = value.match(/(\d{1,2})/);
  return match ? Number(match[1]) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function privateQuizFromAi(payload: unknown, userId: string, input: CreateQuizRequestInput): InternalQuiz {
  const body = asRecord(payload);
  const questions = Array.isArray(body?.questions) ? body.questions : [];
  if (!body || body.verified !== true || questions.length < 3 || questions.length > 5 ||
      String(body.topic ?? '').trim().toLowerCase() !== input.topic_id.trim().toLowerCase()) {
    throw new AppError('Generated practice did not pass validation', 502, true, 'INVALID_GENERATED_QUIZ');
  }
  const mapped: InternalQuizQuestion[] = questions.map((raw, index) => {
    const question = asRecord(raw);
    const choices = Array.isArray(question?.choices) ? question.choices : [];
    const correct = typeof question?.correct_answer === 'string' ? question.correct_answer : '';
    const type = question?.type === 'short_answer' ? 'short_answer' : 'multiple_choice';
    if (!question || !correct || !['linear_equation_one_variable', 'integer_arithmetic', 'slope_from_points'].includes(String(question.problem_type)) ||
      (type === 'multiple_choice' && choices.length < 2)) {
      throw new AppError('Generated practice includes an unsupported question', 502, true, 'INVALID_GENERATED_QUIZ');
    }
    return {
      question_id: String(question.id), order: index + 1, question_text: String(question.question_text),
      question_type: type, options: choices.map((choice, choiceIndex) => {
        const value = asRecord(choice);
        return { option_id: String(value?.id), label: String(value?.id ?? choiceIndex + 1), text: String(value?.text) };
      }), correct_option_id: type === 'multiple_choice' ? correct : undefined,
      correct_answer: typeof question.expected_answer === 'string' ? question.expected_answer : correct,
      explanation: String(question.explanation),
      visualization_data: asRecord(question.metadata),
    };
  });
  return {
    quiz_id: `practice-${randomUUID()}`, subject_id: input.subject_id, topic_id: input.topic_id,
    grade_level_id: input.grade_level_id, title: `Targeted ${String(body.topic)} practice`,
    description: 'Practice selected from your Visual Tutor learning signals.', difficulty_level: input.difficulty_level,
    generation_source: 'ai_service', total_questions: mapped.length, questions: mapped, user_id: userId,
    tutor_session_id: input.tutor_session_id,
    provenance: { source: 'ai_service', generator: asRecord(body.metadata)?.generator ?? 'verified_generator', verified: true,
      skill_tags: input.skill_tags, hint_count: input.hint_count, stuck_count: input.stuck_count,
      verification_results: input.verification_results, verification_evidence: input.verification_evidence },
  };
}

async function generatePrivateQuiz(userId: string, input: CreateQuizRequestInput): Promise<InternalQuiz> {
  if (!SUPPORTED_PRACTICE_TOPICS.has(input.topic_id.trim().toLowerCase())) {
    throw new AppError('Targeted practice is not available for this topic yet', 422, true, 'PRACTICE_TOPIC_UNSUPPORTED');
  }
  let response: Response;
  try {
    response = await fetch(new URL('/api/v1/quiz/generate', env.aiService.baseUrl), {
      method: 'POST', headers: { 'content-type': 'application/json', ...internalTutorHeaders(userId) },
      body: JSON.stringify({ grade: parseGrade(input.grade_level_id), subject: input.subject_id, topic: input.topic_id,
        difficulty: difficultyForAi(input.difficulty_level), tutor_session_id: input.tutor_session_id,
        skill_tags: input.skill_tags, learning_goals: input.learning_goals, misconceptions: input.misconceptions,
        hint_count: input.hint_count, stuck_count: input.stuck_count,
        verification_results: input.verification_results, verification_evidence: input.verification_evidence,
        prior_mastery: input.prior_mastery, prior_quiz_score: input.prior_quiz_score }),
    });
  } catch {
    throw new AppError('AI practice generation is unavailable', 502, true, 'QUIZ_GENERATION_UNAVAILABLE');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new AppError('AI practice generation failed', 502, true, 'QUIZ_GENERATION_UNAVAILABLE');
  return privateQuizFromAi(payload, userId, input);
}

async function persistPrivateQuiz(quiz: InternalQuiz): Promise<void> {
  try {
    await getFirestore().collection('practice_quizzes').doc(quiz.quiz_id).set({ ...quiz, created_at: Timestamp.now() });
  } catch {
    throw new AppError('Practice quiz persistence is unavailable', 503, true, 'QUIZ_PERSISTENCE_UNAVAILABLE');
  }
}

async function loadPrivateQuiz(userId: string, quizId: string): Promise<InternalQuiz | null> {
  try {
    const snapshot = await getFirestore().collection('practice_quizzes').doc(quizId).get();
    if (!snapshot.exists) return null;
    const quiz = snapshot.data() as InternalQuiz;
    if (quiz.user_id !== userId) throw new AppError('You cannot access another student’s practice quiz', 403, true, 'QUIZ_FORBIDDEN');
    return quiz;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (!allowSeededQuizData()) throw new AppError('Practice quiz storage is unavailable', 503, true, 'QUIZ_PERSISTENCE_UNAVAILABLE');
    return null;
  }
}

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function answersAreEquivalent(submitted: string, expected: string): boolean {
  const left = normalizeAnswer(submitted).replace(/\s/g, '');
  const right = normalizeAnswer(expected).replace(/\s/g, '');
  if (left === right) return true;
  const assignment = (value: string) => {
    const parts = value.split('=');
    return parts.length === 2 ? parts : null;
  };
  const submittedAssignment = assignment(left);
  const expectedAssignment = assignment(right);
  if (submittedAssignment && expectedAssignment) {
    return (submittedAssignment[0] === expectedAssignment[1] && submittedAssignment[1] === expectedAssignment[0]) ||
      (submittedAssignment[0] === expectedAssignment[0] && numericEquivalent(submittedAssignment[1], expectedAssignment[1]));
  }
  return numericEquivalent(left, right);
}

function numericEquivalent(left: string, right: string): boolean {
  const parse = (value: string): number | null => {
    if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    const fraction = /^([+-]?\d+)\/([+-]?\d+)$/.exec(value);
    if (!fraction || Number(fraction[2]) === 0) return null;
    return Number(fraction[1]) / Number(fraction[2]);
  };
  const a = parse(left); const b = parse(right);
  return a !== null && b !== null && Math.abs(a - b) < 1e-10;
}

function findSeededQuiz(
  topicId: string,
  query: Pick<GetQuizByTopicQueryInput, 'grade_level_id' | 'subject_id'>
): InternalQuiz | null {
  return (
    seededQuizzes.find(
      (quiz) =>
        quiz.topic_id === topicId &&
        quiz.subject_id === query.subject_id &&
        quiz.grade_level_id === query.grade_level_id
    ) ?? null
  );
}

function requireSeededQuiz(quizId: string): InternalQuiz {
  const quiz = seededQuizzes.find((candidate) => candidate.quiz_id === quizId);

  if (!quiz) {
    throw new AppError('Quiz not found', 404, true, 'QUIZ_NOT_FOUND');
  }

  return quiz;
}

export async function getQuizByTopic(
  userId: string,
  topicId: string,
  query: GetQuizByTopicQueryInput
): Promise<QuizResponse> {
  try {
    const snapshot = await getFirestore().collection('practice_quizzes')
      .where('user_id', '==', userId).where('topic_id', '==', topicId)
      .where('subject_id', '==', query.subject_id).where('grade_level_id', '==', query.grade_level_id)
      .orderBy('created_at', 'desc').limit(1).get();
    if (!snapshot.empty) return publicQuiz(snapshot.docs[0].data() as InternalQuiz);
  } catch {
    if (!allowSeededQuizData()) {
      throw new AppError('Practice quiz storage is unavailable', 503, true, 'QUIZ_PERSISTENCE_UNAVAILABLE');
    }
  }
  const quiz = allowSeededQuizData() ? findSeededQuiz(topicId, query) : null;

  if (!quiz) {
    throw new AppError('No quiz is available for this topic yet', 404, true, 'QUIZ_NOT_FOUND');
  }

  return publicQuiz(quiz);
}

export async function createOrRetrieveQuiz(userId: string, payload: CreateQuizRequestInput): Promise<QuizResponse> {
  const quiz = allowSeededQuizData() ? findSeededQuiz(payload.topic_id, payload) : null;

  if (quiz) {
    return publicQuiz(quiz);
  }

  const generated = await generatePrivateQuiz(userId, payload);
  await persistPrivateQuiz(generated);
  return publicQuiz(generated);
}

function scoreSubmittedAnswers(
  quiz: InternalQuiz,
  payload: SubmitQuizRequestInput
): ScoredAnswer[] {
  const seenQuestionIds = new Set<string>();

  return payload.answers.map((answer) => {
    if (seenQuestionIds.has(answer.question_id)) {
      throw new AppError(
        'Duplicate answer submitted for a quiz question',
        400,
        true,
        'INVALID_QUIZ_SUBMISSION'
      );
    }
    seenQuestionIds.add(answer.question_id);

    const question = quiz.questions.find(
      (candidate) => candidate.question_id === answer.question_id
    );

    if (!question) {
      throw new AppError(
        'Answer references an unknown quiz question',
        400,
        true,
        'INVALID_QUIZ_SUBMISSION'
      );
    }

    const submittedAnswer = answer.answer ?? '';
    const selectedOptionId = answer.selected_option_id ?? null;
    const isCorrect =
      question.question_type === 'multiple_choice'
        ? selectedOptionId === question.correct_option_id
        : answersAreEquivalent(submittedAnswer, question.correct_answer ?? '');

    return {
      question_id: question.question_id,
      selected_option_id: selectedOptionId,
      submitted_answer: submittedAnswer,
      is_correct: isCorrect,
      score_awarded: isCorrect ? 1 : 0,
      feedback: isCorrect ? 'Correct.' : question.explanation,
    };
  });
}

async function persistAttempt(result: QuizAttemptResult): Promise<void> {
  const submittedAt = Timestamp.fromDate(new Date(result.submitted_at));
  const startedAt = submittedAt;
  const firestoreAttempt: QuizAttempt = {
    quiz_attempt_id: result.quiz_attempt_id,
    quiz_id: result.quiz_id,
    student_profile_id: result.user_id,
    tutor_session_id: result.tutor_session_id ?? null,
    score: result.score,
    correct_count: result.correct_count,
    incorrect_count: result.incorrect_count,
    skipped_count: result.skipped_count,
    started_at: startedAt,
    submitted_at: submittedAt,
  };

  try {
    const firestore = getFirestore();
    const attemptRef = firestore
      .collection('quiz_attempts')
      .withConverter(quizAttemptConverter)
      .doc(result.quiz_attempt_id);

    await attemptRef.set(firestoreAttempt);

    await Promise.all(
      result.answers.map((answer) => {
        const answerRef = firestore
          .collection('quiz_answers')
          .withConverter(quizAnswerConverter)
          .doc();
        const firestoreAnswer: QuizAnswer = {
          quiz_answer_id: answerRef.id,
          quiz_attempt_id: result.quiz_attempt_id,
          quiz_question_id: answer.question_id,
          selected_option_id: answer.selected_option_id,
          submitted_answer: answer.submitted_answer,
          is_correct: answer.is_correct,
          is_partially_correct: false,
          score_awarded: answer.score_awarded,
          feedback: answer.feedback,
          created_at: submittedAt,
        };
        return answerRef.set(firestoreAnswer);
      })
    );
  } catch {
    if (!allowSeededQuizData()) {
      throw new AppError(
        'Quiz attempt persistence is unavailable',
        503,
        true,
        'QUIZ_PERSISTENCE_UNAVAILABLE'
      );
    }
    storedDemoAttempts.set(result.quiz_attempt_id, result);
  }
}

export async function submitQuizAnswers(
  userId: string,
  quizId: string,
  payload: SubmitQuizRequestInput
): Promise<QuizAttemptResult> {
  const quiz = (await loadPrivateQuiz(userId, quizId)) ?? (allowSeededQuizData() ? requireSeededQuiz(quizId) : null);
  if (!quiz) throw new AppError('Quiz not found', 404, true, 'QUIZ_NOT_FOUND');
  const answers = scoreSubmittedAnswers(quiz, payload);
  const answeredQuestionIds = new Set(answers.map((answer) => answer.question_id));
  const skippedCount = quiz.questions.filter(
    (question) => !answeredQuestionIds.has(question.question_id)
  ).length;
  const correctCount = answers.filter((answer) => answer.is_correct).length;
  const incorrectCount = answers.length - correctCount;
  const score = Math.round((correctCount / quiz.questions.length) * 100);
  const submittedAt = new Date().toISOString();

  const result: QuizAttemptResult = {
    quiz_attempt_id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    quiz_id: quiz.quiz_id,
    user_id: userId,
    tutor_session_id: quiz.tutor_session_id,
    score,
    correct_count: correctCount,
    incorrect_count: incorrectCount,
    skipped_count: skippedCount,
    total_questions: quiz.questions.length,
    answers,
    submitted_at: submittedAt,
  };

  await persistAttempt(result);
  return result;
}

export function getStoredDemoQuizAttempt(quizAttemptId: string): QuizAttemptResult | undefined {
  return storedDemoAttempts.get(quizAttemptId);
}

export async function assertQuizAttemptOwnership(
  userId: string,
  quizAttemptId: string
): Promise<void> {
  const localAttempt = storedDemoAttempts.get(quizAttemptId);
  if (localAttempt) {
    if (localAttempt.user_id !== userId) {
      throw new AppError(
        'You cannot access another user quiz attempt',
        403,
        true,
        'QUIZ_ATTEMPT_FORBIDDEN'
      );
    }
    return;
  }
  try {
    const snapshot = await getFirestore().collection('quiz_attempts').doc(quizAttemptId).get();
    if (!snapshot.exists) {
      throw new AppError('Quiz attempt not found', 404, true, 'QUIZ_ATTEMPT_NOT_FOUND');
    }
    if (snapshot.data()?.student_profile_id !== userId) {
      throw new AppError(
        'You cannot access another user quiz attempt',
        403,
        true,
        'QUIZ_ATTEMPT_FORBIDDEN'
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      'Quiz attempt ownership could not be verified',
      503,
      true,
      'QUIZ_ATTEMPT_UNAVAILABLE'
    );
  }
}

export function clearStoredDemoQuizAttempts(): void {
  storedDemoAttempts.clear();
}
