import { z } from 'zod';

const quizDifficultyLevels = ['beginner', 'intermediate', 'advanced'] as const;

export const createQuizSchema = z.object({
  subject_id: z.string().min(1),
  topic_id: z.string().min(1),
  grade_level_id: z.string().min(1),
  generated_from_session_id: z.string().min(1).nullable().optional(),
  title: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  difficulty_level: z.enum(quizDifficultyLevels).default('intermediate'),
  generation_source: z.string().min(1),
  total_questions: z.number().int().nonnegative().default(0),
});

export const updateQuizSchema = createQuizSchema.partial().strict();

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
