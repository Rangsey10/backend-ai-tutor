import { getFirestore } from '../../config/firebase';
import { listStudentPublishedLessons } from '../published-lesson-catalog.service';

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
});
