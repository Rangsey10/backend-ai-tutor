import { Router } from 'express';
import { createTutorReport, getMyNotifications, getMyTutorReports } from '../controllers/tutor-report.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { userRateLimit } from '../middlewares/userRateLimit';
import { validate } from '../middlewares/validate';
import { createStudentTutorReportSchema } from '../schemas/reported-ai-responses.schema';

const router = Router();
router.use(authenticate, authorize('student'));
router.post('/', userRateLimit('tutor-report', 10, 60 * 60_000), validate({ body: createStudentTutorReportSchema }), createTutorReport);
router.get('/mine', getMyTutorReports);
router.get('/notifications', getMyNotifications);

export default router;
