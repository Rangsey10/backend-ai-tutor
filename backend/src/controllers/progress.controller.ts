import type { Request, Response } from 'express';
import {
  getDashboardSummary,
  getRecentActivity,
  getWeakTopicSummary,
  storeLessonCompletion,
  storeQuizAttemptSummary,
  storeStudentAnswerEvent,
  storeTutorSessionSummary,
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
  sendSuccess(
    res,
    await getDashboardSummary(req.user!.uid),
    'Dashboard summary retrieved successfully'
  );
});

export const readRecentActivity = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(
    res,
    await getRecentActivity(req.user!.uid),
    'Recent activity retrieved successfully'
  );
});

export const readWeakTopicSummary = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(
    res,
    await getWeakTopicSummary(req.user!.uid),
    'Weak topic summary retrieved successfully'
  );
});
