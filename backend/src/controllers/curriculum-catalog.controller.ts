import type { Request, Response } from 'express';
import { getCurriculumCatalog, type ListCurriculumCatalogQuery } from '../services/curriculum-catalog.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';

export const getCatalog = asyncHandler(async (req: Request, res: Response) => {
  const query: ListCurriculumCatalogQuery = {
    grade: req.query.grade ? String(req.query.grade) : undefined,
    subject_id: req.query.subject_id ? String(req.query.subject_id) : undefined,
    topic_id: req.query.topic_id ? String(req.query.topic_id) : undefined,
    search: req.query.search ? String(req.query.search) : undefined,
  };

  const catalog = await getCurriculumCatalog(query);
  sendSuccess(res, catalog, 'Curriculum catalog retrieved successfully');
});
