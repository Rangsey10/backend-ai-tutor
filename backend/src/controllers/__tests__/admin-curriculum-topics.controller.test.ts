import type { Request, Response } from 'express';
import {
  createAdminTopic,
  updateAdminTopicStatus,
} from '../admin-curriculum.controller';
import { getFirestore } from '../../config/firebase';

jest.mock('../../config/firebase', () => ({
  getFirestore: jest.fn(),
}));

type StoredDocument = Record<string, unknown>;
type FirestoreFixture = {
  collections: Record<string, Map<string, StoredDocument>>;
  set: jest.Mock;
  remove: jest.Mock;
};

type FixtureDocumentReference = {
  get: () => Promise<{ id: string; exists: boolean; data: () => StoredDocument | undefined }>;
  set: (data: StoredDocument, options?: { merge?: boolean }) => Promise<void>;
  delete: () => Promise<void>;
};

type FixtureCollection = {
  withConverter: () => FixtureCollection;
  where: (field: string, operator: string, value: unknown) => FixtureCollection;
  limit: () => FixtureCollection;
  get: () => Promise<{ docs: Array<{ id: string; exists: boolean; data: () => StoredDocument }> }>;
  doc: (id: string) => FixtureDocumentReference;
};

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

function createFirestoreFixture(seed: Record<string, Record<string, StoredDocument>>): FirestoreFixture {
  const collections: Record<string, Map<string, StoredDocument>> = {};
  for (const [collectionName, documents] of Object.entries(seed)) {
    collections[collectionName] = new Map(Object.entries(documents));
  }

  const set = jest.fn();
  const remove = jest.fn();
  const collection = (collectionName: string, filters: Array<[string, unknown]> = []): FixtureCollection => {
    const documents = collections[collectionName] ?? (collections[collectionName] = new Map());
    const query = {
      withConverter: () => query,
      where: (field: string, _operator: string, value: unknown) => collection(collectionName, [...filters, [field, value]]),
      limit: () => query,
      get: async () => ({
        docs: [...documents.entries()]
          .filter(([, data]) => filters.every(([field, value]) => data[field] === value))
          .map(([id, data]) => ({ id, exists: true, data: () => data })),
      }),
      doc: (id: string) => ({
        get: async () => {
          const data = documents.get(id);
          return { id, exists: Boolean(data), data: () => data };
        },
        set: async (data: StoredDocument, options?: { merge?: boolean }) => {
          const previous = documents.get(id);
          documents.set(id, options?.merge && previous ? { ...previous, ...data } : data);
          set(collectionName, id, data, options);
        },
        delete: async () => {
          documents.delete(id);
          remove(collectionName, id);
        },
      }),
    };
    return query;
  };

  const firestore = {
    collection,
    runTransaction: async (callback: (transaction: {
      get: (target: { get: () => Promise<unknown> }) => Promise<unknown>;
      set: (target: { set: (data: StoredDocument, options?: { merge?: boolean }) => Promise<void> }, data: StoredDocument, options?: { merge?: boolean }) => Promise<void>;
      delete: (target: { delete: () => Promise<void> }) => Promise<void>;
    }) => Promise<unknown>) => callback({
      get: (target) => target.get(),
      set: (target, data, options) => target.set(data, options),
      delete: (target) => target.delete(),
    }),
  };
  mockedGetFirestore.mockReturnValue(firestore as never);
  return { collections, set, remove };
}

function invoke(
  handler: (req: Request, res: Response, next: (error?: unknown) => void) => unknown,
  options: { body?: Record<string, unknown>; params?: Record<string, string> } = {},
): Promise<{ status?: number; body?: unknown; error?: unknown }> {
  return new Promise((resolve) => {
    let status: number | undefined;
    const res: { status: jest.Mock; json: jest.Mock } = {} as { status: jest.Mock; json: jest.Mock };
    res.status = jest.fn((code: number) => {
      status = code;
      return res;
    });
    res.json = jest.fn((body: unknown) => resolve({ status, body }));
    handler(
      {
        body: options.body ?? {},
        params: options.params ?? {},
        user: { userId: 'admin-1', role: 'admin' },
      } as unknown as Request,
      res as unknown as Response,
      (error?: unknown) => resolve({ error }),
    );
  });
}

