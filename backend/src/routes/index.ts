import { Router } from 'express';
import healthRoutes from './health.routes';
import profileRoutes from './profile.routes';
import catalogRoutes from './catalog.routes';
import tutorRoutes from './tutor.routes';
import quizRoutes from './quiz.routes';
import authRoutes from './auth.routes';
import adminAuthRoutes from './admin-auth.routes';
import adminDashboardRoutes from './admin-dashboard.routes';
import adminStudentsRoutes from './admin-students.routes';
import adminSettingsRoutes from './admin-settings.routes';
import adminCurriculumRoutes from './admin-curriculum.routes';
import tutorSessionRoutes from './tutor-session.routes';
import progressRoutes from './progress.routes';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/catalog', catalogRoutes);
router.use('/tutor', tutorRoutes);
router.use('/quizzes', quizRoutes);
router.use('/admin/auth', adminAuthRoutes);
router.use('/admin/dashboard', adminDashboardRoutes);
router.use('/admin/students', adminStudentsRoutes);
router.use('/admin/settings', adminSettingsRoutes);
router.use('/admin/curriculum', adminCurriculumRoutes);
router.use('/tutor-sessions', tutorSessionRoutes);
router.use('/tutor-sessions', tutorSessionRoutes);
router.use('/progress', progressRoutes);

// Future route groups will be mounted here as they're built:
// router.use('/users', userRoutes);
// router.use('/curriculum', curriculumRoutes);
// router.use('/admin', adminRoutes);

export default router;
