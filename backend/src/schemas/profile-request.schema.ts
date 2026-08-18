import { z } from 'zod';

const explanationLevels = ['beginner', 'intermediate', 'advanced'] as const;

export const createProfileRequestSchema = z
  .object({
    grade_level_id: z.string().min(1),
    display_name: z.string().min(1).nullable().optional(),
    avatar_url: z.string().url().nullable().optional(),
    explanation_level: z.enum(explanationLevels),
    learning_goal: z.string().min(1).nullable(),
    learning_goals: z.array(z.string().min(1)).default([]),
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
    display_name: z.string().min(1).nullable().optional(),
    avatar_url: z.string().url().nullable().optional(),
    explanation_level: z.enum(explanationLevels).optional(),
    learning_goal: z.string().min(1).nullable().optional(),
    learning_goals: z.array(z.string().min(1)).optional(),
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

export type CreateProfileRequestInput = z.input<typeof createProfileRequestSchema>;
export type UpdateProfileRequestInput = z.input<typeof updateProfileRequestSchema>;
export type AddProfileSubjectRequestInput = z.input<typeof addProfileSubjectRequestSchema>;
export type DeleteProfileSubjectParamsInput = z.input<typeof deleteProfileSubjectParamsSchema>;
