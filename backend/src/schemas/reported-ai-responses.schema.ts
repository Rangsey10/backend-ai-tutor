import { z } from 'zod';

const reportTypes = [
  'incorrect_answer',
  'unclear_explanation',
  'broken_visualization',
  'repeated_response',
  'inappropriate_content',
  'unsupported_question',
  'voice_issue',
] as const;

const verificationStatuses = ['pending', 'approved', 'rejected', 'reviewed'] as const;

export const createReportedAiResponseSchema = z.object({
  student_profile_id: z.string().min(1),
  tutor_session_id: z.string().min(1),
  tutor_turn_id: z.string().min(1),
  report_type: z.enum(reportTypes),
  description: z.string().min(1),
  severity: z.string().min(1),
  verification_status: z.enum(verificationStatuses).default('pending'),
  assigned_admin_id: z.string().min(1).nullable().optional(),
});

export const updateReportedAiResponseSchema = createReportedAiResponseSchema.partial().strict();

export type CreateReportedAiResponseInput = z.infer<typeof createReportedAiResponseSchema>;
export type UpdateReportedAiResponseInput = z.infer<typeof updateReportedAiResponseSchema>;
