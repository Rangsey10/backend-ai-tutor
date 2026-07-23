import { z } from 'zod';

const explanationLevels = ['beginner', 'intermediate', 'advanced'] as const;
const studentProfileStatuses = ['active', 'inactive', 'suspended', 'pending'] as const;

export const createStudentProfileSchema = z.object({
  user_id: z.string().min(1),
  grade_level_id: z.string().min(1),
  account_status: z.enum(studentProfileStatuses).default('active'),
  explanation_level: z.enum(explanationLevels).default('beginner'),
  learning_goal: z.string().min(1).nullable().optional(),
  onboarding_completed: z.boolean().default(false),
  current_streak: z.number().int().nonnegative().default(0),
  longest_streak: z.number().int().nonnegative().default(0),
  total_learning_time: z.number().int().nonnegative().default(0),
});

export const updateStudentProfileSchema = createStudentProfileSchema.partial().strict();

export type CreateStudentProfileInput = z.infer<typeof createStudentProfileSchema>;
export type UpdateStudentProfileInput = z.infer<typeof updateStudentProfileSchema>;
