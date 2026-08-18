import { Router } from 'express';
import {
  createLessonCompletion,
  createQuizAttemptSummary,
  createStudentAnswerEvent,
  createTutorActivityLog,
  createTutorSessionSummary,
  getDashboard,
  getHistory,
  readDashboardSummary,
  readRecentActivity,
  readWeakTopicSummary,
  submitQuiz,
} from '../controllers/progress.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { userRateLimit } from '../middlewares/userRateLimit';
import {
  lessonCompletionSchema,
  quizAttemptSummarySchema,
  studentAnswerEventSchema,
  submitQuizResultRequestSchema,
  tutorActivityRequestSchema,
  tutorSessionSummarySchema,
} from '../schemas/progress-request.schema';

const router = Router();

router.use(authenticate);
router.use(authorize('student'));

router.post(
  '/tutor-sessions',
  userRateLimit('progress-write', 60, 60_000),
  validate({ body: tutorSessionSummarySchema }),
  createTutorSessionSummary
);
router.post(
  '/lessons/complete',
  userRateLimit('progress-write', 60, 60_000),
  validate({ body: lessonCompletionSchema }),
  createLessonCompletion
);
router.post(
  '/answers',
  userRateLimit('progress-write', 60, 60_000),
  validate({ body: studentAnswerEventSchema }),
  createStudentAnswerEvent
);
router.post(
  '/quiz-attempts',
  userRateLimit('progress-write', 60, 60_000),
  validate({ body: quizAttemptSummarySchema }),
  createQuizAttemptSummary
);
router.get('/dashboard', readDashboardSummary);
router.get('/recent-activity', readRecentActivity);
router.get('/weak-topic', readWeakTopicSummary);

router.post('/quiz-results', validate({ body: submitQuizResultRequestSchema }), submitQuiz);
router.post('/tutor-activity', validate({ body: tutorActivityRequestSchema }), createTutorActivityLog);
router.get('/dashboard-v2', getDashboard);
router.get('/history', getHistory);

export default router;
