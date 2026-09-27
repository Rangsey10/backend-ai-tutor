import request from 'supertest';
import { createApp } from '../../app';

jest.mock('../../config/firebase', () => ({
  getAuth: jest.fn(),
  getFirestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      where: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
      })),
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false }),
      })),
    })),
  })),
  isFirebaseInitialized: jest.fn(() => true),
}));

let app: ReturnType<typeof createApp>;

describe('GET /api/v1/curriculum/catalog', () => {
  beforeEach(() => {
    app = createApp();
  });
  it('returns curriculum catalog with Grade 10, 11, and 12 STEM topics', async () => {
    const res = await request(app).get('/api/v1/curriculum/catalog').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.topics)).toBe(true);
    expect(res.body.data.topics.length).toBeGreaterThanOrEqual(10);

    const topics = res.body.data.topics;
    const grades = new Set(topics.map((t: any) => t.grade));
    expect(grades).toContain(10);
    expect(grades).toContain(11);
    expect(grades).toContain(12);

    const subjects = new Set(topics.map((t: any) => t.subject_id));
    expect(subjects).toContain('math');
    expect(subjects).toContain('physics');
    expect(subjects).toContain('chemistry');

    // Verify every topic has tags, difficulty, and problem_count
    for (const t of topics) {
      expect(Array.isArray(t.tags)).toBe(true);
      expect(t.tags.length).toBeGreaterThan(0);
      expect(['beginner', 'intermediate', 'advanced']).toContain(t.difficulty);
      expect(typeof t.problem_count).toBe('number');
      expect(t.problem_count).toBeGreaterThan(0);
      expect(typeof t.topic_name).toBe('string');
      expect(typeof t.starter_problem).toBe('string');
    }
  });

  it('filters catalog by grade', async () => {
    const res = await request(app).get('/api/v1/curriculum/catalog?grade=12').expect(200);

    expect(res.body.success).toBe(true);
    const topics = res.body.data.topics;
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      expect(t.grade).toBe(12);
    }
  });

  it('filters catalog by subject', async () => {
    const res = await request(app).get('/api/v1/curriculum/catalog?subject_id=physics').expect(200);

    expect(res.body.success).toBe(true);
    const topics = res.body.data.topics;
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      expect(t.subject_id).toBe('physics');
    }
  });

  it('filters catalog by search keyword', async () => {
    const res = await request(app).get('/api/v1/curriculum/catalog?search=optics').expect(200);

    expect(res.body.success).toBe(true);
    const topics = res.body.data.topics;
    expect(topics.length).toBeGreaterThanOrEqual(1);
    expect(topics.some((t: any) => t.topic_name.toLowerCase().includes('optics'))).toBe(true);
  });
});
