import { Router } from 'express';
import {
  createLessonCompletion,
  createQuizAttemptSummary,
  createStudentAnswerEvent,
  createTutorSessionSummary,
  readDashboardSummary,
  readRecentActivity,
  readWeakTopicSummary,
} from '../controllers/progress.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { userRateLimit } from '../middlewares/userRateLimit';
import {
  lessonCompletionSchema,
  quizAttemptSummarySchema,
  studentAnswerEventSchema,
  tutorSessionSummarySchema,
} from '../schemas/progress-request.schema';

const router = Router();

router.use(authenticate, authorize('student'));

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

export default router;
