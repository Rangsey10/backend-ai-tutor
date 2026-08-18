import type { Request, Response } from 'express';
import {
  getDashboardSummary,
  getProgressDashboard,
  getProgressHistory,
  getRecentActivity,
  getWeakTopicSummary,
  logTutorActivity,
  storeLessonCompletion,
  storeQuizAttemptSummary,
  storeStudentAnswerEvent,
  storeTutorSessionSummary,
  submitQuizResult,
} from '../services/progress.service';
import { assertTutorSessionOwnership } from '../services/tutor.service';
import { assertQuizAttemptOwnership } from '../services/quiz.service';
import { asyncHandler } from '../utils/asyncHandler';
import { sendCreated, sendSuccess } from '../utils/ApiResponse';

export const createTutorSessionSummary = asyncHandler(async (req: Request, res: Response) => {
  await assertTutorSessionOwnership(req.body.tutor_session_id, req.user!.uid);
  const event = await storeTutorSessionSummary(req.user!.uid, req.body);
  sendCreated(res, event, 'Tutor session summary stored successfully');
});

export const createLessonCompletion = asyncHandler(async (req: Request, res: Response) => {
  await assertTutorSessionOwnership(req.body.tutor_session_id, req.user!.uid);
  const event = await storeLessonCompletion(req.user!.uid, req.body);
  sendCreated(res, event, 'Lesson completion stored successfully');
});

export const createStudentAnswerEvent = asyncHandler(async (req: Request, res: Response) => {
  await assertTutorSessionOwnership(req.body.tutor_session_id, req.user!.uid);
  const event = await storeStudentAnswerEvent(req.user!.uid, req.body);
  sendCreated(res, event, 'Student answer event stored successfully');
});

export const createQuizAttemptSummary = asyncHandler(async (req: Request, res: Response) => {
  await assertQuizAttemptOwnership(req.user!.uid, req.body.quiz_attempt_id);
  const event = await storeQuizAttemptSummary(req.user!.uid, req.body);
  sendCreated(res, event, 'Quiz attempt summary stored successfully');
});

export const readDashboardSummary = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getDashboardSummary(req.user!.uid), 'Dashboard summary retrieved successfully');
});

export const readRecentActivity = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getRecentActivity(req.user!.uid), 'Recent activity retrieved successfully');
});

export const readWeakTopicSummary = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await getWeakTopicSummary(req.user!.uid), 'Weak topic summary retrieved successfully');
});

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
