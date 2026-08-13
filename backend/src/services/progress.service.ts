import { Timestamp } from 'firebase-admin/firestore';
import { env } from '../config/env';
import { getFirestore, isFirebaseInitialized } from '../config/firebase';
import { logger } from '../utils/logger';
import { getDashboardLearnerProfile, type DashboardLearnerProfile } from './profile.service';
import type {
  LessonCompletionInput,
  QuizAttemptSummaryInput,
  StudentAnswerEventInput,
  TutorSessionSummaryInput,
} from '../schemas/progress-request.schema';

type ProgressEventType =
  'tutor_session_summary' | 'lesson_completion' | 'student_answer' | 'quiz_attempt_summary';

type StoredProgressEvent = {
  id: string;
  user_id: string;
  event_type: ProgressEventType;
  topic_id: string | null;
  subject_id: string | null;
  score: number | null;
  is_correct: boolean | null;
  payload: Record<string, unknown>;
  created_at: string;
};

function hasVerifiedCorrectness(event: StoredProgressEvent): boolean {
  if (typeof event.is_correct !== 'boolean') return false;
  const metadata = typeof event.payload.metadata === 'object' && event.payload.metadata !== null
    ? event.payload.metadata as Record<string, unknown> : null;
  // New Visual Tutor writes include this explicit bit. Older durable events did
  // not, and retain their historical deterministic result for continuity.
  return event.payload.verification_verified === undefined && metadata?.verification_verified === undefined
    ? true
    : event.payload.verification_verified === true || metadata?.verification_verified === true;
}

export type StoredProgressEventResponse = {
  id: string;
  event_type: ProgressEventType;
  status: 'recorded';
  created_at: string;
};

export type DashboardSummary = {
  user_id: string;
  learner: DashboardLearnerProfile;
  total_sessions: number;
  lessons_completed: number;
  quiz_attempts: number;
  average_quiz_score: number | null;
  correct_answers: number;
  incorrect_answers: number;
  current_streak: number;
  resume_lesson: ResumeLessonSummary | null;
  weak_topic: WeakTopicSummary;
  practice_recommendations: PracticeRecommendation[];
  completed_practice: number;
  recent_activity: RecentActivityItem[];
  subject_progress: SubjectProgressSummary[];
  persistence: ProgressPersistenceSummary;
  empty_state: boolean;
};

export type ResumeLessonSummary = {
  tutor_session_id: string;
  subject_id: string | null;
  topic_id: string | null;
  status: string;
  board_version: number | null;
};

export type RecentActivityItem = {
  id: string;
  event_type: ProgressEventType;
  topic_id: string | null;
  tutor_session_id: string | null;
  title: string;
  created_at: string;
};

export type WeakTopicSummary = {
  topic_id: string | null;
  confidence: 'none' | 'low' | 'medium';
  reason: string;
};

export type SubjectProgressSummary = {
  subject_id: string;
  topic_id: string;
  progress_percent: number;
  correct_answers: number;
  total_answers: number;
  lessons_completed: number;
  quiz_attempts: number;
  average_quiz_score: number | null;
  evidence_count: number;
  readiness: 'needs_practice' | 'building' | 'ready' | null;
};

export type PracticeRecommendation = {
  topic_id: string;
  subject_id: string;
  reason: string;
  evidence_count: number;
};

export type ProgressPersistenceSummary = {
  mode: 'firestore' | 'local_memory';
  durable: boolean;
};

const localEvents = new Map<string, StoredProgressEvent[]>();
const FIRESTORE_PROGRESS_TIMEOUT_MS = 1200;

function eventsForUser(userId: string): StoredProgressEvent[] {
  return localEvents.get(userId) ?? [];
}

function buildId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function withFirestoreTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Firestore progress operation timed out')),
          FIRESTORE_PROGRESS_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function persistProgressEvent(event: StoredProgressEvent): Promise<void> {
  const currentEvents = eventsForUser(event.user_id);
  localEvents.set(event.user_id, [...currentEvents, event]);

  try {
    await withFirestoreTimeout(
      getFirestore()
        .collection('student_progress_events')
        .doc(event.id)
        .set({
          ...event,
          created_at: Timestamp.fromDate(new Date(event.created_at)),
        })
    );
  } catch (error) {
    const firestoreError = error as { code?: unknown; message?: unknown };
    logger.error('Firestore progress read failed', {
      firestore_code: typeof firestoreError.code === 'string' ? firestoreError.code : undefined,
      firestore_message:
        typeof firestoreError.message === 'string' ? firestoreError.message : 'Unknown Firestore error',
    });
    if (!env.firebase.allowLocalFallback || env.isProductionLike) {
      throw new Error('Firestore progress persistence is unavailable');
    }
    // Local demo mode intentionally keeps an in-memory event copy when Firestore is unavailable.
  }
}

