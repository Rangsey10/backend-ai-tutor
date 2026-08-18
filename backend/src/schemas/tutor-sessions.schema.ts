import { z } from 'zod';

const sessionStatusSchema = z.string().min(1);
const verificationStatusSchema = z.string().min(1);

export const createTutorSessionSchema = z.object({
  student_profile_id: z.string().min(1),
  subject_id: z.string().min(1),
  topic_id: z.string().min(1),
  lesson_id: z.string().min(1).nullable().optional(),
  original_question: z.string().min(1),
  initial_prompt: z.string().min(1).nullable().optional(),
  visual_context: z.record(z.unknown()).nullable().optional(),
  detected_language: z.string().min(1),
  detected_intent: z.string().min(1),
  detected_problem_type: z.string().min(1),
  session_status: sessionStatusSchema.default('active'),
  verification_status: verificationStatusSchema.default('pending'),
  resume_checkpoint: z.record(z.unknown()).nullable().optional(),
  last_turn_number: z.number().int().nonnegative().default(0),
  archived_at: z.any().nullable().optional(),
});

export const updateTutorSessionSchema = createTutorSessionSchema.partial().strict();

export type CreateTutorSessionInput = z.infer<typeof createTutorSessionSchema>;
export type UpdateTutorSessionInput = z.infer<typeof updateTutorSessionSchema>;
