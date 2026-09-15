import { z } from 'zod';

export const studentReportReasons = [
  'incorrect_math',
  'confusing_explanation',
  'unsafe_unhelpful',
  'visual_problem',
  'other',
] as const;

const reviewStatuses = ['pending', 'triaged', 'resolved', 'dismissed'] as const;

export const createStudentTutorReportSchema = z.object({
  tutor_session_id: z.string().min(1),
  tutor_turn_id: z.string().min(1),
  reason: z.enum(studentReportReasons),
  details: z.string().trim().max(600).optional(),
}).strict();

export const studentNotificationParamsSchema = z.object({ notificationId: z.string().trim().min(1).max(160) }).strict();

// Review state is intentionally server/internal-only. No student route accepts
// it, so a report cannot be self-approved or assigned from Flutter.
export const internalTutorReportReviewSchema = z.object({
  review_status: z.enum(reviewStatuses),
  reviewer_id: z.string().min(1).max(256),
  resolution_note: z.string().trim().max(600).optional(),
}).strict();

export type CreateStudentTutorReportInput = z.infer<typeof createStudentTutorReportSchema>;
export type InternalTutorReportReviewInput = z.infer<typeof internalTutorReportReviewSchema>;