function eventResponse(event: StoredProgressEvent): StoredProgressEventResponse {
  return {
    id: event.id,
    event_type: event.event_type,
    status: 'recorded',
    created_at: event.created_at,
  };
}

function createEvent(
  userId: string,
  eventType: ProgressEventType,
  payload: Record<string, unknown>,
  topicId: string | null,
  subjectId: string | null,
  score: number | null,
  isCorrect: boolean | null
): StoredProgressEvent {
  return {
    id: buildId(eventType),
    user_id: userId,
    event_type: eventType,
    topic_id: topicId,
    subject_id: subjectId,
    score,
    is_correct: isCorrect,
    payload,
    created_at: new Date().toISOString(),
  };
}

export async function storeTutorSessionSummary(
  userId: string,
  payload: TutorSessionSummaryInput
): Promise<StoredProgressEventResponse> {
  const event = createEvent(
    userId,
    'tutor_session_summary',
    payload,
    payload.topic_id,
    payload.subject_id,
    null,
    null
  );
  await persistProgressEvent(event);
  return eventResponse(event);
}

export async function storeLessonCompletion(
  userId: string,
  payload: LessonCompletionInput
): Promise<StoredProgressEventResponse> {
  const event = createEvent(
    userId,
    'lesson_completion',
    payload,
    payload.topic_id,
    payload.subject_id ?? null,
    null,
    null
  );
  await persistProgressEvent(event);
  return eventResponse(event);
}

export async function storeStudentAnswerEvent(
  userId: string,
  payload: StudentAnswerEventInput
): Promise<StoredProgressEventResponse> {
  const event = createEvent(
    userId,
    'student_answer',
    payload,
    payload.topic_id ?? null,
    payload.subject_id ?? null,
    payload.score,
    payload.is_correct ?? null
  );
  await persistProgressEvent(event);
  return eventResponse(event);
}

export async function storeQuizAttemptSummary(
  userId: string,
  payload: QuizAttemptSummaryInput
): Promise<StoredProgressEventResponse> {
  const event = createEvent(
    userId,
    'quiz_attempt_summary',
    payload,
    payload.topic_id ?? null,
    payload.subject_id ?? null,
    payload.score,
    null
  );
  await persistProgressEvent(event);
  return eventResponse(event);
}

async function readProgressEvents(userId: string): Promise<{
  events: StoredProgressEvent[];
  persistence: ProgressPersistenceSummary;
}> {
  // A local development server may deliberately run without Firebase. Avoid
  // starting a network request to a non-configured Firestore project: it makes
  // the dashboard appear to load forever in the Flutter web app.
  if (!isFirebaseInitialized() && env.firebase.allowLocalFallback && !env.isProductionLike) {
    return {
      events: eventsForUser(userId),
      persistence: { mode: 'local_memory', durable: false },
    };
  }

  try {
    const snapshot = await withFirestoreTimeout(
      getFirestore().collection('student_progress_events').where('user_id', '==', userId).get()
    );
    const events = snapshot.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      const createdAt = data.created_at;
      const timestampLike = (
        typeof createdAt === 'object' &&
        createdAt !== null &&
        'toDate' in createdAt &&
        typeof createdAt.toDate === 'function'
          ? createdAt
          : null
      ) as { toDate: () => Date } | null;
      return {
        ...(data as unknown as StoredProgressEvent),
        created_at: timestampLike
          ? timestampLike.toDate().toISOString()
          : String(createdAt ?? new Date().toISOString()),
      };
    });
    return { events, persistence: { mode: 'firestore', durable: true } };
  } catch {
    if (!env.firebase.allowLocalFallback || env.isProductionLike) {
      throw new Error('Firestore progress read is unavailable');
    }
    return {
      events: eventsForUser(userId),
      persistence: { mode: 'local_memory', durable: false },
    };
  }
}

function buildRecentActivity(events: StoredProgressEvent[], limit = 10): RecentActivityItem[] {
  return events
    .slice()
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit)
    .map((event) => ({
      id: event.id,
      event_type: event.event_type,
      topic_id: event.topic_id,
      tutor_session_id:
        typeof event.payload.tutor_session_id === 'string' ? event.payload.tutor_session_id : null,
      title: activityTitle(event),
      created_at: event.created_at,
    }));
}

