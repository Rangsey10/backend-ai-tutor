import { z } from 'zod';

const subjectStatuses = ['active', 'inactive'] as const;

export const createSubjectSchema = z.object({
  subject_name: z.string().min(1),
  subject_code: z.string().min(1),
  icon_url: z.string().url().nullable().optional(),
  description: z.string().min(1).nullable().optional(),
  status: z.enum(subjectStatuses).default('active'),
  display_order: z.number().int().nonnegative().default(0),
});

export const updateSubjectSchema = createSubjectSchema.partial().strict();

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type UpdateSubjectInput = z.infer<typeof updateSubjectSchema>;
