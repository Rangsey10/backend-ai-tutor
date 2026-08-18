import { Router } from 'express';
import {
  confirmEmailVerification,
  confirmPasswordReset,
  login,
  logout,
  logoutAll,
  refreshToken,
  register,
  requestPasswordResetToken,
  requestVerificationToken,
} from '../controllers/auth.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import {
  emailVerificationRequestSchema,
  loginRequestSchema,
  logoutRequestSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  refreshTokenRequestSchema,
  registerRequestSchema,
} from '../schemas/auth-request.schema';

const router = Router();

router.post('/register', validate({ body: registerRequestSchema }), register);
router.post('/login', validate({ body: loginRequestSchema }), login);
router.post('/refresh', validate({ body: refreshTokenRequestSchema }), refreshToken);
router.post('/logout', validate({ body: logoutRequestSchema }), logout);
router.post('/password-reset/request', validate({ body: passwordResetRequestSchema }), requestPasswordResetToken);
router.post(
  '/password-reset/confirm',
  validate({ body: passwordResetConfirmRequestSchema }),
  confirmPasswordReset
);
router.post('/email-verification/confirm', validate({ body: emailVerificationRequestSchema }), confirmEmailVerification);
router.post('/email-verification/request', authenticate, requestVerificationToken);
router.post('/logout-all', authenticate, logoutAll);

export default router;
