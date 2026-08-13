import request from 'supertest';
import { createApp } from '../../app';
import { getAuth } from '../../config/firebase';
import {
  createTutorSession,
  getTutorSession,
  getTutorSessionsForUser,
  sendTutorTurn,
  scanTutorImage,
  transcribeTutorVoice,
} from '../../services/tutor.service';
import { AppError } from '../../utils/AppError';
import { clearUserRateLimits } from '../../middlewares/userRateLimit';

jest.mock('../../config/firebase', () => ({
  getAuth: jest.fn(),
}));

jest.mock('../../services/tutor.service', () => {
  const actual = jest.requireActual('../../services/tutor.service');
  return {
    ...actual,
    createTutorSession: jest.fn(),
    getTutorSession: jest.fn(),
    getTutorSessionsForUser: jest.fn(),
    sendTutorTurn: jest.fn(),
    scanTutorImage: jest.fn(),
    transcribeTutorVoice: jest.fn(),
  };
});

const mockedGetAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockedCreateTutorSession = createTutorSession as jest.MockedFunction<
  typeof createTutorSession
>;
const mockedGetTutorSession = getTutorSession as jest.MockedFunction<typeof getTutorSession>;
const mockedGetTutorSessionsForUser = getTutorSessionsForUser as jest.MockedFunction<
  typeof getTutorSessionsForUser
>;
const mockedSendTutorTurn = sendTutorTurn as jest.MockedFunction<typeof sendTutorTurn>;
const mockedScanTutorImage = scanTutorImage as jest.MockedFunction<typeof scanTutorImage>;
const mockedTranscribeTutorVoice = transcribeTutorVoice as jest.MockedFunction<typeof transcribeTutorVoice>;

const app = createApp();

function mockToken(role = 'student') {
  mockedGetAuth.mockReturnValue({
    verifyIdToken: jest.fn().mockResolvedValue({
      uid: 'firebase-uid',
      email: 'student@example.com',
      role,
    }),
  } as never);
}

function authHeader(token = 'valid-token') {
  return { Authorization: `Bearer ${token}` };
}

