import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

export const createStudentAttemptSchema = z.object({
  tutor_session_id: z.string().min(1),
  tutor_turn_id: z.string().min(1),
  student_profile_id: z.string().min(1),
  submitted_answer: z.string().min(1),
  answer_format: z.string().min(1),
  is_correct: z.boolean(),
  is_partially_correct: z.boolean(),
  score: z.number(),
  created_at: z.instanceof(Timestamp).optional(),
});

export const updateStudentAttemptSchema = createStudentAttemptSchema.partial().strict();

export type CreateStudentAttemptInput = z.infer<typeof createStudentAttemptSchema>;
export type UpdateStudentAttemptInput = z.infer<typeof updateStudentAttemptSchema>;
