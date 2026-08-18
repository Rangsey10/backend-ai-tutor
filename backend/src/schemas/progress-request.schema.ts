import { z } from 'zod';

export const submitQuizResultRequestSchema = z
  .object({
    quiz_id: z.string().min(1),
    topic_id: z.string().min(1),
    tutor_session_id: z.string().min(1).nullable().optional(),
    duration_seconds: z.number().int().nonnegative(),
    answers: z
      .array(
        z
          .object({
            quiz_question_id: z.string().min(1),
            selected_option_id: z.string().min(1).nullable().optional(),
            submitted_answer: z.string().min(1),
            is_correct: z.boolean(),
            is_partially_correct: z.boolean().default(false),
            score_awarded: z.number().min(0).default(0),
            feedback: z.string().min(1).nullable().optional(),
          })
          .strict()
      )
      .min(1),
  })
  .strict();

export const tutorActivityRequestSchema = z
  .object({
    tutor_session_id: z.string().min(1).nullable().optional(),
    topic_id: z.string().min(1).nullable().optional(),
    interaction_count: z.number().int().nonnegative(),
    visual_aids_generated: z.number().int().nonnegative(),
    duration_seconds: z.number().int().nonnegative(),
  })
  .strict();
