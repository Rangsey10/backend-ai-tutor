import { z } from 'zod';

export const listTopicsQuerySchema = z
  .object({
    grade_level_id: z.string().min(1).optional(),
    subject_id: z.string().min(1).optional(),
  })
  .strict();

export type ListTopicsQueryInput = z.infer<typeof listTopicsQuerySchema>;
