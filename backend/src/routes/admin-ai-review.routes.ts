import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { authorize } from '../middlewares/authorize';
import { getAdminAiReviews, decideAdminAiReview } from '../controllers/admin-ai-review.controller';
import { validate } from '../middlewares/validate';
import { requireAdminCsrf } from '../middlewares/admin-csrf';
import { adminAiReviewDecisionSchema, adminAiReviewParamsSchema } from '../schemas/admin-ai-review.schema';
const router = Router(); router.use(authenticate, authorize('admin', 'administrator'), requireAdminCsrf); router.get('/', getAdminAiReviews); router.post('/:reviewId/decision', validate({ params: adminAiReviewParamsSchema, body: adminAiReviewDecisionSchema }), decideAdminAiReview); export default router;
