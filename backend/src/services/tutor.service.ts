import { env } from '../config/env';
import type {
  CreateTutorSessionRequestInput,
  TutorTurnRequestInput,
} from '../schemas/tutor-request.schema';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

type JsonObject = Record<string, unknown>;

const BOARD_ACTION_TYPES = new Set([
  'write_text', 'write_equation', 'draw_line', 'draw_arrow', 'draw_point', 'draw_axes',
  'draw_graph_hint', 'highlight', 'circle', 'cross_out', 'show_graph', 'show_table',
  'create_blank', 'fade_previous', 'clear_section', 'focus_element', 'reveal_answer',
  'erase', 'focus', 'reveal', 'hide', 'pause_marker', 'speak_marker', 'update',
  'transform_equation', 'show_number_line', 'plot_function', 'graph_annotation',
  'show_hint', 'show_feedback', 'student_task',
]);
const BOARD_SCHEMA_VERSION = 1;
const TEXT_ACTION_TYPES = new Set([
  'write_text', 'write_equation', 'transform_equation', 'show_hint',
  'show_feedback', 'student_task', 'graph_annotation',
]);
const BOUNDED_ACTION_TYPES = new Set([
  'show_graph', 'show_table', 'show_number_line', 'plot_function', 'create_blank',
]);
const GRAPH_ACTION_TYPES = new Set(['show_graph', 'plot_function']);

function validateBoardContract(payload: unknown): void {
  const body = objectValue(payload);
  const actions = body?.board_actions;
  if (actions === undefined) return; // Backward-compatible session/list payload.
  if (!Array.isArray(actions) || actions.length > 24) {
    throw new AppError('AI returned an invalid teaching-board payload', 502, true, 'INVALID_BOARD_PAYLOAD');
  }
  const ids = new Set<string>();
  const metadata = objectValue(body?.metadata);
  const schemaVersion = metadata?.board_schema_version;
  if (schemaVersion !== undefined && schemaVersion !== BOARD_SCHEMA_VERSION) {
    throw new AppError('AI returned an unsupported teaching-board schema', 502, true, 'INVALID_BOARD_PAYLOAD');
  }
  let studentTasks = 0;
  for (const action of actions) {
    const value = objectValue(action);
    const id = typeof value?.id === 'string' ? value.id.trim() : '';
    const type = typeof value?.type === 'string' ? value.type : '';
    if (!id || ids.has(id) || !BOARD_ACTION_TYPES.has(type)) {
      throw new AppError('AI returned an unsupported board action', 502, true, 'INVALID_BOARD_PAYLOAD');
    }
    for (const key of ['x', 'y', 'width', 'height']) {
      const coordinate = value?.[key];
      // Python serializes optional geometry as `null`; that is equivalent to
      // an omitted coordinate for text-only actions such as student_task.
      if (coordinate !== undefined && coordinate !== null &&
          (typeof coordinate !== 'number' || !Number.isFinite(coordinate) || Math.abs(coordinate) > 10000)) {
        logger.error('AI board geometry failed contract validation', {
          action_id: id,
          action_type: type,
          geometry_key: key,
          geometry_type: typeof coordinate,
        });
        throw new AppError('AI returned invalid board geometry', 502, true, 'INVALID_BOARD_PAYLOAD');
      }
    }
    if (TEXT_ACTION_TYPES.has(type) &&
        !(typeof value?.text === 'string' && value.text.trim()) &&
        !(typeof value?.latex === 'string' && value.latex.trim())) {
      throw new AppError('AI returned a board action without teaching content', 502, true, 'INVALID_BOARD_PAYLOAD');
    }
    if (BOUNDED_ACTION_TYPES.has(type) &&
        (!(typeof value?.width === 'number' && value.width > 0) ||
         !(typeof value?.height === 'number' && value.height > 0))) {
      throw new AppError('AI returned an unbounded visual action', 502, true, 'INVALID_BOARD_PAYLOAD');
    }
    if (GRAPH_ACTION_TYPES.has(type) && !isValidGraphPayload(value?.graph)) {
      throw new AppError('AI returned an invalid graph payload', 502, true, 'INVALID_BOARD_PAYLOAD');
    }
    ids.add(id);
    if (value?.requires_student_response === true && ++studentTasks > 1) {
      throw new AppError('AI returned multiple student tasks', 502, true, 'INVALID_BOARD_PAYLOAD');
    }
  }
}

