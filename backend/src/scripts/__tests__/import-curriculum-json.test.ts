import fs from 'fs';
import path from 'path';
import { runCurriculumImport } from '../import-curriculum-json';
import { getFirestore } from '../../config/firebase';

jest.mock('../../config/firebase', () => ({
  initFirebase: jest.fn(),
  getFirestore: jest.fn(),
}));

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

describe('import-curriculum-json ETL script', () => {
  let mockBatch: { set: jest.Mock; delete: jest.Mock; commit: jest.Mock };
  let storedDocuments: Map<string, Map<string, Record<string, unknown>>>;
  let mockDb: {
    collection: jest.Mock;
    batch: jest.Mock;
  };
  const tempDir = path.join(__dirname, 'temp-curriculum-test');

  beforeAll(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const sampleLine = JSON.stringify({
      id: 'physics.g10.motion.uniform',
      grade: 10,
      subject: 'Physics',
      chapter: 'Mechanics',
      topic: 'Uniform Linear Motion',
      subtopic: 'Speed and velocity',
      text: 'v = s / t',
      formulas: [{ id: 'f1', expression: 'v = s / t', variables: { v: 'velocity' } }],
      khmer_terms: { speed: 'ល្បឿន' },
      solution_steps: ['Identify given', 'Calculate speed'],
    });
    fs.writeFileSync(path.join(tempDir, 'sample_physics.jsonl'), sampleLine + '\n', 'utf-8');
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    storedDocuments = new Map();

    const collectionDocuments = (collectionName: string) => {
      let documents = storedDocuments.get(collectionName);
      if (!documents) {
        documents = new Map();
        storedDocuments.set(collectionName, documents);
      }
      return documents;
    };

    const documentReference = (collectionName: string, documentId: string) => ({
      id: documentId,
      path: `${collectionName}/${documentId}`,
      collectionName,
      get: jest.fn(async () => {
        const data = collectionDocuments(collectionName).get(documentId);
        return {
          exists: data !== undefined,
          id: documentId,
          data: () => data,
        };
      }),
      set: jest.fn(async (data: Record<string, unknown>, options?: { merge?: boolean }) => {
        const documents = collectionDocuments(collectionName);
        const existing = documents.get(documentId) ?? {};
        documents.set(documentId, options?.merge ? { ...existing, ...data } : data);
      }),
    });

    const querySnapshot = (collectionName: string, rows: Array<[string, Record<string, unknown>]>) => ({
      empty: rows.length === 0,
      docs: rows.map(([id, data]) => ({
        id,
        ref: documentReference(collectionName, id),
        data: () => data,
      })),
    });

    mockDb = {
      collection: jest.fn((collectionName: string) => ({
        doc: jest.fn((documentId: string) => documentReference(collectionName, documentId)),
        get: jest.fn(async () =>
          querySnapshot(collectionName, [...collectionDocuments(collectionName).entries()])
        ),
        where: jest.fn((field: string, operator: string, value: unknown) => {
          expect(operator).toBe('==');
          return {
            get: jest.fn(async () =>
              querySnapshot(
                collectionName,
                [...collectionDocuments(collectionName).entries()].filter(
                  ([, data]) => data[field] === value
                )
              )
            ),
          };
        }),
      })),
      batch: jest.fn(() => {
        const writes: Array<{
          ref: { collectionName: string; id: string };
          data: Record<string, unknown>;
        }> = [];
        const deletes: Array<{ collectionName: string; id: string }> = [];
        mockBatch = {
          set: jest.fn((ref, data) => {
            writes.push({ ref, data });
            return mockBatch;
          }),
          delete: jest.fn((ref) => {
            deletes.push(ref);
            return mockBatch;
          }),
          commit: jest.fn(async () => {
            for (const { ref, data } of writes) {
              collectionDocuments(ref.collectionName).set(ref.id, data);
            }
            for (const ref of deletes) {
              collectionDocuments(ref.collectionName).delete(ref.id);
            }
            return [];
          }),
        };
        return mockBatch;
      }),
    };
    mockedGetFirestore.mockReturnValue(mockDb as unknown as ReturnType<typeof getFirestore>);
  });

  it('reads dataset files and writes batch records to Firestore', async () => {
    const result = await runCurriculumImport([tempDir]);

    expect(result.totalFiles).toBe(1);
    expect(result.totalItems).toBe(1);
    expect(result.gradesUpserted).toBe(1);
    expect(result.subjectsUpserted).toBe(1);
    expect(result.topicsUpserted).toBe(1);
    expect(result.contentUpserted).toBe(2);
    expect(result.versionsPublished).toBe(1);
    expect(mockDb.batch).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
    expect(mockDb.collection).toHaveBeenCalledWith('grade_levels');
    expect(mockDb.collection).toHaveBeenCalledWith('subjects');
    expect(mockDb.collection).toHaveBeenCalledWith('topics');
    expect(mockDb.collection).toHaveBeenCalledWith('admin_curriculum_content');
    expect(mockDb.collection).toHaveBeenCalledWith('curriculum_versions');
  });
});
