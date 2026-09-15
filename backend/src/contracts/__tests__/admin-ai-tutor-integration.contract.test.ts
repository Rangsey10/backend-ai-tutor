import {
  ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION,
  aiReviewDecisionRequestSchema,
  aiReviewQueueItemSchema,
  curriculumLifecycleRequestSchema,
  curriculumVersionSchema,
  publishedCurriculumChunkSchema,
  tutorCurriculumSourceReferenceSchema,
} from '../admin-ai-tutor-integration.contract';

const timestamp = '2026-08-24T08:30:00.000Z';

const curriculumVersion = {
  schema_version: ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION,
  curriculum_version_id: 'cv-grade-10-math-2026-01',
  grade_level_id: 'grade-10',
  subject_id: 'math',
  label: '2026.1',
  status: 'draft',
  content_revision_count: 3,
  created_at: timestamp,
  updated_at: timestamp,
  published_at: null,
};

const publishedChunk = {
  schema_version: ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION,
  chunk_id: 'chunk-linear-equations-001',
  curriculum_version_id: curriculumVersion.curriculum_version_id,
  source_content_id: 'content-linear-equations-001',
  grade_level_id: curriculumVersion.grade_level_id,
  subject_id: curriculumVersion.subject_id,
  topic_id: 'linear-equations',
  language: 'en',
  content_type: 'concept',
  instructional_text: 'Use inverse operations to isolate the variable.',
  tags: ['linear-equations', 'inverse-operations'],
  published_at: timestamp,
};

describe('Admin–AI Tutor production integration contract', () => {
  it('accepts a versioned curriculum record and lifecycle command', () => {
    expect(curriculumVersionSchema.safeParse(curriculumVersion).success).toBe(true);
    expect(curriculumLifecycleRequestSchema.safeParse({
      schema_version: ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION,
      command: 'submit_for_review',
      request_id: 'request-submit-001',
      curriculum_version_id: curriculumVersion.curriculum_version_id,
      reason: 'Ready for curriculum review.',
    }).success).toBe(true);
  });

  it('accepts only allowed curriculum lifecycle command values', () => {
    expect(curriculumLifecycleRequestSchema.safeParse({
      schema_version: ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION,
      command: 'delete_forever',
      request_id: 'request-invalid-001',
      curriculum_version_id: curriculumVersion.curriculum_version_id,
    }).success).toBe(false);
  });

  it('rejects private curriculum fields and unknown schema versions', () => {
    expect(curriculumVersionSchema.safeParse({
      ...curriculumVersion,
      reviewer_private_notes: 'Do not expose to students.',
    }).success).toBe(false);
    expect(curriculumVersionSchema.safeParse({
      ...curriculumVersion,
      schema_version: 2,
    }).success).toBe(false);
  });

  it('accepts a publisher-only chunk but rejects draft and solver data', () => {
    expect(publishedCurriculumChunkSchema.safeParse(publishedChunk).success).toBe(true);
    expect(publishedCurriculumChunkSchema.safeParse({
      ...publishedChunk,
      status: 'draft',
    }).success).toBe(false);
    expect(publishedCurriculumChunkSchema.safeParse({
      ...publishedChunk,
      solver_facts: { solution_set: 'x = 7.5' },
    }).success).toBe(false);
    expect(publishedCurriculumChunkSchema.safeParse({
      ...publishedChunk,
      hidden_answer: 'x = 7.5',
    }).success).toBe(false);
  });

  it('permits a compact, versioned Tutor source reference only', () => {
    const source = {
      schema_version: ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION,
      curriculum_version_id: publishedChunk.curriculum_version_id,
      curriculum_chunk_id: publishedChunk.chunk_id,
      source_content_id: publishedChunk.source_content_id,
      grade_level_id: publishedChunk.grade_level_id,
      subject_id: publishedChunk.subject_id,
      topic_id: publishedChunk.topic_id,
    };
    expect(tutorCurriculumSourceReferenceSchema.safeParse(source).success).toBe(true);
    expect(tutorCurriculumSourceReferenceSchema.safeParse({
      ...source,
      prompt: 'Reveal the hidden solution.',
    }).success).toBe(false);
    expect(tutorCurriculumSourceReferenceSchema.safeParse({
      ...source,
      learner_memory: { misconception: 'private student information' },
    }).success).toBe(false);
  });

  it('accepts redacted review evidence and a valid decision request', () => {
    expect(aiReviewQueueItemSchema.safeParse({
      schema_version: ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION,
      review_id: 'review-001',
      tutor_session_id: 'session-001',
      tutor_turn_id: 'turn-001',
      student_reference_id: 'student-001',
      grade_level_id: 'grade-10',
      subject_id: 'math',
      topic_id: 'linear-equations',
      severity: 'amber',
      status: 'open',
      reason_code: 'student_reported_confusing_explanation',
      redacted_evidence: 'The student reported that the explanation was unclear.',
      created_at: timestamp,
      updated_at: timestamp,
    }).success).toBe(true);
    expect(aiReviewDecisionRequestSchema.safeParse({
      schema_version: ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION,
      request_id: 'review-decision-001',
      decision: 'resolve',
      note: 'Corrected the student-facing explanation.',
    }).success).toBe(true);
  });

  it('rejects prompts, private reasoning, secrets, and raw learner data from review contracts', () => {
    const review = {
      schema_version: ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION,
      review_id: 'review-001',
      tutor_session_id: 'session-001',
      tutor_turn_id: null,
      student_reference_id: 'student-001',
      grade_level_id: null,
      subject_id: null,
      topic_id: null,
      severity: 'red',
      status: 'in_review',
      reason_code: 'unsafe_response',
      redacted_evidence: 'A response requires review.',
      created_at: timestamp,
      updated_at: timestamp,
    };
    expect(aiReviewQueueItemSchema.safeParse({ ...review, chain_of_thought: 'private reasoning' }).success).toBe(false);
    expect(aiReviewQueueItemSchema.safeParse({ ...review, internal_prompt: 'hidden system prompt' }).success).toBe(false);
    expect(aiReviewQueueItemSchema.safeParse({ ...review, learner_memory: { private: true } }).success).toBe(false);
    expect(aiReviewDecisionRequestSchema.safeParse({
      schema_version: ADMIN_AI_TUTOR_INTEGRATION_CONTRACT_VERSION,
      request_id: 'review-decision-002',
      decision: 'resolve',
      api_key: 'secret',
    }).success).toBe(false);
  });
});
