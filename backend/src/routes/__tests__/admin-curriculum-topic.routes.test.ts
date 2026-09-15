import express from 'express';
import request from 'supertest';
import router from '../admin-curriculum.routes';
import {
  createAdminTopic,
  getAdminTopics,
  updateAdminTopic,
  updateAdminTopicStatus,
} from '../../controllers/admin-curriculum.controller';

jest.mock('../../middlewares/auth', () => ({
  authenticate: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../../middlewares/authorize', () => ({
  authorize: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../../middlewares/admin-csrf', () => ({
  requireAdminCsrf: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
jest.mock('../../controllers/admin-curriculum.controller', () => ({
  createAdminContent: jest.fn((_req: express.Request, res: express.Response) => res.status(201).json({ route: 'content-create' })),
  createAdminGrade: jest.fn((_req: express.Request, res: express.Response) => res.status(201).json({ route: 'grade-create' })),
  createAdminSubject: jest.fn((_req: express.Request, res: express.Response) => res.status(201).json({ route: 'subject-create' })),
  createAdminTopic: jest.fn((_req: express.Request, res: express.Response) => res.status(201).json({ route: 'topic-create' })),
  deleteAdminContent: jest.fn((_req: express.Request, res: express.Response) => res.status(200).json({ route: 'content-delete' })),
  getAdminContent: jest.fn((_req: express.Request, res: express.Response) => res.status(200).json({ route: 'content-list' })),
  getAdminGrades: jest.fn((_req: express.Request, res: express.Response) => res.status(200).json({ route: 'grade-list' })),
  getAdminSubjects: jest.fn((_req: express.Request, res: express.Response) => res.status(200).json({ route: 'subject-list' })),
  getAdminTopics: jest.fn((_req: express.Request, res: express.Response) => res.status(200).json({ route: 'topic-list' })),
  updateAdminContent: jest.fn((_req: express.Request, res: express.Response) => res.status(200).json({ route: 'content-update' })),
  updateAdminGrade: jest.fn((_req: express.Request, res: express.Response) => res.status(200).json({ route: 'grade-update' })),
  updateAdminSubject: jest.fn((_req: express.Request, res: express.Response) => res.status(200).json({ route: 'subject-update' })),
  updateAdminTopic: jest.fn((_req: express.Request, res: express.Response) => res.status(200).json({ route: 'topic-update' })),
  updateAdminTopicStatus: jest.fn((_req: express.Request, res: express.Response) => res.status(200).json({ route: 'topic-status' })),
}));
jest.mock('../../controllers/curriculum-version.controller', () => ({
  archiveCurriculumVersion: jest.fn(),
  compareCurriculumVersion: jest.fn(),
  createCurriculumVersion: jest.fn(),
  listCurriculumVersions: jest.fn(),
  publishCurriculumVersion: jest.fn(),
  rejectCurriculumVersion: jest.fn(),
  submitCurriculumVersionForReview: jest.fn(),
}));

const app = express();
app.use(express.json());
app.use('/admin/curriculum', router);

describe('Admin curriculum topic route wiring', () => {
  beforeEach(() => jest.clearAllMocks());

  it('wires list, create, update, and non-destructive status endpoints', async () => {
    await request(app).get('/admin/curriculum/topics').expect(200);
    await request(app).post('/admin/curriculum/topics').send({
      grade_level_id: 'grade-10', subject_id: 'math-10', name: 'Linear equations', code: 'M10-01',
    }).expect(201);
    await request(app).put('/admin/curriculum/topics/topic-1').send({ name: 'Updated topic' }).expect(200);
    await request(app)
      .patch('/admin/curriculum/topics/topic-1/status')
      .send({ status: 'Archived' })
      .expect(200);

    expect(getAdminTopics).toHaveBeenCalledTimes(1);
    expect(createAdminTopic).toHaveBeenCalledTimes(1);
    expect(updateAdminTopic).toHaveBeenCalledTimes(1);
    expect(updateAdminTopicStatus).toHaveBeenCalledTimes(1);
  });

  it('does not expose a hard-delete route for topics', async () => {
    await request(app).delete('/admin/curriculum/topics/topic-1').expect(404);
  });
});
