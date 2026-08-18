import { Router } from 'express';
import {
  createTutorActivityLog,
  getDashboard,
  getHistory,
  submitQuiz,
} from '../controllers/progress.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import {
  submitQuizResultRequestSchema,
  tutorActivityRequestSchema,
} from '../schemas/progress-request.schema';

const router = Router();

router.use(authenticate);
router.use(authorize('student', 'tutor', 'teacher', 'admin', 'administrator'));

router.post('/quiz-results', validate({ body: submitQuizResultRequestSchema }), submitQuiz);
router.post('/tutor-activity', validate({ body: tutorActivityRequestSchema }), createTutorActivityLog);
router.get('/dashboard', getDashboard);
router.get('/history', getHistory);

export default router;
