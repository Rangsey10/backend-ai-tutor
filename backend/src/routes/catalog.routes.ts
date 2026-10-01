import { Router } from 'express';
import {
  getGrades,
  getLessonContent,
  getPublishedLessons,
  getSubjects,
  getTopics,
} from '../controllers/catalog.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { listTopicsQuerySchema } from '../schemas/catalog-request.schema';
import {
  lessonContentParamsSchema,
  listPublishedLessonsQuerySchema,
} from '../schemas/published-lesson-catalog.schema';

const router = Router();

router.use(authenticate, authorize('student'));

router.get('/grades', getGrades);
router.get('/subjects', getSubjects);
router.get('/topics', validate({ query: listTopicsQuerySchema }), getTopics);
router.get('/published-lessons', validate({ query: listPublishedLessonsQuerySchema }), getPublishedLessons);
router.get('/lessons', validate({ query: listPublishedLessonsQuerySchema }), getPublishedLessons);
router.get('/lessons/:lessonId/content', validate({ params: lessonContentParamsSchema }), getLessonContent);
router.get('/published-lessons/:lessonId/content', validate({ params: lessonContentParamsSchema }), getLessonContent);

export default router;
