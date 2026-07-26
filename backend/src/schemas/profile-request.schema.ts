import { z } from 'zod';

const explanationLevels = ['beginner', 'intermediate', 'advanced'] as const;

export const createProfileRequestSchema = z
  .object({
    grade_level_id: z.string().min(1),
    explanation_level: z.enum(explanationLevels),
    learning_goal: z.string().min(1).nullable(),
    subject_ids: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.subject_ids).size !== value.subject_ids.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'subject_ids must not contain duplicates',
        path: ['subject_ids'],
      });
    }
  });

export const updateProfileRequestSchema = z
  .object({
    grade_level_id: z.string().min(1).optional(),
    explanation_level: z.enum(explanationLevels).optional(),
    learning_goal: z.string().min(1).nullable().optional(),
    current_streak: z.number().int().nonnegative().optional(),
    longest_streak: z.number().int().nonnegative().optional(),
    total_learning_time: z.number().int().nonnegative().optional(),
  })
  .strict();

export const addProfileSubjectRequestSchema = z
  .object({
    subject_id: z.string().min(1),
  })
  .strict();

export const deleteProfileSubjectParamsSchema = z
  .object({
    subjectId: z.string().min(1),
  })
  .strict();

export type CreateProfileRequestInput = z.infer<typeof createProfileRequestSchema>;
export type UpdateProfileRequestInput = z.infer<typeof updateProfileRequestSchema>;
export type AddProfileSubjectRequestInput = z.infer<typeof addProfileSubjectRequestSchema>;
export type DeleteProfileSubjectParamsInput = z.infer<typeof deleteProfileSubjectParamsSchema>;
