import { z } from 'zod';
export const adminAiReviewParamsSchema = z.object({ reviewId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/) }).strict();
export const adminAiReviewDecisionSchema = z.object({ decision: z.enum(['mark_reviewed', 'resolve', 'escalate', 'restrict_student', 'restore_student_access']), idempotency_key: z.string().trim().min(8).max(160).regex(/^[A-Za-z0-9_-]+$/), note: z.string().trim().max(500).optional() }).strict();
