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
    // Omit correctness when no deterministic verifier produced evidence. It
    // must never be converted into an incorrect answer by default.
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

export type TutorSessionSummaryInput = z.infer<typeof tutorSessionSummarySchema>;
export type LessonCompletionInput = z.infer<typeof lessonCompletionSchema>;
export type StudentAnswerEventInput = z.infer<typeof studentAnswerEventSchema>;
export type QuizAttemptSummaryInput = z.infer<typeof quizAttemptSummarySchema>;
