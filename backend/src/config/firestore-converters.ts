import { Timestamp, type FirestoreDataConverter, type QueryDocumentSnapshot, type DocumentData } from 'firebase-admin/firestore';
import { MathematicalVerification } from '@models/mathematical-verifications.model';
import { GradeLevel } from '@models/grade-levels.model';
import { StudentAttempt } from '@models/student-attempts.model';
import { StudentProfile } from '@models/student-profiles.model';
import { StudentSubject } from '@models/student-subjects.model';
import { StudentTopicProgress } from '@models/student-topic-progress.model';
import { Subject } from '@models/subjects.model';
import { ReportedAiResponse } from '@models/reported-ai-responses.model';
import { AiRequestLog } from '@models/ai-request-logs.model';
import { Quiz } from '@models/quizs.model';
import { QuizAnswer } from '@models/quiz-answers.model';
import { QuizAttempt } from '@models/quiz-attempts.model';
import { QuizOption } from '@models/quiz-options.model';
import { QuizQuestion } from '@models/quiz-questions.model';
import { TutorSession } from '@models/tutor-sessions.model';
import { TutorTurn } from '@models/tutor-turns.model';
import { Topic } from '@models/topics.model';
import { User } from '@models/users.model';

function createConverter<T extends Record<string, unknown>>(): FirestoreDataConverter<T> {
  return {
    toFirestore(modelObject: T): DocumentData {
      return modelObject;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): T {
      return snapshot.data() as T;
    },
  };
}

export const userConverter = createConverter<User>();
export const studentProfileConverter = createConverter<StudentProfile>();
export const gradeLevelConverter = createConverter<GradeLevel>();
export const subjectConverter = createConverter<Subject>();
export const topicConverter = createConverter<Topic>();
export const studentSubjectConverter = createConverter<StudentSubject>();
export const studentTopicProgressConverter = createConverter<StudentTopicProgress>();
export const reportedAiResponseConverter = createConverter<ReportedAiResponse>();
export const aiRequestLogConverter = createConverter<AiRequestLog>();
export const tutorSessionConverter = createConverter<TutorSession>();
export const tutorTurnConverter = createConverter<TutorTurn>();
export const studentAttemptConverter = createConverter<StudentAttempt>();
export const mathematicalVerificationConverter = createConverter<MathematicalVerification>();
export const quizConverter = createConverter<Quiz>();
export const quizQuestionConverter = createConverter<QuizQuestion>();
export const quizOptionConverter = createConverter<QuizOption>();
export const quizAttemptConverter = createConverter<QuizAttempt>();
export const quizAnswerConverter = createConverter<QuizAnswer>();

export const withFirestoreConverters = {
  users: userConverter,
  student_profiles: studentProfileConverter,
  grade_levels: gradeLevelConverter,
  subjects: subjectConverter,
  topics: topicConverter,
  student_subjects: studentSubjectConverter,
  student_topic_progress: studentTopicProgressConverter,
  reported_ai_responses: reportedAiResponseConverter,
  ai_request_logs: aiRequestLogConverter,
  tutor_sessions: tutorSessionConverter,
  turns: tutorTurnConverter,
  attempts: studentAttemptConverter,
  verifications: mathematicalVerificationConverter,
  quizzes: quizConverter,
  questions: quizQuestionConverter,
  options: quizOptionConverter,
  quiz_attempts: quizAttemptConverter,
  answers: quizAnswerConverter,
};

export const firestoreTimestamps = { Timestamp };
