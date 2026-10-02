import express from 'express';
import request from 'supertest';
import router from '../admin-curriculum.routes';
import { importCurriculumDataset } from '../../controllers/admin-curriculum.controller';

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
  createAdminContent: jest.fn(),
  createAdminGrade: jest.fn(),
  createAdminSubject: jest.fn(),
  createAdminTopic: jest.fn(),
  deleteAdminContent: jest.fn(),
  getAdminContent: jest.fn(),
  getAdminGrades: jest.fn(),
  getAdminSubjects: jest.fn(),
  getAdminTopics: jest.fn(),
  importCurriculumDataset: jest.fn((_req: express.Request, res: express.Response) =>
    res.status(200).json({ success: true, message: 'import-invoked' })
  ),
  updateAdminContent: jest.fn(),
  updateAdminGrade: jest.fn(),
  updateAdminSubject: jest.fn(),
  updateAdminTopic: jest.fn(),
  updateAdminTopicStatus: jest.fn(),
}));
jest.mock('../../controllers/curriculum-version.controller', () => ({
  archiveCurriculumVersion: jest.fn(),
  compareCurriculumVersion: jest.fn(),
  createCurriculumVersion: jest.fn(),
  listCurriculumVersions: jest.fn(),
  publishCurriculumVersion: jest.fn(),
  rejectCurriculumVersion: jest.fn(),
  submitCurriculumVersionForReview: jest.fn(),
  validateCurriculumVersion: jest.fn(),
}));

describe('Admin curriculum import route', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/admin/curriculum', router);
  });

  it('routes POST /admin/curriculum/import to importCurriculumDataset', async () => {
    const res = await request(app)
      .post('/admin/curriculum/import')
      .send({ dataset: [{ grade: 10, subject: 'Physics', topic: 'Kinematics' }] })
      .expect(200);

    expect(res.body).toEqual({ success: true, message: 'import-invoked' });
    expect(importCurriculumDataset).toHaveBeenCalledTimes(1);
  });
});
