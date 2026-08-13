import type { Request, Response } from 'express';
import { listGrades, listSubjects, listTopics } from '../services/catalog.service';
import type { ListTopicsQueryInput } from '../schemas/catalog-request.schema';
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