export async function getRecentActivity(userId: string, limit = 10): Promise<RecentActivityItem[]> {
  const { events } = await readProgressEvents(userId);
  return buildRecentActivity(events, limit);
}

function activityTitle(event: StoredProgressEvent): string {
  if (event.event_type === 'lesson_completion') return 'Completed a lesson';
  if (event.event_type === 'student_answer') {
    return event.is_correct ? 'Answered correctly' : 'Submitted an answer';
  }
  if (event.event_type === 'quiz_attempt_summary') return `Quiz score: ${event.score}%`;
  return 'Started tutor session';
}

function buildWeakTopicSummary(events: StoredProgressEvent[]): WeakTopicSummary {
  const answerEvents = events.filter(
    (event) => event.event_type === 'student_answer' && event.topic_id && hasVerifiedCorrectness(event)
  );

  if (answerEvents.length < 3) {
    return {
      topic_id: null,
      confidence: 'none',
      reason: 'Not enough answer history yet.',
    };
  }

  const topicStats = new Map<string, { correct: number; total: number }>();
  for (const event of answerEvents) {
    const topicId = event.topic_id;
    if (!topicId) continue;
    const stat = topicStats.get(topicId) ?? { correct: 0, total: 0 };
    stat.total += 1;
    if (event.is_correct) stat.correct += 1;
    topicStats.set(topicId, stat);
  }

  const weakest = Array.from(topicStats.entries()).sort((left, right) => {
    const leftAccuracy = left[1].correct / left[1].total;
    const rightAccuracy = right[1].correct / right[1].total;
    return leftAccuracy - rightAccuracy;
  })[0];

  if (!weakest) {
    return {
      topic_id: null,
      confidence: 'none',
      reason: 'Not enough topic-specific answer history yet.',
    };
  }

  return {
    topic_id: weakest[0],
    confidence: weakest[1].total >= 5 ? 'medium' : 'low',
    reason: `${weakest[1].correct}/${weakest[1].total} recent answers were correct.`,
  };
}

