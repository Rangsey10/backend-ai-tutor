import type { Request, Response } from 'express';
import { createStudentTutorReport, listStudentNotifications, listStudentTutorReports } from '../services/tutor-report.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/ApiResponse';

export const createTutorReport = asyncHandler(async (req: Request, res: Response) => {
  const report = await createStudentTutorReport(req.user!.uid, req.body);
  sendCreated(res, report, 'Thank you — your report was sent for review.');
});
export const getMyTutorReports = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, { reports: await listStudentTutorReports(req.user!.uid) }, 'Tutor reports loaded'));
export const getMyNotifications = asyncHandler(async (req: Request, res: Response) => sendSuccess(res, { notifications: await listStudentNotifications(req.user!.uid) }, 'Notifications loaded'));
