import { Router } from 'express';
import { getAdminSettings, updateAdminSettings } from '../controllers/admin-settings.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.get('/', authenticate, authorize('admin', 'administrator'), getAdminSettings);
router.put('/', authenticate, authorize('admin', 'administrator'), updateAdminSettings);

export default router;
