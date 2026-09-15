import type { Request, Response } from 'express';
import {
  publishCurriculumVersion,
  submitCurriculumVersionForReview,
} from '../curriculum-version.controller';
import { updateAdminContent } from '../admin-curriculum.controller';
import { getFirestore } from '../../config/firebase';

jest.mock('../../config/firebase', () => ({
  getFirestore: jest.fn(),
}));

jest.mock('../../services/curriculum-publisher.service', () => ({
  publishCurriculumVersionToAi: jest.fn().mockResolvedValue({
    chunkIds: ['admin.math-10-v1.content-1'],
    payloadHash: 'test-payload-hash',
  }),
  unpublishCurriculumVersionFromAi: jest.fn().mockResolvedValue(undefined),
}));

type StoredDocument = Record<string, unknown>;
type FirestoreFixture = {
  collections: Record<string, Map<string, StoredDocument>>;
  set: jest.Mock;
};

type FixtureDocumentReference = {
  path: string;
  get: () => Promise<{ id: string; exists: boolean; data: () => StoredDocument | undefined; ref: FixtureDocumentReference }>;
  set: (data: StoredDocument, options?: { merge?: boolean }) => Promise<void>;
};

type FixtureCollection = {
  where: (field: string, operator: string, value: unknown) => FixtureCollection;
  get: () => Promise<{ docs: Array<{ id: string; exists: boolean; data: () => StoredDocument; ref: FixtureDocumentReference }>; empty: boolean }>;
  doc: (id: string) => FixtureDocumentReference;
};

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

function createFirestoreFixture(seed: Record<string, Record<string, StoredDocument>>): FirestoreFixture {
  const collections: Record<string, Map<string, StoredDocument>> = {};
  for (const [collectionName, documents] of Object.entries(seed)) {
    collections[collectionName] = new Map(Object.entries(documents));
  }
  const set = jest.fn();

  const collection = (collectionName: string, filters: Array<[string, unknown]> = []): FixtureCollection => {
    const documents = collections[collectionName] ?? (collections[collectionName] = new Map());
    const query: FixtureCollection = {
      where: (field: string, _operator: string, value: unknown) => collection(collectionName, [...filters, [field, value]]),
      get: async () => {
        const docs = [...documents.entries()]
          .filter(([, data]) => filters.every(([field, value]) => data[field] === value))
          .map(([id, data]) => ({ id, exists: true, data: () => data, ref: query.doc(id) }));
        return { docs, empty: docs.length === 0 };
      },
      doc: (id: string) => ({
        path: `${collectionName}/${id}`,
        get: async () => {
          const data = documents.get(id);
          return {
            id,
            exists: Boolean(data),
            data: () => data,
            ref: query.doc(id),
          };
        },
        set: async (data: StoredDocument, options?: { merge?: boolean }) => {
          const current = documents.get(id);
          documents.set(id, options?.merge && current ? { ...current, ...data } : data);
          set(collectionName, id, data, options);
        },
      }),
    };
    return query;
  };

  mockedGetFirestore.mockReturnValue({ collection } as never);
  return { collections, set };
}

function invoke(
  handler: (req: Request, res: Response, next: (error?: unknown) => void) => unknown,
  options: { body?: Record<string, unknown>; params?: Record<string, string>; role?: string } = {},
): Promise<{ status?: number; body?: unknown; error?: unknown }> {
  return new Promise((resolve) => {
    let status: number | undefined;
    const response = {} as { status: jest.Mock; json: jest.Mock };
    response.status = jest.fn((code: number) => {
      status = code;
      return response;
    });
    response.json = jest.fn((body: unknown) => resolve({ status, body }));
    handler({
      body: options.body ?? {},
      params: options.params ?? {},
      user: { userId: 'admin-1', role: options.role ?? 'admin' },
    } as unknown as Request, response as unknown as Response, (error?: unknown) => resolve({ error }));
  });
}

const version = {
  curriculum_version_id: 'math-10-v1',
  grade_level_id: 'grade-10',
  subject_id: 'math-10',
  label: 'Version 1',
  status: 'in_review',
  change_summary: 'First review',
  created_by: 'admin-0',
  reviewed_by: 'admin-0',
  published_by: null,
  created_at: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
  updated_at: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
  reviewed_at: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
  published_at: null,
  rejection_reason: null,
  revision: 1,
};

