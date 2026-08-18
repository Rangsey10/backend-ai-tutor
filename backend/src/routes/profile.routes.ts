import { Router } from 'express';
import {
  addProfileSubject,
  createProfile,
  deleteProfileSubject,
  getPreferences,
  getOnboardingState,
  getProfile,
  getProfileSubjects,
  updateOnboardingState,
  getPreferences,
  getProfile,
  getProfileSubjects,
  updateOnboardingState,
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
  updateProfileRequestSchema,
} from '../schemas/profile-request.schema';
import {
  updateOnboardingRequestSchema,
  upsertPreferencesRequestSchema,
} from '../schemas/profile-preferences-request.schema';

const router = Router();

router.use(authenticate);
router.use(authorize('student', 'tutor', 'teacher', 'admin', 'administrator'));

router.get('/', getProfile);
router.post('/', validate({ body: createProfileRequestSchema }), createProfile);
router.patch('/', validate({ body: updateProfileRequestSchema }), updateProfile);
router.get('/preferences', getPreferences);
router.put('/preferences', validate({ body: upsertPreferencesRequestSchema }), updatePreferences);
router.get('/subjects', getProfileSubjects);
router.post('/subjects', validate({ body: addProfileSubjectRequestSchema }), addProfileSubject);
router.delete(
  '/subjects/:subjectId',
  validate({ params: deleteProfileSubjectParamsSchema }),
  deleteProfileSubject
);
router.get('/onboarding', getOnboardingState);
router.patch('/onboarding', validate({ body: updateOnboardingRequestSchema }), updateOnboardingState);

export default router;
