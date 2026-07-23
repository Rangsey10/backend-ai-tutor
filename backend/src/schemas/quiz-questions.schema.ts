import { z } from 'zod';

const quizQuestionTypes = ['multiple_choice', 'short_answer', 'numeric'] as const;
const quizQuestionDifficultyLevels = ['beginner', 'intermediate', 'advanced'] as const;

const visualizationDataSchema: z.ZodType<Record<string, unknown> | null> = z.lazy(() =>
  z.union([
    z.null(),
    z.record(z.union([z.string(), z.number(), z.boolean(), z.null(), visualizationDataSchema])),
  ]),
) as z.ZodType<Record<string, unknown> | null>;

export const createQuizQuestionSchema = z.object({
  quiz_id: z.string().min(1),
  question_order: z.number().int().nonnegative(),
  question_text: z.string().min(1),
  question_type: z.enum(quizQuestionTypes),
  visualization_data: visualizationDataSchema.optional(),
  difficulty_level: z.enum(quizQuestionDifficultyLevels).default('intermediate'),
  explanation: z.string().min(1).nullable().optional(),
  verification_status: z.string().min(1).default('pending'),
});

export const updateQuizQuestionSchema = createQuizQuestionSchema.partial().strict();

export type CreateQuizQuestionInput = z.infer<typeof createQuizQuestionSchema>;
export type UpdateQuizQuestionInput = z.infer<typeof updateQuizQuestionSchema>;
