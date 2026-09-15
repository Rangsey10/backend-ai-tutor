import type { Request, Response } from 'express';
import {
  appendTutorSessionTurn,
  archiveTutorSession,
  createTutorSession,
  getTutorSessionDetail,
} from '../services/tutor-session.service';
import { sendCreated, sendNoContent, sendSuccess } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

// Legacy session persistence contains prompt/expected-answer/snapshot fields.
// Project it before it crosses the student API boundary.
function publicSession(session: Record<string, unknown>) {
  const allowed = ['tutor_session_id', 'subject_id', 'topic_id', 'lesson_id', 'original_question', 'last_turn_number', 'detected_language', 'detected_intent', 'detected_problem_type', 'session_status', 'verification_status', 'archived_at', 'created_at', 'updated_at'];
  return Object.fromEntries(allowed.filter((key) => key in session).map((key) => [key, session[key]]));
}
function publicTurn(turn: Record<string, unknown>) {
  const allowed = ['tutor_turn_id', 'tutor_session_id', 'turn_number', 'sender_type', 'message_text', 'stage', 'teaching_strategy', 'interaction_type', 'created_at'];
  return Object.fromEntries(allowed.filter((key) => key in turn).map((key) => [key, turn[key]]));
}

export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const session = await createTutorSession(req.user!.uid, req.body);
  sendCreated(res, publicSession(session as unknown as Record<string, unknown>), 'Tutor session created successfully');
});

export const appendSessionTurn = asyncHandler(async (req: Request, res: Response) => {
  const response = await appendTutorSessionTurn(req.user!.uid, req.params.sessionId, req.body);
  sendSuccess(res, { session: publicSession(response.session as unknown as Record<string, unknown>), turn: publicTurn(response.turn as unknown as Record<string, unknown>) }, 'Tutor session turn synced successfully');
});

export const getSessionDetail = asyncHandler(async (req: Request, res: Response) => {
  const sessionDetail = await getTutorSessionDetail(req.user!.uid, req.params.sessionId);
  sendSuccess(res, { session: publicSession(sessionDetail.session as unknown as Record<string, unknown>), turns: sessionDetail.turns.map((turn) => publicTurn(turn as unknown as Record<string, unknown>)), snapshots: [] }, 'Tutor session loaded successfully');
});

export const archiveSession = asyncHandler(async (req: Request, res: Response) => {
  await archiveTutorSession(req.user!.uid, req.params.sessionId);
  sendNoContent(res);
});
