import { getFirestore } from '../../config/firebase';
import {
  listStudentPublishedLessons,
  getLessonDetailedContent,
} from '../published-lesson-catalog.service';

jest.mock('../../config/firebase', () => ({
  getFirestore: jest.fn(),
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
      limit: () => query,
      get: async () => {
        const matching = [...rows.entries()].filter(([, row]) =>
          filters.every(([field, value]) => row[field] === value)
        );
        return {
          empty: matching.length === 0,
          docs: matching.map(([id, row]) => ({ id, data: () => row })),
        };
      },
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

const activeGrade10 = {
  grade_level_id: 'grade-10',
  grade_number: 10,
  grade_name: 'Grade 10',
  status: 'active',
};

const activeMath = {
  subject_id: 'math',
  subject_name: 'Mathematics',
  status: 'active',
};

describe('student published lesson catalog', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns only active Grade 10–12 material from published curriculum versions', async () => {
    firestoreFixture({
      curriculum_versions: {
        published: {
          curriculum_version_id: 'version-published',
          status: 'published',
          grade_level_id: 'grade-10',
          subject_id: 'math',
        },
        draft: {
          curriculum_version_id: 'version-draft',
          status: 'draft',
          grade_level_id: 'grade-10',
          subject_id: 'math',
        },
        gradeEight: {
          curriculum_version_id: 'version-grade-8',
          status: 'published',
          grade_level_id: 'grade-8',
          subject_id: 'math',
        },
        inactiveSubject: {
          curriculum_version_id: 'version-inactive-subject',
          status: 'published',
          grade_level_id: 'grade-10',
          subject_id: 'physics',
        },
      },
      grade_levels: {
        'grade-10': activeGrade10,
        'grade-8': { ...activeGrade10, grade_level_id: 'grade-8', grade_number: 8 },
      },
      subjects: {
        math: activeMath,
        physics: { subject_id: 'physics', subject_name: 'Physics', status: 'inactive' },
      },
      topics: {
        linear: {
          topic_id: 'linear',
          grade_level_id: 'grade-10',
          subject_id: 'math',
          topic_name: 'Linear Equations',
          khmer_name: 'សមីការលីនេអ៊ែរ',
          status: 'active',
        },
        archived: {
          topic_id: 'archived',
          grade_level_id: 'grade-10',
          subject_id: 'math',
          topic_name: 'Archived topic',
          status: 'archived',
        },
      },
      admin_curriculum_content: {
        allowed: {
          content_id: 'lesson-linear',
          curriculum_version_id: 'version-published',
          status: 'draft',
          topic_id: 'linear',
          kind: 'example',
          title: 'Solve one-step equations',
          summary: 'Use inverse operations.',
          body: 'Private instructional body and worked answer',
          reviewer_notes: 'Do not expose',
          hidden_answer: 'x = 5',
          internal_metadata: { owner: 'admin-1' },
        },
        archivedTopic: {
          content_id: 'lesson-archived',
          curriculum_version_id: 'version-published',
          status: 'draft',
          topic_id: 'archived',
          title: 'Must be hidden',
        },
        draftVersion: {
          content_id: 'lesson-draft-version',
          curriculum_version_id: 'version-draft',
          status: 'draft',
          topic_id: 'linear',
          title: 'Draft version must be hidden',
        },
        gradeEight: {
          content_id: 'lesson-grade-eight',
          curriculum_version_id: 'version-grade-8',
          status: 'draft',
          topic_id: 'linear',
          title: 'Grade 8 must be hidden',
        },
        inactiveSubject: {
          content_id: 'lesson-inactive-subject',
          curriculum_version_id: 'version-inactive-subject',
          status: 'draft',
          topic_id: 'linear',
          title: 'Inactive subject must be hidden',
        },
      },
    });

    const lessons = await listStudentPublishedLessons();

    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      lesson_id: 'lesson-linear',
      curriculum_version_id: 'version-published',
      grade_level_id: 'grade-10',
      subject_id: 'math',
      topic_id: 'linear',
      source_reference: {
        curriculum_version_id: 'version-published',
        curriculum_chunk_id: 'admin.version-published.allowed',
      },
    });
  });

  it('applies grade, subject, topic, and search isolation before returning a safe DTO', async () => {
    firestoreFixture({
      curriculum_versions: {
        v10: { curriculum_version_id: 'v10', status: 'published', grade_level_id: 'grade-10', subject_id: 'math' },
      },
      grade_levels: { 'grade-10': activeGrade10 },
      subjects: { math: activeMath },
      topics: {
        linear: { topic_id: 'linear', grade_level_id: 'grade-10', subject_id: 'math', topic_name: 'Linear Equations', status: 'active' },
        quadratic: { topic_id: 'quadratic', grade_level_id: 'grade-10', subject_id: 'math', topic_name: 'Quadratic Graphs', status: 'active' },
      },
      admin_curriculum_content: {
        linear: { content_id: 'linear-lesson', curriculum_version_id: 'v10', status: 'draft', topic_id: 'linear', title: 'Solving Linear Equations', kind: 'concept', private_prompt: 'never return this' },
        quadratic: { content_id: 'quadratic-lesson', curriculum_version_id: 'v10', status: 'draft', topic_id: 'quadratic', title: 'Drawing Quadratic Graphs', kind: 'concept' },
      },
    });

    const lessons = await listStudentPublishedLessons({
      grade_level_id: 'grade-10',
      subject_id: 'math',
      topic_id: 'linear',
      search: 'solving',
    });

    expect(lessons).toHaveLength(1);
    expect(lessons[0].lesson_id).toBe('linear-lesson');
    expect(lessons[0]).not.toHaveProperty('private_prompt');
    expect(lessons[0]).not.toHaveProperty('body');
    expect(lessons[0]).not.toHaveProperty('reviewer_notes');
    expect(lessons[0]).not.toHaveProperty('hidden_answer');
    expect(lessons[0]).not.toHaveProperty('internal_metadata');
  });

  it('populates descoped Grade 12 STEM curriculum across Math, Physics, and Chemistry when unseeded', async () => {
    firestoreFixture({});

    const allLessons = await listStudentPublishedLessons();
    expect(allLessons.length).toBeGreaterThanOrEqual(15);

    // Verify all 3 subjects exist
    const subjects = new Set(allLessons.map((l) => l.subject_id));
    expect(subjects).toContain('math');
    expect(subjects).toContain('physics');
    expect(subjects).toContain('chemistry');

    // Verify all are Grade 12
    expect(allLessons.every((l) => l.grade_number === 12)).toBe(true);

    // Verify Khmer and English descriptions & titles
    for (const lesson of allLessons) {
      expect(lesson.title.trim().length).toBeGreaterThan(0);
      expect(lesson.description).toBeTruthy();
      expect(lesson.topic_khmer_name).toBeTruthy();
    }

    // Verify available topics: limits, kinematics, stoichiometry
    const available = allLessons.filter((l) => l.is_available);
    expect(available.map((l) => l.topic_id)).toEqual(
      expect.arrayContaining([
        'limits-of-functions-g12',
        'kinematics-g12',
        'stoichiometry-g12',
      ])
    );
    for (const lesson of available) {
      expect(lesson.starter_problem).toBeTruthy();
    }

    // Verify unavailable topics are marked is_available = false
    const unavailable = allLessons.filter((l) => !l.is_available);
    expect(unavailable.length).toBeGreaterThan(0);
    expect(unavailable.every((l) => l.is_available === false)).toBe(true);

    // Verify filtering by subject works
    const physicsOnly = await listStudentPublishedLessons({ subject_id: 'physics' });
    expect(physicsOnly.length).toBe(5);
    expect(physicsOnly.every((l) => l.subject_id === 'physics')).toBe(true);
  });

  describe('getLessonDetailedContent', () => {
    it('returns detailed pedagogical content from Firestore when available', async () => {
      firestoreFixture({
        admin_curriculum_content: {
          'limit-content-1': {
            content_id: 'limit-content-1',
            curriculum_version_id: 'v-math-12',
            topic_id: 'limits-of-functions-g12',
            title: 'Limits and Asymptotes',
            summary: 'Understanding finite and infinite limits',
            body: 'Detailed explanations of limit behaviors...',
            grade_number: 12,
            subject_id: 'math',
            subject_name: 'Mathematics',
            concepts: [
              {
                title: 'Two-Sided Limits',
                summary: 'Equality of left and right limits',
                body: 'lim_{x->a} f(x) = L iff left and right limits equal L.',
              },
            ],
            formulas: [
              {
                name: 'Quotient Rule for Limits',
                expression: '\\lim_{x \\to a} \\frac{f(x)}{g(x)} = \\frac{L}{M}',
                explanation: 'Valid when M is non-zero',
              },
            ],
            examples: [
              {
                problem: 'Evaluate \\lim_{x \\to 2} (x + 3)',
                solution: '5',
                steps: ['Direct substitution: 2 + 3 = 5'],
              },
            ],
            common_misconceptions: [
              {
                text: 'Dividing by zero is always infinity',
                correction: '0/0 is indeterminate and requires factoring',
              },
            ],
            khmer_terms: { limit: 'លីមីត', asymptote: 'អាស៊ីមតូត' },
            starter_problem: '\\lim_{x \\to 2} (x + 3)',
          },
        },
      });

      const content = await getLessonDetailedContent('limit-content-1');
      expect(content).toEqual(
        expect.objectContaining({
          lesson_id: 'limit-content-1',
          title: 'Limits and Asymptotes',
          subject_id: 'math',
          grade_number: 12,
          starter_problem: '\\lim_{x \\to 2} (x + 3)',
        })
      );
      expect(content.concepts).toHaveLength(1);
      expect(content.concepts[0].title).toBe('Two-Sided Limits');
      expect(content.formulas).toHaveLength(1);
      expect(content.formulas[0].name).toBe('Quotient Rule for Limits');
      expect(content.examples).toHaveLength(1);
      expect(content.examples[0].problem).toBe('Evaluate \\lim_{x \\to 2} (x + 3)');
      expect(content.common_misconceptions[0]).toContain('0/0 is indeterminate');
      expect(content.khmer_terms).toEqual({ limit: 'លីមីត', asymptote: 'អាស៊ីមតូត' });
    });

    it('falls back smoothly to pre-bundled STEM curriculum content when unseeded', async () => {
      firestoreFixture({});

      // 1. Limits
      const limitsContent = await getLessonDetailedContent('math.g12.lesson1.limits-of-functions');
      expect(limitsContent.lesson_id).toBe('math.g12.lesson1.limits-of-functions');
      expect(limitsContent.title).toContain('Limits of Functions');
      expect(limitsContent.concepts.length).toBeGreaterThan(0);
      expect(limitsContent.formulas.length).toBeGreaterThan(0);
      expect(limitsContent.examples.length).toBeGreaterThan(0);
      expect(limitsContent.common_misconceptions.length).toBeGreaterThan(0);
      expect(limitsContent.khmer_terms.limit).toBe('លីមីត');
      expect(limitsContent.starter_problem).toBe('\\lim_{x \\to 3} \\frac{x^2 - 9}{x - 3}');

      // 2. Kinematics
      const kinematicsContent = await getLessonDetailedContent('physics.g12.lesson1.kinematics');
      expect(kinematicsContent.subject_id).toBe('physics');
      expect(kinematicsContent.formulas.some((f) => f.expression.includes('v = v_0 + at'))).toBe(true);

      // 3. Stoichiometry
      const stoichContent = await getLessonDetailedContent('chemistry.g12.lesson1.stoichiometry');
      expect(stoichContent.subject_id).toBe('chemistry');
      expect(stoichContent.formulas.some((f) => f.expression.includes('n = \\frac{m}{M}'))).toBe(true);

      // 4. Complex Numbers
      const complexContent = await getLessonDetailedContent('math.g12.lesson4.complex-numbers');
      expect(complexContent.khmer_terms['complex number']).toBe('ចំនួនកុំផ្លិច');

      // 5. Arbitrary ID (never crashes or returns 500)
      const genericContent = await getLessonDetailedContent('unknown-lesson-id');
      expect(genericContent.lesson_id).toBe('unknown-lesson-id');
      expect(genericContent.concepts.length).toBeGreaterThan(0);
    });

    it('falls back smoothly without throwing when Firestore errors (e.g. quota exhausted)', async () => {
      mockedGetFirestore.mockImplementationOnce(() => {
        throw new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.');
      });

      const content = await getLessonDetailedContent('math.g12.lesson1.limits-of-functions');
      expect(content).toBeDefined();
      expect(content.title).toContain('Limits of Functions');
      expect(content.concepts.length).toBeGreaterThan(0);
    });
  });
});
