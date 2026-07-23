import { z } from 'zod';

export const createQuizOptionSchema = z.object({
  quiz_question_id: z.string().min(1),
  option_label: z.string().min(1),
  option_text: z.string().min(1),
  is_correct: z.boolean(),
  display_order: z.number().int().nonnegative().default(0),
});

export const updateQuizOptionSchema = createQuizOptionSchema.partial().strict();

export type CreateQuizOptionInput = z.infer<typeof createQuizOptionSchema>;
export type UpdateQuizOptionInput = z.infer<typeof updateQuizOptionSchema>;
