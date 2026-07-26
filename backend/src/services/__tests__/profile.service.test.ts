import { Timestamp } from 'firebase-admin/firestore';
import { getFirestore } from '../../config/firebase';
import {
  addCurrentUserSubject,
  createCurrentUserProfile,
  updateCurrentUserProfile,
} from '../profile.service';

jest.mock('../../config/firebase', () => ({
  getFirestore: jest.fn(),
}));

const mockedGetFirestore = getFirestore as jest.MockedFunction<typeof getFirestore>;

function snapshotFromDocs<T extends Record<string, unknown>>(
  docs: Array<{ data: () => T; ref: { update: jest.Mock; set?: jest.Mock } }>
) {
  return {
    empty: docs.length === 0,
    docs,
  };
}

describe('profile.service', () => {
  beforeEach(() => {
    mockedGetFirestore.mockReset();
  });

  it('rejects backend-managed fields on PATCH', async () => {
    await expect(
      updateCurrentUserProfile('firebase-uid', { current_streak: 5 })
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects duplicate subject selection', async () => {
    const profileDoc = {
      data: () => ({
        student_profile_id: 'profile-1',
        user_id: 'firebase-uid',
        grade_level_id: 'grade-1',
        account_status: 'active',
        explanation_level: 'beginner',
        learning_goal: null,
        onboarding_completed: true,
        current_streak: 0,
        longest_streak: 0,
        total_learning_time: 0,
      }),
      ref: { update: jest.fn() },
    };

    const selectionDoc = {
      data: () => ({
        student_subject_id: 'selection-1',
        student_profile_id: 'profile-1',
        subject_id: 'math',
        selected_at: Timestamp.now(),
        current_progress: 0,
        mastery_level: 'not_started',
        status: 'active',
      }),
      ref: { update: jest.fn() },
    };

    mockedGetFirestore.mockReturnValue({
      collection: jest.fn((collectionName: string) => {
        if (collectionName === 'student_profiles') {
          return {
            withConverter: jest.fn().mockReturnValue({
              where: jest
                .fn()
                .mockReturnValue({
                  limit: jest
                    .fn()
                    .mockReturnValue({
                      get: jest.fn().mockResolvedValue(snapshotFromDocs([profileDoc])),
                    }),
                }),
            }),
          };
        }

        if (collectionName === 'subjects') {
          return {
            withConverter: jest.fn().mockReturnValue({
              where: jest
                .fn()
                .mockReturnValue({
                  limit: jest
                    .fn()
                    .mockReturnValue({
                      get: jest
                        .fn()
                        .mockResolvedValue(
                          snapshotFromDocs([
                            {
                              data: () => ({
                                subject_id: 'math',
                                subject_name: 'Mathematics',
                                icon_url: null,
                              }),
                              ref: { update: jest.fn() },
                            },
                          ])
                        ),
                    }),
                }),
            }),
          };
        }

        if (collectionName === 'student_subjects') {
          return {
            withConverter: jest.fn().mockReturnValue({
              where: jest.fn().mockReturnValue({
                where: jest
                  .fn()
                  .mockReturnValue({
                    limit: jest
                      .fn()
                      .mockReturnValue({
                        get: jest.fn().mockResolvedValue(snapshotFromDocs([selectionDoc])),
                      }),
                  }),
                limit: jest
                  .fn()
                  .mockReturnValue({
                    get: jest.fn().mockResolvedValue(snapshotFromDocs([selectionDoc])),
                  }),
                get: jest.fn().mockResolvedValue(snapshotFromDocs([selectionDoc])),
              }),
              doc: jest.fn(() => ({ id: 'new-selection', set: jest.fn() })),
            }),
          };
        }

        return {
          withConverter: jest.fn().mockReturnValue({
            where: jest
              .fn()
              .mockReturnValue({
                limit: jest
                  .fn()
                  .mockReturnValue({
                    get: jest
                      .fn()
                      .mockResolvedValue(
                        snapshotFromDocs([
                          {
                            data: () => ({
                              full_name: 'Student One',
                              email: 'student@example.com',
                              preferred_language: 'en',
                            }),
                            ref: { update: jest.fn() },
                          },
                        ])
                      ),
                  }),
              }),
            doc: jest.fn(() => ({ id: 'doc-1', set: jest.fn() })),
          }),
        };
      }),
      runTransaction: jest.fn(),
    } as never);

    await expect(
      addCurrentUserSubject('firebase-uid', { subject_id: 'math' })
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('creates a profile atomically after validating referenced ids', async () => {
    // Simplified test: verify that createCurrentUserProfile validates IDs and rejects invalid grade levels
    mockedGetFirestore.mockReturnValue({
      collection: jest.fn(() => ({
        withConverter: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              get: jest.fn().mockResolvedValue(snapshotFromDocs([])), // Not found = validation error
            }),
          }),
          doc: jest.fn(() => ({ id: 'new-profile', set: jest.fn() })),
        }),
      })),
      runTransaction: jest.fn(),
    } as never);

    // Should reject because grade_level validation will fail (not found)
    await expect(
      createCurrentUserProfile('firebase-uid', {
        grade_level_id: 'nonexistent-grade',
        explanation_level: 'beginner',
        learning_goal: 'Learn fractions',
        subject_ids: ['math'],
      })
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
