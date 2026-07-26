import { Router } from 'express';
import {
  addProfileSubject,
  createProfile,
  deleteProfileSubject,
  getProfile,
  getProfileSubjects,
  updateProfile,
} from '../controllers/profile.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  addProfileSubjectRequestSchema,
  createProfileRequestSchema,
  deleteProfileSubjectParamsSchema,
  updateProfileRequestSchema,
} from '../schemas/profile-request.schema';

const router = Router();

router.use(authenticate);

router.get('/', getProfile);
router.post('/', validate({ body: createProfileRequestSchema }), createProfile);
router.patch('/', validate({ body: updateProfileRequestSchema }), updateProfile);
router.get('/subjects', getProfileSubjects);
router.post('/subjects', validate({ body: addProfileSubjectRequestSchema }), addProfileSubject);
router.delete(
  '/subjects/:subjectId',
  validate({ params: deleteProfileSubjectParamsSchema }),
  deleteProfileSubject
);

export default router;
