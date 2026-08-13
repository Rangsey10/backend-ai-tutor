import { z } from 'zod';

export const quizTopicParamsSchema = z
  .object({
    topicId: z.string().min(1).max(240),
  })
  .strict();

export const quizIdParamsSchema = z
  .object({
    quizId: z.string().min(1).max(256),
  })
  .strict();

export const getQuizByTopicQuerySchema = z
  .object({
    subject_id: z.string().min(1).max(120).default('math'),
    grade_level_id: z.string().min(1).max(120).default('grade-10'),
  })
  .strict();

export const createQuizRequestSchema = z
  .object({
    subject_id: z.string().min(1).max(120).default('math'),
    topic_id: z.string().min(1).max(240),
    grade_level_id: z.string().min(1).max(120).default('grade-10'),
    difficulty_level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
    tutor_session_id: z.string().min(1).max(256).optional(),
    skill_tags: z.array(z.string().min(1).max(120)).max(12).default([]),
    learning_goals: z.array(z.string().min(1).max(240)).max(12).default([]),
    misconceptions: z.array(z.string().min(1).max(240)).max(12).default([]),
    hint_count: z.number().int().min(0).max(100).default(0),
    stuck_count: z.number().int().min(0).max(100).default(0),
    verification_results: z.array(z.enum(['correct', 'mathematically_valid_but_inefficient', 'invalid', 'incomplete', 'cannot_verify'])).max(30).default([]),
    verification_evidence: z.array(z.record(z.unknown())).max(30).default([]),
    prior_mastery: z.number().min(0).max(1).optional(),
    prior_quiz_score: z.number().int().min(0).max(100).optional(),
  })
  .strict();

export const submitQuizRequestSchema = z
  .object({
    answers: z
      .array(
        z
          .object({
            question_id: z.string().min(1).max(256),
            selected_option_id: z.string().min(1).max(256).optional(),
            answer: z.string().max(4000).optional(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

export type QuizTopicParamsInput = z.infer<typeof quizTopicParamsSchema>;
export type QuizIdParamsInput = z.infer<typeof quizIdParamsSchema>;
export type GetQuizByTopicQueryInput = z.infer<typeof getQuizByTopicQuerySchema>;
export type CreateQuizRequestInput = z.infer<typeof createQuizRequestSchema>;
export type SubmitQuizRequestInput = z.infer<typeof submitQuizRequestSchema>;
