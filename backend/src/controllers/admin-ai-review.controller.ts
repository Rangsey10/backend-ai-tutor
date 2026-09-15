import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';
import { decideAdminAiReview as applyReviewDecision, listAdminAiReviews } from '../services/admin-ai-review.service';
export const getAdminAiReviews = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, { reviews: await listAdminAiReviews(req.query) }, 'AI reviews loaded'));
export const decideAdminAiReview = asyncHandler(async (req: Request, res: Response) => { const item = await applyReviewDecision(req.params.reviewId, req.body.decision, req.body.idempotency_key, req.user!.userId!, req.body.note); sendSuccess(res, item, 'AI review updated'); });
