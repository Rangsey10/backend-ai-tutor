import { z } from 'zod';

const id = z.string().trim().min(1).max(160);

export const createCurriculumVersionSchema = z.object({
  grade_level_id: id,
  subject_id: id,
  label: z.string().trim().min(1).max(120),
  change_summary: z.string().trim().min(1).max(2_000),
}).strict();

export const curriculumVersionParamsSchema = z.object({ curriculumVersionId: id }).strict();
export const lifecycleRequestSchema = z.object({
  idempotency_key: id,
  reason: z.string().trim().min(1).max(2_000).optional(),
}).strict();

export const rejectCurriculumVersionSchema = z.object({
  idempotency_key: id,
  reason: z.string().trim().min(1).max(2_000),
}).strict();