export function calculateCurrentStreak(
  events: Array<Pick<StoredProgressEvent, 'created_at'>>,
  now = new Date()
): number {
  const activeDays = new Set(
    events
      .map((event) => {
        const date = new Date(event.created_at);
        return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
      })
      .filter(Boolean)
  );
  let streak = 0;
  const cursor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (activeDays.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function buildResumeLesson(events: StoredProgressEvent[]): ResumeLessonSummary | null {
  const sessionEvents = events
    .filter((event) => event.event_type === 'tutor_session_summary')
    .filter((event) => typeof event.payload.tutor_session_id === 'string')
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const event = sessionEvents.find((item) => item.payload.status === 'active') ?? sessionEvents[0];
  if (!event || typeof event.payload.tutor_session_id !== 'string') return null;
  const metadata = event.payload.metadata;
  const boardVersion =
    typeof metadata === 'object' && metadata !== null
      ? (metadata as Record<string, unknown>).board_version
      : null;
  return {
    tutor_session_id: event.payload.tutor_session_id,
    subject_id: event.subject_id,
    topic_id: event.topic_id,
    status: typeof event.payload.status === 'string' ? event.payload.status : 'active',
    board_version:
      typeof boardVersion === 'number' && Number.isInteger(boardVersion) ? boardVersion : null,
  };
}

export async function getWeakTopicSummary(userId: string): Promise<WeakTopicSummary> {
  const { events } = await readProgressEvents(userId);
  return buildWeakTopicSummary(events);
}

function buildSubjectProgress(events: StoredProgressEvent[]): SubjectProgressSummary[] {
  const topicStats = new Map<
    string,
    {
      subjectId: string;
      correctAnswers: number;
      totalAnswers: number;
      lessonsCompleted: number;
      quizAttempts: number;
      quizScores: number[];
    }
  >();

  for (const event of events) {
    const topicId = event.topic_id ?? 'general';
    const stat = topicStats.get(topicId) ?? {
      subjectId: event.subject_id ?? 'general',
      correctAnswers: 0,
      totalAnswers: 0,
      lessonsCompleted: 0,
      quizAttempts: 0,
      quizScores: [],
    };

    if (event.subject_id) stat.subjectId = event.subject_id;
    if (event.event_type === 'student_answer' && hasVerifiedCorrectness(event)) {
      stat.totalAnswers += 1;
      if (event.is_correct) stat.correctAnswers += 1;
    }
    if (event.event_type === 'lesson_completion') stat.lessonsCompleted += 1;
    if (event.event_type === 'quiz_attempt_summary') {
      stat.quizAttempts += 1;
      if (typeof event.score === 'number') stat.quizScores.push(event.score);
    }
    topicStats.set(topicId, stat);
  }

  return Array.from(topicStats.entries())
    .map(([topicId, stat]) => {
      const answerProgress = stat.totalAnswers > 0 ? stat.correctAnswers / stat.totalAnswers : 0;
      const quizAverage =
        stat.quizScores.length > 0
          ? stat.quizScores.reduce((total, score) => total + score, 0) / stat.quizScores.length
          : null;
      const quizProgress = quizAverage === null ? 0 : quizAverage / 100;
      const completionBoost = stat.lessonsCompleted > 0 ? 0.2 : 0;
      const weightedProgress =
        stat.totalAnswers > 0 || quizAverage !== null
          ? answerProgress * 0.45 + quizProgress * 0.35 + completionBoost
          : completionBoost;
      return {
        subject_id: stat.subjectId,
        topic_id: topicId,
        progress_percent: Math.max(0, Math.min(100, Math.round(weightedProgress * 100))),
        correct_answers: stat.correctAnswers,
        total_answers: stat.totalAnswers,
        lessons_completed: stat.lessonsCompleted,
        quiz_attempts: stat.quizAttempts,
        average_quiz_score: quizAverage === null ? null : Math.round(quizAverage),
        evidence_count: stat.totalAnswers + stat.quizAttempts,
        readiness: (
          stat.totalAnswers + stat.quizAttempts < 3
            ? null
            : weightedProgress >= 0.8
              ? 'ready'
              : weightedProgress >= 0.5
                ? 'building'
                : 'needs_practice'
        ) as SubjectProgressSummary['readiness'],
      };
    })
    .sort((left, right) => right.progress_percent - left.progress_percent);
}

function buildPracticeRecommendations(progress: SubjectProgressSummary[]): PracticeRecommendation[] {
  return progress
    .filter((item) => item.evidence_count >= 3 && item.progress_percent < 80)
    .sort((left, right) => left.progress_percent - right.progress_percent)
    .slice(0, 3)
    .map((item) => ({
      topic_id: item.topic_id,
      subject_id: item.subject_id,
      evidence_count: item.evidence_count,
      reason: item.progress_percent < 50
        ? 'Recent verified work shows this skill needs more practice.'
        : 'A short practice set can strengthen this developing skill.',
    }));
}

export async function getDashboardSummary(userId: string): Promise<DashboardSummary> {
  const [{ events, persistence }, learner] = await Promise.all([
    readProgressEvents(userId),
    getDashboardLearnerProfile(userId),
  ]);
  const quizEvents = events.filter((event) => event.event_type === 'quiz_attempt_summary');
  const answerEvents = events.filter((event) => event.event_type === 'student_answer' && hasVerifiedCorrectness(event));
  const quizScores = quizEvents
    .map((event) => event.score)
    .filter((score): score is number => typeof score === 'number');
  const averageQuizScore =
    quizScores.length > 0
      ? Math.round(quizScores.reduce((total, score) => total + score, 0) / quizScores.length)
      : null;

  const subjectProgress = buildSubjectProgress(events);
  return {
    user_id: userId,
    learner,
    total_sessions: events.filter((event) => event.event_type === 'tutor_session_summary').length,
    lessons_completed: events.filter((event) => event.event_type === 'lesson_completion').length,
    quiz_attempts: quizEvents.length,
    average_quiz_score: averageQuizScore,
    correct_answers: answerEvents.filter((event) => event.is_correct).length,
    incorrect_answers: answerEvents.filter((event) => event.is_correct === false).length,
    current_streak: calculateCurrentStreak(events),
    resume_lesson: buildResumeLesson(events),
    weak_topic: buildWeakTopicSummary(events),
    practice_recommendations: buildPracticeRecommendations(subjectProgress),
    completed_practice: quizEvents.length,
    recent_activity: buildRecentActivity(events, 5),
    subject_progress: subjectProgress,
    persistence,
    empty_state: events.length === 0,
  };
}

export function clearLocalProgressEvents(): void {
  localEvents.clear();
}
