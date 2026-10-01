import { getFirestore } from '../../config/firebase';
import {
  compileCurriculumVersion,
  publishCurriculumVersionToAi,
  unpublishCurriculumVersionFromAi,
} from '../curriculum-publisher.service';

jest.mock('../../config/firebase', () => ({
  getFirestore: jest.fn(),
}));

jest.mock('../observability.service', () => ({
  incrementMetric: jest.fn(),
}));

type Row = Record<string, unknown>;

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

function firestoreFixture(seed: Record<string, Record<string, Row>>) {
  const collections = Object.fromEntries(
    Object.entries(seed).map(([name, rows]) => [name, new Map(Object.entries(rows))]),
  ) as Record<string, Map<string, Row>>;

  const collection = (name: string, filters: Array<[string, unknown]> = []) => {
    const rows = collections[name] ?? (collections[name] = new Map());
    const query = {
      where: (field: string, _operator: string, value: unknown) =>
        collection(name, [...filters, [field, value]]),
      get: async () => ({
        docs: [...rows.entries()]
          .filter(([, row]) => filters.every(([field, value]) => row[field] === value))
          .map(([id, row]) => ({ id, data: () => row })),
      }),
      doc: (id: string) => ({
        get: async () => {
          const row = rows.get(id);
          return { exists: row != null, data: () => row };
        },
      }),
    };
    return query;
  };

  mockedGetFirestore.mockReturnValue({ collection } as never);
}

