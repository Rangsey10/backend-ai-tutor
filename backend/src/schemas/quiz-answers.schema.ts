import { z } from 'zod';

export const createQuizAnswerSchema = z.object({
  quiz_attempt_id: z.string().min(1),
  quiz_question_id: z.string().min(1),
  selected_option_id: z.string().min(1).nullable().optional(),
  submitted_answer: z.string().min(1),
  is_correct: z.boolean(),
  is_partially_correct: z.boolean(),
  score_awarded: z.number().default(0),
  feedback: z.string().min(1).nullable().optional(),
});

export const updateQuizAnswerSchema = createQuizAnswerSchema.partial().strict();

export type CreateQuizAnswerInput = z.infer<typeof createQuizAnswerSchema>;
export type UpdateQuizAnswerInput = z.infer<typeof updateQuizAnswerSchema>;
