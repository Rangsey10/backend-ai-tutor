import { createTutorSession, getTutorSession, sendTutorTurn } from '../tutor.service';
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

  it('forwards session restore to ai-service with user_id query', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ session_id: 'session-1', user_id: 'firebase-uid' }), {
        status: 200,
      })
    );

    await getTutorSession('session-1', 'firebase-uid', { requestId: 'request-2' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        href: 'http://localhost:8001/api/v1/visual_tutor/sessions/session-1?user_id=firebase-uid',
      }),
      expect.any(Object)
    );
  });

  it('forwards turn payload and preserves Visual Tutor response unchanged', async () => {
    const aiPayload = {
      session_id: 'session-1',
      turn_id: 'turn-1',
      screen_state: 'asking_question',
      tutor_status: 'waiting_for_student',
      speech: { text: 'What changes first?' },
      board: {
        type: 'formula_card',
        metadata: { screen_state: 'asking_question' },
      },
      board_actions: [
        {
          id: 'turn-1-write-equation',
          type: 'write_equation',
          latex: '2x + 5 = 15',
          sequence_index: 0,
        },
      ],
      teaching_board: {
        id: 'teaching-board',
        elements: [{ id: 'eq-1', type: 'equation', latex: '2x + 5 = 15' }],
        metadata: { played_action_ids: ['turn-1-write-equation'] },
      },
      interaction: {
        type: 'multiple_choice',
        prompt: 'Choose one',
        choices: [{ id: 'a', label: 'A', value: 'Subtract 5' }],
      },
      quick_actions: ['request_hint', 'stuck'],
      metadata: {
        response_source: 'hybrid',
        solver_name: 'LinearEquationSolver',
        llm_called: false,
        llm_provider: null,
        fallback_reason: null,
        current_step_index: 0,
        input_relevance: null,
        validation_result: null,
        tutor_move: 'ask_guiding_question',
        policy_decision: { reason: 'first_problem_input' },
        board_action_ids: ['a1'],
      },
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
    expect(response).toMatchObject({
      screen_state: 'asking_question',
      tutor_status: 'waiting_for_student',
      speech: aiPayload.speech,
      board: aiPayload.board,
      board_actions: aiPayload.board_actions,
      teaching_board: aiPayload.teaching_board,
      interaction: aiPayload.interaction,
      quick_actions: aiPayload.quick_actions,
      metadata: aiPayload.metadata,
    });
    expect((response as typeof aiPayload).metadata).toEqual(aiPayload.metadata);
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
          metadata: { client_turn_id: 'client-turn-1' },
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
        response_source: 'hybrid',
        llm_called: false,
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
      board_actions: [{ id: 'unsafe-graph', type: 'show_graph', width: 300, height: 200 }],
      metadata: { board_schema_version: 1 },
    }), { status: 200 }));

    await expect(sendTutorTurn('firebase-uid', {
      subject: 'Mathematics', message: 'graph y = x', input_type: 'text',
      action: 'submit_problem', current_state: {}, allow_final_answer: false, metadata: {},
    })).rejects.toMatchObject({ code: 'INVALID_BOARD_PAYLOAD', statusCode: 502 });
  });
});
