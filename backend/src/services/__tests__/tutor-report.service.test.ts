import { getFirestore } from '../../config/firebase';
import {
  createStudentTutorReport,
  listStudentNotifications,
  listStudentTutorReports,
} from '../tutor-report.service';
import { assertTutorSessionOwnership } from '../tutor.service';

jest.mock('../../config/firebase', () => ({ getFirestore: jest.fn() }));
jest.mock('../tutor.service', () => ({ assertTutorSessionOwnership: jest.fn() }));

const mockedFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;
const mockedOwnership = assertTutorSessionOwnership as jest.MockedFunction<typeof assertTutorSessionOwnership>;

describe('tutor-report.service', () => {
  it('stores only a redacted, authenticated report with an internal pending review state', async () => {
    let stored: Record<string, unknown> | undefined;
    mockedFirestore.mockReturnValue({
      collection: jest.fn(() => ({ doc: () => ({ set: async (value: Record<string, unknown>) => { stored = value; } }) })),
    } as never);
    mockedOwnership.mockResolvedValue(undefined);

    const result = await createStudentTutorReport('student-a', {
      tutor_session_id: 'session-a', tutor_turn_id: 'turn-a', reason: 'incorrect_math',
      details: 'Contact me at student@example.com or +855 12 345 678',
    });

    expect(mockedOwnership).toHaveBeenCalledWith('session-a', 'student-a');
    expect(result.review_status).toBe('pending');
    expect(stored).toMatchObject({
      student_profile_id: 'student-a', tutor_session_id: 'session-a', tutor_turn_id: 'turn-a',
      report_type: 'incorrect_math', review_status: 'pending',
    });
    expect(stored).not.toHaveProperty('ai_response');
    expect(stored).not.toHaveProperty('audio');
    expect(stored).not.toHaveProperty('image');
    expect(stored?.redacted_details).toContain('[redacted email]');
    expect(stored?.redacted_details).toContain('[redacted phone]');
  });

  it('projects report history to a student-safe DTO and scopes it to the authenticated owner', async () => {
    const privateReport = {
      tutor_session_id: 'session-a',
      tutor_turn_id: 'turn-a',
      report_type: 'incorrect_math',
      review_status: 'resolved',
      public_resolution_message: 'We updated the explanation.',
      last_review_note: 'Internal escalation details',
      reviewer_id: 'admin-1',
      review_history: [{ reviewer_id: 'admin-1', internal_note: 'private' }],
      redacted_details: 'Student contact information was removed.',
      created_at: { toDate: () => new Date('2026-08-24T00:00:00.000Z') },
    };
    const where = jest.fn(() => ({ get: async () => ({ docs: [{ id: 'report-a', data: () => privateReport }] }) }));
    mockedFirestore.mockReturnValue({ collection: jest.fn(() => ({ where })) } as never);

    const reports = await listStudentTutorReports('student-a');

    expect(where).toHaveBeenCalledWith('student_profile_id', '==', 'student-a');
    expect(reports).toEqual([expect.objectContaining({
      report_id: 'report-a', status: 'resolved', public_resolution_message: 'We updated the explanation.',
    })]);
    expect(reports[0]).not.toHaveProperty('last_review_note');
    expect(reports[0]).not.toHaveProperty('reviewer_id');
    expect(reports[0]).not.toHaveProperty('review_history');
    expect(reports[0]).not.toHaveProperty('redacted_details');
  });

  it('returns notifications only from the authenticated student collection query', async () => {
    const where = jest.fn(() => ({ get: async () => ({ docs: [{ id: 'notice-a', data: () => ({
      student_id: 'student-a', type: 'restriction_applied', title: 'Tutor access temporarily unavailable',
      body: 'Contact your teacher.', internal_admin_note: 'must not leak',
      created_at: { toDate: () => new Date('2026-08-24T00:00:00.000Z') }, read_at: null,
    }) }] }) }));
    mockedFirestore.mockReturnValue({ collection: jest.fn(() => ({ where })) } as never);

    const notifications = await listStudentNotifications('student-a');

    expect(where).toHaveBeenCalledWith('student_id', '==', 'student-a');
    expect(notifications[0]).toEqual(expect.objectContaining({ notification_id: 'notice-a', type: 'restriction_applied' }));
    expect(notifications[0]).not.toHaveProperty('internal_admin_note');
    expect(notifications[0]).not.toHaveProperty('student_id');
  });
});
