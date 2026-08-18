import { z } from 'zod';

const senderTypes = ['student', 'ai_tutor'] as const;

export const createTutorTurnSchema = z.object({
  tutor_session_id: z.string().min(1),
  turn_number: z.number().int().nonnegative(),
  sender_type: z.enum(senderTypes),
  message_text: z.string().min(1),
  visual_state: z.record(z.unknown()).nullable().optional(),
  stage: z.string().min(1),
  teaching_strategy: z.string().min(1),
  interaction_type: z.string().min(1),
  expected_answer: z.string().min(1).nullable().optional(),
});

export const updateTutorTurnSchema = createTutorTurnSchema.partial().strict();

export type CreateTutorTurnInput = z.infer<typeof createTutorTurnSchema>;
export type UpdateTutorTurnInput = z.infer<typeof updateTutorTurnSchema>;
