import { Router } from 'express';
import express from 'express';
import {
  createSession,
  getSession,
  getUserSessions,
  sendTurn,
  scanProblem,
  transcribeVoice,
  synthesizeVoice,
} from '../controllers/tutor.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { userRateLimit } from '../middlewares/userRateLimit';
import {
  createTutorSessionRequestSchema,
  tutorSessionParamsSchema,
  tutorTurnRequestSchema,
  tutorUserSessionsParamsSchema,
} from '../schemas/tutor-request.schema';

const router = Router();

router.use(authenticate, authorize('student'));

router.post(
  '/sessions',
  userRateLimit('tutor-session', 20, 60_000),
  validate({ body: createTutorSessionRequestSchema }),
  createSession
);
router.post(
  '/scan',
  userRateLimit('tutor-scan', 5, 10 * 60_000),
  express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' }),
  scanProblem
);
router.post(
  '/voice/transcribe',
  userRateLimit('tutor-stt', 10, 10 * 60_000),
  express.raw({ type: 'audio/wav', limit: '12mb' }),
  transcribeVoice
);
router.post(
  '/voice/synthesize',
  userRateLimit('tutor-tts', 20, 10 * 60_000),
  synthesizeVoice
);
router.get(
  '/sessions/user/:userId',
  validate({ params: tutorUserSessionsParamsSchema }),
  getUserSessions
);
router.get('/sessions/:sessionId', validate({ params: tutorSessionParamsSchema }), getSession);
router.post(
  '/turn',
  userRateLimit('tutor-turn', 40, 60_000),
  validate({ body: tutorTurnRequestSchema }),
  sendTurn
);

export default router;
