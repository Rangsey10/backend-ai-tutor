import { Router } from 'express';
import { getAdminDashboard } from '../controllers/admin-dashboard.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, authorize('admin', 'administrator'), getAdminDashboard);

export default router;
