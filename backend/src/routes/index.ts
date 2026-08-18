import { Router } from 'express';
import healthRoutes from './health.routes';
import profileRoutes from './profile.routes';
import catalogRoutes from './catalog.routes';
import tutorRoutes from './tutor.routes';
import quizRoutes from './quiz.routes';
import authRoutes from './auth.routes';
import tutorSessionRoutes from './tutor-session.routes';
import progressRoutes from './progress.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/catalog', catalogRoutes);
router.use('/tutor', tutorRoutes);
router.use('/quizzes', quizRoutes);
router.use('/tutor-sessions', tutorSessionRoutes);
router.use('/tutor-sessions', tutorSessionRoutes);
router.use('/progress', progressRoutes);

// Future route groups will be mounted here as they're built:
// router.use('/users', userRoutes);
// router.use('/curriculum', curriculumRoutes);
// router.use('/admin', adminRoutes);

export default router;