describe('Curriculum Publisher Service', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('maps all curriculum fields and delivers payload with SHA256 checksum to AI service PUT endpoint', async () => {
    firestoreFixture({
      grade_levels: {
        'grade-12': { grade_number: 12, status: 'active' },
      },
      subjects: {
        'chem-12': { subject_name: 'Chemistry', status: 'active' },
      },
      topics: {
        'topic-electrochem': { topic_name: 'Electrochemistry', status: 'active' },
      },
      admin_curriculum_content: {
        'doc-1': {
          curriculum_version_id: 'v-chem-2026',
          topic_id: 'topic-electrochem',
          lesson: 'Galvanic Cells',
          kind: 'formula',
          expression: 'E0_cell = E0_cathode - E0_anode',
          steps: [
            'Identify cathode and anode',
            'Look up reduction potentials',
            'Compute standard emf',
          ],
          khmer_terms: [
            { english: 'electromotive force', khmer: 'កម្លាំងអេឡិចត្រូចលករ' },
            { english: 'galvanic cell', khmer: 'ពិលកាល់វ៉ានិច' },
          ],
          prerequisites: ['Redox'],
          tags: ['electrochem', 'galvanic'],
        },
      },
    });

    let sentUrl = '';
    let sentMethod = '';
    let sentHeaders: Record<string, string> = {};
    let sentBody: string = '';

    global.fetch = jest.fn().mockImplementation(async (url, init) => {
      sentUrl = String(url);
      sentMethod = init?.method ?? '';
      sentHeaders = (init?.headers ?? {}) as Record<string, string>;
      sentBody = String(init?.body ?? '');
      return { ok: true, status: 200, json: async () => ({}) };
    }) as never;

    const result = await publishCurriculumVersionToAi({
      curriculum_version_id: 'v-chem-2026',
      grade_level_id: 'grade-12',
      subject_id: 'chem-12',
      status: 'published',
    });

    expect(result.chunkIds).toEqual(['admin.v-chem-2026.doc-1']);
    expect(result.payloadHash).toMatch(/^[a-f0-9]{64}$/);

    expect(sentUrl).toContain('/api/v1/internal/curriculum/versions/v-chem-2026');
    expect(sentMethod).toBe('PUT');
    expect(sentHeaders['content-type']).toBe('application/json');
    expect(sentHeaders['x-visual-tutor-internal-token']).toBeDefined();

    const parsed = JSON.parse(sentBody);
    expect(parsed.curriculum_version_id).toBe('v-chem-2026');
    expect(parsed.chunks).toHaveLength(1);
    const chunk = parsed.chunks[0];
    expect(chunk.grade).toBe(12);
    expect(chunk.subject).toBe('Chemistry');
    expect(chunk.topic).toBe('Electrochemistry');
    expect(chunk.subtopic).toBe('Galvanic Cells');
    expect(chunk.formulas).toContain('E0_cell = E0_cathode - E0_anode');
    expect(chunk.solution_steps).toEqual([
      'Identify cathode and anode',
      'Look up reduction potentials',
      'Compute standard emf',
    ]);
    expect(chunk.khmer_terms['electromotive force']).toBe('កម្លាំងអេឡិចត្រូចលករ');
    expect(chunk.source.metadata.review_status).toBe('published');
  });

  it('compiles curriculum version with structured steps and misconceptions into canonical chunks', async () => {
    firestoreFixture({
      curriculum_versions: {
        'v-optics-1': {
          curriculum_version_id: 'v-optics-1',
          grade_level_id: 'grade-12',
          subject_id: 'phys-12',
          status: 'in_review',
        },
      },
      grade_levels: {
        'grade-12': { grade_number: 12, status: 'active' },
      },
      subjects: {
        'phys-12': { subject_name: 'Physics', status: 'active' },
      },
      topics: {
        'topic-optics': { topic_name: 'Optics and Light', status: 'active' },
      },
      admin_curriculum_content: {
        'doc-optics-1': {
          curriculum_version_id: 'v-optics-1',
          topic_id: 'topic-optics',
          subtopic: "Snell's Law",
          kind: 'formula',
          expression: 'n_1 \\sin(\\theta_1) = n_2 \\sin(\\theta_2)',
          steps: [
            { heading: 'Step 1', explanation: 'Identify indices', latex: 'n_1=1' },
            { heading: 'Step 2', explanation: 'Solve for angle', latex: '\\sin(\\theta_2)' },
          ],
          common_misconceptions: [
            { misconception: 'Inverting the ratio', correction: 'Use n1*sin(t1)=n2*sin(t2)' },
          ],
          khmerTerms: [
            { english: 'refraction', khmer: 'ចំណាំងបង្វែរ' },
          ],
        },
      },
    });

    const compiled = await compileCurriculumVersion('v-optics-1');

    expect(compiled.chunks).toHaveLength(1);
    expect(compiled.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    const chunk = compiled.chunks[0];
    expect(chunk.subtopic).toBe("Snell's Law");
    expect(chunk.solution_steps).toEqual([
      'Step 1: Identify indices: $n_1=1$',
      'Step 2: Solve for angle: $\\sin(\\theta_2)$',
    ]);
    expect(chunk.common_misconceptions).toEqual([
      { text: 'Inverting the ratio', correction: 'Use n1*sin(t1)=n2*sin(t2)' },
    ]);
    expect((chunk.khmer_terms as Record<string, string>)['refraction']).toBe('ចំណាំងបង្វែរ');
  });

  it('surfaces exact AI service validation rejection error when publish fails', async () => {
    firestoreFixture({
      grade_levels: {
        'grade-12': { grade_number: 12, status: 'active' },
      },
      subjects: {
        'chem-12': { subject_name: 'Chemistry', status: 'active' },
      },
      topics: {
        'topic-1': { topic_name: 'Stoichiometry', status: 'active' },
      },
      admin_curriculum_content: {
        'doc-1': {
          curriculum_version_id: 'v-fail-1',
          topic_id: 'topic-1',
          kind: 'concept',
          text: 'Mole concept',
          khmer_terms: [{ english: 'mole', khmer: 'ម៉ូល' }],
        },
      },
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: 'Invalid published curriculum payload: Version id mismatch' }),
    });

    await expect(
      publishCurriculumVersionToAi({
        curriculum_version_id: 'v-fail-1',
        grade_level_id: 'grade-12',
        subject_id: 'chem-12',
        status: 'published',
      })
    ).rejects.toThrow('AI curriculum store rejected this published version (400): Invalid published curriculum payload: Version id mismatch');
  });

  it('delivers unpublish request to AI service DELETE endpoint', async () => {
    let sentUrl = '';
    let sentMethod = '';
    let sentHeaders: Record<string, string> = {};

    global.fetch = jest.fn().mockImplementation(async (url, init) => {
      sentUrl = String(url);
      sentMethod = init?.method ?? '';
      sentHeaders = (init?.headers ?? {}) as Record<string, string>;
      return { ok: true, status: 200, json: async () => ({}) };
    }) as never;

    await unpublishCurriculumVersionFromAi('v-chem-2026');

    expect(sentUrl).toContain('/api/v1/internal/curriculum/versions/v-chem-2026');
    expect(sentMethod).toBe('DELETE');
    expect(sentHeaders['x-visual-tutor-internal-token']).toBeDefined();
  });
});
