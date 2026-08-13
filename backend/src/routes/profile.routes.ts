import { Router } from 'express';
import {
  addProfileSubject,
  createProfile,
  deleteProfileSubject,
  getPreferences,
  getProfile,
  getProfileSubjects,
  updatePreferences,
  updateProfile,
} from '../controllers/profile.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import {
  addProfileSubjectRequestSchema,
  createProfileRequestSchema,
  deleteProfileSubjectParamsSchema,
  updatePreferencesRequestSchema,
  updateProfileRequestSchema,
} from '../schemas/profile-request.schema';

const router = Router();

router.use(authenticate, authorize('student'));

router.get('/', getProfile);
router.post('/', validate({ body: createProfileRequestSchema }), createProfile);
router.patch('/', validate({ body: updateProfileRequestSchema }), updateProfile);
router.get('/preferences', getPreferences);
router.put('/preferences', validate({ body: updatePreferencesRequestSchema }), updatePreferences);
router.get('/subjects', getProfileSubjects);
router.post('/subjects', validate({ body: addProfileSubjectRequestSchema }), addProfileSubject);
router.delete(
  '/subjects/:subjectId',
  validate({ params: deleteProfileSubjectParamsSchema }),
  deleteProfileSubject
);

export default router;
