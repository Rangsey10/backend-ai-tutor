import { Router } from 'express';
import { getAdminStudents } from '../controllers/admin-students.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, authorize('admin', 'administrator'), getAdminStudents);

export default router;