function isValidGraphPayload(value: unknown): boolean {
  const graph = objectValue(value);
  if (!graph) return false;
  const numbers = ['x_min', 'x_max', 'y_min', 'y_max'].map((key) => graph[key]);
  if (numbers.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry) || Math.abs(entry) > 10000)) return false;
  if ((graph.x_min as number) >= (graph.x_max as number) || (graph.y_min as number) >= (graph.y_max as number)) return false;
  const hasExpression = typeof graph.function_expression === 'string' && graph.function_expression.trim().length > 0;
  const points = graph.points;
  const hasPoints = Array.isArray(points) && points.length > 0 && points.every((point) => {
    const item = objectValue(point);
    return typeof item?.x === 'number' && Number.isFinite(item.x) && typeof item?.y === 'number' && Number.isFinite(item.y);
  });
  return hasExpression || hasPoints;
}

function objectValue(value: unknown): JsonObject | null {
  return typeof value === 'object' && value !== null ? (value as JsonObject) : null;
}

function responseMetadata(payload: unknown): JsonObject {
  const body = objectValue(payload);
  if (!body) return {};

  const metadata = objectValue(body.metadata);
  if (metadata) return metadata;

  const data = objectValue(body.data);
  return objectValue(data?.metadata) ?? {};
}

function internalTutorHeaders(userId: string): Record<string, string> {
  const token =
    env.aiService.visualTutorInternalToken || (env.nodeEnv === 'test' ? 'test-internal-token' : '');
  if (!token) {
    throw new AppError(
      'Visual Tutor internal authentication is not configured',
      503,
      true,
      'AI_SERVICE_UNAVAILABLE'
    );
  }
  return {
    'x-visual-tutor-user-id': userId,
    'x-visual-tutor-internal-token': token,
  };
}

function aiServiceAction(payload: TutorTurnRequestInput): string {
  const action = payload.action;
  if (action === 'student_message') {
    const currentState = objectValue(payload.current_state);
    return currentState?.problem_text ? 'submit_step' : 'submit_problem';
  }
  const aliases: Record<string, string> = {
    stuck: 'request_stuck_help',
    request_answer: 'request_final_answer',
    check_work: 'submit_step',
  };
  return aliases[action] ?? action;
}

function aiServiceInputType(payload: TutorTurnRequestInput): string {
  const inputType = payload.input_type.trim().toLowerCase();
  return inputType === 'voice' || inputType === 'voice_response' ? 'voice' : 'text';
}

export type TutorProxyLogContext = {
  requestId?: string;
  userId: string;
  sessionId?: string;
  operation: 'create_session' | 'get_session' | 'list_sessions' | 'send_turn';
};

export type TutorImageScanResult = {
  detected_text: string;
  confidence: number;
  language: string;
  math_expression_candidates?: string[];
};

const MAX_TUTOR_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TUTOR_IMAGE_PIXELS = 12_000_000;
const MIN_TUTOR_IMAGE_DIMENSION = 160;

type ImageDimensions = { width: number; height: number };

/**
 * Reads dimensions from the small, fixed-size headers of the image formats we
 * accept.  This deliberately avoids writing an untrusted upload to disk or
 * adding a native image-processing dependency to the API gateway.
 */
