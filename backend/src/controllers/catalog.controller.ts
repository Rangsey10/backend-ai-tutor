import type { Request, Response } from 'express';
import { listGrades, listSubjects, listTopics } from '../services/catalog.service';
import { listStudentPublishedLessons } from '../services/published-lesson-catalog.service';
import type { ListTopicsQueryInput } from '../schemas/catalog-request.schema';
import type { ListPublishedLessonsQuery } from '../schemas/published-lesson-catalog.schema';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/ApiResponse';

export const getGrades = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, listGrades(), 'Grade levels retrieved successfully');
});

export const getSubjects = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, listSubjects(), 'Subjects retrieved successfully');
});

export const getTopics = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(
    res,
    listTopics(req.query as ListTopicsQueryInput),
    'Topics retrieved successfully'
  );
});

export const getPublishedLessons = asyncHandler(async (req: Request, res: Response) => {
  const lessons = await listStudentPublishedLessons(req.query as ListPublishedLessonsQuery);
  sendSuccess(res, { lessons }, 'Published lessons retrieved successfully');
});
