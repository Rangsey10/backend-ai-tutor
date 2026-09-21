import { Router } from 'express';
import { getCatalog } from '../controllers/curriculum-catalog.controller';

const router = Router();

// Public / student catalog access
router.get('/catalog', getCatalog);

export default router;
