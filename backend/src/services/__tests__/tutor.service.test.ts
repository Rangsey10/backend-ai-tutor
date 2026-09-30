import {
  assertTutorSessionOwnership,
  createTutorSession,
  sendTutorTurn,
  streamTutorTurn,
} from '../tutor.service';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

const fetchMock = jest.fn();

describe('tutor.service ai-service proxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.spyOn(logger, 'info').mockImplementation(() => logger);
    jest.spyOn(logger, 'error').mockImplementation(() => logger);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('forwards create session to ai-service with authenticated user_id', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: 'session-1',
          user_id: 'firebase-uid',
          subject: 'Mathematics',
        }),
        { status: 200 }
      )
    );

    const response = await createTutorSession(
      'firebase-uid',
      {
        session_mode: 'draft',
        subject: 'Mathematics',
        topic: 'Linear Equations',
        metadata: { grade: 10 },
      },
      { requestId: 'request-1' }
    );

    expect(response).toEqual({
      session_id: 'session-1',
      user_id: 'firebase-uid',
      subject: 'Mathematics',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'http://localhost:8001/api/v1/visual_tutor/sessions',
      }),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          session_mode: 'draft',
          subject: 'Mathematics',
          topic: 'Linear Equations',
          metadata: { grade: 10 },
          user_id: 'firebase-uid',
        }),
      })
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Visual Tutor proxy response received',
      expect.objectContaining({
        request_id: 'request-1',
        user_id: 'firebase-uid',
        ai_service_status: 200,
      })
    );
  });

  it('keeps dev mock mode disabled by default', () => {
    expect(env.aiService.useDevMock).toBe(false);
  });

  it('opens the versioned Visual Tutor SSE endpoint with only gateway identity', async () => {
    fetchMock.mockResolvedValue(new Response('event: visual_tutor\ndata: {}\n\n', {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }));

    const response = await streamTutorTurn(
      'firebase-uid',
      {
        session_id: 'session-1',
        subject: 'Mathematics',
        message: '2x + 5 = 15',
        input_type: 'text',
        action: 'student_message',
        current_state: { current_step_index: 0 },
        allow_final_answer: false,
        idempotency_key: 'stream-key-1',
        metadata: { client_turn_id: 'stream-key-1' },
      },
      { requestId: 'request-stream-1', sessionId: 'session-1', lastEventId: 'stream-key-1:2' }
    );

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('/api/v1/visual_tutor/turn/stream');
    expect(options).toEqual(expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        accept: 'text/event-stream',
        'last-event-id': 'stream-key-1:2',
      }),
      body: JSON.stringify({
        session_id: 'session-1',
        subject: 'Mathematics',
        message: '2x + 5 = 15',
        input_type: 'text',
        action: 'submit_problem',
        current_state: { current_step_index: 0 },
        allow_final_answer: false,
        idempotency_key: 'stream-key-1',
        metadata: { client_turn_id: 'stream-key-1', public_contract_version: 1 },
        user_id: 'firebase-uid',
      }),
    }));
  });

  it('rejects a missing upstream SSE body as a recoverable stream failure', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(streamTutorTurn('firebase-uid', {
      subject: 'Mathematics', message: '2x + 5 = 15', input_type: 'text',
      action: 'student_message', current_state: {}, allow_final_answer: false, metadata: {},
    })).rejects.toMatchObject({ code: 'AI_STREAM_UNAVAILABLE', statusCode: 502 });
  });

  it('accepts a privacy-projected session after the AI service verifies ownership', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ session_id: 'session-1', subject: 'Mathematics' }), {
        status: 200,
      })
    );

    await assertTutorSessionOwnership('session-1', 'firebase-uid');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'http://localhost:8001/api/v1/visual_tutor/sessions/session-1?user_id=firebase-uid',
      }),
      expect.any(Object)
    );
  });

  it('maps an AI ownership rejection to the public tutor-session error', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Forbidden' }), {
      status: 403,
    }));

    await expect(
      assertTutorSessionOwnership('another-student-session', 'firebase-uid')
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'TUTOR_SESSION_FORBIDDEN',
    });
  });

  it('forwards a versioned compact tutor request and returns only the public response', async () => {
    const aiPayload = {
      schema_version: 1,
      session_id: 'session-1',
      turn_id: 'turn-1',
      tutor_status: 'waiting_for_student',
      board_version: 1,
      teaching_plan: {
        schema_version: 1,
        representation: 'equation_transformation',
        learning_objective: 'Use inverse operations.',
        teaching_message: 'What changes first?',
        visible_board_actions: [{
          id: 'turn-1-write-equation', type: 'write_equation',
          latex: '2x + 5 = 15', sequence_index: 0,
        }],
        active_student_task: {
          id: 'task-1', type: 'student_task', sequence_index: 1,
          text: 'What operation removes +5?', requires_student_response: true,
        },
        allowed_student_actions: ['submit_answer', 'request_hint', 'stuck'],
        hidden_answer_policy: { mode: 'hidden', deterministic_policy_permits_final_reveal: false },
        next_state_policy: {
          correct: 'continue', invalid: 'reteach', incomplete: 'ask_for_work',
          stuck: 'reteach', hint: 'ask_for_work', explain_differently: 'reteach',
        },
      },
      verification: {
        status: 'cannot_verify', verified: false,
        concise_evidence: 'No student step has been submitted.',
        student_facing_feedback: 'Tell me the operation you would use.',
      },
      recovery: { state: 'ready' },
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(aiPayload), { status: 200 }));

    const response = await sendTutorTurn(
      'firebase-uid',
      {
        session_id: 'session-1',
        subject: 'Mathematics',
        message: '2x + 5 = 15',
        input_type: 'text',
        action: 'submit_problem',
        current_state: { current_step_index: 0 },
        allow_final_answer: false,
        metadata: { client_turn_id: 'client-turn-1' },
        board_context: { viewport: 'mobile' },
      },
      { requestId: 'request-3', sessionId: 'session-1' }
    );

    expect(response).toEqual(aiPayload);
    expect(Object.keys(response as object).sort()).toEqual([
      'board_version', 'recovery', 'schema_version', 'session_id', 'teaching_plan',
      'turn_id', 'tutor_status', 'verification',
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'http://localhost:8001/api/v1/visual_tutor/turn',
      }),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          session_id: 'session-1',
          subject: 'Mathematics',
          message: '2x + 5 = 15',
          input_type: 'text',
          action: 'submit_problem',
          current_state: { current_step_index: 0 },
          allow_final_answer: false,
          metadata: { client_turn_id: 'client-turn-1', public_contract_version: 1 },
          board_context: { viewport: 'mobile' },
          user_id: 'firebase-uid',
        }),
      })
    );
    expect(logger.info).toHaveBeenCalledWith(
      'Visual Tutor proxy response received',
      expect.objectContaining({
        request_id: 'request-3',
        session_id: 'session-1',
        user_id: 'firebase-uid',
        ai_service_status: 200,
        response_source: undefined,
        llm_called: undefined,
      })
    );
  });

  it('returns AppError when ai-service is down and never returns static tutor content', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(
      sendTutorTurn(
        'firebase-uid',
        {
          subject: 'Mathematics',
          message: '2x + 5 = 15',
          input_type: 'text',
          action: 'submit_problem',
          current_state: {},
          allow_final_answer: false,
          metadata: {},
        },
        { requestId: 'request-4' }
      )
    ).rejects.toMatchObject({
      statusCode: 502,
      code: 'AI_SERVICE_UNAVAILABLE',
      message: 'AI service is unavailable',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Visual Tutor proxy request failed before response',
      expect.objectContaining({
        request_id: 'request-4',
        user_id: 'firebase-uid',
        ai_service_status: 'unavailable',
      })
    );
  });

  it('rejects graph actions without explicit axes and mathematical data', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      schema_version: 1, session_id: 'session-1', turn_id: 'turn-1', board_version: 1,
      tutor_status: 'waiting', teaching_plan: {
        schema_version: 1, representation: 'coordinate_graph', learning_objective: 'Read the graph.',
        teaching_message: 'Find the slope.',
        visible_board_actions: [{ id: 'unsafe-graph', type: 'show_graph', sequence_index: 0, width: 300, height: 200 }],
        active_student_task: { id: 'task', type: 'student_task', sequence_index: 1, text: 'State the slope.', requires_student_response: true },
        allowed_student_actions: ['submit_answer'], hidden_answer_policy: { mode: 'hidden', deterministic_policy_permits_final_reveal: false },
        next_state_policy: { correct: 'continue', invalid: 'reteach', incomplete: 'ask_for_work', stuck: 'reteach', hint: 'ask_for_work', explain_differently: 'reteach' },
      }, verification: { status: 'cannot_verify', verified: false, concise_evidence: 'No submitted step.', student_facing_feedback: 'State the slope.' }, recovery: { state: 'ready' },
    }), { status: 200 }));

    const response = await sendTutorTurn('firebase-uid', {
      subject: 'Mathematics', message: 'graph y = x', input_type: 'text',
      action: 'submit_problem', current_state: {}, allow_final_answer: false, metadata: {},
    }) as { teaching_plan: { visible_board_actions: unknown[] } };
    // The public contract intentionally preserves valid sibling content and
    // replaces an invalid visual action with a recoverable board notice.
    expect(response.teaching_plan.visible_board_actions).toEqual([
      expect.objectContaining({ type: 'show_feedback', layout_zone: 'feedback' }),
    ]);
  });
});

