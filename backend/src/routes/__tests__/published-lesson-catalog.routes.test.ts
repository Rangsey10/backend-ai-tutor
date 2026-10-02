import request from 'supertest';
import { createApp } from '../../app';
import { getAuth, getFirestore } from '../../config/firebase';
import {
  listStudentPublishedLessons,
  getLessonDetailedContent,
} from '../../services/published-lesson-catalog.service';

jest.mock('../../config/firebase', () => ({
  getAuth: jest.fn(),
  getFirestore: jest.fn(),
}));

jest.mock('../../services/published-lesson-catalog.service', () => ({
  listStudentPublishedLessons: jest.fn(),
  getLessonDetailedContent: jest.fn(),
}));

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockedListLessons = listStudentPublishedLessons as jest.MockedFunction<
  typeof listStudentPublishedLessons
>;
const mockedGetLessonContent = getLessonDetailedContent as jest.MockedFunction<
  typeof getLessonDetailedContent
>;
let app: ReturnType<typeof createApp>;

function mockUserDocument(uid = 'student-1', role: 'student' | 'admin' = 'student') {
  const snapshot = {
    exists: true,
    data: () => ({
      user_id: uid,
      firebase_uid: uid,
      full_name: 'Test Student',
      email: 'student@example.com',
      role,
      account_status: 'active',
    }),
  };
  const doc = jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(snapshot),
    set: jest.fn().mockResolvedValue(undefined),
  });
  (getFirestore as jest.Mock).mockReturnValue({
    collection: jest.fn().mockReturnValue({
      withConverter: jest.fn().mockReturnValue({ doc }),
      doc,
    }),
  } as never);
}

function as(role: 'student' | 'admin') {
  mockUserDocument('student-1', role);
  mockedGetAuth.mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'student-1',
      email: 'student@example.com',
      role,
    }),
  } as never);
}

describe('published student lesson catalog route', () => {
  beforeEach(() => {
    app = createApp();
    jest.clearAllMocks();
    as('student');
    mockedListLessons.mockResolvedValue([
      {
        lesson_id: 'lesson-1',
        curriculum_version_id: 'version-1',
        grade_level_id: 'grade-10',
        grade_number: 10,
        grade_name: 'Grade 10',
        subject_id: 'math',
        subject_name: 'Mathematics',
        topic_id: 'linear-equations',
        topic_name: 'Linear Equations',
        topic_khmer_name: null,
        title: 'Solve linear equations',
        description: null,
        content_type: 'concept',
        difficulty: 'beginner',
        learning_objectives: ['Use inverse operations'],
        is_available: true,
        starter_problem: '2x + 1 = 5',
        source_reference: {
          curriculum_version_id: 'version-1',
          curriculum_chunk_id: 'admin.version-1.lesson-1',
          grade_level_id: 'grade-10',
          subject_id: 'math',
          topic_id: 'linear-equations',
        },
      },
    ]);
  });

  it('requires a student session', async () => {
    await request(app).get('/api/v1/catalog/published-lessons').expect(401);

    as('admin');
    await request(app)
      .get('/api/v1/catalog/published-lessons')
      .set('Authorization', 'Bearer valid-token')
      .expect(403);
  });

  it('passes only validated catalog filters to the student-safe projection', async () => {
    const response = await request(app)
      .get('/api/v1/catalog/published-lessons')
      .query({
        grade_level_id: 'grade-10',
        subject_id: 'math',
        topic_id: 'linear-equations',
        search: 'linear',
      })
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(mockedListLessons).toHaveBeenCalledWith({
      grade_level_id: 'grade-10',
      subject_id: 'math',
      topic_id: 'linear-equations',
      search: 'linear',
    });
    expect(response.body.data.lessons[0]).toEqual(
      expect.objectContaining({
        lesson_id: 'lesson-1',
        curriculum_version_id: 'version-1',
      }),
    );
    expect(response.body.data.lessons[0]).not.toHaveProperty('body');
    expect(response.body.data.lessons[0]).not.toHaveProperty('hidden_answer');
    expect(response.body.data.lessons[0]).not.toHaveProperty('reviewer_notes');
  });

  it('rejects unrecognised public query fields', async () => {
    await request(app)
      .get('/api/v1/catalog/published-lessons')
      .query({ include_drafts: 'true' })
      .set('Authorization', 'Bearer valid-token')
      .expect(400);

    expect(mockedListLessons).not.toHaveBeenCalled();
  });

  it('returns rich pedagogical content for a lesson (concepts, formulas, examples)', async () => {
    mockedGetLessonContent.mockResolvedValue({
      lesson_id: 'lesson-1',
      title: 'Limits of Functions',
      topic_id: 'limits-of-functions',
      topic_name: 'Limits of Functions',
      topic_khmer_name: 'លីមីតនៃអនុគមន៍',
      subject_id: 'math',
      subject_name: 'Mathematics',
      grade_number: 12,
      grade_name: 'Grade 12',
      learning_objectives: ['Understand limits'],
      concepts: [
        {
          title: 'Direct Substitution',
          summary: 'Evaluating f(a) directly',
          body: 'If f is continuous...',
        },
      ],
      formulas: [
        {
          name: 'Indeterminate Form 0/0',
          expression: '\\lim_{x \\to a} \\frac{P(x)}{Q(x)}',
          explanation: 'Factor and cancel common factors',
        },
      ],
      examples: [
        {
          problem: 'Find \\lim_{x \\to 2} (x^2 - 4)/(x - 2)',
          solution: '4',
          steps: ['Factor numerator', 'Cancel x - 2', 'Substitute x = 2'],
        },
      ],
      common_misconceptions: ['0/0 is not 1 or 0'],
      khmer_terms: { limit: 'លីមីត' },
      prerequisites: ['Polynomial factoring'],
      starter_problem: '\\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2}',
    });

    const response = await request(app)
      .get('/api/v1/catalog/lessons/lesson-1/content')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(mockedGetLessonContent).toHaveBeenCalledWith('lesson-1');
    expect(response.body.data).toEqual(
      expect.objectContaining({
        lesson_id: 'lesson-1',
        title: 'Limits of Functions',
        concepts: expect.any(Array),
        formulas: expect.any(Array),
        examples: expect.any(Array),
        common_misconceptions: expect.any(Array),
        khmer_terms: expect.any(Object),
      })
    );
  });
});
