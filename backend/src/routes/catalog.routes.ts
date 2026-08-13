import { Router } from 'express';
import { getGrades, getSubjects, getTopics } from '../controllers/catalog.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { listTopicsQuerySchema } from '../schemas/catalog-request.schema';

const router = Router();

router.use(authenticate, authorize('student'));

router.get('/grades', getGrades);
router.get('/subjects', getSubjects);
router.get('/topics', validate({ query: listTopicsQuerySchema }), getTopics);

export default router;