describe('a typed message after the answer is on the board', () => {
  /**
   * While a problem is unsolved, typed text is the student working, and it must
   * stay a step: a correct step of "3x + 4 = 19" is "3x = 15", which would
   * otherwise be mistaken for a brand new equation and restart the problem.
   *
   * Once the answer has been revealed there is no step left to answer. A
   * student typing a whole new problem there had it graded against the problem
   * they had just finished, and nothing on screen said so -- they saw the old
   * solution and assumed the tutor was wrong.
   */
  const turn = (
    currentState: Record<string, unknown>,
    message = 'lim (x^2-4)/(x-2) as x approaches 2'
  ) => ({
    subject: 'Mathematics',
    message,
    action: 'student_message' as const,
    input_type: 'text' as const,
    language_mode: 'english' as const,
    current_state: currentState,
  });

  const forwardedAction = async (
    currentState: Record<string, unknown>,
    message?: string
  ) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ schema_version: 2, session_id: 's' }), { status: 200 })
    );
    // The stub reply is not a valid public turn envelope, so the call rejects --
    // but the upstream request has already been made, which is what is under test.
    await sendTutorTurn('firebase-uid', turn(currentState, message) as never, {}).catch(
      () => undefined
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    return body.action;
  };

  it('is a new problem once the final answer has been revealed', async () => {
    expect(
      await forwardedAction({ problem_text: '3x + 4 = 19', final_answer_revealed: true })
    ).toBe('submit_problem');
  });

  it('is still a step while the problem is unsolved', async () => {
    expect(
      await forwardedAction({ problem_text: '3x + 4 = 19', final_answer_revealed: false })
    ).toBe('submit_step');
  });

  it('is a new problem when no problem is on the board', async () => {
    expect(await forwardedAction({})).toBe('submit_problem');
  });

  /**
   * A finished solution does not mean the student has moved on. Asking about
   * the working is the whole point of the board, and the AI service answers
   * those as submit_step against the problem already in state -- that is what
   * produces "About Step 4 - Cancel the common factor". Forwarding them as
   * submit_problem made the tutor try to solve the question itself, so asking
   * for more detail on a step just re-ran the solver.
   */
  const solved = { problem_text: 'lim (x^2-4)/(x-2) as x approaches 2', final_answer_revealed: true };

  it.each([
    'explain step 2 in more detail',
    'why can we cancel (x-2)?',
    'I do not understand step 3',
    'can you explain that again',
    'how did you get x = 2',
  ])('asks about the finished work rather than starting over: %s', async (message) => {
    expect(await forwardedAction(solved, message)).toBe('submit_step');
  });

  it.each([
    'lim (x^2-9)/(x-3) as x approaches 3',
    'solve x^2 - 5x + 6 = 0',
    'A car starts from rest and accelerates at 2 m/s^2 for 5 s. Find its final velocity.',
  ])('still starts over for a genuinely new problem: %s', async (message) => {
    expect(await forwardedAction(solved, message)).toBe('submit_problem');
  });

  it('treats a Khmer question about the work as a question', async () => {
    // Khmer is written without spaces between words, so this must never be
    // matched with a word boundary.
    expect(await forwardedAction(solved, 'ពន្យល់ជំហានទី ២ បន្ថែម')).toBe('submit_step');
  });
});
