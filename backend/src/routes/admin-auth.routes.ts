import { Router } from 'express';
import {
  confirmAdminPasswordReset,
  getAdminSession,
  loginAdmin,
  loginAdminWithGoogle,
  logoutAdmin,
  registerAdmin,
  requestAdminPasswordReset,
  refreshAdminSession,
} from '../controllers/admin-auth.controller';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { validate } from '../middlewares/validate';
import { requireAdminCsrf } from '../middlewares/admin-csrf';
import { authRateLimit } from '../middlewares/auth-rate-limit';
import {
  loginRequestSchema,
  googleLoginRequestSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  registerRequestSchema,
} from '../schemas/auth-request.schema';
import { z } from 'zod';

const router = Router();
router.use(requireAdminCsrf);

router.post('/login', authRateLimit('admin-login', 10, 15 * 60_000), validate({ body: loginRequestSchema }), loginAdmin);
router.post('/google', authRateLimit('admin-google-login', 10, 15 * 60_000), validate({ body: googleLoginRequestSchema }), loginAdminWithGoogle);
router.post('/register', validate({ body: registerRequestSchema.omit({ role: true }) }), registerAdmin);
router.post('/logout', validate({ body: z.object({ refresh_token: z.string().min(1).optional() }).strict() }), logoutAdmin);
router.post('/refresh', refreshAdminSession);
router.post('/password-reset/request', authRateLimit('admin-password-reset', 5, 60 * 60_000), validate({ body: passwordResetRequestSchema }), requestAdminPasswordReset);
router.post(
  '/password-reset/confirm',
  validate({ body: passwordResetConfirmRequestSchema }),
  confirmAdminPasswordReset
);
router.get('/me', authenticate, authorize('admin', 'administrator'), getAdminSession);

export default router;
