import { listGrades, listSubjects, listTopics } from '../catalog.service';

describe('Grade 8–10 Mathematics MVP catalog contract', () => {
  it('exposes only Grade 8, 9, and 10 in the student Visual Tutor catalog', () => {
    expect(listGrades().map((grade) => grade.grade_number)).toEqual([8, 9, 10]);
    expect(listSubjects()).toEqual([
      expect.objectContaining({ subject_id: 'math', subject_name: 'Mathematics' }),
    ]);
  });

  it.each([
    ['grade-8', [
      'Integer, Fraction & Decimal Arithmetic',
      'Percentages',
      'Linear Equations',
    ]],
    ['grade-9', [
      'Linear Equations',
      'Slope from Two Points',
      'Straight-Line Graphs',
    ]],
    ['grade-10', [
      'Linear Equations',
      'Basic Quadratic Graphs',
    ]],
  ])('maps %s to its supported Mathematics topics only', (gradeLevelId, expectedTopicNames) => {
    const topics = listTopics({ grade_level_id: gradeLevelId, subject_id: 'math' });

    expect(topics.map((topic) => topic.topic_name)).toEqual(expectedTopicNames);
    expect(topics.every((topic) => topic.subject_id === 'math')).toBe(true);
    expect(topics.every((topic) => topic.grade_level_id === gradeLevelId)).toBe(true);
  });

  it('does not leak retired Grade 11/12 or unsupported-topic catalog rows', () => {
    expect(listTopics({ grade_level_id: 'grade-7', subject_id: 'math' })).toEqual([]);
    expect(listTopics({ grade_level_id: 'grade-11', subject_id: 'math' })).toEqual([]);
    expect(listTopics({ grade_level_id: 'grade-12', subject_id: 'math' })).toEqual([]);
  });
});