function readImageDimensions(image: Buffer, contentType: string): ImageDimensions | null {
  if (contentType === 'image/png') {
    if (image.length < 24 || image.toString('ascii', 1, 4) !== 'PNG') return null;
    return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
  }

  if (contentType === 'image/jpeg') {
    if (image.length < 4 || image[0] !== 0xff || image[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 9 < image.length) {
      if (image[offset] !== 0xff) return null;
      const marker = image[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      if (offset + 2 > image.length) return null;
      const length = image.readUInt16BE(offset);
      if (length < 2 || offset + length > image.length) return null;
      // Start-of-frame markers which contain height and width.
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
          (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { width: image.readUInt16BE(offset + 5), height: image.readUInt16BE(offset + 3) };
      }
      offset += length;
    }
    return null;
  }

  if (contentType === 'image/webp') {
    if (image.length < 30 || image.toString('ascii', 0, 4) !== 'RIFF' || image.toString('ascii', 8, 12) !== 'WEBP') return null;
    const kind = image.toString('ascii', 12, 16);
    if (kind === 'VP8X') {
      return { width: 1 + image.readUIntLE(24, 3), height: 1 + image.readUIntLE(27, 3) };
    }
    if (kind === 'VP8 ') {
      if (image.length < 30 || image[23] !== 0x9d || image[24] !== 0x01 || image[25] !== 0x2a) return null;
      return { width: image.readUInt16LE(26) & 0x3fff, height: image.readUInt16LE(28) & 0x3fff };
    }
    if (kind === 'VP8L') {
      if (image.length < 25 || image[20] !== 0x2f) return null;
      const bits = image.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}

export function validateTutorImageUpload(image: Buffer, contentType: string): void {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)) {
    throw new AppError('Use a JPG, PNG, or WEBP image', 415, true, 'UNSUPPORTED_IMAGE_TYPE');
  }
  if (image.length === 0 || image.length > MAX_TUTOR_IMAGE_BYTES) {
    throw new AppError('Image must be between 1 byte and 8 MB', 413, true, 'INVALID_IMAGE_SIZE');
  }
  const dimensions = readImageDimensions(image, contentType);
  if (!dimensions || dimensions.width < MIN_TUTOR_IMAGE_DIMENSION || dimensions.height < MIN_TUTOR_IMAGE_DIMENSION) {
    throw new AppError('Image is too small or is not a readable supported image', 422, true, 'INVALID_IMAGE_DIMENSIONS');
  }
  if (dimensions.width * dimensions.height > MAX_TUTOR_IMAGE_PIXELS) {
    throw new AppError('Image dimensions are too large', 413, true, 'INVALID_IMAGE_DIMENSIONS');
  }
}

export async function transcribeTutorVoice(userId: string, audio: Buffer): Promise<string> {
  validateTutorAudioUpload(audio, 'audio/wav');
  const response = await fetch(new URL('/api/v1/visual_tutor/transcribe', env.aiService.baseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'audio/wav',
      ...internalTutorHeaders(userId),
    },
    body: audio,
  });
  const payload = await parseJsonResponse(response);
  const text = objectValue(payload)?.transcript;
  if (!response.ok || typeof text !== 'string' || !text.trim()) {
    throw new AppError(
      typeof objectValue(payload)?.detail === 'string'
        ? (objectValue(payload)?.detail as string)
        : 'We could not transcribe this recording',
      response.status || 502,
      true,
      'VOICE_TRANSCRIPTION_FAILED'
    );
  }
  return text.trim();
}

export async function synthesizeTutorVoice(
  userId: string, text: string, language: string
): Promise<{ audio: Buffer; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(new URL('/api/v1/visual_tutor/synthesize', env.aiService.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...internalTutorHeaders(userId) },
      body: JSON.stringify({ text, language }), signal: controller.signal,
    });
    if (!response.ok) {
      const payload = await parseJsonResponse(response);
      throw new AppError(
        typeof objectValue(payload)?.detail === 'string' ? objectValue(payload)?.detail as string : 'Tutor speech is unavailable',
        response.status || 502, true, 'TTS_UNAVAILABLE'
      );
    }
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? 'audio/wav';
    if (!['audio/wav', 'audio/mpeg'].includes(contentType)) {
      throw new AppError('Tutor speech service returned unsupported audio', 502, true, 'INVALID_TTS_AUDIO');
    }
    return { audio: Buffer.from(await response.arrayBuffer()), contentType };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Tutor speech is temporarily unavailable', 503, true, 'TTS_UNAVAILABLE');
  } finally { clearTimeout(timeout); }
}

