import { z } from 'zod';

/**
 * Contract boundary for the future Admin -> curriculum publisher -> AI Tutor
 * pipeline. These schemas deliberately describe identifiers, lifecycle state,
 * and redacted review evidence only. They are not student Tutor response DTOs.
 */
export const ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION = 1 as const;

const identifier = z.string().trim().min(1).max(160);
const isoTimestamp = z.string().datetime({ offset: true });

export const curriculumVersionStatusSchema = z.enum([
  'draft',
  'in_review',
  'published',
  'archived',
]);

export const curriculumLifecycleCommandSchema = z.enum([
  'submit_for_review',
  'publish',
  'archive',
]);

export const curriculumVersionSchema = z
  .object({
    schema_version: z.literal(ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION),
    curriculum_version_id: identifier,
    grade_level_id: identifier,
    subject_id: identifier,
    label: z.string().trim().min(1).max(120),
    status: curriculumVersionStatusSchema,
    content_revision_count: z.number().int().nonnegative(),
    created_at: isoTimestamp,
    updated_at: isoTimestamp,
    published_at: isoTimestamp.nullable(),
  })
  .strict();

export const curriculumLifecycleRequestSchema = z
  .object({
    schema_version: z.literal(ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION),
    command: curriculumLifecycleCommandSchema,
    request_id: identifier,
    curriculum_version_id: identifier,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

/** Internal publisher payload. It must never be returned by student APIs. */
export const publishedCurriculumChunkSchema = z
  .object({
    schema_version: z.literal(ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION),
    chunk_id: identifier,
    curriculum_version_id: identifier,
    source_content_id: identifier,
    grade_level_id: identifier,
    subject_id: identifier,
    topic_id: identifier,
    language: z.enum(['en', 'km']),
    content_type: z.enum(['formula', 'concept', 'example', 'exercise']),
    instructional_text: z.string().trim().min(1).max(20_000),
    tags: z.array(z.string().trim().min(1).max(80)).max(40),
    published_at: isoTimestamp,
  })
  .strict();

/** Safe reference permitted in an authenticated Admin view or public Tutor DTO. */
export const tutorCurriculumSourceReferenceSchema = z
  .object({
    schema_version: z.literal(ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION),
    curriculum_version_id: identifier,
    curriculum_chunk_id: identifier,
    source_content_id: identifier,
    grade_level_id: identifier,
    subject_id: identifier,
    topic_id: identifier,
  })
  .strict();

export const aiReviewQueueStatusSchema = z.enum([
  'open',
  'in_review',
  'resolved',
  'escalated',
]);

export const aiReviewDecisionSchema = z.enum([
  'mark_in_review',
  'resolve',
  'escalate',
  'restrict_student',
  'restore_student_access',
]);

export const aiReviewQueueItemSchema = z
  .object({
    schema_version: z.literal(ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION),
    review_id: identifier,
    tutor_session_id: identifier,
    tutor_turn_id: identifier.nullable(),
    student_reference_id: identifier,
    grade_level_id: identifier.nullable(),
    subject_id: identifier.nullable(),
    topic_id: identifier.nullable(),
    severity: z.enum(['amber', 'red']),
    status: aiReviewQueueStatusSchema,
    reason_code: identifier,
    redacted_evidence: z.string().trim().min(1).max(2_000),
    created_at: isoTimestamp,
    updated_at: isoTimestamp,
  })
  .strict();

export const aiReviewDecisionRequestSchema = z
  .object({
    schema_version: z.literal(ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION),
    request_id: identifier,
    decision: aiReviewDecisionSchema,
    note: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

export type CurriculumVersionDto = z.infer<typeof curriculumVersionSchema>;
export type CurriculumLifecycleRequestDto = z.infer<
  typeof curriculumLifecycleRequestSchema
>;
export type PublishedCurriculumChunkDto = z.infer<
  typeof publishedCurriculumChunkSchema
>;
export type TutorCurriculumSourceReferenceDto = z.infer<
  typeof tutorCurriculumSourceReferenceSchema
>;
export type AiReviewQueueItemDto = z.infer<typeof aiReviewQueueItemSchema>;
export type AiReviewDecisionRequestDto = z.infer<
  typeof aiReviewDecisionRequestSchema
>;
