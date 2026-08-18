import type { Request, Response } from 'express';
import {
  appendTutorSessionTurn,
  archiveTutorSession,
  createTutorSession,
  getTutorSessionDetail,
} from '../services/tutor-session.service';
import { sendCreated, sendNoContent, sendSuccess } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await createTutorSession(req.user!.uid, req.body);
  sendCreated(res, session, 'Tutor session created successfully');
});

export const appendSessionTurn = asyncHandler(async (req: Request, res: Response) => {
  const response = await appendTutorSessionTurn(req.user!.uid, req.params.sessionId, req.body);
  sendSuccess(res, response, 'Tutor session turn synced successfully');
});

export const getSessionDetail = asyncHandler(async (req: Request, res: Response) => {
  const sessionDetail = await getTutorSessionDetail(req.user!.uid, req.params.sessionId);
  sendSuccess(res, sessionDetail, 'Tutor session loaded successfully');
});

export const archiveSession = asyncHandler(async (req: Request, res: Response) => {
  await archiveTutorSession(req.user!.uid, req.params.sessionId);
  sendNoContent(res);
});
