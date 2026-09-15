import { z } from 'zod';

const topicDifficultyLevels = ['beginner', 'intermediate', 'advanced'] as const;
const topicStatuses = ['draft', 'active', 'inactive', 'archived'] as const;

const subjectSnapshotSchema = z.object({
  subject_id: z.string().min(1),
  subject_name: z.string().min(1),
  subject_code: z.string().min(1),
});

const gradeLevelSnapshotSchema = z.object({
  grade_level_id: z.string().min(1),
  grade_name: z.string().min(1),
  grade_number: z.number().int().nonnegative(),
});

export const createTopicSchema = z.object({
  unit_id: z.string().min(1).optional(),
  subject_id: z.string().min(1),
  grade_level_id: z.string().min(1),
  topic_name: z.string().min(1),
  topic_code: z.string().min(1),
  khmer_name: z.string().min(1).nullable().optional(),
  description: z.string().min(1).nullable().optional(),
  difficulty_level: z.enum(topicDifficultyLevels).default('beginner'),
  learning_objective: z.string().min(1).nullable().optional(),
  learning_objectives: z.array(z.string().min(1)).default([]),
  prerequisites: z.array(z.string().min(1)).default([]),
  status: z.enum(topicStatuses).default('draft'),
  subject_snapshot: subjectSnapshotSchema.nullable().optional(),
  grade_level_snapshot: gradeLevelSnapshotSchema.nullable().optional(),
});

export const updateTopicSchema = createTopicSchema.partial().strict();

const adminTopicStatuses = ['Draft', 'Active', 'Inactive', 'Archived'] as const;
const adminTopicDifficulties = ['Beginner', 'Intermediate', 'Advanced'] as const;

export const adminTopicCreateRequestSchema = z.object({
  grade_level_id: z.string().trim().min(1),
  subject_id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  khmer: z.string().trim().min(1).optional(),
  code: z.string().trim().min(1),
  description: z.string().trim().max(10000).optional(),
  learning_objectives: z.array(z.string().trim().min(1)).max(100).optional(),
  difficulty: z.enum(adminTopicDifficulties).optional(),
  prerequisites: z.array(z.string().trim().min(1)).max(100).optional(),
  status: z.enum(adminTopicStatuses).optional(),
}).strict();

export const adminTopicUpdateRequestSchema = adminTopicCreateRequestSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one topic field is required');

export const adminTopicStatusRequestSchema = z.object({
  status: z.enum(['Inactive', 'Archived']),
}).strict();

export const adminTopicParamsSchema = z.object({
  topicId: z.string().trim().min(1),
}).strict();

export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