const publishableContent = {
  curriculum_version_id: 'math-10-v1',
  grade_level_id: 'grade-10',
  subject_id: 'math-10',
  topic_id: 'linear-equations',
  kind: 'concept',
  status: 'draft',
  lesson: 'Linear equations',
  title: 'Inverse operations',
  body: 'Use inverse operations to isolate x.',
  khmer_terms: [{ khmer: 'ប្រមាណវិធីបញ្ច្រាស' }],
};

describe('Curriculum version lifecycle controller', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects an invalid lifecycle transition without changing a draft version', async () => {
    const firestore = createFirestoreFixture({
      curriculum_versions: { 'math-10-v1': { ...version, status: 'draft' } },
    });

    const response = await invoke(publishCurriculumVersion, {
      params: { curriculumVersionId: 'math-10-v1' },
      body: { idempotency_key: 'publish-1' },
    });

    expect((response.error as Error).message).toContain('Cannot published a curriculum version in draft state');
    expect((response.error as { statusCode?: number }).statusCode).toBe(409);
    expect(firestore.collections.curriculum_versions.get('math-10-v1')?.status).toBe('draft');
    expect(firestore.collections.admin_audit_logs).toBeUndefined();
  });

  it('publishes idempotently and writes one audit event for the accepted request', async () => {
    const firestore = createFirestoreFixture({
      curriculum_versions: { 'math-10-v1': version },
      admin_curriculum_content: { 'content-1': publishableContent },
      grade_levels: { 'grade-10': { grade_level_id: 'grade-10', grade_number: 10, status: 'active' } },
      subjects: { 'math-10': { subject_id: 'math-10', subject_name: 'Mathematics', status: 'active' } },
      topics: { 'linear-equations': { topic_id: 'linear-equations', topic_name: 'Linear equations', grade_level_id: 'grade-10', subject_id: 'math-10', status: 'active' } },
    });
    const request = {
      params: { curriculumVersionId: 'math-10-v1' },
      body: { idempotency_key: 'publish-1' },
    };

    const first = await invoke(publishCurriculumVersion, request);
    const second = await invoke(publishCurriculumVersion, request);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(firestore.collections.curriculum_versions.get('math-10-v1')).toMatchObject({
      status: 'published', published_by: 'admin-1', revision: 2,
    });
    expect(firestore.collections.admin_audit_logs.size).toBe(1);
    expect([...firestore.collections.admin_audit_logs.values()][0]).toMatchObject({
      action: 'curriculum_version.published', actor_id: 'admin-1', resource_id: 'math-10-v1',
    });
  });

  it('keeps a published version immutable to draft-review transitions', async () => {
    const firestore = createFirestoreFixture({
      curriculum_versions: { 'math-10-v1': { ...version, status: 'published', published_by: 'admin-1' } },
    });

    const response = await invoke(submitCurriculumVersionForReview, {
      params: { curriculumVersionId: 'math-10-v1' },
      body: { idempotency_key: 'review-again' },
    });

    expect((response.error as Error).message).toContain('Cannot submitted_for_review a curriculum version in published state');
    expect(firestore.collections.curriculum_versions.get('math-10-v1')?.status).toBe('published');
  });

  it('rejects direct edits to content owned by a published version', async () => {
    const firestore = createFirestoreFixture({
      curriculum_versions: { 'math-10-v1': { ...version, status: 'published', published_by: 'admin-1' } },
      admin_curriculum_content: {
        'content-1': {
          ...publishableContent,
          content_id: 'content-1',
          grade_name: 'Grade 10',
          subject_name: 'Mathematics',
          topic_name: 'Linear equations',
          created_at: version.created_at,
          updated_at: version.updated_at,
        },
      },
    });

    const response = await invoke(updateAdminContent, {
      params: { contentId: 'content-1' },
      body: { title: 'Changed after publication' },
    });

    expect((response.error as Error).message).toBe('Published or in-review curriculum versions are immutable; create a new draft version');
    expect((response.error as { statusCode?: number }).statusCode).toBe(409);
    expect(firestore.collections.admin_curriculum_content.get('content-1')?.title).toBe('Inverse operations');
    expect(firestore.set).not.toHaveBeenCalled();
  });

  it('requires an authenticated administrator for curriculum lifecycle actions', async () => {
    createFirestoreFixture({ curriculum_versions: { 'math-10-v1': version } });

    const response = await invoke(publishCurriculumVersion, {
      params: { curriculumVersionId: 'math-10-v1' },
      body: { idempotency_key: 'student-publish' },
      role: 'student',
    });

    expect((response.error as Error).message).toBe('Admin access is required');
    expect((response.error as { statusCode?: number }).statusCode).toBe(403);
  });
});
