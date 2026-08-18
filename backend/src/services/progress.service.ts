import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { getFirestore } from '../config/firebase';
import {
  quizAnswerConverter,
  quizAttemptConverter,
  quizConverter,
  studentProfileConverter,
  studentTopicProgressConverter,
  tutorActivityLogConverter,
} from '../config/firestore-converters';
import type { Quiz } from '../models/quizs.model';
import type { QuizAnswer } from '../models/quiz-answers.model';
import type { QuizAttempt } from '../models/quiz-attempts.model';
import type { StudentProfile } from '../models/student-profiles.model';
import type { StudentTopicProgress } from '../models/student-topic-progress.model';
import type { TutorActivityLog } from '../models/tutor-activity-logs.model';
import { AppError } from '../utils/AppError';

type SubmitQuizResultPayload = {
  quiz_id: string;
  topic_id: string;
  tutor_session_id?: string | null;
  duration_seconds: number;
  answers: Array<{
    quiz_question_id: string;
    selected_option_id?: string | null;
    submitted_answer: string;
    is_correct: boolean;
    is_partially_correct: boolean;
    score_awarded: number;
    feedback?: string | null;
  }>;
};

type TutorActivityPayload = {
  tutor_session_id?: string | null;
  topic_id?: string | null;
  interaction_count: number;
  visual_aids_generated: number;
  duration_seconds: number;
};

export type ProgressDashboardResponse = {
  total_quizzes: number;
  average_quiz_score: number;
  mastered_topics: number;
  current_streak: number;
  total_learning_time: number;
  total_tutor_sessions: number;
  total_interactions: number;
};

function db(): Firestore {
  return getFirestore();
}

async function requireProfile(firebaseUid: string): Promise<StudentProfile> {
  const snapshot = await db()
    .collection('student_profiles')
    .withConverter(studentProfileConverter)
    .where('user_id', '==', firebaseUid)
    .limit(1)
    .get();

  if (snapshot.empty) {
    throw new AppError('Student profile not found for the current user', 404);
  }

  return snapshot.docs[0].data();
}

async function requireQuiz(quizId: string): Promise<Quiz> {
  const quizByDocId = await db().collection('quizzes').withConverter(quizConverter).doc(quizId).get();

  if (quizByDocId.exists) {
    return quizByDocId.data()!;
  }

  const quizByField = await db()
    .collection('quizzes')
    .withConverter(quizConverter)
    .where('quiz_id', '==', quizId)
    .limit(1)
    .get();

  if (quizByField.empty) {
    throw new AppError('Quiz not found', 404);
  }

  return quizByField.docs[0].data();
}

export async function submitQuizResult(
  firebaseUid: string,
  payload: SubmitQuizResultPayload
): Promise<{ attempt: QuizAttempt; answers: QuizAnswer[] }> {
  const profile = await requireProfile(firebaseUid);
  const quiz = await requireQuiz(payload.quiz_id);
  const attemptRef = db().collection('quiz_attempts').withConverter(quizAttemptConverter).doc();
  const now = Timestamp.now();

  const correctCount = payload.answers.filter((answer) => answer.is_correct).length;
  const incorrectCount = payload.answers.filter((answer) => !answer.is_correct && !answer.is_partially_correct).length;
  const partialCount = payload.answers.filter((answer) => answer.is_partially_correct).length;
  const totalScore =
    payload.answers.reduce((sum, answer) => sum + answer.score_awarded, 0) /
    (payload.answers.length > 0 ? payload.answers.length : 1);
  const normalizedScore = Math.max(0, Math.min(100, Math.round(totalScore)));

  const attempt: QuizAttempt = {
    quiz_attempt_id: attemptRef.id,
    quiz_id: quiz.quiz_id,
    student_profile_id: profile.student_profile_id,
    score: normalizedScore,
    correct_count: correctCount,
    incorrect_count: incorrectCount,
    skipped_count: partialCount,
    started_at: now,
    submitted_at: now,
  };

  const answerRecords = payload.answers.map((answer) => {
    const answerRef = db().collection('quiz_answers').withConverter(quizAnswerConverter).doc();
    const answerRecord: QuizAnswer = {
      quiz_answer_id: answerRef.id,
      quiz_attempt_id: attemptRef.id,
      quiz_question_id: answer.quiz_question_id,
      selected_option_id: answer.selected_option_id ?? null,
      submitted_answer: answer.submitted_answer,
      is_correct: answer.is_correct,
      is_partially_correct: answer.is_partially_correct,
      score_awarded: answer.score_awarded,
      feedback: answer.feedback ?? null,
      created_at: now,
    };
    return { ref: answerRef, data: answerRecord };
  });

  const progressSnapshot = await db()
    .collection('student_topic_progress')
    .withConverter(studentTopicProgressConverter)
    .where('student_profile_id', '==', profile.student_profile_id)
    .where('topic_id', '==', payload.topic_id)
    .limit(1)
    .get();

  const progressRef =
    progressSnapshot.empty
      ? db().collection('student_topic_progress').withConverter(studentTopicProgressConverter).doc()
      : progressSnapshot.docs[0].ref;
  const existingProgress = progressSnapshot.empty ? null : progressSnapshot.docs[0].data();

  const quizzesCompleted = (existingProgress?.quizzes_completed ?? 0) + 1;
  const averageQuizScore =
    ((existingProgress?.average_quiz_score ?? 0) * (quizzesCompleted - 1) + normalizedScore) / quizzesCompleted;
  const masteryScore = Math.max(0, Math.min(100, Math.round(averageQuizScore)));

  const progress: StudentTopicProgress = {
    progress_id: existingProgress?.progress_id ?? progressRef.id,
    student_profile_id: profile.student_profile_id,
    topic_id: payload.topic_id,
    mastery_score: masteryScore,
    lessons_completed: existingProgress?.lessons_completed ?? 0,
    quizzes_completed: quizzesCompleted,
    average_quiz_score: averageQuizScore,
    correct_attempts: (existingProgress?.correct_attempts ?? 0) + correctCount,
    incorrect_attempts: (existingProgress?.incorrect_attempts ?? 0) + incorrectCount,
    created_at: existingProgress?.created_at ?? now,
    updated_at: now,
  };

  const profileDocSnapshot = await db()
    .collection('student_profiles')
    .withConverter(studentProfileConverter)
    .where('student_profile_id', '==', profile.student_profile_id)
    .limit(1)
    .get();

  await db().runTransaction(async (transaction) => {
    transaction.set(attemptRef, attempt);
    answerRecords.forEach((answer) => {
      transaction.set(answer.ref, answer.data);
    });
    transaction.set(progressRef, progress);

    if (!profileDocSnapshot.empty) {
      transaction.update(profileDocSnapshot.docs[0].ref, {
        total_learning_time: (profile.total_learning_time ?? 0) + payload.duration_seconds,
        current_streak: (profile.current_streak ?? 0) + 1,
        longest_streak: Math.max((profile.longest_streak ?? 0), (profile.current_streak ?? 0) + 1),
      });
    }
  });

  return {
    attempt,
    answers: answerRecords.map((answer) => answer.data),
  };
}

