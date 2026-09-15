import { createTopicSchema, updateTopicSchema } from '../topics.schema';

describe('Admin topic schemas', () => {
  const validTopic = {
    grade_level_id: 'grade-10',
    subject_id: 'math-10',
    topic_name: 'Linear equations',
    topic_code: 'M10-ALG-01',
  };

  it('accepts the persisted topic lifecycle and fills draft-safe defaults', () => {
    const parsed = createTopicSchema.parse(validTopic);

    expect(parsed.status).toBe('draft');
    expect(parsed.difficulty_level).toBe('beginner');
    expect(parsed.learning_objectives).toEqual([]);
    expect(parsed.prerequisites).toEqual([]);

    for (const status of ['draft', 'active', 'inactive', 'archived']) {
      expect(createTopicSchema.parse({ ...validTopic, status }).status).toBe(status);
    }
  });

  it('rejects invalid lifecycle values and unrecognised update fields', () => {
    expect(() => createTopicSchema.parse({ ...validTopic, status: 'published' })).toThrow();
    expect(() => updateTopicSchema.parse({ status: 'deleted' })).toThrow();
    expect(() => updateTopicSchema.parse({ hidden_answer: 'do not expose' })).toThrow();
  });
});
