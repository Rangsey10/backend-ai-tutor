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
  let mockBatch: { set: jest.Mock; commit: jest.Mock };
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
    mockBatch = {
      set: jest.fn().mockReturnThis(),
      commit: jest.fn().mockResolvedValue([]),
    };
    mockDb = {
      collection: jest.fn().mockReturnValue({
        doc: jest.fn().mockReturnValue({
          set: jest.fn().mockResolvedValue(undefined),
        }),
      }),
      batch: jest.fn().mockReturnValue(mockBatch),
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
    expect(result.contentUpserted).toBe(1);
    expect(mockDb.batch).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
  });
});
