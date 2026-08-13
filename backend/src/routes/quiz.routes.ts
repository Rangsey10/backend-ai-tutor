import { Router } from 'express';
import { getQuizForTopic, createQuiz, submitQuiz } from '../controllers/quiz.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { userRateLimit } from '../middlewares/userRateLimit';
import {
  createQuizRequestSchema,
  getQuizByTopicQuerySchema,
  quizIdParamsSchema,
  quizTopicParamsSchema,
  submitQuizRequestSchema,
} from '../schemas/quiz-request.schema';

const router = Router();

router.use(authenticate, authorize('student'));

router.get(
  '/topic/:topicId',
  validate({ params: quizTopicParamsSchema, query: getQuizByTopicQuerySchema }),
  getQuizForTopic
);
router.post(
  '/generate',
  userRateLimit('quiz-generate', 10, 10 * 60_000),
  validate({ body: createQuizRequestSchema }),
  createQuiz
);
router.post(
  '/:quizId/submit',
  userRateLimit('quiz-submit', 30, 10 * 60_000),
  validate({ params: quizIdParamsSchema, body: submitQuizRequestSchema }),
  submitQuiz
);

export default router;
