import { Router } from 'express';
import {
  confirmAdminPasswordReset,
  getAdminSession,
  loginAdmin,
  loginAdminWithGoogle,
  logoutAdmin,
  registerAdmin,
  requestAdminPasswordReset,
} from '../controllers/admin-auth.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import {
  loginRequestSchema,
  googleLoginRequestSchema,
  logoutRequestSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
} from '../schemas/auth-request.schema';

const router = Router();

router.post('/login', validate({ body: loginRequestSchema }), loginAdmin);
router.post('/google', validate({ body: googleLoginRequestSchema }), loginAdminWithGoogle);
router.post('/register', validate({ body: registerRequestSchema.omit({ role: true }) }), registerAdmin);
router.post('/logout', validate({ body: logoutRequestSchema }), logoutAdmin);
router.post('/password-reset/request', validate({ body: passwordResetRequestSchema }), requestAdminPasswordReset);
router.post(
  '/password-reset/confirm',
  validate({ body: passwordResetConfirmRequestSchema }),
  confirmAdminPasswordReset
);
router.get('/me', authenticate, authorize('admin', 'administrator'), getAdminSession);

export default router;
