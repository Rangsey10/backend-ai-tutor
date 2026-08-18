import { z } from 'zod';

const senderTypes = ['student', 'ai_tutor'] as const;
const snapshotTypes = ['canvas_state', 'visual_cards', 'diagram', 'checkpoint'] as const;

export const createTutorSessionRequestSchema = z
  .object({
    subject_id: z.string().min(1),
    topic_id: z.string().min(1),
    lesson_id: z.string().min(1).nullable().optional(),
    original_question: z.string().min(1),
    initial_prompt: z.string().min(1).nullable().optional(),
    visual_context: z.record(z.unknown()).nullable().optional(),
    detected_language: z.string().min(1).default('en'),
    detected_intent: z.string().min(1).default('question'),
    detected_problem_type: z.string().min(1).default('general'),
  })
  .strict();

export const appendTutorSessionTurnRequestSchema = z
  .object({
    sender_type: z.enum(senderTypes),
    message_text: z.string().min(1),
    stage: z.string().min(1).default('teaching'),
    teaching_strategy: z.string().min(1).default('guided'),
    interaction_type: z.string().min(1).default('chat'),
    expected_answer: z.string().min(1).nullable().optional(),
    visual_state: z.record(z.unknown()).nullable().optional(),
    expected_last_turn_number: z.number().int().nonnegative().optional(),
    snapshot: z
      .object({
        snapshot_type: z.enum(snapshotTypes),
        payload: z.record(z.unknown()),
      })
      .strict()
      .optional(),
  })
  .strict();

export const tutorSessionParamsSchema = z
  .object({
    sessionId: z.string().min(1),
  })
  .strict();
