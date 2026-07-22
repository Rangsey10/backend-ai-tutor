import { Router } from 'express';
import healthRoutes from './health.routes';

const router = Router();

router.use('/health', healthRoutes);

// Future route groups will be mounted here as they're built:
// router.use('/auth', authRoutes);
// router.use('/users', userRoutes);
// router.use('/curriculum', curriculumRoutes);
// router.use('/quizzes', quizRoutes);
// router.use('/progress', progressRoutes);
// router.use('/admin', adminRoutes);

export default router;