export async function logTutorActivity(
  firebaseUid: string,
  payload: TutorActivityPayload
): Promise<TutorActivityLog> {
  const profile = await requireProfile(firebaseUid);
  const logRef = db().collection('tutor_activity_logs').withConverter(tutorActivityLogConverter).doc();
  const log: TutorActivityLog = {
    tutor_activity_log_id: logRef.id,
    student_profile_id: profile.student_profile_id,
    tutor_session_id: payload.tutor_session_id ?? null,
    topic_id: payload.topic_id ?? null,
    interaction_count: payload.interaction_count,
    visual_aids_generated: payload.visual_aids_generated,
    duration_seconds: payload.duration_seconds,
    completed_at: Timestamp.now(),
  };

  await logRef.set(log);
  return log;
}

export async function getProgressDashboard(firebaseUid: string): Promise<ProgressDashboardResponse> {
  const profile = await requireProfile(firebaseUid);
  const [attemptsSnapshot, topicsSnapshot, activitiesSnapshot] = await Promise.all([
    db()
      .collection('quiz_attempts')
      .withConverter(quizAttemptConverter)
      .where('student_profile_id', '==', profile.student_profile_id)
      .get(),
    db()
      .collection('student_topic_progress')
      .withConverter(studentTopicProgressConverter)
      .where('student_profile_id', '==', profile.student_profile_id)
      .get(),
    db()
      .collection('tutor_activity_logs')
      .withConverter(tutorActivityLogConverter)
      .where('student_profile_id', '==', profile.student_profile_id)
      .get(),
  ]);

  const attempts = attemptsSnapshot.docs.map((doc) => doc.data());
  const activities = activitiesSnapshot.docs.map((doc) => doc.data());
  const averageQuizScore =
    attempts.length === 0
      ? 0
      : Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length);

  return {
    total_quizzes: attempts.length,
    average_quiz_score: averageQuizScore,
    mastered_topics: topicsSnapshot.docs.filter((doc) => doc.data().mastery_score >= 80).length,
    current_streak: profile.current_streak,
    total_learning_time: profile.total_learning_time,
    total_tutor_sessions: new Set(activities.map((activity) => activity.tutor_session_id).filter(Boolean)).size,
    total_interactions: activities.reduce((sum, activity) => sum + activity.interaction_count, 0),
  };
}

export async function getProgressHistory(firebaseUid: string): Promise<{
  quiz_attempts: QuizAttempt[];
  topic_progress: StudentTopicProgress[];
  tutor_activity_logs: TutorActivityLog[];
}> {
  const profile = await requireProfile(firebaseUid);
  const [attemptsSnapshot, progressSnapshot, activitySnapshot] = await Promise.all([
    db()
      .collection('quiz_attempts')
      .withConverter(quizAttemptConverter)
      .where('student_profile_id', '==', profile.student_profile_id)
      .orderBy('started_at', 'desc')
      .limit(50)
      .get(),
    db()
      .collection('student_topic_progress')
      .withConverter(studentTopicProgressConverter)
      .where('student_profile_id', '==', profile.student_profile_id)
      .orderBy('updated_at', 'desc')
      .limit(100)
      .get(),
    db()
      .collection('tutor_activity_logs')
      .withConverter(tutorActivityLogConverter)
      .where('student_profile_id', '==', profile.student_profile_id)
      .orderBy('completed_at', 'desc')
      .limit(100)
      .get(),
  ]);

  return {
    quiz_attempts: attemptsSnapshot.docs.map((doc) => doc.data()),
    topic_progress: progressSnapshot.docs.map((doc) => doc.data()),
    tutor_activity_logs: activitySnapshot.docs.map((doc) => doc.data()),
  };
}
