import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

export const createQuizAttemptSchema = z.object({
  quiz_id: z.string().min(1),
  student_profile_id: z.string().min(1),
  score: z.number().default(0),
  correct_count: z.number().int().nonnegative().default(0),
  incorrect_count: z.number().int().nonnegative().default(0),
  skipped_count: z.number().int().nonnegative().default(0),
  started_at: z.instanceof(Timestamp).optional(),
  submitted_at: z.instanceof(Timestamp).nullable().optional(),
});

export const updateQuizAttemptSchema = createQuizAttemptSchema.partial().strict();

export type CreateQuizAttemptInput = z.infer<typeof createQuizAttemptSchema>;
export type UpdateQuizAttemptInput = z.infer<typeof updateQuizAttemptSchema>;
