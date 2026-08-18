import type { Request, Response } from 'express';
import {
  getProgressDashboard,
  getProgressHistory,
  logTutorActivity,
  submitQuizResult,
} from '../services/progress.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/ApiResponse';

export const submitQuiz = asyncHandler(async (req: Request, res: Response) => {
  const result = await submitQuizResult(req.user!.uid, req.body);
  sendCreated(res, result, 'Quiz result submitted successfully');
});

export const createTutorActivityLog = asyncHandler(async (req: Request, res: Response) => {
  const result = await logTutorActivity(req.user!.uid, req.body);
  sendCreated(res, result, 'Tutor activity logged successfully');
});

export const getDashboard = asyncHandler(async (req: Request, res: Response) => {
  const dashboard = await getProgressDashboard(req.user!.uid);
  sendSuccess(res, dashboard, 'Progress dashboard retrieved successfully');
});

export const getHistory = asyncHandler(async (req: Request, res: Response) => {
  const history = await getProgressHistory(req.user!.uid);
  sendSuccess(res, history, 'Progress history retrieved successfully');
});
