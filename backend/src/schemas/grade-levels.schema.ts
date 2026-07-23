import { z } from 'zod';

const gradeLevelStatuses = ['active', 'inactive'] as const;

export const createGradeLevelSchema = z.object({
  grade_name: z.string().min(1),
  grade_number: z.number().int().nonnegative(),
  description: z.string().min(1).nullable().optional(),
  status: z.enum(gradeLevelStatuses).default('active'),
});

export const updateGradeLevelSchema = createGradeLevelSchema.partial().strict();

export type CreateGradeLevelInput = z.infer<typeof createGradeLevelSchema>;
export type UpdateGradeLevelInput = z.infer<typeof updateGradeLevelSchema>;
