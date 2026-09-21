import type { Request, Response } from 'express';
import { importCurriculumDataset } from '../admin-curriculum.controller';
import { getFirestore } from '../../config/firebase';

jest.mock('../../config/firebase', () => ({
  getFirestore: jest.fn(),
}));

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

function invoke(
  handler: (req: Request, res: Response, next: (error?: unknown) => void) => unknown,
  options: {
    body?: Record<string, unknown>;
    query?: Record<string, string>;
    user?: { userId: string; role: string };
  } = {},
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
        query: options.query ?? {},
        user: options.user ?? { userId: 'admin-1', role: 'admin' },
      } as unknown as Request,
      res as unknown as Response,
      (error?: unknown) => resolve({ error }),
    );
  });
}

describe('importCurriculumDataset Controller', () => {
  let mockBatch: { set: jest.Mock; commit: jest.Mock };
  let mockDb: {
    collection: jest.Mock;
    batch: jest.Mock;
  };

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

  it('rejects when caller is not an admin', async () => {
    const result = await invoke(importCurriculumDataset, {
      user: { userId: 'student-1', role: 'student' },
      body: { dataset: [] },
    });
    expect((result.error as { statusCode?: number })?.statusCode).toBe(403);
  });

  it('rejects empty dataset with 400', async () => {
    const result = await invoke(importCurriculumDataset, {
      body: { dataset: [] },
    });
    expect((result.error as { statusCode?: number })?.statusCode).toBe(400);
  });

  it('generates preview summary without writing to Firestore when commit is false', async () => {
    const sampleItems = [
      {
        id: 'physics.g10.motion.uniform',
        grade: 10,
        subject: 'Physics',
        topic: 'Uniform Linear Motion',
        subtopic: 'Speed and Velocity',
        text: 'v = s / t',
        formulas: [{ id: 'f1', expression: 'v = s / t', variables: { v: 'speed', s: 'distance', t: 'time' } }],
        khmer_terms: { speed: 'ល្បឿន', distance: 'ចម្ងាយ' },
        solution_steps: ['Identify given', 'Apply v = s / t'],
      },
    ];

    const result = await invoke(importCurriculumDataset, {
      body: { dataset: sampleItems, commit: false },
    });

    expect(result.status).toBe(200);
    const body = result.body as { success: boolean; data: { preview: boolean; totalReceived: number; validCount: number; summary: { grades: string[]; subjects: string[]; totalFormulas: number; totalKhmerTerms: number } } };
    expect(body.success).toBe(true);
    expect(body.data.preview).toBe(true);
    expect(body.data.totalReceived).toBe(1);
    expect(body.data.validCount).toBe(1);
    expect(body.data.summary.grades).toEqual(['Grade 10']);
    expect(body.data.summary.subjects).toEqual(['Physics']);
    expect(body.data.summary.totalFormulas).toBe(1);
    expect(body.data.summary.totalKhmerTerms).toBe(2);
    expect(mockDb.batch).not.toHaveBeenCalled();
  });

  it('commits batched documents to Firestore when commit is true', async () => {
    const sampleItems = [
      {
        id: 'physics.g10.motion.uniform',
        grade: 10,
        subject: 'Physics',
        topic: 'Uniform Linear Motion',
        subtopic: 'Speed and Velocity',
        text: 'v = s / t',
        formulas: [{ id: 'f1', expression: 'v = s / t', variables: { v: 'speed' } }],
        khmer_terms: { speed: 'ល្បឿន' },
        solution_steps: ['Step 1: calculate'],
      },
      {
        id: 'chem.g12.acid.ph',
        grade: 12,
        subject: 'Chemistry',
        topic: 'Acids and Bases',
        subtopic: 'pH Calculation',
        text: 'pH = -log[H+]',
        formulas: [{ id: 'f2', expression: 'pH = -\\log[H^+]' }],
        khmer_terms: { acid: 'អាស៊ីត' },
        solution_steps: ['Step 1: compute pH'],
      },
    ];

    const result = await invoke(importCurriculumDataset, {
      body: { dataset: sampleItems, commit: true },
    });

    expect(result.status).toBe(201);
    expect(mockDb.batch).toHaveBeenCalled();
    expect(mockBatch.commit).toHaveBeenCalled();
    const body = result.body as { success: boolean; data: { totalItems: number; validItems: number; gradesUpserted: number; subjectsUpserted: number; topicsUpserted: number; contentUpserted: number } };
    expect(body.success).toBe(true);
    expect(body.data.totalItems).toBe(2);
    expect(body.data.validItems).toBe(2);
    expect(body.data.gradesUpserted).toBe(2);
    expect(body.data.subjectsUpserted).toBe(2);
    expect(body.data.topicsUpserted).toBe(2);
    expect(body.data.contentUpserted).toBe(2);
  });
});
