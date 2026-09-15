import { z } from 'zod';

export const listPublishedLessonsQuerySchema = z.object({
  grade_level_id: z.string().min(1).max(120).optional(),
  subject_id: z.string().min(1).max(120).optional(),
  topic_id: z.string().min(1).max(120).optional(),
  search: z.string().trim().min(1).max(100).optional(),
}).strict();

export type ListPublishedLessonsQuery = z.infer<typeof listPublishedLessonsQuerySchema>;
