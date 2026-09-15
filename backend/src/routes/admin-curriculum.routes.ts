import { Router } from 'express';
import {
  createAdminContent,
  createAdminGrade,
  createAdminSubject,
  createAdminTopic,
  deleteAdminContent,
  getAdminContent,
  getAdminGrades,
  getAdminSubjects,
  getAdminTopics,
  updateAdminContent,
  updateAdminGrade,
  updateAdminSubject,
  updateAdminTopic,
  updateAdminTopicStatus,
} from '../controllers/admin-curriculum.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { requireAdminCsrf } from '../middlewares/admin-csrf';
import {
  adminTopicCreateRequestSchema,
  adminTopicParamsSchema,
  adminTopicStatusRequestSchema,
  adminTopicUpdateRequestSchema,
} from '../schemas/topics.schema';
import {
  archiveCurriculumVersion,
  compareCurriculumVersion,
  createCurriculumVersion,
  listCurriculumVersions,
  publishCurriculumVersion,
  rejectCurriculumVersion,
  submitCurriculumVersionForReview,
} from '../controllers/curriculum-version.controller';
import {
  createCurriculumVersionSchema,
  curriculumVersionParamsSchema,
  lifecycleRequestSchema,
  rejectCurriculumVersionSchema,
} from '../schemas/curriculum-versions.schema';

const router = Router();

router.use(authenticate, authorize('admin', 'administrator'));
router.use(requireAdminCsrf);

router.get('/grades', getAdminGrades);
router.post('/grades', createAdminGrade);
router.put('/grades/:gradeLevelId', updateAdminGrade);
router.get('/subjects', getAdminSubjects);
router.post('/subjects', createAdminSubject);
router.put('/subjects/:subjectId', updateAdminSubject);
router.get('/topics', getAdminTopics);
router.post('/topics', validate({ body: adminTopicCreateRequestSchema }), createAdminTopic);
router.put('/topics/:topicId', validate({ params: adminTopicParamsSchema, body: adminTopicUpdateRequestSchema }), updateAdminTopic);
router.patch('/topics/:topicId/status', validate({ params: adminTopicParamsSchema, body: adminTopicStatusRequestSchema }), updateAdminTopicStatus);
router.get('/versions', listCurriculumVersions);
router.post('/versions', validate({ body: createCurriculumVersionSchema }), createCurriculumVersion);
router.post('/versions/:curriculumVersionId/submit-review', validate({ params: curriculumVersionParamsSchema, body: lifecycleRequestSchema }), submitCurriculumVersionForReview);
router.post('/versions/:curriculumVersionId/publish', validate({ params: curriculumVersionParamsSchema, body: lifecycleRequestSchema }), publishCurriculumVersion);
router.post('/versions/:curriculumVersionId/reject', validate({ params: curriculumVersionParamsSchema, body: rejectCurriculumVersionSchema }), rejectCurriculumVersion);
router.post('/versions/:curriculumVersionId/archive', validate({ params: curriculumVersionParamsSchema, body: lifecycleRequestSchema }), archiveCurriculumVersion);
router.get('/versions/:curriculumVersionId/compare', validate({ params: curriculumVersionParamsSchema }), compareCurriculumVersion);
router.get('/content', getAdminContent);
router.post('/content', createAdminContent);
router.put('/content/:contentId', updateAdminContent);
router.delete('/content/:contentId', deleteAdminContent);

export default router;
