import { Router } from 'express';
import {
  appendSessionTurn,
  archiveSession,
  createSession,
  getSessionDetail,
} from '../controllers/tutor-session.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { assertStudentAiAccess } from '../services/admin-ai-review.service';
import {
  appendTutorSessionTurnRequestSchema,
  createTutorSessionRequestSchema,
  tutorSessionParamsSchema,
} from '../schemas/tutor-session-request.schema';

const router = Router();

router.use(authenticate);
router.use(authorize('student'));
router.use(async (req, _res, next) => {
  try { await assertStudentAiAccess(req.user!.uid); next(); } catch (error) { next(error); }
});

router.post('/', validate({ body: createTutorSessionRequestSchema }), createSession);
router.post(
  '/:sessionId/sync',
  validate({ params: tutorSessionParamsSchema, body: appendTutorSessionTurnRequestSchema }),
  appendSessionTurn
);
router.get('/:sessionId', validate({ params: tutorSessionParamsSchema }), getSessionDetail);
router.patch('/:sessionId/archive', validate({ params: tutorSessionParamsSchema }), archiveSession);

export default router;
