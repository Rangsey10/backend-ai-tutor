import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import type {
  CreateTutorSessionRequestInput,
  TutorSessionParamsInput,
  TutorTurnRequestInput,
  TutorUserSessionsParamsInput,
} from '../schemas/tutor-request.schema';
import {
  createTutorSession,
  getTutorSession,
  getTutorSessionsForUser,
  responseBelongsToUser,
  sendTutorTurn,
  scanTutorImage,
  transcribeTutorVoice,
  synthesizeTutorVoice,
  validateTutorImageUpload,
  validateTutorAudioUpload,
} from '../services/tutor.service';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { logger } from '../utils/logger';

function requestId(req: Request): string {
  const header = req.header('x-request-id');
  return header && header.trim().length > 0 ? header : randomUUID();
}

function withoutClientUserId<T extends Record<string, unknown>>(
  payload: T
): Omit<T, 'user_id' | 'userId'> {
  const safePayload = { ...payload };
  delete safePayload.user_id;
  delete safePayload.userId;
  return safePayload;
}

export const createSession = asyncHandler(async (req: Request, res: Response) => {
  const response = await createTutorSession(
    req.user!.uid,
    withoutClientUserId(req.body) as CreateTutorSessionRequestInput,
    {
      requestId: requestId(req),
    }
  );
  res.status(201).json(response);
});

export const getSession = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params as TutorSessionParamsInput;
  const response = await getTutorSession(sessionId, req.user!.uid, {
    requestId: requestId(req),
  });
  const belongsToUser = responseBelongsToUser(response, req.user!.uid);

  if (belongsToUser === false) {
    throw new AppError(
      'You cannot access another user tutor session',
      403,
      true,
      'TUTOR_SESSION_FORBIDDEN'
    );
  }

  res.status(200).json(response);
});

export const getUserSessions = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params as TutorUserSessionsParamsInput;

  if (userId !== req.user!.uid) {
    throw new AppError(
      'You cannot access another user tutor sessions',
      403,
      true,
      'TUTOR_SESSION_FORBIDDEN'
    );
  }

  const response = await getTutorSessionsForUser(req.user!.uid, {
    requestId: requestId(req),
  });
  res.status(200).json(response);
});

export const sendTurn = asyncHandler(async (req: Request, res: Response) => {
  const response = await sendTutorTurn(
    req.user!.uid,
    withoutClientUserId(req.body) as TutorTurnRequestInput,
    {
      requestId: requestId(req),
      sessionId: typeof req.body.session_id === 'string' ? req.body.session_id : undefined,
    }
  );
  res.status(200).json(response);
});

export const scanProblem = asyncHandler(async (req: Request, res: Response) => {
  if (!Buffer.isBuffer(req.body)) {
    throw new AppError('Upload an image file', 400, true, 'INVALID_IMAGE_UPLOAD');
  }
  const contentType = (req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const filename = (req.header('x-upload-filename') ?? 'problem-image').trim().slice(0, 180);
  validateTutorImageUpload(req.body, contentType);
  const result = await scanTutorImage(req.user!.uid, req.body, contentType, filename, {
    requestId: requestId(req),
  });
  // Deliberately log only operation metadata — never image bytes or OCR text.
  logger.info('Visual Tutor security audit', {
    audit_event: 'visual_tutor_scan_completed',
    user_id: req.user!.uid,
    bytes: req.body.length,
  });
  res.status(200).json({ success: true, message: 'Image read successfully', data: result });
});

export const transcribeVoice = asyncHandler(async (req: Request, res: Response) => {
  if (!Buffer.isBuffer(req.body))
    throw new AppError('Upload WAV audio', 400, true, 'INVALID_AUDIO_UPLOAD');
  const contentType = (req.header('content-type') ?? '').split(';')[0].trim().toLowerCase();
  validateTutorAudioUpload(req.body, contentType);
  const transcript = await transcribeTutorVoice(req.user!.uid, req.body);
  // Audio bytes and transcript are not included in the audit log.
  logger.info('Visual Tutor security audit', {
    audit_event: 'visual_tutor_stt_completed',
    user_id: req.user!.uid,
    bytes: req.body.length,
  });
  res.status(200).json({ success: true, message: 'Voice transcribed', data: { transcript } });
});

export const synthesizeVoice = asyncHandler(async (req: Request, res: Response) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const language = typeof req.body?.language === 'string' ? req.body.language.trim() : 'en';
  if (!text || text.length > 4000) {
    throw new AppError('Speech text must be between 1 and 4000 characters', 400, true, 'INVALID_TTS_TEXT');
  }
  const speech = await synthesizeTutorVoice(req.user!.uid, text, language);
  logger.info('Visual Tutor security audit', {
    audit_event: 'visual_tutor_tts_completed', user_id: req.user!.uid, characters: text.length,
  });
  res.setHeader('Cache-Control', 'no-store');
  res.type(speech.contentType).status(200).send(speech.audio);
});
