import { env } from '../config/env';
import type {
  CreateTutorSessionRequestInput,
  TutorTurnRequestInput,
} from '../schemas/tutor-request.schema';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { incrementMetric } from './observability.service';
import { TeachingPlanContractError, recoverPublicTutorTurn, validatePublicTutorTurn, validateTeachingPlan } from './teaching-plan.contract';

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

function validateBoardContract(payload: unknown, requirePublicTutorTurn = false): void {
  if (requirePublicTutorTurn) {
    try {
      validatePublicTutorTurn(payload);
    } catch (error) {
      logger.info('Visual Tutor safety metric', {
        metric: 'invalid_plan_rejected', contract: 'public_tutor_turn',
        reason: error instanceof Error ? error.message : 'unknown',
      });
      throw new AppError(
        error instanceof TeachingPlanContractError ? error.message : 'AI returned an invalid public tutor turn',
        502, true, 'INVALID_TEACHING_PLAN'
      );
    }
    return;
  }
  const body = objectValue(payload);
  const rawTeachingPlan = body?.teaching_plan ?? objectValue(body?.metadata)?.teaching_plan;
  const teachingPlan = normalizeTeachingPlan(rawTeachingPlan);
  if (teachingPlan !== undefined) {
    try {
      validateTeachingPlan(teachingPlan);
    } catch (error) {
      logger.info('Visual Tutor safety metric', {
        metric: 'invalid_plan_rejected', contract: 'teaching_plan',
        reason: error instanceof Error ? error.message : 'unknown',
      });
      throw new AppError(
        error instanceof TeachingPlanContractError ? error.message : 'AI returned an invalid teaching plan',
        502, true, 'INVALID_TEACHING_PLAN'
      );
    }
  }
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

function normalizeTeachingPlan(value: unknown): unknown {
  const plan = objectValue(value);
  if (!plan || Array.isArray(plan.board_actions)) return value;
  // Public tutor turns intentionally send only visible actions plus the one
  // active task. Rebuild the internal validation shape without reintroducing
  // legacy board/canvas payloads to the client.
  const visible = Array.isArray(plan.visible_board_actions) ? plan.visible_board_actions : [];
  const task = objectValue(plan.active_student_task);
  return {
    ...plan,
    board_actions: [...visible, ...(task ? [task] : [])],
  };
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

function internalTutorHeaders(userId: string, requestId?: string): Record<string, string> {
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
    ...(requestId ? { 'x-request-id': requestId } : {}),
    'x-visual-tutor-internal-token': token,
  };
}

function aiServiceAction(payload: TutorTurnRequestInput): string {
  const action = payload.action;
  if (action === 'student_message') {
    const currentState = objectValue(payload.current_state);
    if (!currentState?.problem_text) return 'submit_problem';
    // A typed message while a problem is unsolved is the student working, and it
    // has to stay a step: a correct step of "3x + 4 = 19" is "3x = 15", which
    // reads as a new equation but is not one.
    //
    // Once the answer is on the board there is no step left to answer, so the
    // student is moving on. Treating that as a step meant someone who typed a
    // whole new problem had it graded against the problem they had just
    // finished -- the board kept showing the old solution, with nothing on
    // screen to say why.
    if (currentState.final_answer_revealed === true) return 'submit_problem';
    return 'submit_step';
  }
  const aliases: Record<string, string> = {
    stuck: 'request_stuck_help',
    request_answer: 'request_final_answer',
    check_work: 'submit_step',
  };
  return aliases[action] ?? action;
}

/**
 * The client's `student_intent` uses the same UI-side vocabulary as `action`
 * (e.g. the "Check" quick action sends intent "check_work"), but the AI
 * service's VisualTutorStudentIntent enum doesn't share that vocabulary --
 * only `action` was being translated here, so a value like "check_work" hit
 * the AI service's request validation and 422'd the whole turn. Everything
 * else the client sends already matches the enum verbatim; only this one
 * value needs remapping.
 */
function aiServiceStudentIntent(payload: TutorTurnRequestInput): string | undefined {
  const intent = payload.student_intent;
  if (typeof intent !== 'string') return intent;
  const aliases: Record<string, string> = {
    check_work: 'submitted_step',
  };
  return aliases[intent] ?? intent;
}

function aiServiceInputType(payload: TutorTurnRequestInput): string {
  const inputType = payload.input_type.trim().toLowerCase();
  return inputType === 'voice' || inputType === 'voice_response' ? 'voice' : 'text';
}

export type TutorProxyLogContext = {
  requestId?: string;
  userId: string;
  sessionId?: string;
  operation:
    | 'create_session'
    | 'get_session'
    | 'list_sessions'
    | 'send_turn'
    | 'client_telemetry';
};

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
        ...(context ? internalTutorHeaders(context.userId, context.requestId) : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch (error) {
    incrementMetric('tutor_response_errors_total');
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
  if (metadata?.planner_fallback === true || metadata?.response_source === 'template_fallback') {
    logger.info('Visual Tutor safety metric', {
      metric: 'provider_fallback', request_id: context?.requestId,
      session_id: context?.sessionId, operation: context?.operation,
      fallback_reason: typeof metadata?.fallback_reason === 'string' ? metadata.fallback_reason : 'provider_or_plan_unavailable',
    });
  }

  if (!response.ok) {
    incrementMetric('tutor_response_errors_total');
    if (response.status === 409) incrementMetric('stale_board_conflicts_total');
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as JsonObject).message === 'string'
        ? ((payload as JsonObject).message as string)
        : 'AI service request failed';

    logger.error('Visual Tutor upstream request failed', {
      request_id: context?.requestId,
      operation: context?.operation,
      ai_service_status: response.status,
      upstream_message: message.slice(0, 180),
    });
    // Never expose a remote response body: it can include persistence or
    // solver diagnostics that are not part of the student contract.
    throw new AppError('The tutor service could not complete this request. Please retry.', response.status, true, 'AI_SERVICE_ERROR');
  }

  const publicTurn = context?.operation === 'send_turn';
  const safePayload = publicTurn ? recoverPublicTutorTurn(payload) : payload;
  validateBoardContract(safePayload, publicTurn);

  return safePayload;
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

/**
 * Board diagnostics only -- counts and outcomes, never lesson content. The app
 * has always sent these; without this proxy every batch 404'd, which is why a
 * short lesson produced dozens of failed requests.
 */
export async function sendTutorTelemetry(
  userId: string,
  payload: unknown,
  context?: Omit<TutorProxyLogContext, 'userId' | 'operation'>
): Promise<unknown> {
  return requestAiService(
    '/api/v1/visual_tutor/telemetry',
    { method: 'POST', body: JSON.stringify(payload) },
    { ...context, userId, operation: 'client_telemetry' }
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
        student_intent: aiServiceStudentIntent(payload),
        input_type: aiServiceInputType(payload),
        user_id: userId,
        metadata: {
          ...(objectValue(payload.metadata) ?? {}),
          public_contract_version: 1,
        },
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

/**
 * Opens the private AI SSE response without buffering it. The gateway still
 * owns student authentication; the AI service receives only its internal
 * service token and authenticated user header.
 */
export async function streamTutorTurn(
  userId: string,
  payload: TutorTurnRequestInput,
  context?: Omit<TutorProxyLogContext, 'userId' | 'operation'> & { lastEventId?: string }
): Promise<Response> {
  const url = new URL('/api/v1/visual_tutor/turn/stream', env.aiService.baseUrl);
  const requestId = context?.requestId;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'text/event-stream',
      ...(context?.lastEventId ? { 'last-event-id': context.lastEventId } : {}),
      ...internalTutorHeaders(userId, requestId),
    },
    body: JSON.stringify({
      ...payload,
      action: aiServiceAction(payload),
      student_intent: aiServiceStudentIntent(payload),
      input_type: aiServiceInputType(payload),
      user_id: userId,
      metadata: {
        ...(objectValue(payload.metadata) ?? {}),
        public_contract_version: 1,
      },
    }),
  });
  if (!response.ok || !response.body) {
    incrementMetric('tutor_response_errors_total');
    throw new AppError(
      'The tutor stream could not start. Please retry.',
      response.ok ? 502 : response.status,
      true,
      'AI_STREAM_UNAVAILABLE'
    );
  }
  return response;
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
  try {
    // The AI service authenticates this gateway request and verifies ownership
    // before returning its intentionally privacy-projected session DTO.  That
    // DTO must not include `user_id`, so checking its response body here would
    // turn every valid session into a false ownership failure.
    await getTutorSession(sessionId, userId);
  } catch (error) {
    // Preserve a student-safe, domain-specific error for a genuinely
    // cross-account session.  Other upstream failures remain retryable AI
    // service errors and must not be mistaken for an ownership decision.
    if (error instanceof AppError && error.statusCode === 403) {
      throw new AppError(
        'You cannot access another user tutor session',
        403,
        true,
        'TUTOR_SESSION_FORBIDDEN'
      );
    }
    throw error;
  }
}
