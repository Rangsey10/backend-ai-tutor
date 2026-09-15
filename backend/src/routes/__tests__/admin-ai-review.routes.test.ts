import request from 'supertest';
import { createApp } from '../../app';
import { getAuth, getFirestore, isFirebaseInitialized } from '../../config/firebase';
import {
  assertStudentAiAccess,
  decideAdminAiReview,
  listAdminAiReviews,
} from '../../services/admin-ai-review.service';

type Document = Record<string, unknown>;

const collections = new Map<string, Map<string, Document>>();

function collectionDocuments(name: string): Map<string, Document> {
  const existing = collections.get(name);
  if (existing) return existing;
  const created = new Map<string, Document>();
  collections.set(name, created);
  return created;
}

function firestoreDouble() {
  return {
    collection(name: string) {
      const documents = collectionDocuments(name);
      return {
        doc(id: string) {
          return {
            async get() {
              const value = documents.get(id);
              return { exists: Boolean(value), data: () => value };
            },
            async set(value: Document, options?: { merge?: boolean }) {
              documents.set(id, options?.merge ? { ...(documents.get(id) ?? {}), ...value } : value);
            },
          };
        },
        async get() {
          return {
            docs: Array.from(documents.entries()).map(([id, value]) => ({ id, data: () => value })),
          };
        },
      };
    },
  };
}

jest.mock('../../config/firebase', () => ({
  getAuth: jest.fn(),
  getFirestore: jest.fn(),
  isFirebaseInitialized: jest.fn(() => true),
}));

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;
const mockedIsFirebaseInitialized = isFirebaseInitialized as jest.MockedFunction<typeof isFirebaseInitialized>;
const app = createApp();

function addReview(overrides: Document = {}): void {
  collectionDocuments('reported_ai_responses').set('review-1', {
    tutor_session_id: 'session-1',
    tutor_turn_id: 'turn-1',
    student_profile_id: 'student-1',
    grade_level_id: 'grade-10',
    subject_id: 'math',
    topic_id: 'linear-equations',
    report_type: 'unsafe_unhelpful',
    review_status: 'pending',
    redacted_details: 'The response skipped a teaching step.',
    chain_of_thought: 'must never leave the server',
    hidden_answer: 'x = 7',
    internal_prompt: 'hidden instruction',
    learner_memory: { private: true },
    created_at: { toDate: () => new Date('2026-08-24T00:00:00.000Z') },
    ...overrides,
  });
}

beforeEach(() => {
  collections.clear();
  addReview();
  jest.clearAllMocks();
  mockedGetFirestore.mockReturnValue(firestoreDouble() as never);
  mockedIsFirebaseInitialized.mockReturnValue(true);
  mockedGetAuth.mockReturnValue({
    verifyIdToken: jest.fn(async (token: string) => ({
      uid: token === 'admin-token' ? 'admin-1' : 'student-1',
      role: token === 'admin-token' ? 'admin' : 'student',
    })),
  } as never);
});

describe('Admin AI review queue', () => {
  it('returns a redacted review view and never returns implementation-sensitive report fields', async () => {
    const reviews = await listAdminAiReviews({ grade_level_id: 'grade-10', severity: 'red' });

    expect(reviews).toEqual([
      expect.objectContaining({
        review_id: 'review-1',
        status: 'pending',
        evidence: 'The response skipped a teaching step.',
        severity: 'red',
      }),
    ]);
    expect(reviews[0]).not.toHaveProperty('chain_of_thought');
    expect(reviews[0]).not.toHaveProperty('hidden_answer');
    expect(reviews[0]).not.toHaveProperty('internal_prompt');
    expect(reviews[0]).not.toHaveProperty('learner_memory');
  });

  it('allows only admins to make a review decision', async () => {
    await request(app)
      .post('/api/v1/admin/ai-reviews/review-1/decision')
      .send({ decision: 'resolve', idempotency_key: 'decision-1' })
      .expect(401);

    await request(app)
      .post('/api/v1/admin/ai-reviews/review-1/decision')
      .set('Authorization', 'Bearer student-token')
      .send({ decision: 'resolve', idempotency_key: 'decision-1' })
      .expect(403);

    const response = await request(app)
      .post('/api/v1/admin/ai-reviews/review-1/decision')
      .set('Authorization', 'Bearer admin-token')
      .set('Cookie', 'rean_admin_csrf=test-csrf')
      .set('X-CSRF-Token', 'test-csrf')
      .send({ decision: 'resolve', idempotency_key: 'decision-1', note: 'Reviewed safely.' })
      .expect(200);

    expect(response.body.data.review_status).toBe('resolved');
    expect(collectionDocuments('admin_audit_logs').size).toBe(1);
  });

  it('makes duplicate decisions idempotent and records a single audit entry', async () => {
    await decideAdminAiReview('review-1', 'escalate', 'same-request', 'admin-1', 'Needs teacher review');
    await decideAdminAiReview('review-1', 'escalate', 'same-request', 'admin-1', 'Needs teacher review');

    const report = collectionDocuments('reported_ai_responses').get('review-1')!;
    expect(report.review_status).toBe('escalated');
    expect((report.review_history as unknown[])).toHaveLength(1);
    expect(collectionDocuments('admin_ai_review_idempotency').size).toBe(1);
    expect(collectionDocuments('admin_audit_logs').size).toBe(1);
  });

  it('enforces a restriction during tutor access and restores access only through an auditable review action', async () => {
    await decideAdminAiReview('review-1', 'restrict_student', 'restrict-1', 'admin-1', 'Safety review');
    await expect(assertStudentAiAccess('student-1')).rejects.toMatchObject({
      statusCode: 403,
      code: 'AI_FEATURE_RESTRICTED',
    });

    await decideAdminAiReview('review-1', 'restore_student_access', 'restore-1', 'admin-1');
    await expect(assertStudentAiAccess('student-1')).resolves.toBeUndefined();
    expect(collectionDocuments('admin_audit_logs').size).toBe(2);
  });
});