function pngHeader(width = 320, height = 320): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt8(0x89, 0);
  buffer.write('PNG', 1, 'ascii');
  buffer.writeUInt8(0x0d, 4);
  buffer.writeUInt8(0x0a, 5);
  buffer.writeUInt8(0x1a, 6);
  buffer.writeUInt8(0x0a, 7);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function wavBytes(seconds = 1): Buffer {
  const sampleRate = 16000;
  const byteRate = sampleRate * 2;
  const dataBytes = Math.floor(seconds * byteRate);
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVEfmt ', 8, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

describe('Visual Tutor AI-service proxy routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearUserRateLimits();
    mockToken();
  });

  it('rejects missing and invalid Firebase credentials before tutor handlers run', async () => {
    await request(app).post('/api/v1/tutor/sessions').send({ subject: 'Mathematics' }).expect(401);

    mockedGetAuth.mockReturnValue({
      verifyIdToken: jest.fn().mockRejectedValue(new Error('invalid token')),
    } as never);
    await request(app)
      .post('/api/v1/tutor/sessions')
      .set(authHeader('forged-token'))
      .send({ subject: 'Mathematics' })
      .expect(401);

    expect(mockedCreateTutorSession).not.toHaveBeenCalled();
  });

  it('rejects oversized tutor text before it reaches the AI service', async () => {
    const response = await request(app)
      .post('/api/v1/tutor/turn')
      .set(authHeader())
      .send({ subject: 'Mathematics', message: 'x'.repeat(8001) })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockedSendTutorTurn).not.toHaveBeenCalled();
  });

  it('creates a session through ai-service using authenticated uid', async () => {
    mockedCreateTutorSession.mockResolvedValue({
      session_id: 'session-1',
      user_id: 'firebase-uid',
      subject: 'Mathematics',
      topic: 'Linear Equations',
    });

    const response = await request(app)
      .post('/api/v1/tutor/sessions')
      .set(authHeader())
      .send({
        user_id: 'spoofed-user',
        subject: 'Mathematics',
        topic: 'Linear Equations',
      })
      .expect(201);

    expect(response.body.session_id).toBe('session-1');
    expect(mockedCreateTutorSession).toHaveBeenCalledWith(
      'firebase-uid',
      {
        session_mode: 'draft',
        subject: 'Mathematics',
        topic: 'Linear Equations',
        metadata: {},
      },
      expect.objectContaining({ requestId: expect.any(String) })
    );
  });

  it('requires a problem when a client explicitly confirms a tutor session', async () => {
    const response = await request(app)
      .post('/api/v1/tutor/sessions')
      .set(authHeader())
      .send({ session_mode: 'confirmed_problem', subject: 'Mathematics' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(mockedCreateTutorSession).not.toHaveBeenCalled();
  });

  it('accepts a supported image only through the authenticated student gateway', async () => {
    mockedScanTutorImage.mockResolvedValue({
      detected_text: '2x + 5 = 15',
      confidence: 0.9,
      language: 'en',
    });

    const response = await request(app)
      .post('/api/v1/tutor/scan')
      .set(authHeader())
      .set('Content-Type', 'image/png')
      .set('X-Upload-Filename', 'problem.png')
      .send(pngHeader())
      .expect(200);

    expect(response.body.data.detected_text).toBe('2x + 5 = 15');
    expect(mockedScanTutorImage).toHaveBeenCalledWith(
      'firebase-uid',
      expect.any(Buffer),
      'image/png',
      'problem.png',
      expect.objectContaining({ requestId: expect.any(String) })
    );
  });

  it('rejects an unsupported image content type before it reaches AI', async () => {
    const response = await request(app)
      .post('/api/v1/tutor/scan')
      .set(authHeader())
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('not an image'))
      .expect(400);

    expect(response.body.error.code).toBe('INVALID_IMAGE_UPLOAD');
    expect(mockedScanTutorImage).not.toHaveBeenCalled();
  });

  it('rejects a supported MIME type when its image dimensions are invalid before AI', async () => {
    const response = await request(app)
      .post('/api/v1/tutor/scan')
      .set(authHeader())
      .set('Content-Type', 'image/png')
      .send(pngHeader(100, 100))
      .expect(422);

    expect(response.body.error.code).toBe('INVALID_IMAGE_DIMENSIONS');
    expect(mockedScanTutorImage).not.toHaveBeenCalled();
  });

  it('rate limits repeated OCR requests before they reach the AI service', async () => {
    mockedScanTutorImage.mockResolvedValue({
      detected_text: '2x + 5 = 15',
      confidence: 0.9,
      language: 'en',
    });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app)
        .post('/api/v1/tutor/scan')
        .set(authHeader())
        .set('Content-Type', 'image/png')
        .send(pngHeader())
        .expect(200);
    }
    const limited = await request(app)
      .post('/api/v1/tutor/scan')
      .set(authHeader())
      .set('Content-Type', 'image/png')
      .send(pngHeader())
      .expect(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(mockedScanTutorImage).toHaveBeenCalledTimes(5);
  });

  it('accepts a valid authenticated WAV recording and never accepts a client user id', async () => {
    mockedTranscribeTutorVoice.mockResolvedValue('Solve two x plus five equals fifteen');
    const response = await request(app)
      .post('/api/v1/tutor/voice/transcribe')
      .set(authHeader())
      .set('Content-Type', 'audio/wav')
      .send(wavBytes())
      .expect(200);

    expect(response.body.data.transcript).toContain('Solve two x');
    expect(mockedTranscribeTutorVoice).toHaveBeenCalledWith('firebase-uid', expect.any(Buffer));
  });

  it('rejects malformed and implausibly short WAV audio before STT', async () => {
    await request(app)
      .post('/api/v1/tutor/voice/transcribe')
      .set(authHeader())
      .set('Content-Type', 'audio/wav')
      .send(Buffer.alloc(44))
      .expect(422);
    await request(app)
      .post('/api/v1/tutor/voice/transcribe')
      .set(authHeader())
      .set('Content-Type', 'audio/wav')
      .send(wavBytes(.1))
      .expect(422);
    expect(mockedTranscribeTutorVoice).not.toHaveBeenCalled();
  });

  it('sends a turn through ai-service using authenticated uid', async () => {
    mockedSendTutorTurn.mockResolvedValue({
      session_id: 'session-1',
      turn_id: 'turn-1',
      screen_state: 'speaking_writing',
      tutor_status: 'writing',
      spoken_text: 'What should we remove first?',
      final_answer_locked: true,
      speech: { text: 'What should we remove first?', language: 'en' },
      board: {
        type: 'equation_steps',
        metadata: { problem_type: 'linear_equation_one_variable' },
      },
      board_actions: [{ id: 'a1', type: 'write_equation', latex: '2x + 5 = 15' }],
      teaching_board: {
        id: 'teaching-board',
        elements: [{ id: 'a1', type: 'equation', latex: '2x + 5 = 15' }],
      },
      interaction: { type: 'text_response', prompt: 'What should happen first?' },
      quick_actions: ['request_hint', 'stuck'],
      metadata: { response_source: 'hybrid', llm_called: false },
    });

    const response = await request(app)
      .post('/api/v1/tutor/turn')
      .set(authHeader())
      .send({
        user_id: 'spoofed-user',
        session_id: 'session-1',
        subject: 'Mathematics',
        message: '2x + 5 = 15',
        current_state: {},
      })
      .expect(200);

    expect(response.body.turn_id).toBe('turn-1');
    expect(response.body).toMatchObject({
      screen_state: 'speaking_writing',
      tutor_status: 'writing',
      speech: { text: 'What should we remove first?', language: 'en' },
      board_actions: [{ id: 'a1', type: 'write_equation', latex: '2x + 5 = 15' }],
      teaching_board: {
        id: 'teaching-board',
        elements: [{ id: 'a1', type: 'equation', latex: '2x + 5 = 15' }],
      },
      interaction: { type: 'text_response', prompt: 'What should happen first?' },
      quick_actions: ['request_hint', 'stuck'],
      metadata: { response_source: 'hybrid', llm_called: false },
    });
    expect(mockedSendTutorTurn).toHaveBeenCalledWith(
      'firebase-uid',
      {
        session_id: 'session-1',
        subject: 'Mathematics',
        message: '2x + 5 = 15',
        input_type: 'text',
        action: 'submit_problem',
        current_state: {},
        allow_final_answer: false,
        metadata: {},
      },
      expect.objectContaining({
        requestId: expect.any(String),
        sessionId: 'session-1',
      })
    );
  });

  it('returns Visual Tutor screen-state payload unchanged from ai-service', async () => {
    const aiPayload = {
      session_id: 'session-1',
      turn_id: 'turn-1',
      screen_state: 'asking_question',
      tutor_status: 'Waiting for you',
      spoken_text: 'Now, what should we try next?',
      display_text: 'Now, what should we try next?',
      teaching_mode: 'guided_question',
      final_answer_locked: true,
      student_task: 'Choose the matching next step.',
      speech: {
        text: 'Now, what should we try next?',
        language: 'en',
        tts_status: 'pending',
      },
      board: {
        type: 'formula_card',
        title: 'Tutor board',
        metadata: { screen_state: 'asking_question' },
      },
      board_actions: [
        {
          id: 'turn-1-question',
          type: 'write_text',
          text: 'Choose a next step',
          sequence_index: 0,
        },
      ],
      teaching_board: {
        id: 'teaching-board',
        elements: [
          {
            id: 'turn-1-question',
            type: 'text',
            text: 'Choose a next step',
          },
        ],
      },
      interaction: {
        type: 'multiple_choice',
        prompt: 'What should happen next?',
        input_enabled: true,
        choices: [
          { id: 'a', label: 'Option A', value: 'a' },
          { id: 'b', label: 'Option B', value: 'b' },
        ],
      },
      allowed_actions: ['submit_answer', 'request_hint'],
      quick_actions: ['submit_answer', 'request_hint'],
      mastery_signal: 'exploring',
      metadata: {
        screen_state: 'asking_question',
        problem_type: 'linear_equation_one_variable',
        response_source: 'hybrid',
        llm_called: true,
      },
    };
    mockedSendTutorTurn.mockResolvedValue(aiPayload);

    const response = await request(app)
      .post('/api/v1/tutor/turn')
      .set(authHeader())
      .send({
        session_id: 'session-1',
        subject: 'Mathematics',
        message: '2x + 5 = 15',
      })
      .expect(200);

    expect(response.body).toEqual(aiPayload);
  });

  it('returns useful error when ai-service fails', async () => {
    mockedSendTutorTurn.mockRejectedValue(
      new AppError('AI service is unavailable', 502, true, 'AI_SERVICE_UNAVAILABLE')
    );

    const response = await request(app)
      .post('/api/v1/tutor/turn')
      .set(authHeader())
      .send({ subject: 'Mathematics', message: '2x + 5 = 15' })
      .expect(502);

    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('AI_SERVICE_UNAVAILABLE');
    expect(response.body.message).toBe('AI service is unavailable');
  });

  it('blocks user sessions lookup for another user', async () => {
    const response = await request(app)
      .get('/api/v1/tutor/sessions/user/other-user')
      .set(authHeader())
      .expect(403);

    expect(response.body.error.code).toBe('TUTOR_SESSION_FORBIDDEN');
    expect(mockedGetTutorSessionsForUser).not.toHaveBeenCalled();
  });

  it('blocks session access when ai-service ownership is available and mismatched', async () => {
    mockedGetTutorSession.mockResolvedValue({
      session_id: 'session-1',
      user_id: 'other-user',
    });

    const response = await request(app)
      .get('/api/v1/tutor/sessions/session-1')
      .set(authHeader())
      .expect(403);

    expect(response.body.error.code).toBe('TUTOR_SESSION_FORBIDDEN');
    expect(mockedGetTutorSession).toHaveBeenCalledWith(
      'session-1',
      'firebase-uid',
      expect.objectContaining({ requestId: expect.any(String) })
    );
  });

  it('restores a session only for its authenticated owner', async () => {
    mockedGetTutorSession.mockResolvedValue({
      session_id: 'session-restore-1',
      user_id: 'firebase-uid',
      problem_text: '2x + 5 = 15',
      normalized_problem: '2*x + 5 = 15',
      current_step_index: 2,
      hint_count: 1,
      wrong_attempts: 1,
      board_version: 3,
      final_answer_revealed: false,
      validation_history: [{ validation_result: 'correct_step' }],
    });

    const response = await request(app)
      .get('/api/v1/tutor/sessions/session-restore-1')
      .set(authHeader())
      .expect(200);

    expect(response.body).toMatchObject({
      session_id: 'session-restore-1',
      user_id: 'firebase-uid',
      current_step_index: 2,
      board_version: 3,
    });
  });

  it('returns current user sessions', async () => {
    mockedGetTutorSessionsForUser.mockResolvedValue([
      { session_id: 'session-1', user_id: 'firebase-uid' },
    ]);

    const response = await request(app)
      .get('/api/v1/tutor/sessions/user/firebase-uid')
      .set(authHeader())
      .expect(200);

    expect(response.body).toEqual([{ session_id: 'session-1', user_id: 'firebase-uid' }]);
    expect(mockedGetTutorSessionsForUser).toHaveBeenCalledWith(
      'firebase-uid',
      expect.objectContaining({ requestId: expect.any(String) })
    );
  });
});
