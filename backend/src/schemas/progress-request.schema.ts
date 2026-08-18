import { z } from 'zod';

const progressMetadataSchema = z.record(z.unknown()).default({});

export const tutorSessionSummarySchema = z
  .object({
    tutor_session_id: z.string().min(1),
    subject_id: z.string().min(1).default('math'),
    topic_id: z.string().min(1),
    original_question: z.string().min(1),
    detected_problem_type: z.string().min(1).optional(),
    mastery_signal: z.string().min(1).optional(),
    status: z.string().min(1).default('active'),
    metadata: progressMetadataSchema,
  })
  .strict();

export const lessonCompletionSchema = z
  .object({
    tutor_session_id: z.string().min(1),
    topic_id: z.string().min(1),
    subject_id: z.string().min(1).optional(),
    lesson_id: z.string().min(1).optional(),
    mastery_signal: z.string().min(1).optional(),
    completion_status: z.string().min(1).default('completed'),
    metadata: progressMetadataSchema,
  })
  .strict();

export const studentAnswerEventSchema = z
  .object({
    tutor_session_id: z.string().min(1),
    tutor_turn_id: z.string().min(1),
    topic_id: z.string().min(1).optional(),
    subject_id: z.string().min(1).optional(),
    submitted_answer: z.string().default(''),
    answer_format: z.string().min(1).default('text'),
    is_correct: z.boolean().nullable().optional(),
    is_partially_correct: z.boolean().default(false),
    score: z.number().min(0).max(1).default(0),
    metadata: progressMetadataSchema,
  })
  .strict();

export const quizAttemptSummarySchema = z
  .object({
    quiz_attempt_id: z.string().min(1),
    quiz_id: z.string().min(1),
    topic_id: z.string().min(1).optional(),
    subject_id: z.string().min(1).optional(),
    score: z.number().min(0).max(100),
    correct_count: z.number().int().nonnegative(),
    incorrect_count: z.number().int().nonnegative(),
    skipped_count: z.number().int().nonnegative().default(0),
    metadata: progressMetadataSchema,
  })
  .strict();

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

export type TutorSessionSummaryInput = z.infer<typeof tutorSessionSummarySchema>;
export type LessonCompletionInput = z.infer<typeof lessonCompletionSchema>;
export type StudentAnswerEventInput = z.infer<typeof studentAnswerEventSchema>;
export type QuizAttemptSummaryInput = z.infer<typeof quizAttemptSummarySchema>;
