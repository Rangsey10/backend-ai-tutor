import request from 'supertest';
import { createApp } from '../../app';
import { getAuth } from '../../config/firebase';
import {
  createStudentTutorReport,
  listStudentNotifications,
  listStudentTutorReports,
} from '../../services/tutor-report.service';
import { AppError } from '../../utils/AppError';

jest.mock('../../config/firebase', () => ({ getAuth: jest.fn() }));
jest.mock('../../services/tutor-report.service', () => ({
  createStudentTutorReport: jest.fn(),
  listStudentTutorReports: jest.fn(),
  listStudentNotifications: jest.fn(),
}));

const mockedAuth = getAuth as jest.MockedFunction<typeof getAuth>;
const mockedCreate = createStudentTutorReport as jest.MockedFunction<typeof createStudentTutorReport>;
const mockedListReports = listStudentTutorReports as jest.MockedFunction<typeof listStudentTutorReports>;
const mockedListNotifications = listStudentNotifications as jest.MockedFunction<typeof listStudentNotifications>;
const app = createApp();

beforeEach(() => {
  jest.clearAllMocks();
  mockedAuth.mockReturnValue({ verifyIdToken: jest.fn().mockResolvedValue({ uid: 'student-a', role: 'student' }) } as never);
  mockedCreate.mockResolvedValue({ report_id: 'report-1', review_status: 'pending', created_at: '2026-08-17T00:00:00.000Z' });
  mockedListReports.mockResolvedValue([]);
  mockedListNotifications.mockResolvedValue([]);
});

describe('student tutor reports', () => {
  it('creates an authenticated report without accepting a spoofed student identity', async () => {
    await request(app).post('/api/v1/tutor/reports').set('Authorization', 'Bearer valid').send({
      tutor_session_id: 'session-a', tutor_turn_id: 'turn-a', reason: 'visual_problem',
    }).expect(201);
    expect(mockedCreate).toHaveBeenCalledWith('student-a', {
      tutor_session_id: 'session-a', tutor_turn_id: 'turn-a', reason: 'visual_problem',
    });
  });

  it('rejects malformed reports and cross-user session reports', async () => {
    await request(app).post('/api/v1/tutor/reports').set('Authorization', 'Bearer valid').send({
      student_profile_id: 'student-b', tutor_session_id: 'session-a', tutor_turn_id: 'turn-a', reason: 'wrong',
    }).expect(400);
    mockedCreate.mockRejectedValueOnce(new AppError('You cannot access another user tutor session', 403, true, 'TUTOR_SESSION_FORBIDDEN'));
    await request(app).post('/api/v1/tutor/reports').set('Authorization', 'Bearer valid').send({
      tutor_session_id: 'other-session', tutor_turn_id: 'turn-a', reason: 'incorrect_math',
    }).expect(403);
  });

  it('returns report status only for the authenticated student and keeps review internals private', async () => {
    mockedListReports.mockResolvedValue([
      {
        report_id: 'report-1',
        tutor_session_id: 'session-a',
        tutor_turn_id: 'turn-a',
        reason: 'confusing_explanation',
        status: 'resolved',
        public_resolution_message: 'We improved this explanation.',
        created_at: '2026-08-17T00:00:00.000Z',
        updated_at: '2026-08-18T00:00:00.000Z',
      },
    ]);

    const response = await request(app)
      .get('/api/v1/tutor/reports/mine')
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(mockedListReports).toHaveBeenCalledWith('student-a');
    expect(response.body.data.reports[0]).toEqual(expect.objectContaining({
      report_id: 'report-1', status: 'resolved', public_resolution_message: 'We improved this explanation.',
    }));
    expect(response.body.data.reports[0]).not.toHaveProperty('review_history');
    expect(response.body.data.reports[0]).not.toHaveProperty('last_review_note');
    expect(response.body.data.reports[0]).not.toHaveProperty('reviewer_id');
    expect(response.body.data.reports[0]).not.toHaveProperty('redacted_details');
  });

  it('returns only authenticated student notifications', async () => {
    mockedListNotifications.mockResolvedValue([
      {
        notification_id: 'notification-1', type: 'report_resolved', title: 'Your Tutor report was reviewed',
        body: 'Thank you for helping improve the Tutor.', read_at: null,
        created_at: '2026-08-18T00:00:00.000Z',
      },
    ]);

    const response = await request(app)
      .get('/api/v1/tutor/reports/notifications')
      .set('Authorization', 'Bearer valid')
      .expect(200);

    expect(mockedListNotifications).toHaveBeenCalledWith('student-a');
    expect(response.body.data.notifications).toEqual([
      expect.objectContaining({ notification_id: 'notification-1', type: 'report_resolved' }),
    ]);
  });
});
