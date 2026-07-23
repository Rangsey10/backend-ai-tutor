import { z } from 'zod';

const topicDifficultyLevels = ['beginner', 'intermediate', 'advanced'] as const;
const topicStatuses = ['active', 'inactive'] as const;

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
  unit_id: z.string().min(1),
  subject_id: z.string().min(1),
  grade_level_id: z.string().min(1),
  topic_name: z.string().min(1),
  topic_code: z.string().min(1),
  description: z.string().min(1).nullable().optional(),
  difficulty_level: z.enum(topicDifficultyLevels).default('beginner'),
  learning_objective: z.string().min(1).nullable().optional(),
  status: z.enum(topicStatuses).default('active'),
  subject_snapshot: subjectSnapshotSchema.nullable().optional(),
  grade_level_snapshot: gradeLevelSnapshotSchema.nullable().optional(),
});

export const updateTopicSchema = createTopicSchema.partial().strict();

export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