const grade10 = {
  grade_level_id: 'grade-10',
  grade_name: 'Grade 10',
  grade_number: 10,
  description: null,
  status: 'active',
};

const math10 = {
  subject_id: 'math-10',
  grade_level_id: 'grade-10',
  grade_name: 'Grade 10',
  subject_name: 'Mathematics',
  subject_code: 'MATH',
  display_order: 1,
  status: 'active',
};

describe('Admin topic CRUD controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a Firestore topic with lifecycle, scoped identity, and audit data', async () => {
    const firestore = createFirestoreFixture({
      grade_levels: { 'grade-10': grade10 },
      subjects: { 'math-10': math10 },
      topics: {},
    });

    const response = await invoke(createAdminTopic, {
      body: {
        grade_level_id: 'grade-10',
        subject_id: 'math-10',
        name: 'Linear equations',
        khmer: 'សមីការលីនេអ៊ែរ',
        code: 'm10-alg-01',
        description: 'Solve one-variable equations.',
        learning_objectives: ['Use inverse operations'],
        difficulty: 'intermediate',
        prerequisites: ['Integers'],
        status: 'draft',
      },
    });

    expect(response.status).toBe(201);
    expect(firestore.set).toHaveBeenCalledTimes(2);
    const created = [...firestore.collections.topics.values()][0];
    expect(created).toMatchObject({
      grade_level_id: 'grade-10',
      subject_id: 'math-10',
      topic_code: 'M10-ALG-01',
      status: 'draft',
      created_by: 'admin-1',
      updated_by: 'admin-1',
      prerequisites: ['Integers'],
    });
    expect([...firestore.collections.topic_code_reservations.values()][0]).toMatchObject({
      subject_id: 'math-10',
      topic_code: 'M10-ALG-01',
      topic_id: created.topic_id,
    });
  });

  it('rejects a subject selected from a different grade before persisting', async () => {
    const firestore = createFirestoreFixture({
      grade_levels: { 'grade-10': grade10 },
      subjects: { 'physics-11': { ...math10, subject_id: 'physics-11', grade_level_id: 'grade-11' } },
      topics: {},
    });

    const response = await invoke(createAdminTopic, {
      body: {
        grade_level_id: 'grade-10',
        subject_id: 'physics-11',
        name: 'Forces',
        code: 'P11-01',
      },
    });

    expect((response.error as Error).message).toBe('Subject does not belong to the selected grade level');
    expect(firestore.set).not.toHaveBeenCalled();
  });

  it('enforces a topic code unique within its subject', async () => {
    const firestore = createFirestoreFixture({
      grade_levels: { 'grade-10': grade10 },
      subjects: { 'math-10': math10 },
      topics: {
        'existing-topic': { topic_id: 'existing-topic', subject_id: 'math-10', topic_code: 'M10-ALG-01' },
      },
    });

    const response = await invoke(createAdminTopic, {
      body: {
        grade_level_id: 'grade-10',
        subject_id: 'math-10',
        name: 'Another equation lesson',
        code: 'm10-alg-01',
      },
    });

    expect((response.error as Error).message).toBe('Topic code M10-ALG-01 already exists for this subject');
    expect(firestore.set).not.toHaveBeenCalled();
  });

  it('archives without deleting the published topic document', async () => {
    const publishedTopic = {
      topic_id: 'linear-equations',
      grade_level_id: 'grade-10',
      subject_id: 'math-10',
      topic_name: 'Linear equations',
      topic_code: 'M10-ALG-01',
      status: 'active',
      created_by: 'admin-original',
    };
    const firestore = createFirestoreFixture({ topics: { 'linear-equations': publishedTopic } });

    const response = await invoke(updateAdminTopicStatus, {
      params: { topicId: 'linear-equations' },
      body: { status: 'archived' },
    });

    expect(response.status).toBe(200);
    expect(firestore.remove).not.toHaveBeenCalled();
    expect(firestore.collections.topics.get('linear-equations')).toMatchObject({
      ...publishedTopic,
      status: 'archived',
      updated_by: 'admin-1',
    });
    expect(firestore.set).toHaveBeenCalledWith(
      'topics',
      'linear-equations',
      expect.objectContaining({ status: 'archived' }),
      { merge: true },
    );
  });
});
