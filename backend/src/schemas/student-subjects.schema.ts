import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';

const studentSubjectStatuses = ['active', 'completed', 'archived'] as const;
const masteryLevels = ['not_started', 'developing', 'proficient', 'mastered'] as const;

export const createStudentSubjectSchema = z.object({
  student_profile_id: z.string().min(1),
  subject_id: z.string().min(1),
  selected_at: z.instanceof(Timestamp).optional(),
  current_progress: z.number().min(0).max(100).default(0),
  mastery_level: z.enum(masteryLevels).default('not_started'),
  status: z.enum(studentSubjectStatuses).default('active'),
});

export const updateStudentSubjectSchema = createStudentSubjectSchema.partial().strict();

export type CreateStudentSubjectInput = z.infer<typeof createStudentSubjectSchema>;
export type UpdateStudentSubjectInput = z.infer<typeof updateStudentSubjectSchema>;