export function validateTutorAudioUpload(audio: Buffer, contentType: string): void {
  if (contentType !== 'audio/wav') {
    throw new AppError('Use WAV audio', 415, true, 'UNSUPPORTED_AUDIO_TYPE');
  }
  if (audio.length < 44 || audio.length > 12 * 1024 * 1024) {
    throw new AppError('Recording is too short or too large', 413, true, 'INVALID_AUDIO_SIZE');
  }
  if (audio.subarray(0, 4).toString('ascii') !== 'RIFF' ||
      audio.subarray(8, 12).toString('ascii') !== 'WAVE' ||
      audio.subarray(12, 16).toString('ascii') !== 'fmt ') {
    throw new AppError('This recording is not valid WAV audio', 422, true, 'INVALID_AUDIO_FORMAT');
  }
  const byteRate = audio.readUInt32LE(28);
  if (byteRate === 0) {
    throw new AppError('This recording is not valid WAV audio', 422, true, 'INVALID_AUDIO_FORMAT');
  }
  // Limit expensive STT work to a focused tutor response. The AI service
  // revalidates the WAV container and duration before decoding.
  const durationSeconds = (audio.length - 44) / byteRate;
  if (durationSeconds < .2 || durationSeconds > 180) {
    throw new AppError('Recording must be between 0.2 seconds and 3 minutes', 422, true, 'INVALID_AUDIO_DURATION');
  }
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

async function requestAiService(
  path: string,
  options: RequestInit = {},
  context?: TutorProxyLogContext
): Promise<unknown> {
  const url = new URL(path, env.aiService.baseUrl);

  let response: Response;
  logger.info('Visual Tutor proxy request started', {
    request_id: context?.requestId,
    session_id: context?.sessionId,
    user_id: context?.userId,
    operation: context?.operation,
    ai_service_url: url.pathname,
  });

  try {
    response = await fetch(url, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(context ? internalTutorHeaders(context.userId) : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch (error) {
    logger.error('Visual Tutor proxy request failed before response', {
      request_id: context?.requestId,
      session_id: context?.sessionId,
      user_id: context?.userId,
      operation: context?.operation,
      ai_service_status: 'unavailable',
      error: error instanceof Error ? error.message : undefined,
    });
    throw new AppError(
      'AI service is unavailable',
      502,
      true,
      'AI_SERVICE_UNAVAILABLE',
      error instanceof Error ? error.message : undefined
    );
  }

  const payload = await parseJsonResponse(response);
  const metadata = responseMetadata(payload);
  logger.info('Visual Tutor proxy response received', {
    request_id: context?.requestId,
    session_id: context?.sessionId,
    user_id: context?.userId,
    operation: context?.operation,
    ai_service_status: response.status,
    response_source: metadata.response_source,
    llm_called: metadata.llm_called,
    teaching_strategy: metadata?.teaching_strategy,
    board_version: metadata?.board_version,
    board_update_mode: metadata?.board_update_mode,
    student_intent_final: metadata?.student_intent_final,
    solver_speech_bypassed: metadata?.solver_speech_bypassed,
    llm_latency_ms: metadata?.llm_latency_ms,
  });

  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as JsonObject).message === 'string'
        ? ((payload as JsonObject).message as string)
        : 'AI service request failed';

    throw new AppError(message, response.status, true, 'AI_SERVICE_ERROR', payload);
  }

  validateBoardContract(payload);

  return payload;
}

export async function createTutorSession(
  userId: string,
  payload: CreateTutorSessionRequestInput,
  context?: Omit<TutorProxyLogContext, 'userId' | 'operation'>
): Promise<unknown> {
  return requestAiService(
    '/api/v1/visual_tutor/sessions',
    {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        session_mode: payload.session_mode ?? 'draft',
        user_id: userId,
      }),
    },
    { ...context, userId, operation: 'create_session' }
  );
}

export async function getTutorSession(
  sessionId: string,
  userId: string,
  context?: Omit<TutorProxyLogContext, 'userId' | 'sessionId' | 'operation'>
): Promise<unknown> {
  const path = `/api/v1/visual_tutor/sessions/${encodeURIComponent(
    sessionId
  )}?user_id=${encodeURIComponent(userId)}`;
  return requestAiService(path, {}, { ...context, userId, sessionId, operation: 'get_session' });
}

