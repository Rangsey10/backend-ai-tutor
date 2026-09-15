import request from 'supertest';
import { createApp } from '../../app';
import { getAuth } from '../../config/firebase';
import { listStudentPublishedLessons } from '../../services/published-lesson-catalog.service';

jest.mock('../../config/firebase', () => ({
  getAuth: jest.fn(),
}));

jest.mock('../../services/published-lesson-catalog.service', () => ({
  listStudentPublishedLessons: jest.fn(),
}));

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockedListLessons = listStudentPublishedLessons as jest.MockedFunction<
  typeof listStudentPublishedLessons
>;
const app = createApp();

function as(role: 'student' | 'admin') {
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
});
