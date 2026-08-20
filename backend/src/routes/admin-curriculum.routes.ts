import { Router } from 'express';
import {
  createAdminContent,
  createAdminGrade,
  createAdminSubject,
  deleteAdminContent,
  getAdminContent,
  getAdminGrades,
  getAdminSubjects,
  getAdminTopics,
  updateAdminContent,
  updateAdminGrade,
  updateAdminSubject,
} from '../controllers/admin-curriculum.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';

const router = Router();

router.use(authenticate, authorize('admin', 'administrator'));

router.get('/grades', getAdminGrades);
router.post('/grades', createAdminGrade);
router.put('/grades/:gradeLevelId', updateAdminGrade);
router.get('/subjects', getAdminSubjects);
router.post('/subjects', createAdminSubject);
router.put('/subjects/:subjectId', updateAdminSubject);
router.get('/topics', getAdminTopics);
router.get('/content', getAdminContent);
router.post('/content', createAdminContent);
router.put('/content/:contentId', updateAdminContent);
router.delete('/content/:contentId', deleteAdminContent);

export default router;
