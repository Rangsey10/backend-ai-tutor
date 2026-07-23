import { z } from 'zod';

export const createAiRequestLogSchema = z.object({
  tutor_session_id: z.string().min(1).nullable().optional(),
  request_type: z.string().min(1),
  provider: z.string().min(1),
  model_name: z.string().min(1),
  prompt_version: z.string().min(1),
  response_status: z.string().min(1),
  response_latency_ms: z.number().int().nonnegative(),
  token_input: z.number().int().nonnegative(),
});

export const updateAiRequestLogSchema = createAiRequestLogSchema.partial().strict();

export type CreateAiRequestLogInput = z.infer<typeof createAiRequestLogSchema>;
export type UpdateAiRequestLogInput = z.infer<typeof updateAiRequestLogSchema>;
