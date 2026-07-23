import { z } from 'zod';

export const createStudentTopicProgressSchema = z.object({
  student_profile_id: z.string().min(1),
  topic_id: z.string().min(1),
  mastery_score: z.number().default(0),
  lessons_completed: z.number().int().nonnegative().default(0),
  quizzes_completed: z.number().int().nonnegative().default(0),
  average_quiz_score: z.number().min(0).max(100).default(0),
  correct_attempts: z.number().int().nonnegative().default(0),
  incorrect_attempts: z.number().int().nonnegative().default(0),
});

export const updateStudentTopicProgressSchema = createStudentTopicProgressSchema.partial().strict();

export type CreateStudentTopicProgressInput = z.infer<typeof createStudentTopicProgressSchema>;
export type UpdateStudentTopicProgressInput = z.infer<typeof updateStudentTopicProgressSchema>;
