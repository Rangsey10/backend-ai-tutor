import request from 'supertest';
import { Timestamp } from 'firebase-admin/firestore';
import { createApp } from '../../app';
import * as tutorSessionService from '../../services/tutor-session.service';

jest.mock('../../middlewares/auth', () => ({
  authenticate: (
    req: { user?: unknown },
    _res: unknown,
    next: (error?: unknown) => void
  ) => {
    req.user = {
      uid: 'firebase-user-1',
      userId: 'user-1',
      email: 'student@example.com',
      role: 'student',
      normalizedRole: 'student',
    };
    next();
  },
}));

jest.mock('../../services/tutor-session.service', () => ({
  createTutorSession: jest.fn(),
  appendTutorSessionTurn: jest.fn(),
  getTutorSessionDetail: jest.fn(),
  archiveTutorSession: jest.fn(),
}));

const mockedTutorSessionService = tutorSessionService as jest.Mocked<typeof tutorSessionService>;

describe('tutor session routes', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid create session payload', async () => {
    const response = await request(app).post('/api/v1/tutor-sessions').send({
      topic_id: 'topic-1',
      original_question: 'Explain this topic',
      detected_language: 'en',
      detected_intent: 'learn',
      detected_problem_type: 'general',
    });

    expect(response.status).toBe(400);
    expect(mockedTutorSessionService.createTutorSession).not.toHaveBeenCalled();
  });

  it('creates session for valid payload', async () => {
    mockedTutorSessionService.createTutorSession.mockResolvedValue({
      tutor_session_id: 'session-1',
      student_profile_id: 'profile-1',
      subject_id: 'math',
      topic_id: 'fractions',
      lesson_id: null,
      original_question: 'Explain fractions',
      initial_prompt: null,
      visual_context: null,
      resume_checkpoint: null,
      last_turn_number: 0,
      detected_language: 'en',
      detected_intent: 'learn',
      detected_problem_type: 'general',
      session_status: 'active',
      verification_status: 'pending',
      archived_at: null,
      created_at: Timestamp.now(),
      updated_at: Timestamp.now(),
    });

    const response = await request(app).post('/api/v1/tutor-sessions').send({
      subject_id: 'math',
      topic_id: 'fractions',
      original_question: 'Explain fractions',
      detected_language: 'en',
      detected_intent: 'learn',
      detected_problem_type: 'general',
    });

    expect(response.status).toBe(201);
    expect(mockedTutorSessionService.createTutorSession).toHaveBeenCalledWith('firebase-user-1', {
      subject_id: 'math',
      topic_id: 'fractions',
      original_question: 'Explain fractions',
      detected_language: 'en',
      detected_intent: 'learn',
      detected_problem_type: 'general',
    });
  });

  it('syncs a tutor turn', async () => {
    mockedTutorSessionService.appendTutorSessionTurn.mockResolvedValue({
      session: {
        tutor_session_id: 'session-1',
        student_profile_id: 'profile-1',
        subject_id: 'math',
        topic_id: 'fractions',
        lesson_id: null,
        original_question: 'Explain fractions',
        initial_prompt: null,
        visual_context: null,
        resume_checkpoint: { last_turn_number: 1 },
        last_turn_number: 1,
        detected_language: 'en',
        detected_intent: 'learn',
        detected_problem_type: 'general',
        session_status: 'active',
        verification_status: 'pending',
        archived_at: null,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
      },
      turn: {
        tutor_turn_id: 'turn-1',
        tutor_session_id: 'session-1',
        turn_number: 1,
        sender_type: 'student',
        message_text: 'I need help',
        visual_state: null,
        stage: 'teaching',
        teaching_strategy: 'guided',
        interaction_type: 'chat',
        expected_answer: null,
        created_at: Timestamp.now(),
      },
    });

    const response = await request(app)
      .post('/api/v1/tutor-sessions/session-1/sync')
      .send({
        sender_type: 'student',
        message_text: 'I need help',
        stage: 'teaching',
        teaching_strategy: 'guided',
        interaction_type: 'chat',
      });

    expect(response.status).toBe(200);
    expect(mockedTutorSessionService.appendTutorSessionTurn).toHaveBeenCalledTimes(1);
  });

  it('archives a session', async () => {
    mockedTutorSessionService.archiveTutorSession.mockResolvedValue();

    const response = await request(app).patch('/api/v1/tutor-sessions/session-1/archive').send({});

    expect(response.status).toBe(204);
    expect(mockedTutorSessionService.archiveTutorSession).toHaveBeenCalledWith(
      'firebase-user-1',
      'session-1'
    );
  });
});
