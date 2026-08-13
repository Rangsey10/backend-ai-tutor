import { z } from 'zod';

const flexibleRecordSchema = z.record(z.unknown());

export const createTutorSessionRequestSchema = z
  .object({
    // A session always has an explicit lifecycle. A draft is allowed before a
    // learner confirms a problem; a confirmed session must include one.
    session_mode: z.enum(['draft', 'confirmed_problem']).default('draft'),
    subject: z.string().min(1).max(120).default('Mathematics'),
    topic: z.string().min(1).max(240).optional(),
    problem_text: z.string().min(1).max(8000).optional(),
    grade_level_id: z.string().min(1).max(120).optional(),
    metadata: flexibleRecordSchema.default({}),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.session_mode === 'confirmed_problem' && !value.problem_text?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['problem_text'],
        message: 'A confirmed tutor session requires a problem_text',
      });
    }
  });

export const tutorSessionParamsSchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .strict();

export const tutorUserSessionsParamsSchema = z
  .object({
    userId: z.string().min(1),
  })
  .strict();

export const tutorTurnRequestSchema = z
  .object({
    session_id: z.string().min(1).max(256).optional(),
    subject: z.string().min(1).max(120).default('Mathematics'),
    topic: z.string().min(1).max(240).optional(),
    message: z.string().max(8000).default(''),
    input_type: z.string().min(1).max(48).default('text'),
    locale: z.string().min(1).max(32).optional(),
    action: z.string().min(1).max(80).default('submit_problem'),
    student_intent: z.string().min(1).max(80).optional(),
    current_state: flexibleRecordSchema.default({}),
    hint_count: z.number().int().nonnegative().optional(),
    student_submitted_step: z.boolean().optional(),
    allow_final_answer: z.boolean().default(false),
    metadata: flexibleRecordSchema.default({}),
  })
  .passthrough();

export type CreateTutorSessionRequestInput = z.infer<typeof createTutorSessionRequestSchema>;
export type TutorSessionParamsInput = z.infer<typeof tutorSessionParamsSchema>;
export type TutorUserSessionsParamsInput = z.infer<typeof tutorUserSessionsParamsSchema>;
export type TutorTurnRequestInput = z.infer<typeof tutorTurnRequestSchema>;