export async function getTutorSessionsForUser(
  userId: string,
  context?: Omit<TutorProxyLogContext, 'userId' | 'operation'>
): Promise<unknown> {
  return requestAiService(
    `/api/v1/visual_tutor/sessions/user/${encodeURIComponent(userId)}`,
    {},
    { ...context, userId, operation: 'list_sessions' }
  );
}

export async function sendTutorTurn(
  userId: string,
  payload: TutorTurnRequestInput,
  context?: Omit<TutorProxyLogContext, 'userId' | 'operation'>
): Promise<unknown> {
  return requestAiService(
    '/api/v1/visual_tutor/turn',
    {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        action: aiServiceAction(payload),
        input_type: aiServiceInputType(payload),
        user_id: userId,
      }),
    },
    {
      ...context,
      userId,
      sessionId: typeof payload.session_id === 'string' ? payload.session_id : context?.sessionId,
      operation: 'send_turn',
    }
  );
}

export async function scanTutorImage(
  userId: string,
  image: Buffer,
  contentType: string,
  filename: string,
  context?: Omit<TutorProxyLogContext, 'userId' | 'operation'>
): Promise<TutorImageScanResult> {
  logger.info('Visual Tutor image scan started', {
    request_id: context?.requestId,
    user_id: userId,
    operation: 'scan_problem',
    bytes: image.length,
    content_type: contentType,
  });
  validateTutorImageUpload(image, contentType);
  const url = new URL('/api/v1/visual_tutor/scan', env.aiService.baseUrl);
  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        'x-upload-filename': filename,
        ...internalTutorHeaders(userId),
      },
      body: image,
      signal: controller.signal,
    });
  } catch (error) {
    throw new AppError(
      error instanceof Error && error.name === 'AbortError'
        ? 'Image reading timed out. Please try again.'
        : 'Image reading service is unavailable',
      error instanceof Error && error.name === 'AbortError' ? 504 : 502,
      true,
      error instanceof Error && error.name === 'AbortError'
        ? 'OCR_TIMEOUT'
        : 'AI_SERVICE_UNAVAILABLE',
      error instanceof Error ? error.message : undefined
    );
  } finally {
    clearTimeout(timeout);
  }
  const payload = await parseJsonResponse(response);
  if (!response.ok) {
    const message = objectValue(payload)?.detail;
    const code = response.status === 502 || response.status === 503
      ? 'AI_SERVICE_UNAVAILABLE'
      : response.status === 422
      ? 'OCR_EMPTY_RESULT'
      : response.status === 504
      ? 'OCR_TIMEOUT'
      : 'IMAGE_SCAN_FAILED';
    throw new AppError(typeof message === 'string' ? message : 'We could not read this image', response.status, true, code, payload);
  }
  const result = objectValue(payload);
  const detectedText = result?.detected_text;
  if (typeof detectedText !== 'string' || !detectedText.trim()) {
    throw new AppError(
      'We could not read a question from this image',
      422,
      true,
      'OCR_EMPTY_RESULT'
    );
  }
  return {
    detected_text: detectedText.trim(),
    confidence: typeof result?.confidence === 'number' ? result.confidence : 0,
    language: typeof result?.language === 'string' ? result.language : 'unknown',
    math_expression_candidates: Array.isArray(result?.math_expression_candidates)
      ? result.math_expression_candidates.filter((value): value is string => typeof value === 'string')
      : [],
  };
}

export function responseBelongsToUser(payload: unknown, userId: string): boolean | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const body = payload as JsonObject;
  const candidate = body.user_id ?? body.userId;
  if (typeof candidate === 'string') {
    return candidate === userId;
  }

  const data = body.data;
  if (typeof data === 'object' && data !== null) {
    const dataCandidate = (data as JsonObject).user_id ?? (data as JsonObject).userId;
    if (typeof dataCandidate === 'string') {
      return dataCandidate === userId;
    }
  }

  return null;
}

export async function assertTutorSessionOwnership(
  sessionId: string,
  userId: string
): Promise<void> {
  const response = await getTutorSession(sessionId, userId);
  if (responseBelongsToUser(response, userId) !== true) {
    throw new AppError(
      'You cannot access another user tutor session',
      403,
      true,
      'TUTOR_SESSION_FORBIDDEN'
    );
  }
}
